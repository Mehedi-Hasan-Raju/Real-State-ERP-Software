import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().max(254).nullable().optional(),
  address: optionalText(500),
  notes: optionalText(2000),
});

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    phone: z.string().trim().min(5).max(30).optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    address: optionalText(500),
    notes: optionalText(2000),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listCustomersSchema = z.object({
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "phone", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const archiveCustomerSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;
export type ArchiveCustomerInput = z.infer<typeof archiveCustomerSchema>;