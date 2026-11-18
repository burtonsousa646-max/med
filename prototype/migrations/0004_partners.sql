-- Партнёры: текущая версия оферты, срок приглашений, адрес точки после геокодера.
insert into settings (key, value) values
  ('offer_version', '"2026-10"'),
  ('invitation_ttl_days', '7');

alter table points add column normalized text;
