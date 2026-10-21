import { z } from "zod";

export const assignProjectMemberSchema = z.object({
  userId: z.string().min(1, "Employee ID is required"),
});

export const projectMemberParamsSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  userId: z.string().min(1, "Employee ID is required"),
});

export type AssignProjectMemberInput = z.infer<
  typeof assignProjectMemberSchema
>;