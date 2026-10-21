import express from "express";
import { requireAuth } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DB } from "./db.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { incidentsRouter } from "./routes/incidents.js";

export function createApp(db: DB, config: AppConfig) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  const auth = requireAuth(db, config);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter(db, config, auth)); // register and login are public
  app.use("/api/incidents", incidentsRouter(db, auth)); // everything here needs a token

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
