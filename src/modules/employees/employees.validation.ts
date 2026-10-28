import { z } from "zod";

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum([
    "ADMIN",
    "MANAGER",
    "SALES",
    "ACCOUNTANT",
    "CONSTRUCTION",
    "VIEWER",
  ]),
});

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateEmployeeInput = z.infer<
  typeof createEmployeeSchema
>;

export type EmployeeListQueryInput = z.infer<
  typeof employeeListQuerySchema
>;