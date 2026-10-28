import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import {
  archiveUnitSchema,
  createUnitSchema,
  listUnitsSchema,
  unitParamsSchema,
  updateUnitSchema,
} from "./units.validation";
import * as unitService from "./units.service";

function handleError(res: Response, error: unknown) {
  if (error instanceof unitService.UnitServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "A unit with this number already exists on this floor",
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({ message: "Unit not found" });
    }
  }

  console.error("Unit API error:", error);
  return res.status(500).json({ message: "Internal server error" });
}

function getActor(req: Request) {
  return req.user ?? null;
}

export async function create(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request data",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const unit = await unitService.createUnit(parsed.data, actor);
    return res.status(201).json({ message: "Unit created successfully", data: unit });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function list(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = listUnitsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid query parameters",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const result = await unitService.listUnits(parsed.data, actor);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getById(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = unitParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid unit ID" });
  }

  try {
    const unit = await unitService.getUnitById(parsed.data.unitId, actor);
    return res.status(200).json({ data: unit });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function update(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const params = unitParamsSchema.safeParse(req.params);
  const body = updateUnitSchema.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({
      message: "Invalid request data",
      errors: !params.success
        ? params.error.flatten()
        : body.success
          ? undefined
          : body.error.flatten(),
    });
  }

  try {
    const unit = await unitService.updateUnit(
      params.data.unitId,
      body.data,
      actor,
    );
    return res.status(200).json({ message: "Unit updated successfully", data: unit });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listArchived(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  try {
    const units = await unitService.listArchivedUnits(actor);
    return res.status(200).json({ data: units });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function archive(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const params = unitParamsSchema.safeParse(req.params);
  const body = archiveUnitSchema.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({
      message: "Invalid request data",
      errors: !params.success
        ? params.error.flatten()
        : body.success
          ? undefined
          : body.error.flatten(),
    });
  }

  try {
    const unit = await unitService.archiveUnit(
      params.data.unitId,
      body.data.reason,
      actor,
    );
    return res.status(200).json({ message: "Unit archived successfully", data: unit });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function restore(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = unitParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid unit ID" });
  }

  try {
    const unit = await unitService.restoreUnit(parsed.data.unitId, actor);
    return res.status(200).json({ message: "Unit restored successfully", data: unit });
  } catch (error) {
    return handleError(res, error);
  }
}