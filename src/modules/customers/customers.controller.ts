import type { Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";

import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  archiveCustomerSchema,
} from "./customers.validation";

import {
  CustomerServiceError,
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  listArchivedCustomers,
  archiveCustomer,
  restoreCustomer,
} from "./customers.service";

import type { CustomerActor } from "./customers.service";

type CustomerRouteParams = { customerId: string };

function getActor(req: Pick<Request, "user">): CustomerActor {
  if (!req.user) {
    throw new CustomerServiceError(401, "Authentication required");
  }

  return {
    id: req.user.id,
    organizationId: req.user.organizationId,
    role: req.user.role,
  };
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      errors: error.issues,
    });
  }

  if (error instanceof CustomerServiceError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return res.status(409).json({
      message: "A record with these details already exists",
    });
  }

  console.error("Customer API error:", error);

  return res.status(500).json({
    message: "Internal server error",
  });
}

export async function createCustomerHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(actor, input);

    return res.status(201).json({
      message: "Customer created successfully",
      data: customer,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listCustomersHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = listCustomersSchema.parse(req.query);
    const result = await listCustomers(actor, input);

    return res.status(200).json({
      message: "Customers retrieved successfully",
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getCustomerHandler(
  req: Request<CustomerRouteParams>,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const customer = await getCustomer(actor, req.params.customerId!);

    return res.status(200).json({
      message: "Customer retrieved successfully",
      data: customer,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateCustomerHandler(
  req: Request<CustomerRouteParams>,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = updateCustomerSchema.parse(req.body);

    const customer = await updateCustomer(
      actor,
      req.params.customerId!,
      input,
    );

    return res.status(200).json({
      message: "Customer updated successfully",
      data: customer,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listArchivedCustomersHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = listCustomersSchema.parse(req.query);
    const result = await listArchivedCustomers(actor, input);

    return res.status(200).json({
      message: "Archived customers retrieved successfully",
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function archiveCustomerHandler(
  req: Request<CustomerRouteParams>,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = archiveCustomerSchema.parse(req.body);

    const result = await archiveCustomer(
      actor,
      req.params.customerId!,
      input,
    );

    return res.status(200).json({
      message: "Customer archived successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function restoreCustomerHandler(
  req: Request<CustomerRouteParams>,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const customer = await restoreCustomer(
      actor,
      req.params.customerId!,
    );

    return res.status(200).json({
      message: "Customer restored successfully",
      data: customer,
    });
  } catch (error) {
    return handleError(res, error);
  }
}