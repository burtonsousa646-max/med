-- Ядро платформы: люди и компании, справочники, кампании, модерация, деньги, документы, аудитории, события.
-- Деньги — bigint в копейках (суффикс _kop). Время — timestamptz. Всё, что принадлежит партнёру, несёт company_id.

/* ───────── identity ───────── */

-- Человек со стороны партнёра. Один человек может состоять в нескольких компаниях.
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text unique,
  phone text unique,
  created_at timestamptz not null default now()
);

-- Сотрудник билайна: модератор, менеджер, финансист, администратор.
create table staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  roles text[] not null default '{}' check (roles <@ array['moderator', 'manager', 'finance', 'admin']),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Как человек входит: ЕСИА, СберБизнес ID, Альфа ID, ЛК B2B, SSO билайна, код на почту. subject — ID у провайдера.
create table identities (
  provider text not null,
  subject text not null,
  user_id uuid references users on delete cascade,
  staff_id uuid references staff on delete cascade,
  data jsonb,
  created_at timestamptz not null default now(),
  primary key (provider, subject),
  check ((user_id is null) <> (staff_id is null))
);

-- Одноразовые коды входа и подтверждения. Храним только хеш.
create table otp_codes (
  id bigint generated always as identity primary key,
  target text not null,              -- почта или телефон
  purpose text not null,             -- login, sign
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_codes_target on otp_codes (target, created_at desc);

-- Сессии. В cookie лежит случайный токен, в базе — его хеш.
create table sessions (
  token_hash text primary key,
  user_id uuid references users on delete cascade,
  staff_id uuid references staff on delete cascade,
  company_id uuid,                   -- текущая компания партнёра
  provider text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (staff_id is null))
);

/* ───────── partners ───────── */

create table companies (
  id uuid primary key default gen_random_uuid(),
  inn text not null unique,
  kpp text,
  ogrn text,
  name text not null,
  brand text not null default '',
  segment text not null default 'small' check (segment in ('small', 'medium', 'large')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'verified', 'rejected', 'blocked')),
  kyc_data jsonb,                    -- ответ реестра: статус юрлица, адрес, руководитель, риски
  bank jsonb,                        -- { bik, account, bank }
  site text,
  phone text,
  notify jsonb not null default '{"sms": true, "mail": true, "tg": false}',
  edo_operator text,
  auto_topup boolean not null default false,
  offer_version text,                -- версия принятой оферты
  offer_accepted_at timestamptz,
  agency_id uuid references companies, -- субклиент агентства
  created_at timestamptz not null default now()
);

