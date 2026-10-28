import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateBookingInput,
  ListBookingsQuery,
  UpdateBookingStatusInput,
} from "./bookings.validation";

export type BookingActor = {
  id: string;
  organizationId: string;
  role: string;
};

export class BookingServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "BookingServiceError";
  }
}

const WRITE_ROLES = ["OWNER", "ADMIN", "MANAGER", "SALES"];

function assertWriteRole(actor: BookingActor) {
  if (!WRITE_ROLES.includes(actor.role)) {
    throw new BookingServiceError(
      "You do not have permission to manage bookings",
      403
    );
  }
}

function jsonValue(value: unknown) {
  return value == null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: BookingActor,
  bookingId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "BOOKING",
      entityId: bookingId,
      action,
      oldValues: jsonValue(oldValues),
      newValues: jsonValue(newValues),
    },
  });
}

const bookingInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  },
  unit: {
    select: {
      id: true,
      unitNumber: true,
      name: true,
      status: true,
      area: true,
      price: true,
      floor: {
        select: {
          id: true,
          floorNumber: true,
          building: {
            select: {
              id: true,
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
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.BookingInclude;

export const BookingsService = {
  async create(actor: BookingActor, input: CreateBookingInput) {
    assertWriteRole(actor);

    try {
      return await prisma.$transaction(
        async (tx) => {
          const customer = await tx.customer.findFirst({
            where: {
              id: input.customerId,
              organizationId: actor.organizationId,
              archivedAt: null,
            },
            select: { id: true },
          });

          if (!customer) {
            throw new BookingServiceError(
              "Active customer not found in your organization",
              404
            );
          }

          const unit = await tx.unit.findFirst({
            where: {
              id: input.unitId,
              archivedAt: null,
              floor: {
                is: {
                  archivedAt: null,
                  building: {
                    is: {
                      archivedAt: null,
                      project: {
                        is: {
                          organizationId: actor.organizationId,
                          archivedAt: null,
                        },
                      },
                    },
                  },
                },
              },
            },
            select: {
              id: true,
              status: true,
              floor: {
                select: {
                  building: {
                    select: {
                      projectId: true,
                    },
                  },
                },
              },
            },
          });

          if (!unit) {
            throw new BookingServiceError(
              "Active unit not found in your organization",
              404
            );
          }

          // Non-manager roles must be assigned to the project.
          if (!["OWNER", "ADMIN", "MANAGER"].includes(actor.role)) {
            const membership = await tx.projectMember.findFirst({
              where: {
                projectId: unit.floor.building.projectId,
                userId: actor.id,
              },
              select: { id: true },
            });

            if (!membership) {
              throw new BookingServiceError(
                "You are not assigned to this project",
                403
              );
            }
          }

          if (unit.status !== "AVAILABLE") {
            throw new BookingServiceError(
              "This unit is not available for booking",
              409
            );
          }

          const existingBooking = await tx.booking.findFirst({
            where: {
              unitId: unit.id,
              organizationId: actor.organizationId,
              status: { in: ["RESERVED", "CONFIRMED"] },
            },
            select: { id: true },
          });

          if (existingBooking) {
            throw new BookingServiceError(
              "This unit already has an active booking",
              409
            );
          }

          // Atomic conditional update prevents two requests from
          // reserving a unit that is no longer AVAILABLE.
          const unitUpdate = await tx.unit.updateMany({
            where: {
              id: unit.id,
              status: "AVAILABLE",
              archivedAt: null,
            },
            data: {
              status: "RESERVED",
            },
          });

          if (unitUpdate.count !== 1) {
            throw new BookingServiceError(
              "This unit was just reserved by another request",
              409
            );
          }

          const booking = await tx.booking.create({
            data: {
              bookingCode: input.bookingCode,
              customerId: customer.id,
              unitId: unit.id,
              agreedPrice: new Prisma.Decimal(input.agreedPrice),
              bookingAmount: new Prisma.Decimal(input.bookingAmount),
              bookingDate: input.bookingDate,
              notes: input.notes,
              organizationId: actor.organizationId,
              createdById: actor.id,
            },
            include: bookingInclude,
          });

          await writeAudit(
            tx,
            actor,
            booking.id,
            "BOOKING_CREATED",
            null,
            {
              bookingCode: booking.bookingCode,
              customerId: booking.customerId,
              unitId: booking.unitId,
              status: booking.status,
              agreedPrice: booking.agreedPrice.toString(),
              bookingAmount: booking.bookingAmount.toString(),
            }
          );

          return booking;
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
        throw new BookingServiceError(
          "This booking code is already in use",
          409
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new BookingServiceError(
          "A concurrent booking operation occurred. Please retry",
          409
        );
      }

      throw error;
    }
  },

  async list(actor: BookingActor, query: ListBookingsQuery) {
    const {
      page,
      limit,
      search,
      status,
      customerId,
      unitId,
      projectId,
      sortBy,
      sortOrder,
    } = query;

    const where: Prisma.BookingWhereInput = {
      organizationId: actor.organizationId,
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(projectId
        ? {
            unit: {
              floor: {
                building: {
                  projectId,
                },
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                bookingCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                customer: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
              {
                customer: {
                  phone: { contains: search, mode: "insensitive" },
                },
              },
              {
                unit: {
                  unitNumber: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, bookings] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getById(actor: BookingActor, bookingId: string) {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        organizationId: actor.organizationId,
      },
      include: bookingInclude,
    });

    if (!booking) {
      throw new BookingServiceError("Booking not found", 404);
    }

    return booking;
  },

  async updateStatus(
    actor: BookingActor,
    bookingId: string,
    input: UpdateBookingStatusInput
  ) {
    assertWriteRole(actor);

    try {
      return await prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.findFirst({
            where: {
              id: bookingId,
              organizationId: actor.organizationId,
            },
          });

          if (!booking) {
            throw new BookingServiceError("Booking not found", 404);
          }

          const targetStatus = input.status;

          if (booking.status === targetStatus) {
            throw new BookingServiceError(
              `Booking is already ${targetStatus}`,
              409
            );
          }

          if (
            booking.status === "CANCELLED" ||
            booking.status === "COMPLETED"
          ) {
            throw new BookingServiceError(
              "Cancelled or completed bookings cannot be changed",
              409
            );
          }

          if (
            targetStatus === "CONFIRMED" &&
            booking.status !== "RESERVED"
          ) {
            throw new BookingServiceError(
              "Only reserved bookings can be confirmed",
              409
            );
          }

          if (
            targetStatus === "COMPLETED" &&
            booking.status !== "CONFIRMED"
          ) {
            throw new BookingServiceError(
              "Only confirmed bookings can be completed",
              409
            );
          }

          if (targetStatus === "CONFIRMED") {
            const unitUpdate = await tx.unit.updateMany({
              where: {
                id: booking.unitId,
                status: "RESERVED",
                archivedAt: null,
              },
              data: { status: "BOOKED" },
            });

            if (unitUpdate.count !== 1) {
              throw new BookingServiceError(
                "Unit status does not allow confirmation",
                409
              );
            }
          }

          if (targetStatus === "CANCELLED") {
            const activeOtherBooking = await tx.booking.findFirst({
              where: {
                unitId: booking.unitId,
                organizationId: actor.organizationId,
                id: { not: booking.id },
                status: { in: ["RESERVED", "CONFIRMED"] },
              },
              select: { id: true },
            });

            if (!activeOtherBooking) {
              await tx.unit.updateMany({
                where: {
                  id: booking.unitId,
                  status: { in: ["RESERVED", "BOOKED"] },
                  archivedAt: null,
                },
                data: { status: "AVAILABLE" },
              });
            }
          }

          if (targetStatus === "COMPLETED") {
            const unitUpdate = await tx.unit.updateMany({
              where: {
                id: booking.unitId,
                status: "BOOKED",
                archivedAt: null,
              },
              data: { status: "SOLD" },
            });

            if (unitUpdate.count !== 1) {
              throw new BookingServiceError(
                "Unit status does not allow completion",
                409
              );
            }
          }

          const updated = await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: targetStatus,
              ...(targetStatus === "CANCELLED"
                ? {
                    cancelledAt: new Date(),
                    cancelledById: actor.id,
                    cancellationReason: input.cancellationReason,
                  }
                : {}),
            },
            include: bookingInclude,
          });

          await writeAudit(
            tx,
            actor,
            booking.id,
            `BOOKING_${targetStatus}`,
            { status: booking.status },
            {
              status: targetStatus,
              ...(targetStatus === "CANCELLED"
                ? {
                    cancellationReason: input.cancellationReason,
                    cancelledById: actor.id,
                  }
                : {}),
            }
          );

          return updated;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new BookingServiceError(
          "A concurrent booking operation occurred. Please retry",
          409
        );
      }

      throw error;
    }
  },
};