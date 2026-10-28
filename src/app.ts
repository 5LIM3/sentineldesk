import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DB } from "./db.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { incidentsRouter } from "./routes/incidents.js";

export function createApp(db: DB, config: AppConfig) {
  const app = express();

  // Behind a host's reverse proxy the real client IP is in X-Forwarded-For. Without this the rate
  // limiter would see only the proxy's address. Set TRUST_PROXY to the number of proxies (usually 1).
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(helmet()); // security headers, and removes X-Powered-By
  app.use(
    cors({
      // Only the exact origins in CORS_ORIGINS. With none configured, no CORS headers are sent at all.
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: "100kb" }));

  const auth = requireAuth(db, config);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter(db, config, auth)); // register and login are public (and rate limited)
  app.use("/api/incidents", incidentsRouter(db, auth)); // everything here needs a token

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
