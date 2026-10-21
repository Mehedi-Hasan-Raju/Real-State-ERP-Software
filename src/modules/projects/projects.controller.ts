
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { projectsService, ProjectServiceError } from "./projects.service";
import {
  archiveProjectSchema,
  createProjectSchema,
  projectListQuerySchema,
  updateProjectSchema,
} from "./projects.validation";

function handleError(res: Parameters<RequestHandler>[1], error: unknown) {
  if (error instanceof ProjectServiceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  console.error("Project API error:", error);
  res.status(500).json({ message: "Internal server error" });
}

function actorFromRequest(req: Parameters<RequestHandler>[0]) {
  if (!req.user) {
    throw new ProjectServiceError("Authentication required", 401);
  }

  return req.user;
}

export const projectsController = {
  create: (async (req, res) => {
    try {
      const input = createProjectSchema.parse(req.body);
      const project = await projectsService.create(actorFromRequest(req), input);
      res.status(201).json({
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,

  list: (async (req, res) => {
    try {
      const query = projectListQuerySchema.parse(req.query);
      const result = await projectsService.list(actorFromRequest(req), query);
      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,

  getById: (async (req, res) => {
    try {
      const project = await projectsService.getById(
        actorFromRequest(req),
        String(req.params.projectId),
      );
      res.status(200).json({ project });
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,

  update: (async (req, res) => {
    try {
      const input = updateProjectSchema.parse(req.body);
      const project = await projectsService.update(
        actorFromRequest(req),
        String(req.params.projectId),
        input,
      );
      res.status(200).json({
        message: "Project updated successfully",
        project,
      });
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,

  archive: (async (req, res) => {
    try {
      const { reason } = archiveProjectSchema.parse(req.body);
      const project = await projectsService.archive(
        actorFromRequest(req),
        String(req.params.projectId),
        reason,
      );
      res.status(200).json({
        message: "Project archived successfully",
        project,
      });
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,

  restore: (async (req, res) => {
    try {
      const project = await projectsService.restore(
        actorFromRequest(req),
        String(req.params.projectId),
      );
      res.status(200).json({
        message: "Project restored successfully",
        project,
      });
    } catch (error) {
      handleError(res, error);
    }
  }) as RequestHandler,
};
