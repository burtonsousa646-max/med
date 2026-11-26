-- CreateEnum
CREATE TYPE "invitation_state" AS ENUM ('pending', 'replaced', 'accepted', 'revoked');

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "state" "invitation_state" NOT NULL DEFAULT 'pending',
    "accepted_by_id" UUID,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Замена и вставка происходят в одной транзакции.
CREATE UNIQUE INDEX invitations_pending_recipient_key
  ON invitations (organization_id, recipient_email) WHERE state = 'pending';

ALTER TABLE invitations ADD CONSTRAINT invitations_accepted_by_check
  CHECK ((state = 'accepted') = (accepted_by_id IS NOT NULL));
