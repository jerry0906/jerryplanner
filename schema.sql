-- ============================================================
--  AI Scheduler — Supabase schema
--  PRD 5. 정보 구조 기준. 모든 테이블은 user_id로 스코프되어
--  계정 간 데이터가 RLS로 완전히 분리됨.
-- ============================================================

-- ── ENUM ──────────────────────────────────────────────────
create type task_category as enum ('today', 'followup_delegated', 'later');
create type type_tag      as enum ('personal', 'work', 'social', 'admin', 'ltg');
create type repeat_rule   as enum ('none', 'daily', 'weekly', 'custom_days');

-- ── profiles (auth.users 확장) ────────────────────────────
create table profiles (
  id                  uuid primary key references auth.users on delete cascade,
  display_name        text not null default '',
  -- 루틴(repeat_rule <> 'none')을 제외한 하루 할 일이 이 개수를 넘으면
  -- Allocator/Today에서 "너무 많은 거 아닌지" 한 번 확인시킨다.
  max_daily_tasks     int  not null default 6,
  -- 저녁 계획 / 아침 브리핑 알림 시각. 이 값 그대로 시스템 루틴의 고정 시간이 된다.
  evening_plan_time   time not null default '21:00',
  morning_brief_time  time not null default '08:00',
  created_at          timestamptz not null default now()
);

-- 신규 가입 시 프로필 자동 생성 + 저녁계획/아침브리핑 시스템 루틴 자동 등록
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));

  -- 이 두 루틴은 "일반 태스크"가 아니라 알림 트리거 겸용 시스템 루틴이다.
  -- system_kind로 구분해서 notify-cron이 찾아 쓰고, 설정에서 시간을 바꾸면
  -- 이 태스크의 fixed_start_time/fixed_end_time도 같이 갱신된다.
  insert into public.tasks
    (user_id, title, category, type_tag, repeat_rule, fixed_start_time, fixed_end_time, system_kind)
  values
    (new.id, '저녁 계획 세우기', 'today', 'personal', 'daily', '21:00', '21:20', 'evening_plan'),
    (new.id, '아침 브리핑 확인', 'today', 'personal', 'daily', '08:00', '08:10', 'morning_brief');

  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── ltgs (Long Term Goals) ────────────────────────────────
create table ltgs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,
  due_date    date not null,              -- 프로젝트 전체 기한 (필수)
  note        text,
  created_at  timestamptz not null default now()
);
create index on ltgs (user_id, due_date);

-- ── tasks ─────────────────────────────────────────────────
--  루틴은 별도 테이블이 아니라 repeat_rule <> 'none' 인 task.
--  소요시간은 tasks가 아니라 schedule_entries.duration_minutes에만 있다.
--  (같은 태스크라도 날짜마다 배정 시간이 다를 수 있고, tasks 쪽에 중복으로
--   들고 있으면 Allocator에서 리사이즈해도 안 따라가는 두 번째 소스가 생긴다)
create table tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  title             text not null,
  category          task_category not null default 'today',
  type_tag          type_tag not null default 'work',   -- AI 자동 지정 + 수동 수정
  ltg_id            uuid references ltgs on delete cascade,
  repeat_rule       repeat_rule not null default 'none',
  days_of_week      smallint[],                         -- repeat_rule = 'custom_days'
  fixed_start_time  time,                               -- repeat_rule <> 'none'
  fixed_end_time    time,
  is_done           boolean not null default false,
  source            text not null default 'text',       -- 'voice' | 'text'
  -- 'evening_plan' | 'morning_brief' | null. 알림 스케줄러(notify-cron)가 이 값으로
  -- "저녁 계획/아침 브리핑 루틴"을 찾는다. 사용자당 각각 최대 1개.
  system_kind       text check (system_kind in ('evening_plan', 'morning_brief')),
  created_at        timestamptz not null default now(),

  constraint repeat_needs_time check (
    repeat_rule = 'none'
    or (fixed_start_time is not null and fixed_end_time is not null)
  )
);
create index on tasks (user_id, category);
create index on tasks (user_id, ltg_id);
create unique index tasks_one_system_kind_per_user on tasks (user_id, system_kind) where system_kind is not null;

-- ltg에서 파생된 태스크는 태그가 자동으로 ltg
create function default_ltg_tag() returns trigger
language plpgsql as $$
begin
  if new.ltg_id is not null and tg_op = 'INSERT' then
    new.type_tag := 'ltg';
  end if;
  return new;
end; $$;

create trigger tasks_default_ltg_tag
  before insert on tasks
  for each row execute function default_ltg_tag();

