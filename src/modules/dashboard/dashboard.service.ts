
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { DashboardQuery } from "./dashboard.validation";

type DashboardActor = {
  id: string;
  role: string;
  organizationId: string;
};

const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toString();

const decimalSum = (values: { amount: Prisma.Decimal }[]) =>
  values.reduce(
    (total, item) => total.plus(item.amount),
    new Prisma.Decimal(0),
  );

const activeBookingWhere = {
  status: { not: "CANCELLED" as const },
};

export class DashboardService {
  static async getOverview(
    actor: DashboardActor,
    query: DashboardQuery,
  ) {
    const organizationId = actor.organizationId;
    const now = new Date();

    const paymentDateWhere: Prisma.PaymentWhereInput = {
      organizationId,
      ...(query.from || query.to
        ? {
            paymentDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const overdueWhere: Prisma.InstallmentWhereInput = {
      organizationId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      booking: {
        status: { not: "CANCELLED" },
      },
    };

    const [
      projectCount,
      projectsByStatus,
      buildingCount,
      floorCount,
      unitCount,
      unitsByStatus,
      bookingCount,
      bookingsByStatus,
      activeBookings,
      allPayments,
      periodPayments,
      installments,
      overdueInstallments,
      overdueInstallmentCount,
      recentBookings,
      recentPayments,
    ] = await Promise.all([
      prisma.project.count({
        where: { organizationId, archivedAt: null },
      }),

      prisma.project.groupBy({
        by: ["status"],
        where: { organizationId, archivedAt: null },
        _count: { _all: true },
      }),

      prisma.building.count({
        where: {
          project: { organizationId, archivedAt: null },
          archivedAt: null,
        },
      }),

      prisma.floor.count({
        where: {
          building: {
            project: { organizationId, archivedAt: null },
            archivedAt: null,
          },
          archivedAt: null,
        },
      }),

      prisma.unit.count({
        where: {
          floor: {
            building: {
              project: { organizationId, archivedAt: null },
              archivedAt: null,
            },
            archivedAt: null,
          },
          archivedAt: null,
        },
      }),

      prisma.unit.groupBy({
        by: ["status"],
        where: {
          floor: {
            building: {
              project: { organizationId, archivedAt: null },
              archivedAt: null,
            },
            archivedAt: null,
          },
          archivedAt: null,
        },
        _count: { _all: true },
      }),

      prisma.booking.count({
        where: { organizationId },
      }),

      prisma.booking.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),

      prisma.booking.findMany({
        where: { organizationId, ...activeBookingWhere },
        select: {
          id: true,
          agreedPrice: true,
          payments: {
            select: { amount: true },
          },
        },
      }),

      prisma.payment.findMany({
        where: {
          organizationId,
          booking: { status: { not: "CANCELLED" } },
        },
        select: { amount: true },
      }),

      prisma.payment.findMany({
        where: paymentDateWhere,
        select: { amount: true },
      }),

      prisma.installment.findMany({
        where: {
          organizationId,
          status: { not: "CANCELLED" },
          booking: { status: { not: "CANCELLED" } },
        },
        select: {
          amount: true,
          payments: {
            select: { amount: true },
          },
        },
      }),

      prisma.installment.findMany({
        where: overdueWhere,
        orderBy: { dueDate: "asc" },
        take: 10,
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
          payments: {
            select: { amount: true },
          },
        },
      }),

      prisma.installment.count({
        where: overdueWhere,
      }),

      prisma.booking.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          bookingCode: true,
          status: true,
          agreedPrice: true,
          bookingDate: true,
          customer: {
            select: { name: true },
          },
          unit: {
            select: {
              unitNumber: true,
              floor: {
                select: {
                  building: {
                    select: {
                      name: true,
                      project: {
                        select: { name: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),

      prisma.payment.findMany({
        where: { organizationId },
        orderBy: { paymentDate: "desc" },
        take: 5,
        select: {
          id: true,
          paymentCode: true,
          amount: true,
          paymentDate: true,
          method: true,
          booking: {
            select: {
              bookingCode: true,
              customer: {
                select: { name: true },
              },
            },
          },
        },
      }),
    ]);

    const totalAgreed = activeBookings.reduce(
      (total, booking) => total.plus(booking.agreedPrice),
      new Prisma.Decimal(0),
    );

    const lifetimeCollected = decimalSum(allPayments);

    const collectedInPeriod = decimalSum(periodPayments);

    const outstanding = Prisma.Decimal.max(
      totalAgreed.minus(lifetimeCollected),
      new Prisma.Decimal(0),
    );

    const installmentOutstanding = installments.reduce((total, item) => {
      const paid = decimalSum(item.payments);
      return total.plus(
        Prisma.Decimal.max(
          item.amount.minus(paid),
          new Prisma.Decimal(0),
        ),
      );
    }, new Prisma.Decimal(0));

    const overdueBalance = overdueInstallments.reduce((total, item) => {
      const paid = decimalSum(item.payments);
      return total.plus(
        Prisma.Decimal.max(
          item.amount.minus(paid),
          new Prisma.Decimal(0),
        ),
      );
    }, new Prisma.Decimal(0));

    const mapCounts = <T extends { status: string; _count: { _all: number } }>(
      rows: T[],
    ) =>
      Object.fromEntries(
        rows.map((row) => [row.status, row._count._all]),
      );

    return {
      generatedAt: now.toISOString(),

      overview: {
        projects: projectCount,
        buildings: buildingCount,
        floors: floorCount,
        units: unitCount,
        bookings: bookingCount,
      },

      projectsByStatus: mapCounts(projectsByStatus),
      unitsByStatus: mapCounts(unitsByStatus),
      bookingsByStatus: mapCounts(bookingsByStatus),

      finance: {
        totalAgreed: money(totalAgreed),
        lifetimeCollected: money(lifetimeCollected),
        collectedInPeriod: money(collectedInPeriod),
        outstanding: money(outstanding),
        installmentOutstanding: money(installmentOutstanding),
        overdueInstallmentCount: overdueInstallmentCount,
        overdueBalance: money(overdueBalance),
        period: {
          from: query.from?.toISOString() ?? null,
          to: query.to?.toISOString() ?? null,
        },
      },

      overdueInstallments: overdueInstallments.map((item) => {
        const paid = decimalSum(item.payments);
        const remaining = Prisma.Decimal.max(
          item.amount.minus(paid),
          new Prisma.Decimal(0),
        );

        return {
          id: item.id,
          installmentNo: item.installmentNo,
          title: item.title,
          dueDate: item.dueDate,
          bookingCode: item.booking.bookingCode,
          customer: item.booking.customer,
          amount: money(item.amount),
          paid: money(paid),
          remaining: money(remaining),
        };
      }),

      recentBookings: recentBookings.map((booking) => ({
        ...booking,
        agreedPrice: money(booking.agreedPrice),
      })),

      recentPayments: recentPayments.map((payment) => ({
        ...payment,
        amount: money(payment.amount),
      })),
    };
  }
}
