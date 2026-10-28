import { z } from "zod";

export const createInstallmentSchema = z.object({
  bookingId: z.string().min(1),
  installmentNo: z.coerce.number().int().min(1),
  title: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive(),
  dueDate: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
});

export const listInstallmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  bookingId: z.string().optional(),
  status: z.enum([
    "PENDING",
    "PARTIALLY_PAID",
    "PAID",
    "CANCELLED",
  ]).optional(),
  overdueOnly: z.enum(["true", "false"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const cancelInstallmentSchema = z.object({
  notes: z.string().trim().min(3).max(1000),
});

export type CreateInstallmentInput = z.infer<
  typeof createInstallmentSchema
>;
export type ListInstallmentsQuery = z.infer<
  typeof listInstallmentsSchema
>;