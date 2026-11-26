import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { channelKey } from '../../application/dispatch.ts'
import type { NotificationsDatabase } from '../prisma/database.ts'

const bounds = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 3, 10]

/** Хранит длительности RPC и строит агрегаты журнала с ограниченными наборами меток. */
export class NotificationsMetrics {
  private readonly buckets = bounds.map(() => 0)
  private count = 0
  private errors = 0
  private sum = 0

  observe(durationSeconds: number, succeeded: boolean) {
    this.count++
    if (!succeeded) this.errors++
    this.sum += durationSeconds
    for (const [index, bound] of bounds.entries()) {
      if (durationSeconds <= bound) this.buckets[index] = (this.buckets[index] ?? 0) + 1
    }
  }

  async render(
    db: NotificationsDatabase,
    stream?: { healthy: boolean; lagMs: number | undefined; ignored: number },
  ) {
    const [attempts, pending, skipped, replayed, events] = await Promise.all([
      db.$queryRaw<{ channel: string; transport: string; outcome: string; count: number }[]>`
        SELECT CASE c.channel
          WHEN ${channelKey(NotificationChannel.NOTIFICATION_CHANNEL_EMAIL)} THEN 'email'
          WHEN ${channelKey(NotificationChannel.NOTIFICATION_CHANNEL_TELEGRAM)} THEN 'telegram'
          ELSE 'other' END AS channel,
          CASE WHEN a.transport IN ('smtp','postbox','telegram','unconfigured','external-unconfigured')
            THEN a.transport ELSE 'other' END AS transport,
          a.submission::text AS outcome, count(*)::float8 AS count
        FROM submission_attempts a JOIN dispatch_channels c ON c.id = a.channel_id
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
      `,
      db.$queryRaw<{ age: number }[]>`
        SELECT GREATEST(0, COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - MIN(started_at))), 0))::float8 AS age
        FROM submission_attempts WHERE submission = 'unconfirmed'
      `,
      db.dispatchAudit.count({
        where: { OR: [{ event: 'expired' }, { event: { startsWith: 'skipped:' } }] },
      }),
      db.dispatchAudit.count({ where: { event: 'already_started' } }),
      db.postboxEvent.groupBy({ by: ['result'], _count: true }),
    ])

    const lines = [
      '# TYPE notifications_rpc_duration_seconds histogram',
      ...bounds.map(
        (bound, index) =>
          `notifications_rpc_duration_seconds_bucket{le="${bound}"} ${this.buckets[index] ?? 0}`,
      ),
      `notifications_rpc_duration_seconds_bucket{le="+Inf"} ${this.count}`,
      `notifications_rpc_duration_seconds_count ${this.count}`,
      `notifications_rpc_duration_seconds_sum ${this.sum}`,
      '# TYPE notifications_rpc_errors_total counter',
      `notifications_rpc_errors_total ${this.errors}`,
      '# TYPE notifications_attempts gauge',
      ...attempts.map(
        ({ channel, transport, outcome, count }) =>
          `notifications_attempts{channel="${channel}",transport="${transport}",outcome="${outcome}"} ${count}`,
      ),
      '# TYPE notifications_oldest_unconfirmed_seconds gauge',
      `notifications_oldest_unconfirmed_seconds ${pending[0]?.age ?? 0}`,
      '# TYPE notifications_skips_total counter',
      `notifications_skips_total ${skipped}`,
      '# TYPE notifications_replays_without_submission_total counter',
      `notifications_replays_without_submission_total ${replayed}`,
      '# TYPE notifications_postbox_events_total counter',
      ...['matched', 'unmatched', 'conflict'].map(
        (result) =>
          `notifications_postbox_events_total{result="${result}"} ${events.find((row) => row.result === result)?._count ?? 0}`,
      ),
    ]
    if (stream) {
      lines.push(
        '# TYPE notifications_postbox_stream_healthy gauge',
        `notifications_postbox_stream_healthy ${Number(stream.healthy)}`,
      )
      lines.push(
        '# TYPE notifications_postbox_records_ignored_total counter',
        `notifications_postbox_records_ignored_total ${stream.ignored}`,
      )
      if (stream.lagMs !== undefined) {
        lines.push(
          '# TYPE notifications_postbox_stream_lag_seconds gauge',
          `notifications_postbox_stream_lag_seconds ${stream.lagMs / 1000}`,
        )
      }
    }
    return lines.join('\n') + '\n'
  }
}
