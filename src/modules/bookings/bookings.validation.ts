import { z } from "zod";

export const createBookingSchema = z.object({
  bookingCode: z.string().trim().min(2).max(40),
  customerId: z.string().min(1),
  unitId: z.string().min(1),
  agreedPrice: z.coerce.number().positive(),
  bookingAmount: z.coerce.number().min(0).default(0),
  bookingDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine(
  (data) => data.bookingAmount <= data.agreedPrice,
  {
    message: "Booking amount cannot exceed the agreed price",
    path: ["bookingAmount"],
  }
);

export const listBookingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum([
    "RESERVED",
    "CONFIRMED",
    "CANCELLED",
    "COMPLETED",
  ]).optional(),
  customerId: z.string().optional(),
  unitId: z.string().optional(),
  projectId: z.string().optional(),
  sortBy: z.enum([
    "createdAt",
    "updatedAt",
    "bookingDate",
    "bookingCode",
    "agreedPrice",
  ]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]),
  cancellationReason: z.string().trim().max(1000).optional(),
}).refine(
  (data) =>
    data.status !== "CANCELLED" ||
    Boolean(data.cancellationReason?.trim()),
  {
    message: "Cancellation reason is required",
    path: ["cancellationReason"],
  }
);

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsSchema>;
export type UpdateBookingStatusInput = z.infer<
  typeof updateBookingStatusSchema
>;