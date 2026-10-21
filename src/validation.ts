import { z } from "zod";
import { SEVERITIES, STATUSES } from "./db.js";

const id = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id });

// The creator is never taken from the body: it is the logged-in user (from the JWT).
export const createIncidentSchema = z.strictObject({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(SEVERITIES),
  assigned_to: id.nullable().optional(),
});

// `status` is deliberately absent: status only changes through POST /api/incidents/:id/updates,
// so every change is recorded in the history (previous_status -> new_status).
export const updateIncidentSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(5000),
    severity: z.enum(SEVERITIES),
    assigned_to: id.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

// The author is never taken from the body: it is the logged-in user (from the JWT).
export const createUpdateSchema = z.strictObject({
  note: z.string().trim().min(1).max(5000),
  new_status: z.enum(STATUSES).optional(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// History defaults to a larger page so one request normally covers a whole investigation.
export const historyQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listIncidentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  assigned_to: id.optional(),
});

// ---------- Authentication ----------

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

// bcrypt only uses the first 72 BYTES of a password, so longer ones are rejected, not silently cut.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 bytes");

// strict: a request that tries to send `role` (or anything else unexpected) is rejected.
export const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email,
  password,
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(200),
});
