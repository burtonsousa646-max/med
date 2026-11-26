-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "organization_id" UUID;

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "inn" TEXT NOT NULL,
    "customer_name" TEXT,
    "first_representative_id" UUID NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_inn_key" ON "organizations"("inn");

-- CreateIndex
CREATE INDEX "user_profiles_organization_id_idx" ON "user_profiles"("organization_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_first_representative_id_fkey" FOREIGN KEY ("first_representative_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_inn_format" CHECK (inn ~ '^([0-9]{10}|[0-9]{12})$');
