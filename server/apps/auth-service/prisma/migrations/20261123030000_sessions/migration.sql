CREATE TABLE "auth_sessions" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "verified_email" TEXT NOT NULL,
  "refresh_hash" CHAR(64) NOT NULL UNIQUE,
  "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3)
);

CREATE TABLE "access_tokens" (
  "hash" CHAR(64) PRIMARY KEY,
  "session_id" UUID NOT NULL REFERENCES "auth_sessions" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "access_tokens_session_id_idx" ON "access_tokens" ("session_id");
