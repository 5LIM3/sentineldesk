import express from "express";
import type { DB } from "./db.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { incidentsRouter } from "./routes/incidents.js";

export function createApp(db: DB) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/incidents", incidentsRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
