import { z } from "zod";

export const createUnitSchema = z.object({
  floorId: z.string().min(1),
  unitNumber: z.string().trim().min(1).max(50),
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  area: z.coerce.number().positive().max(100000).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  price: z.coerce.number().positive().max(1_000_000_000_000).optional(),
});

export const updateUnitSchema = z
  .object({
    unitNumber: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    area: z.coerce.number().positive().max(100000).nullable().optional(),
    bedrooms: z.number().int().min(0).max(50).nullable().optional(),
    bathrooms: z.number().int().min(0).max(50).nullable().optional(),
    price: z.coerce.number().positive().max(1_000_000_000_000).nullable().optional(),
    
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const unitParamsSchema = z.object({
  unitId: z.string().min(1),
});

export const listUnitsSchema = z.object({
  floorId: z.string().min(1).optional(),
  buildingId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "BOOKED", "SOLD"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minArea: z.coerce.number().min(0).optional(),
  maxArea: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["unitNumber", "price", "area", "createdAt"]).default("unitNumber"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
}).refine(
  (data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
  { message: "minPrice must not exceed maxPrice" },
).refine(
  (data) => data.minArea === undefined || data.maxArea === undefined || data.minArea <= data.maxArea,
  { message: "minArea must not exceed maxArea" },
);

export const archiveUnitSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type ListUnitsInput = z.infer<typeof listUnitsSchema>;