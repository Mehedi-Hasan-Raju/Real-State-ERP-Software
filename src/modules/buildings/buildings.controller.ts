import type { RequestHandler, Response } from "express";
import { ZodError } from "zod";
import {
  archiveBuildingSchema,
  buildingIdParamsSchema,
  createBuildingSchema,
  listBuildingsSchema,
  updateBuildingSchema,
} from "./buildings.validation";
import {
  BuildingServiceError,
  buildingsService,
} from "./buildings.service";

function handleError(error: unknown, res: Response) {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: error.issues,
    });
    return;
  }

  if (error instanceof BuildingServiceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error("Building API error:", error);
  res.status(500).json({ message: "Internal server error" });
}

export const buildingsController = {
  create: (async (req, res) => {
    try {
      const input = createBuildingSchema.parse(req.body);
      const building = await buildingsService.create(req.user!, input);

      res.status(201).json({
        message: "Building created successfully",
        building,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  list: (async (req, res) => {
    try {
      const query = listBuildingsSchema.parse(req.query);
      const result = await buildingsService.list(req.user!, query);

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  getById: (async (req, res) => {
    try {
      const { buildingId } = buildingIdParamsSchema.parse(req.params);
      const building = await buildingsService.getById(
        req.user!,
        buildingId,
      );

      res.json({ building });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  update: (async (req, res) => {
    try {
      const { buildingId } = buildingIdParamsSchema.parse(req.params);
      const input = updateBuildingSchema.parse(req.body);

      const building = await buildingsService.update(
        req.user!,
        buildingId,
        input,
      );

      res.json({
        message: "Building updated successfully",
        building,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  archive: (async (req, res) => {
    try {
      const { buildingId } = buildingIdParamsSchema.parse(req.params);
      const { reason } = archiveBuildingSchema.parse(req.body);

      const building = await buildingsService.archive(
        req.user!,
        buildingId,
        reason,
      );

      res.json({
        message: "Building archived successfully",
        building,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  listArchived: (async (req, res) => {
    try {
      const buildings = await buildingsService.listArchived(req.user!);
      res.json({ buildings });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  restore: (async (req, res) => {
    try {
      const { buildingId } = buildingIdParamsSchema.parse(req.params);
      const building = await buildingsService.restore(
        req.user!,
        buildingId,
      );

      res.json({
        message: "Building restored successfully",
        building,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,
};