import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  FinanceServiceError,
  writeFinanceAudit,
  type FinanceActor,
} from "../installments/installments.service";
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
} from "./payments.validation";

const PAYMENT_WRITE_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "SALES",
];

function assertPaymentWrite(actor: FinanceActor) {
  if (!PAYMENT_WRITE_ROLES.includes(actor.role)) {
    throw new FinanceServiceError(
      "You do not have permission to record payments",
      403
    );
  }
}

const paymentInclude = {
  booking: {
    select: {
      id: true,
      bookingCode: true,
      agreedPrice: true,
      status: true,
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
        },
      },
    },
  },
  installment: {
    select: {
      id: true,
      installmentNo: true,
      title: true,
      amount: true,
      dueDate: true,
      status: true,
    },
  },
  receivedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.PaymentInclude;

export const PaymentsService = {
  async create(actor: FinanceActor, input: CreatePaymentInput) {
    assertPaymentWrite(actor);

    try {
      return await prisma.$transaction(
        async (tx) => {
          const installment = await tx.installment.findFirst({
            where: {
              id: input.installmentId,
              organizationId: actor.organizationId,
              status: { in: ["PENDING", "PARTIALLY_PAID"] },
              booking: {
                is: {
                  organizationId: actor.organizationId,
                  status: { in: ["CONFIRMED", "COMPLETED"] },
                },
              },
            },
            include: {
              booking: {
                select: {
                  id: true,
                  agreedPrice: true,
                  organizationId: true,
                },
              },
              payments: {
                select: {
                  amount: true,
                },
              },
            },
          });

          if (!installment) {
            throw new FinanceServiceError(
              "Payable installment not found in your organization",
              404
            );
          }

          const amount = new Prisma.Decimal(input.amount);

          const alreadyPaidOnInstallment = installment.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Prisma.Decimal(0)
          );

          const installmentBalance = installment.amount.minus(
            alreadyPaidOnInstallment
          );

          if (amount.greaterThan(installmentBalance)) {
            throw new FinanceServiceError(
              `Payment exceeds installment balance of ${installmentBalance.toString()}`,
              409
            );
          }

          const bookingPayments = await tx.payment.findMany({
            where: {
              bookingId: installment.bookingId,
              organizationId: actor.organizationId,
            },
            select: { amount: true },
          });

          const totalAlreadyPaid = bookingPayments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Prisma.Decimal(0)
          );

          if (
            totalAlreadyPaid.plus(amount).greaterThan(
              installment.booking.agreedPrice
            )
          ) {
            throw new FinanceServiceError(
              "Payment would exceed the booking's agreed price",
              409
            );
          }

          const payment = await tx.payment.create({
            data: {
              paymentCode: input.paymentCode,
              amount,
              paymentDate: input.paymentDate,
              method: input.method,
              reference: input.reference,
              notes: input.notes,
              organizationId: actor.organizationId,
              bookingId: installment.bookingId,
              installmentId: installment.id,
              receivedById: actor.id,
            },
            include: paymentInclude,
          });

          const newTotalPaid = alreadyPaidOnInstallment.plus(amount);

          const newStatus = newTotalPaid.greaterThanOrEqualTo(
            installment.amount
          )
            ? "PAID"
            : "PARTIALLY_PAID";

          const updatedInstallment = await tx.installment.update({
            where: { id: installment.id },
            data: { status: newStatus },
          });

          await writeFinanceAudit(
            tx,
            actor,
            "PAYMENT",
            payment.id,
            "PAYMENT_RECORDED",
            null,
            {
              paymentCode: payment.paymentCode,
              amount: payment.amount.toString(),
              method: payment.method,
              bookingId: payment.bookingId,
              installmentId: payment.installmentId,
              receivedById: actor.id,
            }
          );

          await writeFinanceAudit(
            tx,
            actor,
            "INSTALLMENT",
            installment.id,
            "INSTALLMENT_PAYMENT_APPLIED",
            {
              status: installment.status,
              totalPaid: alreadyPaidOnInstallment.toString(),
            },
            {
              status: updatedInstallment.status,
              totalPaid: newTotalPaid.toString(),
              remaining: installment.amount.minus(newTotalPaid).toString(),
            }
          );

          return {
            ...payment,
            installmentPaymentSummary: {
              installmentAmount: installment.amount.toString(),
              totalPaid: newTotalPaid.toString(),
              remaining: installment.amount.minus(newTotalPaid).toString(),
              status: updatedInstallment.status,
            },
          };
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
          "This payment code is already in use",
          409
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new FinanceServiceError(
          "Concurrent payment update detected. Please retry",
          409
        );
      }

      throw error;
    }
  },

  async list(actor: FinanceActor, query: ListPaymentsQuery) {
    const where: Prisma.PaymentWhereInput = {
      organizationId: actor.organizationId,
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.installmentId
        ? { installmentId: query.installmentId }
        : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.from || query.to
        ? {
            paymentDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, payments] = await prisma.$transaction([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { paymentDate: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: payments,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(actor: FinanceActor, paymentId: string) {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        organizationId: actor.organizationId,
      },
      include: paymentInclude,
    });

    if (!payment) {
      throw new FinanceServiceError("Payment not found", 404);
    }

    return payment;
  },
};