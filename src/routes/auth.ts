import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { Router, type RequestHandler } from "express";
import { signToken, type AuthUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { DB } from "../db.js";
import { AppError } from "../errors.js";
import { loginSchema, registerSchema } from "../validation.js";

export function authRouter(db: DB, config: AppConfig, requireAuth: RequestHandler): Router {
  const router = Router();

  // Brute-force protection, per client IP. Login counts only FAILED attempts, so normal use is never
  // blocked; sign-up counts every attempt, so one address cannot mass-create accounts.
  // The counters live in memory: they reset on restart and are per server instance.
  const tooMany: RequestHandler = (_req, _res, next) =>
    next(new AppError(429, "TOO_MANY_REQUESTS", "Too many attempts. Wait a while and try again."));
  const limiterOptions = {
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: "draft-7" as const,
    legacyHeaders: false,
    handler: tooMany,
  };
  const loginLimiter = rateLimit({ ...limiterOptions, skipSuccessfulRequests: true });
  const registerLimiter = rateLimit(limiterOptions);

  // Compared against when the email is unknown, so "no such user" and "wrong password"
  // take about the same time and return the same answer.
  const dummyHash = bcrypt.hashSync("not-a-real-password", config.bcryptRounds);

  const publicUser = (u: { id: number; name: string; email: string; role: string; created_at?: string }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    ...(u.created_at ? { created_at: u.created_at } : {}),
  });

  // Everyone who registers is an analyst. The admin role cannot be requested through the API.
  router.post("/register", registerLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(body.email)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    const hash = await bcrypt.hash(body.password, config.bcryptRounds);
    try {
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'analyst')")
        .run(body.name, body.email, hash);
      const user = db
        .prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as AuthUser & { created_at: string };
      res.status(201).json(publicUser(user));
    } catch (err) {
      // Two sign-ups racing for the same email: the UNIQUE constraint decides.
      if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
      }
      throw err;
    }
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const row = db
      .prepare("SELECT id, name, email, role, password_hash FROM users WHERE email = ?")
      .get(body.email) as (AuthUser & { password_hash: string }) | undefined;

    const ok = await bcrypt.compare(body.password, row?.password_hash ?? dummyHash);
    if (!row || !ok) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    res.json({
      token: signToken(row, config),
      token_type: "Bearer",
      expires_in: config.jwtExpiresIn,
      user: publicUser(row),
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json(publicUser(req.user as AuthUser));
  });

  return router;
}
