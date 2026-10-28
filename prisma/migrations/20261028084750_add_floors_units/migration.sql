-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD');

-- CreateEnum
CREATE TYPE "FloorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "status" "FloorStatus" NOT NULL DEFAULT 'ACTIVE',
    "buildingId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "area" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "price" DECIMAL(15,2),
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "floorId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Floor_buildingId_status_idx" ON "Floor"("buildingId", "status");

-- CreateIndex
CREATE INDEX "Floor_buildingId_archivedAt_idx" ON "Floor"("buildingId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_floorNumber_key" ON "Floor"("buildingId", "floorNumber");

-- CreateIndex
CREATE INDEX "Unit_floorId_status_idx" ON "Unit"("floorId", "status");

-- CreateIndex
CREATE INDEX "Unit_floorId_archivedAt_idx" ON "Unit"("floorId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_floorId_unitNumber_key" ON "Unit"("floorId", "unitNumber");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