-- ── schedule_entries ──────────────────────────────────────
--  Allocator = 계획(start/duration), Today = 실행(actual_*)
create table schedule_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  task_id           uuid not null references tasks on delete cascade,
  date              date not null,
  start_minute      int  not null,        -- 자정 기준 분 (예: 09:00 = 540)
  duration_minutes  int  not null default 60,
  actual_start      int,
  actual_duration   int,
  is_skipped        boolean not null default false,
  outlook_event_id  text,                 -- Outlook에 이미 push된 이벤트 id (있으면 update, 없으면 create)
  created_at        timestamptz not null default now(),

  unique (task_id, date),
  constraint valid_window check (start_minute between 0 and 1439 and duration_minutes > 0)
);
create index on schedule_entries (user_id, date);

-- ── outlook_connections (일방향 push용 토큰) ──────────────
create table outlook_connections (
  user_id        uuid primary key references auth.users on delete cascade,
  refresh_token  text not null,
  account_email  text,
  push_tags      type_tag[] not null default '{work,admin,ltg}',
  is_enabled     boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- ── push_subscriptions (Web Push, VAPID) ──────────────────
--  브라우저 1개당 구독 1행. 기기를 여러 개 쓰면 여러 행이 생긴다.
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index on push_subscriptions (user_id);

-- ── notification_log (중복 발송 방지) ─────────────────────
--  notify-cron 이 5분 간격으로 돌면서 "오늘 이미 보냈는지"를 이 테이블로 확인한다.
create table notification_log (
  user_id  uuid not null references auth.users on delete cascade,
  date     date not null,
  kind     text not null check (kind in ('evening_plan', 'morning_brief')),
  sent_at  timestamptz not null default now(),
  primary key (user_id, date, kind)
);

-- ============================================================
--  Row Level Security — 각 사용자는 본인 행만 접근
-- ============================================================
alter table profiles             enable row level security;
alter table ltgs                 enable row level security;
alter table tasks                enable row level security;
alter table schedule_entries     enable row level security;
alter table outlook_connections  enable row level security;
alter table push_subscriptions   enable row level security;
alter table notification_log     enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own ltgs" on ltgs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own entries" on schedule_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own outlook" on outlook_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own push subs" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own notification log" on notification_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
--  주간 통계 뷰 (PRD 3.7 — 3종)
-- ============================================================
create view weekly_stats as
select
  e.user_id,
  date_trunc('week', e.date)::date                                as week_of,
  count(*) filter (where e.actual_duration is not null)           as completed,
  count(*)                                                        as planned,
  round(100.0 * count(*) filter (where e.actual_duration is not null)
        / nullif(count(*), 0), 1)                                 as completion_rate,
  round(avg(100.0 * (e.actual_duration - e.duration_minutes)
        / nullif(e.duration_minutes, 0))
        filter (where e.actual_duration is not null), 1)          as estimation_drift_pct
from schedule_entries e
group by e.user_id, week_of;

create view weekly_tag_minutes as
select
  e.user_id,
  date_trunc('week', e.date)::date  as week_of,
  t.type_tag,
  sum(coalesce(e.actual_duration, e.duration_minutes)) as minutes
from schedule_entries e
join tasks t on t.id = e.task_id
where e.is_skipped = false
group by e.user_id, week_of, t.type_tag;

-- ============================================================
--  마이그레이션 — schema.sql을 이미 실행한 경우 이 부분만 추가 실행
-- ============================================================
-- alter table profiles add column if not exists max_daily_tasks int not null default 6;
-- alter table profiles add column if not exists evening_plan_time time not null default '21:00';
-- alter table profiles add column if not exists morning_brief_time time not null default '08:00';
-- alter table tasks add column if not exists system_kind text check (system_kind in ('evening_plan','morning_brief'));
-- alter table tasks drop column if exists duration_minutes;  -- 아무도 안 읽는 죽은 값이었음. schedule_entries.duration_minutes가 유일한 소스.
-- create unique index if not exists tasks_one_system_kind_per_user on tasks (user_id, system_kind) where system_kind is not null;
-- alter table schedule_entries add column if not exists outlook_event_id text;
-- (push_subscriptions, notification_log 테이블은 위 CREATE TABLE 문을 그대로 한 번 더 실행하면 됩니다)

-- ============================================================
--  알림 스케줄러 — pg_cron으로 5분마다 notify-cron Edge Function 호출
--  Database → Extensions 에서 pg_cron, pg_net 을 먼저 켜세요.
-- ============================================================
-- select cron.schedule(
--   'notify-cron-5min',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/notify-cron',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <service-role-key>',
--       'Content-Type', 'application/json'
--     )
--   );
--   $$
-- );
