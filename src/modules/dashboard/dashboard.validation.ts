
import { z } from "zod";

export const dashboardQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "'from' must be before or equal to 'to'",
    path: ["from"],
  });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;