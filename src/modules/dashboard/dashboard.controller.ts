
import type { Request, Response } from "express";
import { dashboardQuerySchema } from "./dashboard.validation";
import { DashboardService } from "./dashboard.service";

export class DashboardController {
  static async overview(req: Request, res: Response) {
    try {
      const parsedQuery = dashboardQuerySchema.safeParse(req.query);

      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid dashboard query parameters",
          errors: parsedQuery.error.flatten(),
        });
      }

      if (!req.user?.organizationId) {
        return res.status(403).json({
          success: false,
          message: "Organization context is required",
        });
      }

      const result = await DashboardService.getOverview(
        {
          id: req.user.id,
          role: req.user.role,
          organizationId: req.user.organizationId,
        },
        parsedQuery.data,
      );

      return res.status(200).json({
        success: true,
        message: "Dashboard overview retrieved successfully",
        data: result,
      });
    } catch (error) {
      console.error("Dashboard overview error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve dashboard overview",
      });
    }
  }
}
