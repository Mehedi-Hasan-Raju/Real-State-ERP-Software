
import type { RequestHandler } from "express";
import type { Role } from "../generated/prisma/client";

export const allowRoles = (...roles: Role[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Permission denied" });
      return;
    }

    next();
  };
};
