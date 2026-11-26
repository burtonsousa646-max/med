CREATE TABLE "auth_identities" (
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "registration_id" UUID NOT NULL,
  "user_id" UUID,
  "retry_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("provider", "subject")
);
CREATE UNIQUE INDEX "auth_identities_registration_id_key" ON "auth_identities" ("registration_id");
CREATE INDEX "auth_identities_user_id_retry_at_idx" ON "auth_identities" ("user_id", "retry_at");
