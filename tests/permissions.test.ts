import request from "supertest";
import { makeTestApp, newIncident } from "./helpers";

afterEach(() => jest.restoreAllMocks());

// User ids: 1 admin, 2 = A, 3 = B, 4 = C.
async function setup() {
  const ctx = makeTestApp();
  const { app, t } = ctx;
  const mine = (await request(app).post("/api/incidents").set(t.a).send(newIncident({ assigned_to: 3 })).expect(201)).body; // A created, B assigned
  const unassigned = (await request(app).post("/api/incidents").set(t.a).send(newIncident({ title: "Nobody has this yet" })).expect(201)).body;
  return { ...ctx, mine, unassigned };
}

describe("identity comes from the token, never the body", () => {
  test("created_by in the body is rejected", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).send(newIncident({ created_by: 3 })).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("author_id in the body is rejected, and the author recorded is the logged-in user", async () => {
    const { app, t, mine } = await setup();
    await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.a).send({ note: "x", author_id: 3 }).expect(400);
    const ok = await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.a).send({ note: "x" }).expect(201);
    expect(ok.body.author_id).toBe(2);
  });
});

describe("ownership: who may change an incident", () => {
  test("creator, assignee and admin may; another analyst gets 403", async () => {
    const { app, t, mine } = await setup();
    await request(app).patch(`/api/incidents/${mine.id}`).set(t.a).send({ severity: "medium" }).expect(200); // creator
    await request(app).patch(`/api/incidents/${mine.id}`).set(t.b).send({ severity: "high" }).expect(200); // assignee
    await request(app).patch(`/api/incidents/${mine.id}`).set(t.admin).send({ severity: "critical" }).expect(200); // admin
    const res = await request(app).patch(`/api/incidents/${mine.id}`).set(t.c).send({ severity: "low" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("the same rule applies to adding updates", async () => {
    const { app, t, mine } = await setup();
    await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.b).send({ note: "assignee note" }).expect(201);
    await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.admin).send({ note: "admin note" }).expect(201);
    const res = await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.c).send({ note: "outsider note" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("a forbidden status change leaves the incident untouched", async () => {
    const { app, t, mine } = await setup();
    await request(app).post(`/api/incidents/${mine.id}/updates`).set(t.c).send({ note: "x", new_status: "investigating" }).expect(403);
    expect((await request(app).get(`/api/incidents/${mine.id}`).set(t.a)).body.status).toBe("open");
    expect((await request(app).get(`/api/incidents/${mine.id}/updates`).set(t.a)).body.data).toHaveLength(0);
  });

  test("any logged-in user can read incidents and history", async () => {
    const { app, t, mine } = await setup();
    await request(app).get(`/api/incidents/${mine.id}`).set(t.c).expect(200);
    await request(app).get(`/api/incidents/${mine.id}/updates`).set(t.c).expect(200);
    await request(app).get("/api/incidents").set(t.c).expect(200);
  });

  test("a missing incident is 404, not 403", async () => {
    const { app, t } = makeTestApp();
    await request(app).patch("/api/incidents/999").set(t.c).send({ severity: "low" }).expect(404);
  });
});

describe("claiming an unassigned incident", () => {
  test("an analyst may assign an unassigned incident to themselves, and can then work on it", async () => {
    const { app, t, unassigned } = await setup();
    await request(app).post(`/api/incidents/${unassigned.id}/updates`).set(t.c).send({ note: "too early" }).expect(403);
    const claimed = await request(app).patch(`/api/incidents/${unassigned.id}`).set(t.c).send({ assigned_to: 4 }).expect(200);
    expect(claimed.body.assigned_to).toBe(4);
    await request(app).post(`/api/incidents/${unassigned.id}/updates`).set(t.c).send({ note: "on it", new_status: "investigating" }).expect(201);
  });

  test("a claim cannot assign someone else, change other fields, or take an already assigned incident", async () => {
    const { app, t, mine, unassigned } = await setup();
    await request(app).patch(`/api/incidents/${unassigned.id}`).set(t.c).send({ assigned_to: 3 }).expect(403);
    await request(app).patch(`/api/incidents/${unassigned.id}`).set(t.c).send({ assigned_to: 4, severity: "low" }).expect(403);
    await request(app).patch(`/api/incidents/${mine.id}`).set(t.c).send({ assigned_to: 4 }).expect(403);
  });
});

describe("delete is admin only", () => {
  test("analysts get 403 even on their own incident; admin gets 204", async () => {
    const { app, t, mine } = await setup();
    const res = await request(app).delete(`/api/incidents/${mine.id}`).set(t.a).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await request(app).delete(`/api/incidents/${mine.id}`).set(t.b).expect(403);
    await request(app).get(`/api/incidents/${mine.id}`).set(t.a).expect(200); // still there
    await request(app).delete(`/api/incidents/${mine.id}`).set(t.admin).expect(204);
  });
});

describe("error responses do not leak internals", () => {
  test("403 and 401 bodies use the standard format only", async () => {
    const { app, t, mine } = await setup();
    const forbidden = await request(app).delete(`/api/incidents/${mine.id}`).set(t.a).expect(403);
    expect(Object.keys(forbidden.body)).toEqual(["error"]);
    expect(JSON.stringify(forbidden.body)).not.toMatch(/stack|at \w+ \(|password|secret/i);
  });
});
