import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createPaymentSchema,
  listPaymentsSchema,
} from "./payments.validation";
import {
  PaymentsService,
} from "./payments.service";
import {
  FinanceServiceError,
  type FinanceActor,
} from "../installments/installments.service";

function actorFrom(req: Request): FinanceActor {
  if (!req.user) {
    throw new FinanceServiceError("Authentication required", 401);
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
  if (error instanceof FinanceServiceError) {
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

export const PaymentsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const input = createPaymentSchema.parse(req.body);
      const data = await PaymentsService.create(actor, input);

      return res.status(201).json({
        success: true,
        message: "Payment recorded successfully",
        data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const query = listPaymentsSchema.parse(req.query);
      const result = await PaymentsService.list(actor, query);

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
      const actor = actorFrom(req);
      const data = await PaymentsService.getById(
        actor,
        req.params.paymentId as string
      );

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
};