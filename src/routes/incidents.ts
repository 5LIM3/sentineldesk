import { Router, type RequestHandler } from "express";
import { canModifyIncident, requireAdmin, type AuthUser } from "../auth.js";
import type { DB } from "../db.js";
import { AppError } from "../errors.js";
import { STATUS_TRANSITIONS, canTransition, type Status } from "../status.js";
import {
  createIncidentSchema,
  createUpdateSchema,
  historyQuerySchema,
  idParamSchema,
  listIncidentsQuerySchema,
  updateIncidentSchema,
} from "../validation.js";

type Incident = Record<string, unknown>;
type Ownership = { created_by: number; assigned_to: number | null };

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function incidentsRouter(db: DB, requireAuth: RequestHandler): Router {
  const router = Router();

  // Every incident route needs a logged-in user. Who may CHANGE what is decided per route below.
  router.use(requireAuth);

  const userExists = (userId: number) => !!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId);
  const getIncident = (incidentId: number) =>
    db.prepare("SELECT * FROM incidents WHERE id = ?").get(incidentId) as Incident | undefined;
  const notFound = (incidentId: number) =>
    new AppError(404, "INCIDENT_NOT_FOUND", `Incident ${incidentId} not found`);

  const forbidden = () =>
    new AppError(403, "FORBIDDEN", "You can only change incidents you created or are assigned to (admins can change any)");

  // `assigned_to` is the one user id still accepted from the body (assigning someone else), so
  // it must point at a real user.
  const assertUser = (userId: number | null | undefined, field: string) => {
    if (userId != null && !userExists(userId)) {
      throw new AppError(400, "INVALID_REFERENCE", `${field} ${userId} does not match an existing user`);
    }
  };

  // ---------- Incidents ----------

  router.post("/", (req, res) => {
    const body = createIncidentSchema.parse(req.body);
    const user = req.user as AuthUser; // the creator is the logged-in user, never the request body
    assertUser(body.assigned_to, "assigned_to");
    const result = db
      .prepare(
        `INSERT INTO incidents (title, description, severity, created_by, assigned_to)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(body.title, body.description, body.severity, user.id, body.assigned_to ?? null);
    res.status(201).json(getIncident(Number(result.lastInsertRowid)));
  });

  router.get("/", (req, res) => {
    const q = listIncidentsQuerySchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status) { where.push("status = ?"); params.push(q.status); }
    if (q.severity) { where.push("severity = ?"); params.push(q.severity); }
    if (q.assigned_to) { where.push("assigned_to = ?"); params.push(q.assigned_to); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM incidents ${clause}`).get(...params) as { n: number }).n;
    const data = db
      .prepare(`SELECT * FROM incidents ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, q.limit, (q.page - 1) * q.limit);

    res.json({
      data,
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    });
  });

  router.get("/:id", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const incident = getIncident(id);
    if (!incident) throw notFound(id);
    res.json(incident);
  });

  // Partial update. `status` is NOT editable here: it changes only via POST /:id/updates so the
  // history can never drift from the current state.
  router.patch("/:id", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    if (req.body && typeof req.body === "object" && "status" in req.body) {
      throw new AppError(
        400,
        "STATUS_VIA_UPDATES",
        "Status cannot be changed with PATCH. POST /api/incidents/:id/updates with new_status so the change is recorded in the history."
      );
    }
    const body = updateIncidentSchema.parse(req.body);
    const user = req.user as AuthUser;
    const current = getIncident(id) as (Incident & Ownership) | undefined;
    if (!current) throw notFound(id);

    // Ownership check: admin, creator or assignee may edit. One extra rule so unassigned work can
    // be picked up: any analyst may assign an UNASSIGNED incident to themselves (and nothing else).
    const isClaim =
      Object.keys(body).length === 1 && body.assigned_to === user.id && current.assigned_to === null;
    if (!canModifyIncident(user, current) && !isClaim) throw forbidden();

    assertUser(body.assigned_to, "assigned_to");

    // Column names come from the strict Zod schema (a fixed whitelist), never from raw user input.
    const fields = Object.keys(body) as (keyof typeof body)[];
    const sets = fields.map((f) => `${f} = ?`);
    const values = fields.map((f) => body[f] ?? null);
    db.prepare(`UPDATE incidents SET ${sets.join(", ")}, updated_at = ${NOW} WHERE id = ?`).run(...values, id);
    res.json(getIncident(id));
  });

  // Deleting an incident also deletes its updates: ON DELETE CASCADE in the schema, which only
  // works because openDb() turns foreign key enforcement on for every connection.
  // Admin only: analysts get 403.
  router.delete("/:id", requireAdmin, (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const result = db.prepare("DELETE FROM incidents WHERE id = ?").run(id);
    if (result.changes === 0) throw notFound(id);
    res.status(204).send();
  });

  // ---------- Investigation history ----------

  // Adds a note and, optionally, a status change. Both happen in ONE transaction: either the
  // update row AND the incident's new status are saved, or neither is.
  router.post("/:id/updates", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = createUpdateSchema.parse(req.body);
    const user = req.user as AuthUser; // the author is the logged-in user, never the request body

    const created = db
      .transaction(() => {
        // Read inside the transaction (IMMEDIATE below takes the write lock first), so the
        // previous_status we record is the status we actually changed from.
        const incident = db
          .prepare("SELECT id, status, created_by, assigned_to FROM incidents WHERE id = ?")
          .get(id) as ({ id: number; status: Status } & Ownership) | undefined;
        if (!incident) throw notFound(id);
        if (!canModifyIncident(user, incident)) throw forbidden();

        let previous: Status | null = null;
        let next: Status | null = null;
        if (body.new_status !== undefined) {
          if (!canTransition(incident.status, body.new_status)) {
            const allowed = STATUS_TRANSITIONS[incident.status];
            throw new AppError(
              409,
              "INVALID_STATUS_TRANSITION",
              `Cannot move incident ${id} from '${incident.status}' to '${body.new_status}'. ` +
                (allowed.length ? `Allowed: ${allowed.join(", ")}.` : "A closed incident cannot change status."),
              { from: incident.status, to: body.new_status, allowed }
            );
          }
          previous = incident.status;
          next = body.new_status;
        }

        const result = db
          .prepare(
            `INSERT INTO incident_updates (incident_id, author_id, note, previous_status, new_status)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(id, user.id, body.note, previous, next);

        // Any activity bumps updated_at; a status change also moves the incident to the new status.
        if (next) {
          db.prepare(`UPDATE incidents SET status = ?, updated_at = ${NOW} WHERE id = ?`).run(next, id);
        } else {
          db.prepare(`UPDATE incidents SET updated_at = ${NOW} WHERE id = ?`).run(id);
        }
        return db.prepare("SELECT * FROM incident_updates WHERE id = ?").get(Number(result.lastInsertRowid));
      })
      .immediate();

    res.status(201).json(created);
  });

  // History, oldest first (id order = insertion order = chronological), so a reader can follow
  // the investigation from the first note to resolution.
  router.get("/:id/updates", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const q = historyQuerySchema.parse(req.query);
    if (!getIncident(id)) throw notFound(id);

    const total = (
      db.prepare("SELECT COUNT(*) AS n FROM incident_updates WHERE incident_id = ?").get(id) as { n: number }
    ).n;
    const data = db
      .prepare("SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY id ASC LIMIT ? OFFSET ?")
      .all(id, q.limit, (q.page - 1) * q.limit);

    res.json({
      data,
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    });
  });

  return router;
}
