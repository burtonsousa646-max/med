-- Общее для всех интеграций: исходящая очередь, связка с внешними ID, журнал запросов, аудит действий.

-- Исходящие вызовы пишутся в той же транзакции, что и изменение; воркер отправляет с ретраями.
create table outbox (
  id bigint generated always as identity primary key,
  system text not null,                 -- порт: ord, edo, payments, ...
  action text not null,                 -- операция порта: createCreative, sendDocument, ...
  payload jsonb not null,
  idempotency_key text not null unique, -- повтор той же операции не создаёт второй задачи
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);
create index outbox_due on outbox (next_at) where status = 'pending';

-- Наша сущность ↔ её ID во внешней системе: компания ↔ клиент CRM, креатив ↔ erid, платёж ↔ транзакция шлюза.
create table external_refs (
  entity text not null,
  entity_id text not null,
  system text not null,
  external_id text not null,
  data jsonb,
  created_at timestamptz not null default now(),
  primary key (entity, entity_id, system),
  unique (system, external_id)
);

-- Входящие события от внешних систем. Повтор того же события не обрабатывается второй раз.
create table inbound_events (
  system text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (system, event_id)
);

-- Каждый запрос к внешней системе и каждый входящий вебхук. Без секретов и ПДн.
create table integration_log (
  id bigint generated always as identity primary key,
  system text not null,
  direction text not null check (direction in ('out', 'in')),
  action text not null,
  ok boolean not null,
  ms int,
  request jsonb,
  response jsonb,
  created_at timestamptz not null default now()
);
create index integration_log_recent on integration_log (system, created_at desc);

-- Кто что сделал: партнёр, сотрудник билайна или система.
create table audit_log (
  id bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('partner', 'staff', 'system')),
  actor_id text,
  company_id uuid,
  action text not null,
  entity text,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company on audit_log (company_id, created_at desc);
