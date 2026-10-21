import type { Request, Response } from "express";
import {
  EmployeeServiceError,
  employeesService,
} from "./employees.service";
import {
  createEmployeeSchema,
  employeeListQuerySchema,
} from "./employees.validation";

function handleError(res: Response, error: unknown) {
  if (error instanceof EmployeeServiceError) {
    res.status(error.statusCode).json({
      message: error.message,
    });
    return;
  }

  console.error("Employee request failed:", error);
  res.status(500).json({
    message: "An unexpected server error occurred",
  });
}

function hasEmployeeManagementAccess(req: Request) {
  return (
    req.user?.role === "OWNER" ||
    req.user?.role === "ADMIN"
  );
}

export const employeesController = {
  create: async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    if (!hasEmployeeManagementAccess(req)) {
      res.status(403).json({
        message: "You cannot create employee accounts",
      });
      return;
    }

    const parsed = createEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid employee details",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // Admin cannot grant Admin privileges.
    if (
      req.user.role === "ADMIN" &&
      parsed.data.role === "ADMIN"
    ) {
      res.status(403).json({
        message: "Only the Owner can create Admin accounts",
      });
      return;
    }

    try {
      const employee = await employeesService.create(
        req.user.organizationId,
        parsed.data,
      );

      res.status(201).json({
        message: "Employee account created successfully",
        employee,
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  list: async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    if (!hasEmployeeManagementAccess(req)) {
      res.status(403).json({
        message: "You cannot view the employee list",
      });
      return;
    }

    const parsed = employeeListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid pagination parameters",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await employeesService.list(
        req.user.organizationId,
        parsed.data.page,
        parsed.data.limit,
      );

      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  },
};