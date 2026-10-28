import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import {
  archiveFloorSchema,
  createFloorSchema,
  floorParamsSchema,
  listFloorsSchema,
  updateFloorSchema,
} from "./floors.validation";
import * as floorService from "./floors.service";

function handleError(res: Response, error: unknown) {
  if (error instanceof floorService.FloorServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "A floor with this number already exists in this building",
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({ message: "Floor not found" });
    }
  }

  console.error("Floor API error:", error);
  return res.status(500).json({ message: "Internal server error" });
}

function getActor(req: Request) {
  if (!req.user) return null;
  return req.user;
}

export async function create(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createFloorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request data",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const floor = await floorService.createFloor(parsed.data, actor);
    return res.status(201).json({ message: "Floor created successfully", data: floor });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function list(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = listFloorsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid query parameters",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const result = await floorService.listFloors(parsed.data, actor);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getById(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const parsed = floorParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid floor ID" });
  }

  try {
    const floor = await floorService.getFloorById(parsed.data.floorId, actor);
    return res.status(200).json({ data: floor });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function update(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const params = floorParamsSchema.safeParse(req.params);
  const body = updateFloorSchema.safeParse(req.body);

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
    const floor = await floorService.updateFloor(
      params.data.floorId,
      body.data,
      actor,
    );
    return res.status(200).json({ message: "Floor updated successfully", data: floor });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listArchived(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  try {
    const floors = await floorService.listArchivedFloors(actor);
    return res.status(200).json({ data: floors });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function archive(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const params = floorParamsSchema.safeParse(req.params);
  const body = archiveFloorSchema.safeParse(req.body);

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
    const floor = await floorService.archiveFloor(
      params.data.floorId,
      body.data.reason,
      actor,
    );
    return res.status(200).json({ message: "Floor archived successfully", data: floor });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function restore(req: Request, res: Response) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ message: "Unauthorized" });

  const params = floorParamsSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ message: "Invalid floor ID" });
  }

  try {
    const floor = await floorService.restoreFloor(params.data.floorId, actor);
    return res.status(200).json({ message: "Floor restored successfully", data: floor });
  } catch (error) {
    return handleError(res, error);
  }
}