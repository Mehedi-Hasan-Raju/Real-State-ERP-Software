import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  FinanceServiceError,
  type FinanceActor,
} from "../installments/installments.service";
import type {
  CustomerLedgerQuery,
  FinancialSummaryQuery,
} from "./finance-reports.validation";

const REPORT_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "SALES",
];

function assertReportAccess(actor: FinanceActor) {
  if (!REPORT_ROLES.includes(actor.role)) {
    throw new FinanceServiceError(
      "You do not have permission to view financial reports",
      403
    );
  }
}

function sumAmounts(
  values: Array<{ amount: Prisma.Decimal }>
): Prisma.Decimal {
  return values.reduce(
    (total, item) => total.plus(item.amount),
    new Prisma.Decimal(0)
  );
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2).toString();
}

function paymentDateFilter(from?: Date, to?: Date) {
  if (!from && !to) return {};

  return {
    paymentDate: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

const ledgerBookingInclude = {
  unit: {
    select: {
      id: true,
      unitNumber: true,
      name: true,
      status: true,
      floor: {
        select: {
          floorNumber: true,
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
  installments: {
    orderBy: { installmentNo: "asc" as const },
    include: {
      payments: {
        orderBy: { paymentDate: "asc" as const },
        select: {
          id: true,
          paymentCode: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
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
      installmentId: true,
    },
  },
} satisfies Prisma.BookingInclude;

export const FinanceReportsService = {
  async customerLedger(
    actor: FinanceActor,
    customerId: string
  ) {
    assertReportAccess(actor);

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        archivedAt: true,
        bookings: {
          where: {
            organizationId: actor.organizationId,
          },
          orderBy: { createdAt: "desc" },
          include: ledgerBookingInclude,
        },
      },
    });

    if (!customer) {
      throw new FinanceServiceError("Customer not found", 404);
    }

    const bookings = customer.bookings.map((booking) => {
      const totalPaid = sumAmounts(booking.payments);
      const outstanding = Prisma.Decimal.max(
        booking.agreedPrice.minus(totalPaid),
        new Prisma.Decimal(0)
      );

      const installments = booking.installments.map((installment) => {
        const installmentPaid = sumAmounts(installment.payments);
        const remaining = Prisma.Decimal.max(
          installment.amount.minus(installmentPaid),
          new Prisma.Decimal(0)
        );

        const overdue =
          remaining.greaterThan(0) &&
          installment.dueDate.getTime() < Date.now() &&
          installment.status !== "CANCELLED";

        return {
          id: installment.id,
          installmentNo: installment.installmentNo,
          title: installment.title,
          dueDate: installment.dueDate,
          status: installment.status,
          amount: money(installment.amount),
          paid: money(installmentPaid),
          remaining: money(remaining),
          overdue,
          payments: installment.payments.map((payment) => ({
            ...payment,
            amount: money(payment.amount),
          })),
        };
      });

      return {
        id: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        bookingDate: booking.bookingDate,
        agreedPrice: money(booking.agreedPrice),
        bookingAmount: money(booking.bookingAmount),
        totalPaid: money(totalPaid),
        outstanding: money(outstanding),
        unit: booking.unit,
        installments,
        payments: booking.payments.map((payment) => ({
          ...payment,
          amount: money(payment.amount),
        })),
      };
    });

    const totalAgreed = bookings.reduce(
      (total, booking) => total.plus(booking.agreedPrice),
      new Prisma.Decimal(0)
    );

    const totalPaid = bookings.reduce(
      (total, booking) => total.plus(booking.totalPaid),
      new Prisma.Decimal(0)
    );

    const totalOutstanding = bookings.reduce(
      (total, booking) => total.plus(booking.outstanding),
      new Prisma.Decimal(0)
    );

    const activeBookings = bookings.filter(
      (booking) =>
        booking.status === "RESERVED" ||
        booking.status === "CONFIRMED"
    ).length;

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        archived: customer.archivedAt !== null,
      },
      summary: {
        bookingCount: bookings.length,
        activeBookingCount: activeBookings,
        totalAgreed: money(totalAgreed),
        totalPaid: money(totalPaid),
        outstanding: money(totalOutstanding),
      },
      bookings,
    };
  },

  async listCustomerLedgers(
    actor: FinanceActor,
    query: CustomerLedgerQuery
  ) {
    assertReportAccess(actor);

    const where: Prisma.CustomerWhereInput = {
      organizationId: actor.organizationId,
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const [total, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          bookings: {
            where: {
              organizationId: actor.organizationId,
            },
            select: {
              id: true,
              status: true,
              agreedPrice: true,
              payments: {
                select: { amount: true, paymentDate: true },
              },
            },
          },
        },
      }),
    ]);

    const data = customers.map((customer) => {
      const bookings = customer.bookings;

      const totalAgreed = bookings.reduce(
        (sum, booking) =>
          sum.plus(
            booking.status === "CANCELLED"
              ? new Prisma.Decimal(0)
              : booking.agreedPrice
          ),
        new Prisma.Decimal(0)
      );

      const allPayments = bookings.flatMap(
        (booking) => booking.payments
      );

      const totalPaid = sumAmounts(allPayments);

      const periodPayments = allPayments.filter((payment) => {
        if (query.from && payment.paymentDate < query.from) return false;
        if (query.to && payment.paymentDate > query.to) return false;
        return true;
      });

      const periodCollected = sumAmounts(periodPayments);

      return {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        bookingCount: bookings.length,
        totalAgreed: money(totalAgreed),
        totalPaid: money(totalPaid),
        outstanding: money(
          Prisma.Decimal.max(
            totalAgreed.minus(totalPaid),
            new Prisma.Decimal(0)
          )
        ),
        collectedInPeriod: money(periodCollected),
      };
    });

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async summary(
    actor: FinanceActor,
    query: FinancialSummaryQuery
  ) {
    assertReportAccess(actor);

    const bookingWhere: Prisma.BookingWhereInput = {
      organizationId: actor.organizationId,
      status: { not: "CANCELLED" },
    };

    const paymentWhere: Prisma.PaymentWhereInput = {
      organizationId: actor.organizationId,
      ...paymentDateFilter(query.from, query.to),
    };

    const installmentWhere: Prisma.InstallmentWhereInput = {
      organizationId: actor.organizationId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      dueDate: { lt: new Date() },
    };

    const [
      bookings,
      payments,
      installments,
      overdueInstallments,
    ] = await prisma.$transaction([
      prisma.booking.findMany({
        where: bookingWhere,
        select: {
          id: true,
          agreedPrice: true,
          status: true,
          payments: {
            select: { amount: true },
          },
        },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true },
      }),
      prisma.installment.findMany({
        where: {
          organizationId: actor.organizationId,
          status: { not: "CANCELLED" },
        },
        select: {
          amount: true,
          payments: { select: { amount: true } },
        },
      }),
      prisma.installment.findMany({
        where: installmentWhere,
        select: {
          id: true,
          installmentNo: true,
          title: true,
          amount: true,
          dueDate: true,
          booking: {
            select: {
              bookingCode: true,
              customer: {
                select: { name: true, phone: true },
              },
            },
          },
          payments: { select: { amount: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const totalAgreed = bookings.reduce(
      (sum, booking) => sum.plus(booking.agreedPrice),
      new Prisma.Decimal(0)
    );

    // Lifetime receipts for outstanding balance.
    const lifetimePaid = bookings.reduce(
      (sum, booking) =>
        sum.plus(sumAmounts(booking.payments)),
      new Prisma.Decimal(0)
    );

    // Date-filtered receipts for the selected reporting period.
    const collectedInPeriod = sumAmounts(payments);

    const outstanding = Prisma.Decimal.max(
      totalAgreed.minus(lifetimePaid),
      new Prisma.Decimal(0)
    );

    const totalInstallmentDue = installments.reduce(
      (sum, installment) => {
        const paid = sumAmounts(installment.payments);
        return sum.plus(
          Prisma.Decimal.max(
            installment.amount.minus(paid),
            new Prisma.Decimal(0)
          )
        );
      },
      new Prisma.Decimal(0)
    );

    const overdueBalance = overdueInstallments.reduce(
      (sum, installment) => {
        const paid = sumAmounts(installment.payments);
        return sum.plus(
          Prisma.Decimal.max(
            installment.amount.minus(paid),
            new Prisma.Decimal(0)
          )
        );
      },
      new Prisma.Decimal(0)
    );

    return {
      period: {
        from: query.from ?? null,
        to: query.to ?? null,
      },
      summary: {
        bookingCount: bookings.length,
        reservedBookings: bookings.filter(
          (booking) => booking.status === "RESERVED"
        ).length,
        confirmedBookings: bookings.filter(
          (booking) => booking.status === "CONFIRMED"
        ).length,
        completedBookings: bookings.filter(
          (booking) => booking.status === "COMPLETED"
        ).length,
        totalAgreed: money(totalAgreed),
        lifetimeCollected: money(lifetimePaid),
        collectedInPeriod: money(collectedInPeriod),
        outstanding: money(outstanding),
        installmentOutstanding: money(totalInstallmentDue),
        overdueInstallmentCount: overdueInstallments.length,
        overdueBalance: money(overdueBalance),
      },
      overdueInstallments: overdueInstallments.map((item) => {
        const paid = sumAmounts(item.payments);
        const remaining = Prisma.Decimal.max(
          item.amount.minus(paid),
          new Prisma.Decimal(0)
        );

        return {
          id: item.id,
          bookingCode: item.booking.bookingCode,
          customer: item.booking.customer,
          installmentNo: item.installmentNo,
          title: item.title,
          dueDate: item.dueDate,
          amount: money(item.amount),
          paid: money(paid),
          remaining: money(remaining),
        };
      }),
    };
  },
};