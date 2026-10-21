import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { AppConfig } from "./config.js";
import { ROLES, type DB } from "./db.js";
import { AppError } from "./errors.js";

export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: Pick<AuthUser, "id" | "role">, config: AppConfig): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    algorithm: "HS256",
    subject: String(user.id),
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Requires a valid `Authorization: Bearer <token>` header and sets req.user.
 * The user is re-read from the database on every request, so a token for a deleted user
 * stops working and the role used for permissions is always the current one.
 * Anything wrong with the token is 401 (not logged in); being logged in but not allowed is 403.
 */
export function requireAuth(db: DB, config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AppError(401, "UNAUTHENTICATED", "Log in first and send 'Authorization: Bearer <token>'");
    }

    let payload: jwt.JwtPayload;
    try {
      // Pin the algorithm so a token cannot choose its own (e.g. "none").
      const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
      if (typeof decoded === "string") throw new Error("unexpected payload");
      payload = decoded;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "TOKEN_EXPIRED", "Your token has expired. Log in again.");
      }
      throw new AppError(401, "INVALID_TOKEN", "The token is not valid");
    }

    const user = db
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(Number(payload.sub)) as AuthUser | undefined;
    if (!user) throw new AppError(401, "INVALID_TOKEN", "The token is not valid");

    req.user = user;
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "This action needs the admin role");
  }
  next();
};

/** Admin, the person who created the incident, or the analyst it is assigned to. */
export function canModifyIncident(
  user: AuthUser,
  incident: { created_by: number; assigned_to: number | null }
): boolean {
  return user.role === "admin" || incident.created_by === user.id || incident.assigned_to === user.id;
}
