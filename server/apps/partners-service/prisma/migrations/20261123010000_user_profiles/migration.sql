CREATE TABLE "user_profiles" (
  "id" UUID PRIMARY KEY,
  "registration_id" UUID NOT NULL,
  "registration_email" TEXT NOT NULL,
  "contact_email" TEXT,
  "phone" TEXT
);

CREATE UNIQUE INDEX "user_profiles_registration_id_key"
  ON "user_profiles" ("registration_id");
