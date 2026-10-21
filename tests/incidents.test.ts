import request from "supertest";
import { STATUSES } from "../src/db";
import { STATUS_TRANSITIONS, canTransition } from "../src/status";
import { makeTestApp, newIncident } from "./helpers";

afterEach(() => jest.restoreAllMocks());

describe("incident CRUD", () => {
  test("create returns 201, starts open, and the creator is the logged-in user", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201);
    expect(res.body).toMatchObject({ title: "Suspicious login burst", status: "open", created_by: 2, assigned_to: null });
  });

  test("create rejects bad input with 400 and the standard error format", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).send({ title: "x", severity: "nope" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at \w+ \(/i);
  });

  test("create rejects an assignee that does not exist", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).send(newIncident({ assigned_to: 99 })).expect(400);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
  });

  test("list filters and paginates", async () => {
    const { app, t } = makeTestApp();
    await request(app).post("/api/incidents").set(t.a).send(newIncident({ severity: "high" })).expect(201);
    await request(app).post("/api/incidents").set(t.a).send(newIncident({ severity: "low", title: "Low one" })).expect(201);
    const res = await request(app).get("/api/incidents?severity=high&limit=1").set(t.a).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    await request(app).get("/api/incidents?limit=1000").set(t.a).expect(400);
  });

  test("get one: 200, 404 for unknown, 400 for a bad id", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    await request(app).get(`/api/incidents/${created.id}`).set(t.a).expect(200);
    const missing = await request(app).get("/api/incidents/999").set(t.a).expect(404);
    expect(missing.body.error.code).toBe("INCIDENT_NOT_FOUND");
    await request(app).get("/api/incidents/abc").set(t.a).expect(400);
  });

  test("patch updates allowed fields, rejects unknown fields and empty bodies", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const res = await request(app).patch(`/api/incidents/${created.id}`).set(t.a).send({ severity: "critical", assigned_to: 3 }).expect(200);
    expect(res.body).toMatchObject({ severity: "critical", assigned_to: 3 });
    await request(app).patch(`/api/incidents/${created.id}`).set(t.a).send({ created_by: 3 }).expect(400);
    await request(app).patch(`/api/incidents/${created.id}`).set(t.a).send({}).expect(400);
    await request(app).patch("/api/incidents/999").set(t.a).send({ severity: "low" }).expect(404);
  });

  test("delete (admin): 204 then 404", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    await request(app).delete(`/api/incidents/${created.id}`).set(t.admin).expect(204);
    await request(app).delete(`/api/incidents/${created.id}`).set(t.admin).expect(404);
  });
});

describe("status changes and history", () => {
  test("PATCH cannot change status", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const res = await request(app).patch(`/api/incidents/${created.id}`).set(t.a).send({ status: "closed" }).expect(400);
    expect(res.body.error.code).toBe("STATUS_VIA_UPDATES");
  });

  test("a status change is recorded with previous and new status and the logged-in author", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const res = await request(app)
      .post(`/api/incidents/${created.id}/updates`)
      .set(t.a)
      .send({ note: "Picked up", new_status: "investigating" })
      .expect(201);
    expect(res.body).toMatchObject({ previous_status: "open", new_status: "investigating", author_id: 2 });
    expect((await request(app).get(`/api/incidents/${created.id}`).set(t.a)).body.status).toBe("investigating");
  });

  test("a note without new_status leaves both statuses null and the status unchanged", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const res = await request(app).post(`/api/incidents/${created.id}/updates`).set(t.a).send({ note: "Just a note" }).expect(201);
    expect(res.body).toMatchObject({ previous_status: null, new_status: null });
    expect((await request(app).get(`/api/incidents/${created.id}`).set(t.a)).body.status).toBe("open");
  });

  test("an invalid transition returns 409 and saves nothing (all-or-nothing)", async () => {
    const { app, db, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const res = await request(app)
      .post(`/api/incidents/${created.id}/updates`)
      .set(t.a)
      .send({ note: "Skip ahead", new_status: "resolved" })
      .expect(409);
    expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect((db.prepare("SELECT COUNT(*) AS n FROM incident_updates").get() as { n: number }).n).toBe(0);
    expect((await request(app).get(`/api/incidents/${created.id}`).set(t.a)).body.status).toBe("open");
  });

  test("history is returned oldest first", async () => {
    const { app, t } = makeTestApp();
    const created = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    for (const note of ["first", "second", "third"]) {
      await request(app).post(`/api/incidents/${created.id}/updates`).set(t.a).send({ note }).expect(201);
    }
    const res = await request(app).get(`/api/incidents/${created.id}/updates`).set(t.a).expect(200);
    expect(res.body.data.map((u: { note: string }) => u.note)).toEqual(["first", "second", "third"]);
  });

  test("updates on an unknown incident return 404", async () => {
    const { app, t } = makeTestApp();
    await request(app).post("/api/incidents/999/updates").set(t.a).send({ note: "x" }).expect(404);
  });

  test("unknown route returns 404 in the standard error format", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("status transition table", () => {
  const allowed: Record<string, string[]> = {
    open: ["investigating", "closed"],
    investigating: ["contained", "resolved", "closed"],
    contained: ["investigating", "resolved"],
    resolved: ["closed", "investigating"],
    closed: [],
  };

  test.each(STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const)))("%s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(allowed[from].includes(to));
  });

  test("the table in code matches the README", () => {
    expect(STATUS_TRANSITIONS).toEqual(allowed);
  });
});
