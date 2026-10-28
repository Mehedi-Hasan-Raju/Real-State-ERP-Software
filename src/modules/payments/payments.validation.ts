import { z } from "zod";

export const createPaymentSchema = z.object({
  paymentCode: z.string().trim().min(2).max(40),
  installmentId: z.string().min(1),
  amount: z.coerce.number().positive(),
  paymentDate: z.coerce.date().optional(),
  method: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CHEQUE",
    "ONLINE",
    "OTHER",
  ]),
  reference: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const listPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  bookingId: z.string().optional(),
  installmentId: z.string().optional(),
  method: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CHEQUE",
    "ONLINE",
    "OTHER",
  ]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  {
    message: "'from' must be before or equal to 'to'",
    path: ["from"],
  }
);

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsSchema>;