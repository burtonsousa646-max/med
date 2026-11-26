CREATE TABLE "telegram_phone_lookup_windows" (
    "sender_id" TEXT NOT NULL,
    "next_lookup_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_phone_lookup_windows_pkey" PRIMARY KEY ("sender_id")
);
