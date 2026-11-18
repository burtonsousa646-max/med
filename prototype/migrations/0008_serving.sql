-- Показ и отслеживание: поиск повторного клика, срок на спор по типам, априорные конверсии для ставки за результат.
create index clicks_repeat on clicks (campaign_id, med_id, created_at) where billable;
create index conversions_pending on conversions (dispute_until) where status = 'pending';
create index conversions_uncharged on conversions (id) where charge_tx_id is null and status = 'approved';

insert into settings (key, value) values
  ('dispute_days', '{"lead": 7, "promo": 14}'),
  -- доля кликов, которые становятся результатом: переводит ставку за результат в ставку за клик для аукциона
  ('result_rate', '{"lead": 0.05, "promo": 0.03, "coupon": 0.05, "sub": 0.03}'),
  ('ctr_prior_weight', '200');
