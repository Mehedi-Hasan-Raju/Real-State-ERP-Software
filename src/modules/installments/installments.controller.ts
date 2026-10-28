import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createInstallmentSchema,
  listInstallmentsSchema,
  cancelInstallmentSchema,
} from "./installments.validation";
import {
  InstallmentsService,
  FinanceServiceError,
  type FinanceActor,
} from "./installments.service";

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

export const InstallmentsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const input = createInstallmentSchema.parse(req.body);
      const data = await InstallmentsService.create(actor, input);

      return res.status(201).json({
        success: true,
        message: "Installment created successfully",
        data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const query = listInstallmentsSchema.parse(req.query);
      const result = await InstallmentsService.list(actor, query);

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
      const data = await InstallmentsService.getById(
        actor,
        req.params.installmentId as string
      );

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const input = cancelInstallmentSchema.parse(req.body);
      const data = await InstallmentsService.cancel(
        actor,
        req.params.installmentId as string,
        input.notes
      );

      return res.status(200).json({
        success: true,
        message: "Installment cancelled successfully",
        data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
};