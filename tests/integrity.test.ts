import request from "supertest";
import { openDb } from "../src/db";
import { makeTestApp, newIncident } from "./helpers";

const count = (db: ReturnType<typeof makeTestApp>["db"], sql: string, ...p: unknown[]) =>
  (db.prepare(sql).get(...p) as { n: number }).n;

describe("database integrity", () => {
  afterEach(() => jest.restoreAllMocks());

  test("foreign key enforcement is ON for every connection openDb() creates", () => {
    const a = openDb(":memory:");
    const b = openDb(":memory:");
    expect(a.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(b.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  test("deleting an incident deletes its updates (ON DELETE CASCADE)", async () => {
    const { app, db, t } = makeTestApp();
    const { body: incident } = await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201);
    await request(app).post(`/api/incidents/${incident.id}/updates`).set(t.a).send({ note: "First note" }).expect(201);
    await request(app)
      .post(`/api/incidents/${incident.id}/updates`)
      .set(t.a)
      .send({ note: "Picked up", new_status: "investigating" })
      .expect(201);
    expect(count(db, "SELECT COUNT(*) AS n FROM incident_updates WHERE incident_id = ?", incident.id)).toBe(2);

    await request(app).delete(`/api/incidents/${incident.id}`).set(t.admin).expect(204);

    expect(count(db, "SELECT COUNT(*) AS n FROM incident_updates WHERE incident_id = ?", incident.id)).toBe(0);
    await request(app).get(`/api/incidents/${incident.id}/updates`).set(t.admin).expect(404);
  });

  test("deleting one incident leaves other incidents' updates alone", async () => {
    const { app, db, t } = makeTestApp();
    const a = (await request(app).post("/api/incidents").set(t.a).send(newIncident()).expect(201)).body;
    const b = (await request(app).post("/api/incidents").set(t.a).send(newIncident({ title: "Second incident" })).expect(201)).body;
    await request(app).post(`/api/incidents/${a.id}/updates`).set(t.a).send({ note: "On A" }).expect(201);
    await request(app).post(`/api/incidents/${b.id}/updates`).set(t.a).send({ note: "On B" }).expect(201);

    await request(app).delete(`/api/incidents/${a.id}`).set(t.admin).expect(204);

    expect(count(db, "SELECT COUNT(*) AS n FROM incident_updates WHERE incident_id = ?", b.id)).toBe(1);
  });

  test("a user who authored history cannot be deleted (RESTRICT)", async () => {
    const { app, db, t } = makeTestApp();
    const incident = (await request(app).post("/api/incidents").set(t.a).send(newIncident({ assigned_to: 3 })).expect(201)).body;
    await request(app).post(`/api/incidents/${incident.id}/updates`).set(t.b).send({ note: "Note from B" }).expect(201);

    expect(() => db.prepare("DELETE FROM users WHERE id = 3").run()).toThrow(/FOREIGN KEY/i);
  });

  test("the database rejects an update row that points at a missing incident", () => {
    const { db } = makeTestApp();
    expect(() =>
      db.prepare("INSERT INTO incident_updates (incident_id, author_id, note) VALUES (999, 2, 'orphan')").run()
    ).toThrow(/FOREIGN KEY/i);
  });
});