create table memberships (
  company_id uuid not null references companies on delete cascade,
  user_id uuid not null references users on delete cascade,
  role text not null check (role in ('owner', 'staff', 'accountant', 'agency')),
  title text not null default '',
  signer boolean not null default false, -- может подписывать и принимать оферту
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  target text not null,              -- почта или телефон
  role text not null check (role in ('staff', 'accountant')),
  token_hash text not null unique,
  invited_by uuid references users,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table points (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  addr text not null,
  lat double precision not null,
  lon double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index points_company on points (company_id);

-- Согласия со стороны партнёра: обработка данных компании, подписанта, профиля. Отзыв — новая строка не нужна, ставим revoked_at.
create table partner_consents (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  user_id uuid references users,
  kind text not null,
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

/* ───────── catalog ───────── */

-- Места показа на поверхностях билайна. pricing — за что платит рекламодатель.
create table placements (
  id text primary key,               -- showcase, app.main, app.paid, ...
  surface text not null,             -- app, site, shop, b2b, tv, push
  name text not null,
  format text not null,
  pricing text not null check (pricing in ('cpc', 'cpm')),
  base_ctr numeric,                  -- априорный CTR, %, для скора и прогноза
  slots int not null default 1,      -- сколько мест в одном показе
  min_bid_kop bigint not null,       -- минимальная ставка T1
  needs_consent boolean not null default false, -- пуши: только с согласием на рекламу
  active boolean not null default true,
  spec jsonb                         -- техтребования к креативу
);

-- Типы офферов: переход, купон, заявка, промокод, подписка. data — тексты и поля условий для кабинета.
create table offer_types (
  id text primary key,
  share boolean not null,            -- true — платит клиент, партнёр получает выплаты
  fee_pct numeric not null default 0,
  data jsonb not null
);

-- Каталог сигналов и триггеров. tier — T1 контекст, T2 профиль, T3 триггер, T4 триггер + закрытый цикл.
create table triggers (
  id text primary key,
  grp text not null,
  name text not null,
  tier text not null check (tier in ('T1', 'T2', 'T3', 'T4')),
  value text not null check (value in ('hot', 'week', 'wide', 'off')), -- off — не продаётся
  source text not null default 'beeline',
  ttl_days int,
  max_advertisers int,               -- сколько разных рекламодателей на человека в окне
  min_bid_kop bigint,
  reach_hint int,                    -- оценка охвата для прогноза до подключения DMP
  spec jsonb                         -- определение, исключения, разрешённые категории
);

create table stop_words (
  id bigint generated always as identity primary key,
  pattern text not null,             -- регулярное выражение
  why text not null,
  fix text not null,
  active boolean not null default true
);

-- Параметры, которые меняет бэкофис: бонус первой кампании, наценка широкой карточки, сбор ОРД.
create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references staff,
  updated_at timestamptz not null default now()
);

/* ───────── campaigns ───────── */

create table campaigns (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  type text not null references offer_types,
  status text not null default 'draft'
    check (status in ('draft', 'approval', 'invoice', 'moderation', 'rejected', 'live', 'paused', 'finished', 'archived')),
  name text not null default '',
  mode text not null default 'auto' check (mode in ('auto', 'manual', 'plan', 'special')),
  goal text,
  terms jsonb not null default '{}',     -- условия оффера по полям типа + способ подтверждения
  targeting jsonb not null default '{}', -- { signals: { id: any|and|not }, radiusM, points: [id] }
  placements text[] not null default '{}',
  wide_card boolean not null default false,
  bid_kop bigint,                        -- ставка за клик или результат; null — автоставка
  budget_month_kop bigint not null default 0,
  daily_cap_kop bigint,
  pay_method text check (pay_method in ('sbp', 'card', 'invoice', 'post')),
  landing_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  launched_at timestamptz,
  created_by uuid references users,
  version int not null default 1,        -- оптимистичная блокировка правок
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_company on campaigns (company_id, created_at desc);
create index campaigns_live on campaigns (status) where status = 'live';

-- Креатив. Каждая правка — новая версия; в показ идёт последняя одобренная.
create table creatives (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references campaigns on delete cascade,
  version int not null,
  ad_text text not null,
  image_key text,                        -- ключ в хранилище файлов
  data jsonb,
  status text not null default 'moderation' check (status in ('moderation', 'approved', 'rejected')),
  erid text unique,                      -- маркировка, выдаёт ОРД
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

-- Сотрудник отправил кампанию руководителю: ссылка с токеном, срок жизни.
create table approvals (
  token_hash text primary key,
  campaign_id bigint not null references campaigns on delete cascade,
  requested_by uuid references users,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_by uuid references users,
  created_at timestamptz not null default now()
);

create table special_requests (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  data jsonb not null,
  status text not null default 'new' check (status in ('new', 'in_work', 'done', 'declined')),
  manager_id uuid references staff,
  created_at timestamptz not null default now()
);

/* ───────── moderation ───────── */

create table moderation_tasks (
  id bigint generated always as identity primary key,
  creative_id bigint not null references creatives on delete cascade,
  company_id uuid not null references companies on delete cascade,
  status text not null default 'auto' check (status in ('auto', 'queued', 'approved', 'rejected')),
  auto_result jsonb,                     -- стоп-слова, вердикт модели, уверенность
  reason text,                           -- причина для партнёра
  decided_by uuid references staff,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index moderation_queue on moderation_tasks (created_at) where status = 'queued';

/* ───────── billing: двойная запись ───────── */

-- Счета. У партнёра — основной, бонусный, холд и выплаты; у платформы — системные (company_id null).
create table accounts (
  id bigint generated always as identity primary key,
  company_id uuid references companies on delete cascade,
  kind text not null check (kind in (
    'partner_main', 'partner_bonus', 'partner_payout',
    'beeline_revenue', 'gateway', 'bank', 'bonus_fund', 'ord_fee', 'payout_clearing', 'adjustment')),
  created_at timestamptz not null default now(),
  unique nulls not distinct (company_id, kind)
);

-- Операция: пополнение, списание за клики, бонус, выплата, возврат, корректировка. Ключ идемпотентности обязателен.
create table transactions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('topup', 'charge', 'bonus', 'payout', 'refund', 'adjustment', 'commission')),
  idempotency_key text not null unique,
  company_id uuid references companies,
  campaign_id bigint references campaigns,
  memo text not null default '',
  staff_id uuid references staff,        -- кто сделал ручную корректировку
  created_at timestamptz not null default now()
);

-- Проводки. Сумма проводок одной операции всегда ноль — проверяется в конце транзакции базы.
create table entries (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references transactions,
  account_id bigint not null references accounts,
  amount_kop bigint not null check (amount_kop <> 0)
);
create index entries_account on entries (account_id);
create index entries_tx on entries (transaction_id);

create function entries_balanced() returns trigger language plpgsql as $$
begin
  if (select coalesce(sum(amount_kop), 0) from entries where transaction_id = new.transaction_id) <> 0 then
    raise exception 'проводки операции % не сходятся в ноль', new.transaction_id;
  end if;
  return null;
end $$;
create constraint trigger entries_balanced after insert on entries
  deferrable initially deferred for each row execute function entries_balanced();

-- ponytail: баланс — сумма проводок на лету; кэш остатка на счёте, когда проводок станут миллионы
create view account_balances as
  select a.id as account_id, a.company_id, a.kind, coalesce(sum(e.amount_kop), 0)::bigint as balance_kop
  from accounts a left join entries e on e.account_id = a.id
  group by a.id;

-- Платёж через шлюз или по счёту. Деньги на баланс — только при succeeded.
create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  campaign_id bigint references campaigns,
  method text not null check (method in ('sbp', 'card', 'invoice', 'post')),
  amount_kop bigint not null check (amount_kop > 0),
  status text not null default 'created' check (status in ('created', 'pending', 'succeeded', 'failed', 'refunded')),
  transaction_id bigint references transactions,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  payment_id uuid references payments,
  number text not null unique,
  amount_kop bigint not null check (amount_kop > 0),
  status text not null default 'issued' check (status in ('issued', 'paid', 'cancelled')),
  due_at timestamptz,
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Выплаты партнёру за купоны и подписки, раз в месяц.
create table payouts (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies,
  period date not null,                  -- первое число месяца, за который выплата
  gross_kop bigint not null,
  fee_kop bigint not null,
  net_kop bigint not null,
  status text not null default 'accrued' check (status in ('accrued', 'sent', 'paid', 'failed')),
  transaction_id bigint references transactions,
  created_at timestamptz not null default now(),
  unique (company_id, period)
);

/* ───────── documents ───────── */

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  kind text not null check (kind in ('offer', 'invoice', 'act', 'sf', 'agent_report', 'contract')),
  number text,
  period date,
  amount_kop bigint,
  status text not null default 'issued' check (status in ('draft', 'issued', 'sent', 'delivered', 'signed', 'rejected')),
  file_key text,
  data jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, kind, number)
);

/* ───────── audiences ───────── */

-- Сегмент: гео, правила по сигналам, загруженная база хешей, сегмент DMP. company_id null — общий.
create table segments (
  id bigint generated always as identity primary key,
  company_id uuid references companies on delete cascade,
  name text not null,
  kind text not null check (kind in ('geo', 'rules', 'upload', 'dmp')),
  definition jsonb not null,
  size_estimate int,
  created_at timestamptz not null default now()
);

/* ───────── tracking ───────── */

-- Показы — самая объёмная таблица, партиции по дням. Строки без своей партиции попадают в default.
create table impressions (
  id uuid not null,
  created_at timestamptz not null default now(),
  campaign_id bigint not null,
  creative_id bigint not null,
  placement text not null,
  med_id text,                           -- обезличенный ID абонента, не номер
  price_kop bigint not null default 0,   -- цена за клик, которую дал аукцион, или цена показа для cpm
  context jsonb,
  primary key (id, created_at)
) partition by range (created_at);
create table impressions_default partition of impressions default;
create index impressions_campaign on impressions (campaign_id, created_at);

-- Создаёт дневные партиции показов на days дней вперёд. Вызывает воркер раз в сутки.
create function ensure_impression_partitions(days int) returns void language plpgsql as $$
declare d date;
begin
  for i in 0..days loop
    d := current_date + i;
    execute format('create table if not exists %I partition of impressions for values from (%L) to (%L)',
      'impressions_' || to_char(d, 'YYYYMMDD'), d, d + 1);
  end loop;
end $$;

-- ponytail: клики без партиций — их на два порядка меньше показов, а поиск по click_id нужен по всей таблице
create table clicks (
  click_id text primary key,
  impression_id uuid,
  campaign_id bigint not null references campaigns,
  company_id uuid not null references companies,
  placement text not null,
  med_id text,
  cost_kop bigint not null default 0,
  billable boolean not null,
  reason text,                           -- почему не оплачивается: repeat24h, tooFast, fraud
  charge_tx_id bigint references transactions,
  created_at timestamptz not null default now()
);
create index clicks_campaign on clicks (campaign_id, created_at);
create index clicks_uncharged on clicks (created_at) where billable and charge_tx_id is null;

create table conversions (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  campaign_id bigint not null references campaigns,
  click_id text,
  order_id text,
  kind text not null check (kind in ('lead', 'order', 'redeem', 'renewal')),
  amount_kop bigint,                     -- сумма заказа или платежа
  cost_kop bigint not null default 0,    -- сколько стоит результат партнёру или сколько ему причитается
  status text not null check (status in ('pending', 'approved', 'rejected', 'returned')),
  source text not null check (source in ('postback', 'csv', 'cabinet', 'form', 'billing', 'pos')),
  note text,
  dispute_until timestamptz,
  charge_tx_id bigint references transactions,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_id)
);
create index conversions_campaign on conversions (campaign_id, created_at);

-- Ключи сервера партнёра для постбэка. Несколько ключей для смены без простоя; храним хеш.
create table tracking_keys (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  key_hash text not null unique,
  hint text not null,                    -- последние символы, чтобы партнёр узнал ключ
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

/* ───────── reporting ───────── */

-- Почасовые свёртки событий. Пересчитывает воркер; кабинет и бэкофис читают только их.
create table stats_hourly (
  campaign_id bigint not null references campaigns on delete cascade,
  hour timestamptz not null,
  placement text not null,
  impressions int not null default 0,
  reach int not null default 0,
  clicks int not null default 0,
  billable_clicks int not null default 0,
  conversions int not null default 0,
  spend_kop bigint not null default 0,
  primary key (campaign_id, hour, placement)
);

/* ───────── связи с 0001 ───────── */
alter table audit_log add foreign key (company_id) references companies on delete set null;
