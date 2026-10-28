import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  customerLedgerQuerySchema,
  financialSummaryQuerySchema,
} from "./finance-reports.validation";
import {
  FinanceReportsService,
} from "./finance-reports.service";
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

export const FinanceReportsController = {
  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const query = financialSummaryQuerySchema.parse(req.query);
      const data = await FinanceReportsService.summary(actor, query);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async customerLedgers(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const actor = actorFrom(req);
      const query = customerLedgerQuerySchema.parse(req.query);
      const data = await FinanceReportsService.listCustomerLedgers(
        actor,
        query
      );

      return res.status(200).json({
        success: true,
        ...data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  async customerLedger(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const actor = actorFrom(req);
      const data = await FinanceReportsService.customerLedger(
        actor,
        req.params.customerId as string
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
};