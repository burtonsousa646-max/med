ALTER TABLE "email_deliveries"
  ADD COLUMN "retry_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  ADD COLUMN "lease_id" UUID,
  ADD COLUMN "retry_attempt_id" UUID;
CREATE INDEX "email_deliveries_pending_idx" ON "email_deliveries" ("retry_at") WHERE "sent_at" IS NULL;
