
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { AuthServiceError, authService } from "./auth.service";
import { loginSchema, setupSchema } from "./auth.validation";

const cookieName = "access_token";

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function setSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "7d",
    issuer: "estateflow-api",
    audience: "estateflow-web",
  });

  res.cookie(cookieName, token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function handleError(res: Response, error: unknown) {
  if (error instanceof AuthServiceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  // Keep details in the server terminal, not in the public response.
  console.error("Authentication request failed:", error);
  res.status(500).json({
    message: "An unexpected server error occurred",
  });
}

export const authController = {
  setup: async (req: Request, res: Response) => {
    const parsed = setupSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid setup details",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await authService.setup(parsed.data);
      setSessionCookie(res, user.id);

      res.status(201).json({
        message: "EstateFlow initial setup completed",
        user,
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  login: async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid login details",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await authService.login(parsed.data);
      setSessionCookie(res, user.id);

      res.status(200).json({
        message: "Login successful",
        user,
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  logout: (_req: Request, res: Response) => {
    res.clearCookie(cookieName, cookieOptions);
    res.status(200).json({
      message: "Logged out successfully",
    });
  },

  me: async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    try {
      const user = await authService.getCurrentUser(req.user.id);
      res.status(200).json({ user });
    } catch (error) {
      handleError(res, error);
    }
  },
};
