CREATE TABLE "postbox_events" (
    "source" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "attempt_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "postbox_events_pkey" PRIMARY KEY ("source", "event_id")
);

CREATE TABLE "postbox_stream_positions" (
    "source" TEXT NOT NULL,
    "shard" TEXT NOT NULL,
    "sequence_number" TEXT NOT NULL,
    CONSTRAINT "postbox_stream_positions_pkey" PRIMARY KEY ("source", "shard")
);
