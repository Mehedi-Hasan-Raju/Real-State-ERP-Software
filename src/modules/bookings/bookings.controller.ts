import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createBookingSchema,
  listBookingsSchema,
  updateBookingStatusSchema,
} from "./bookings.validation";
import {
  BookingsService,
  BookingServiceError,
  type BookingActor,
} from "./bookings.service";

function getActor(req: Request): BookingActor {
  if (!req.user) {
    throw new BookingServiceError("Authentication required", 401);
  }

  return {
    id: req.user.id,
    organizationId: req.user.organizationId,
    role: req.user.role,
  };
}

function handleError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof BookingServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.issues,
    });
  }

  return next(error);
}

export const BookingsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const input = createBookingSchema.parse(req.body);
      const booking = await BookingsService.create(actor, input);

      return res.status(201).json({
        success: true,
        message: "Booking created successfully",
        data: booking,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const query = listBookingsSchema.parse(req.query);
      const result = await BookingsService.list(actor, query);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const booking = await BookingsService.getById(
        actor,
        req.params.bookingId as string
      );

      return res.status(200).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async updateStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const actor = getActor(req);
      const input = updateBookingStatusSchema.parse(req.body);
      const booking = await BookingsService.updateStatus(
        actor,
        req.params.bookingId as string,
        input
      );

      return res.status(200).json({
        success: true,
        message: `Booking ${input.status.toLowerCase()} successfully`,
        data: booking,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
};