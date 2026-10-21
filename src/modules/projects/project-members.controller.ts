import type { RequestHandler } from "express";
import { ZodError } from "zod";
import {
  assignProjectMemberSchema,
  projectMemberParamsSchema,
} from "./project-members.validation";
import {
  ProjectMemberServiceError,
  projectMembersService,
} from "./project-members.service";

function handleError(
  error: unknown,
  res: Parameters<RequestHandler>[1],
) {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: error.issues,
    });
    return;
  }

  if (error instanceof ProjectMemberServiceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error("Project member error:", error);
  res.status(500).json({ message: "Internal server error" });
}

export const projectMembersController = {
  list: (async (req, res) => {
    try {
      const { projectId } = projectMemberParamsSchema
        .pick({ projectId: true })
        .parse(req.params);

      const members = await projectMembersService.list(
        req.user!,
        projectId,
      );

      res.json({ members });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  assign: (async (req, res) => {
    try {
      const { projectId } = projectMemberParamsSchema
        .pick({ projectId: true })
        .parse(req.params);

      const { userId } = assignProjectMemberSchema.parse(req.body);

      const result = await projectMembersService.assign(
        req.user!,
        projectId,
        userId,
      );

      res.status(201).json({
        message: "Employee assigned to project successfully",
        ...result,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,

  remove: (async (req, res) => {
    try {
      const { projectId, userId } =
        projectMemberParamsSchema.parse(req.params);

      const membership = await projectMembersService.remove(
        req.user!,
        projectId,
        userId,
      );

      res.json({
        message: "Employee removed from project successfully",
        membership,
      });
    } catch (error) {
      handleError(error, res);
    }
  }) as RequestHandler,
};