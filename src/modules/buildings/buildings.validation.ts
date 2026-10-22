// src/modules/buildings/buildings.validation.ts

import { z } from "zod";
import { BuildingStatus } from "../../generated/prisma/client";

const optionalText = z.string().trim().max(2000).optional();

export const createBuildingSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(1).max(50),
  description: optionalText,
  address: z.string().trim().max(500).optional(),
  totalFloors: z.number().int().min(1).max(300).nullable().optional(),
  status: z.nativeEnum(BuildingStatus).optional(),
});

export const updateBuildingSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  totalFloors: z.number().int().min(1).max(300).nullable().optional(),
  status: z.nativeEnum(BuildingStatus).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

export const buildingIdParamsSchema = z.object({
  buildingId: z.string().min(1, "Building ID is required"),
});

export const listBuildingsSchema = z.object({
  projectId: z.string().min(1).optional(),
  search: z.string().trim().max(150).optional(),
  status: z.nativeEnum(BuildingStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "code", "status", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const archiveBuildingSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;