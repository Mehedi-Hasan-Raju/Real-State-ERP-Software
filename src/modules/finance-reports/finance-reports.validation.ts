import { z } from "zod";

export const customerLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  {
    message: "'from' must be before or equal to 'to'",
    path: ["from"],
  }
);

export const financialSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  {
    message: "'from' must be before or equal to 'to'",
    path: ["from"],
  }
);

export type CustomerLedgerQuery = z.infer<
  typeof customerLedgerQuerySchema
>;

export type FinancialSummaryQuery = z.infer<
  typeof financialSummaryQuerySchema
>;