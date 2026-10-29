
import bcrypt from "bcrypt";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { LoginInput, SetupInput } from "./auth.validation";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  organizationId: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const authService = {
  async setup(input: SetupInput) {
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await prisma.$transaction(
        async (tx) => {
          // This installation supports only one organization.
          const organizationCount = await tx.organization.count();

          if (organizationCount > 0) {
            throw new AuthServiceError(
              "Initial setup is already completed",
              409,
            );
          }

          return tx.user.create({
            data: {
              name: input.name,
              email: input.email,
              passwordHash,
              role: "OWNER",
              organization: {
                create: {
                  name: input.organizationName,
                },
              },
            },
            select: publicUserSelect,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          maxWait: 10_000,
        },
      );
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AuthServiceError(
          "Email is already registered",
          409,
        );
      }

      // Concurrent setup requests must not create multiple organizations.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2028")
      ) {
        throw new AuthServiceError(
          "Setup is being completed or has already been completed. Please try again.",
          409,
        );
      }

      throw error;
    }
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (
      !user ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new AuthServiceError("Invalid email or password", 401);
    }

    if (!user.isActive) {
      throw new AuthServiceError("Account is inactive", 403);
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  },

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user || !user.isActive) {
      throw new AuthServiceError("Account unavailable", 401);
    }

    return user;
  },
};
