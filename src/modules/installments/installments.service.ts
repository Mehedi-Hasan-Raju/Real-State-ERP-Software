import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateInstallmentInput,
  ListInstallmentsQuery,
} from "./installments.validation";

export type FinanceActor = {
  id: string;
  organizationId: string;
  role: string;
};

export class FinanceServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "FinanceServiceError";
  }
}

const INSTALLMENT_WRITE_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SALES",
];

function assertInstallmentWrite(actor: FinanceActor) {
  if (!INSTALLMENT_WRITE_ROLES.includes(actor.role)) {
    throw new FinanceServiceError(
      "You do not have permission to manage installments",
      403
    );
  }
}

function toJson(value: unknown) {
  return value == null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

export async function writeFinanceAudit(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  entityType: string,
  entityId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType,
      entityId,
      action,
      oldValues: toJson(oldValues),
      newValues: toJson(newValues),
    },
  });
}

const installmentInclude = {
  booking: {
    select: {
      id: true,
      bookingCode: true,
      status: true,
      agreedPrice: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitNumber: true,
          floor: {
            select: {
              building: {
                select: {
                  name: true,
                  project: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  payments: {
    orderBy: { paymentDate: "desc" as const },
    select: {
      id: true,
      paymentCode: true,
      amount: true,
      paymentDate: true,
      method: true,
      reference: true,
    },
  },
} satisfies Prisma.InstallmentInclude;

export const InstallmentsService = {
  async create(actor: FinanceActor, input: CreateInstallmentInput) {
    assertInstallmentWrite(actor);

    try {
      return await prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.findFirst({
            where: {
              id: input.bookingId,
              organizationId: actor.organizationId,
              status: { in: ["CONFIRMED", "COMPLETED"] },
            },
            select: {
              id: true,
              agreedPrice: true,
              organizationId: true,
            },
          });

          if (!booking) {
            throw new FinanceServiceError(
              "Confirmed booking not found in your organization",
              404
            );
          }

          const existing = await tx.installment.findMany({
            where: {
              bookingId: booking.id,
              organizationId: actor.organizationId,
              status: { not: "CANCELLED" },
            },
            select: {
              amount: true,
            },
          });

          const allocated = existing.reduce(
            (sum, item) => sum.plus(item.amount),
            new Prisma.Decimal(0)
          );

          const requestedAmount = new Prisma.Decimal(input.amount);

          if (allocated.plus(requestedAmount).greaterThan(booking.agreedPrice)) {
            throw new FinanceServiceError(
              "Total installments cannot exceed the booking agreed price",
              409
            );
          }

          const installment = await tx.installment.create({
            data: {
              bookingId: booking.id,
              organizationId: actor.organizationId,
              installmentNo: input.installmentNo,
              title: input.title,
              amount: requestedAmount,
              dueDate: input.dueDate,
              notes: input.notes,
              createdById: actor.id,
            },
            include: installmentInclude,
          });

          await writeFinanceAudit(
            tx,
            actor,
            "INSTALLMENT",
            installment.id,
            "INSTALLMENT_CREATED",
            null,
            {
              bookingId: booking.id,
              installmentNo: installment.installmentNo,
              title: installment.title,
              amount: installment.amount.toString(),
              dueDate: installment.dueDate.toISOString(),
              status: installment.status,
            }
          );

          return installment;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new FinanceServiceError(
          "This installment number already exists for the booking",
          409
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new FinanceServiceError(
          "Concurrent finance update detected. Please retry",
          409
        );
      }

      throw error;
    }
  },

  async list(actor: FinanceActor, query: ListInstallmentsQuery) {
    const now = new Date();

    const where: Prisma.InstallmentWhereInput = {
      organizationId: actor.organizationId,
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdueOnly === "true"
        ? {
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
            dueDate: { lt: now },
          }
        : {}),
    };

    const [total, installments] = await prisma.$transaction([
      prisma.installment.count({ where }),
      prisma.installment.findMany({
        where,
        include: installmentInclude,
        orderBy: {
          dueDate: query.sortOrder,
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: installments,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(actor: FinanceActor, installmentId: string) {
    const installment = await prisma.installment.findFirst({
      where: {
        id: installmentId,
        organizationId: actor.organizationId,
      },
      include: installmentInclude,
    });

    if (!installment) {
      throw new FinanceServiceError("Installment not found", 404);
    }

    return installment;
  },

  async cancel(actor: FinanceActor, installmentId: string, notes: string) {
    assertInstallmentWrite(actor);

    if (!["OWNER", "ADMIN", "MANAGER"].includes(actor.role)) {
      throw new FinanceServiceError(
        "Only management can cancel installments",
        403
      );
    }

    return prisma.$transaction(async (tx) => {
      const installment = await tx.installment.findFirst({
        where: {
          id: installmentId,
          organizationId: actor.organizationId,
        },
        include: {
          payments: { select: { id: true } },
        },
      });

      if (!installment) {
        throw new FinanceServiceError("Installment not found", 404);
      }

      if (installment.status === "CANCELLED") {
        throw new FinanceServiceError(
          "Installment is already cancelled",
          409
        );
      }

      if (installment.payments.length > 0) {
        throw new FinanceServiceError(
          "An installment with recorded payments cannot be cancelled. Handle its financial adjustment first",
          409
        );
      }

      const updated = await tx.installment.update({
        where: { id: installment.id },
        data: {
          status: "CANCELLED",
          notes: [installment.notes, `Cancellation: ${notes}`]
            .filter(Boolean)
            .join("\n"),
        },
        include: installmentInclude,
      });

      await writeFinanceAudit(
        tx,
        actor,
        "INSTALLMENT",
        installment.id,
        "INSTALLMENT_CANCELLED",
        { status: installment.status },
        { status: updated.status, cancellationNotes: notes }
      );

      return updated;
    });
  },
};