-- CreateEnum
CREATE TYPE "submission_outcome" AS ENUM ('unconfirmed', 'sent', 'not_sent');

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "initiator" TEXT NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "key_version" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_channels" (
    "id" UUID NOT NULL,
    "dispatch_key" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "dispatch_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attempts" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "predecessor_id" UUID,
    "transport" TEXT NOT NULL,
    "sender_config" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submission" "submission_outcome" NOT NULL DEFAULT 'unconfirmed',
    "reason" TEXT,
    "provider_id" TEXT,
    "delivery" TEXT,

    CONSTRAINT "submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_audit" (
    "id" UUID NOT NULL,
    "dispatch_key" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "channel" TEXT,
    "attempt_id" UUID,

    CONSTRAINT "dispatch_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_initiator_dispatch_id_key" ON "dispatches"("initiator", "dispatch_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_channels_dispatch_key_channel_key" ON "dispatch_channels"("dispatch_key", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attempts_predecessor_id_key" ON "submission_attempts"("predecessor_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attempts_channel_id_number_key" ON "submission_attempts"("channel_id", "number");

-- CreateIndex
CREATE INDEX "dispatch_audit_dispatch_key_recorded_at_idx" ON "dispatch_audit"("dispatch_key", "recorded_at");

-- AddForeignKey
ALTER TABLE "dispatch_channels" ADD CONSTRAINT "dispatch_channels_dispatch_key_fkey" FOREIGN KEY ("dispatch_key") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "dispatch_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "submission_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_audit" ADD CONSTRAINT "dispatch_audit_dispatch_key_fkey" FOREIGN KEY ("dispatch_key") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
