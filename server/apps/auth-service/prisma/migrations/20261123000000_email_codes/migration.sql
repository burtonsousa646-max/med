CREATE TABLE "email_challenges" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE CHECK ("email" = lower("email")),
  "sealed_code" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_sent_at" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
  "consumed" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "email_deliveries" (
  "id" UUID PRIMARY KEY,
  "challenge_id" UUID NOT NULL REFERENCES "email_challenges"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "sent_at" TIMESTAMPTZ(3)
);
CREATE INDEX "email_deliveries_challenge_id_idx" ON "email_deliveries" ("challenge_id");
