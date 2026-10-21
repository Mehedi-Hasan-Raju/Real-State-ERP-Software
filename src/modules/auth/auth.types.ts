
import type { Role } from "../../generated/prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
