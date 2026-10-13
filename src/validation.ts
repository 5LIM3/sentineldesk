import { z } from "zod";
import { SEVERITIES, STATUSES } from "./db.js";

const id = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id });

/*
 * TEMPORARY (Week 1 only): `created_by` and `author_id` are read from the request body because
 * there is no authentication yet. They are a development stand-in, NOT a trusted identity:
 * anyone can send any user id. Week 2 deletes these fields from the schemas and reads the
 * user from the verified JWT instead.
 */
export const createIncidentSchema = z.strictObject({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(SEVERITIES),
  created_by: id, // TEMPORARY - see note above
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

export const createUpdateSchema = z.strictObject({
  author_id: id, // TEMPORARY - see note above
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
