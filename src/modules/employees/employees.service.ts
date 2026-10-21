import bcrypt from "bcrypt";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateEmployeeInput } from "./employees.validation";

export class EmployeeServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "EmployeeServiceError";
  }
}

const publicEmployeeSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  organizationId: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const employeesService = {
  async create(
    organizationId: string,
    input: CreateEmployeeInput,
  ) {
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          organizationId,
        },
        select: publicEmployeeSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new EmployeeServiceError(
          "This email is already registered",
          409,
        );
      }

      throw error;
    }
  },

  async list(
    organizationId: string,
    page: number,
    limit: number,
  ) {
    const where = { organizationId };

    const [employees, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: publicEmployeeSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      employees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};