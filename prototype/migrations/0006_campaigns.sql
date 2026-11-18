-- Кампании: креатив-черновик до отправки, срок ссылки руководителю, постоплата для крупного бизнеса.
alter table creatives drop constraint creatives_status_check;
alter table creatives add constraint creatives_status_check check (status in ('draft', 'moderation', 'approved', 'rejected'));
alter table creatives alter column status set default 'draft';

insert into settings (key, value) values
  ('approval_ttl_days', '3'),
  ('postpay_limit_kop', '50000000'); -- 500 000 ₽, только сегмент large
