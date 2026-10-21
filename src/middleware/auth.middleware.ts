
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../modules/auth/auth.types";

type TokenPayload = {
  sub: string;
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token;

    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (
      typeof decoded === "string" ||
      typeof decoded.sub !== "string"
    ) {
      res.status(401).json({ message: "Invalid authentication token" });
      return;
    }

    const payload = decoded as jwt.JwtPayload & TokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "Account unavailable" });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    };

    req.user = authUser;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
};
