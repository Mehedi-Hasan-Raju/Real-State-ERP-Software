
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const dateField = z
  .string()
  .datetime({ offset: true })
  .optional()
  .nullable();

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, numbers, _ and -"),
  description: optionalText(5000),
  type: z.enum(["RESIDENTIAL", "COMMERCIAL", "MIXED_USE", "OTHER"])
    .optional(),
  status: z.enum(["PLANNING", "ONGOING", "ON_HOLD", "COMPLETED"])
    .optional(),
  address: optionalText(300),
  city: optionalText(100),
  startDate: dateField,
  expectedEndDate: dateField,
  budget: z.coerce.number().finite().min(0).max(9999999999999.99).optional().nullable(),
  projectManagerId: z.string().trim().min(1).optional().nullable(),
}).strict();

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(150).optional(),
  status: z.enum(["PLANNING", "ONGOING", "ON_HOLD", "COMPLETED"]).optional(),
  type: z.enum(["RESIDENTIAL", "COMMERCIAL", "MIXED_USE", "OTHER"]).optional(),
  projectManagerId: z.string().trim().min(1).optional(),
  startDateFrom: dateField,
  startDateTo: dateField,
  sortBy: z.enum(["name", "code", "createdAt", "updatedAt", "startDate", "expectedEndDate", "budget"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  archived: z.enum(["true", "false"]).default("false"),
}).strict().refine(
  (data) =>
    !data.startDateFrom ||
    !data.startDateTo ||
    new Date(data.startDateFrom) <= new Date(data.startDateTo),
  { message: "startDateFrom must be before or equal to startDateTo" },
);

export const archiveProjectSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
