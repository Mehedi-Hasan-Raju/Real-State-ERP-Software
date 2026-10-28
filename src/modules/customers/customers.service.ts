import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersInput,
  ArchiveCustomerInput,
} from "./customers.validation";

export type CustomerActor = {
  id: string;
  organizationId: string;
  role: string;
};

export class CustomerServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CustomerServiceError";
  }
}

const WRITE_ROLES = ["OWNER", "ADMIN", "MANAGER", "SALES"];
const ARCHIVE_ROLES = ["OWNER", "ADMIN", "MANAGER"];

function requireRole(actor: CustomerActor, roles: string[]) {
  if (!roles.includes(actor.role)) {
    throw new CustomerServiceError(
      403,
      "You do not have permission to perform this action",
    );
  }
}

function normalizeEmail(email: string | null | undefined) {
  if (email == null || email.trim() === "") return null;
  return email.trim().toLowerCase();
}

function customerSnapshot(customer: {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
}) {
  return {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notes: customer.notes,
  };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    actor: CustomerActor;
    customerId: string;
    action: string;
    oldValues?: Prisma.InputJsonValue;
    newValues?: Prisma.InputJsonValue;
    details: string;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: input.actor.organizationId,
      actorId: input.actor.id,
      entityType: "CUSTOMER",
      entityId: input.customerId,
      action: input.action,
      oldValues: input.oldValues ?? Prisma.JsonNull,
      newValues: input.newValues ?? Prisma.JsonNull,
      details: input.details,
    },
  });
}

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  organizationId: true,
  createdById: true,
  archivedAt: true,
  archiveReason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.CustomerSelect;

export async function createCustomer(
  actor: CustomerActor,
  input: CreateCustomerInput,
) {
  requireRole(actor, WRITE_ROLES);

  const data = {
    name: input.name,
    phone: input.phone,
    email: normalizeEmail(input.email),
    address: input.address ?? null,
    notes: input.notes ?? null,
  };

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        ...data,
        organizationId: actor.organizationId,
        createdById: actor.id,
      },
      select: customerSelect,
    });

    await writeAudit(tx, {
      actor,
      customerId: customer.id,
      action: "CUSTOMER_CREATED",
      newValues: customerSnapshot(customer),
      details: "Customer created",
    });

    return customer;
  });
}

export async function listCustomers(
  actor: CustomerActor,
  input: ListCustomersInput,
) {
  const where: Prisma.CustomerWhereInput = {
    organizationId: actor.organizationId,
    archivedAt: null,
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { phone: { contains: input.search } },
            { email: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: { [input.sortBy]: input.sortOrder },
      skip,
      take: input.limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function getCustomer(
  actor: CustomerActor,
  customerId: string,
) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId: actor.organizationId,
      archivedAt: null,
    },
    select: customerSelect,
  });

  if (!customer) {
    throw new CustomerServiceError(404, "Customer not found");
  }

  return customer;
}

export async function updateCustomer(
  actor: CustomerActor,
  customerId: string,
  input: UpdateCustomerInput,
) {
  requireRole(actor, WRITE_ROLES);

  const existing = await getCustomer(actor, customerId);

  const data: Prisma.CustomerUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined
      ? { email: normalizeEmail(input.email) }
      : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  const oldValues = customerSnapshot(existing);

  return prisma.$transaction(async (tx) => {
    const result = await tx.customer.updateMany({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      data: data as Prisma.CustomerUpdateManyMutationInput,
    });

    if (result.count === 0) {
      throw new CustomerServiceError(404, "Customer not found");
    }

    const customer = await tx.customer.findFirstOrThrow({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: customerSelect,
    });

    await writeAudit(tx, {
      actor,
      customerId,
      action: "CUSTOMER_UPDATED",
      oldValues,
      newValues: customerSnapshot(customer),
      details: "Customer details updated",
    });

    return customer;
  });
}

export async function listArchivedCustomers(
  actor: CustomerActor,
  input: ListCustomersInput,
) {
  const where: Prisma.CustomerWhereInput = {
    organizationId: actor.organizationId,
    archivedAt: { not: null },
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { phone: { contains: input.search } },
            { email: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: { [input.sortBy]: input.sortOrder },
      skip,
      take: input.limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function archiveCustomer(
  actor: CustomerActor,
  customerId: string,
  input: ArchiveCustomerInput,
) {
  requireRole(actor, ARCHIVE_ROLES);

  const existing = await getCustomer(actor, customerId);

  return prisma.$transaction(async (tx) => {
    const archivedAt = new Date();

    const result = await tx.customer.updateMany({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      data: {
        archivedAt,
        archivedById: actor.id,
        archiveReason: input.reason ?? null,
      },
    });

    if (result.count === 0) {
      throw new CustomerServiceError(404, "Customer not found");
    }

    await writeAudit(tx, {
      actor,
      customerId,
      action: "CUSTOMER_ARCHIVED",
      oldValues: {
        archivedAt: null,
        name: existing.name,
      },
      newValues: {
        archivedAt: archivedAt.toISOString(),
        archiveReason: input.reason ?? null,
      },
      details: "Customer archived",
    });

    return { id: customerId, archivedAt };
  });
}

export async function restoreCustomer(
  actor: CustomerActor,
  customerId: string,
) {
  requireRole(actor, ARCHIVE_ROLES);

  const existing = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId: actor.organizationId,
      archivedAt: { not: null },
    },
    select: customerSelect,
  });

  if (!existing) {
    throw new CustomerServiceError(404, "Archived customer not found");
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.customer.updateMany({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
        archivedAt: { not: null },
      },
      data: {
        archivedAt: null,
        archivedById: null,
        archiveReason: null,
      },
    });

    if (result.count === 0) {
      throw new CustomerServiceError(404, "Archived customer not found");
    }

    const customer = await tx.customer.findFirstOrThrow({
      where: {
        id: customerId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: customerSelect,
    });

    await writeAudit(tx, {
      actor,
      customerId,
      action: "CUSTOMER_RESTORED",
      oldValues: {
        archivedAt: existing.archivedAt!.toISOString(),
        archiveReason: existing.archiveReason,
      },
      newValues: { archivedAt: null },
      details: "Customer restored",
    });

    return customer;
  });
}