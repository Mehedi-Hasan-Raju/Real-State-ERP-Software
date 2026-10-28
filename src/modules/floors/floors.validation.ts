import { z } from "zod";

export const createFloorSchema = z.object({
  buildingId: z.string().min(1),
  floorNumber: z.number().int().min(0).max(300),
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const updateFloorSchema = z
  .object({
    floorNumber: z.number().int().min(0).max(300).optional(),
    name: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const floorParamsSchema = z.object({
  floorId: z.string().min(1),
});

export const listFloorsSchema = z.object({
  buildingId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const archiveFloorSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type CreateFloorInput = z.infer<typeof createFloorSchema>;
export type UpdateFloorInput = z.infer<typeof updateFloorSchema>;
export type ListFloorsInput = z.infer<typeof listFloorsSchema>;