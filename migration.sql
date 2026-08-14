-- ============================================================
--  Jerry Planner — 구조 개편 마이그레이션
--  Supabase SQL Editor에 이 파일 전체를 붙여넣고 한 번 실행하세요.
--  (이미 만든 데이터는 그대로 유지됩니다)
-- ============================================================

-- ── 1. 이미 가입한 사용자에게 없는 profiles 행 채우기 ──────
--  schema.sql의 트리거가 만들어지기 전에 로그인한 계정은 profiles 행이 없어서
--  설정 화면이 무한 로딩됩니다. 아래 한 줄로 메웁니다.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ── 2. tasks 구조 개편 ────────────────────────────────────
--  오늘/팔로우업/나중에 카테고리 개념을 없애고,
--  우선순위(sort_order) + 오늘 선정(is_selected) + 상태(status)로 대체.
alter table tasks add column if not exists sort_order  int not null default 0;
alter table tasks add column if not exists is_selected boolean not null default false;
alter table tasks add column if not exists status      text not null default 'todo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_status_check') then
    alter table tasks add constraint tasks_status_check
      check (status in ('todo', 'followup', 'done'));
  end if;
end $$;

-- 기존 데이터 이관: 예전 category 값을 새 모델로 옮긴다
update tasks set is_selected = true  where category = 'today'  and is_selected = false;
update tasks set status = 'followup' where category = 'followup_delegated' and status = 'todo';
update tasks set status = 'done'     where is_done = true and status = 'todo';

-- 우선순위 초기값을 생성순으로 채움
with ordered as (
  select id, row_number() over (partition by user_id order by created_at) * 10 as rn
  from tasks
)
update tasks t set sort_order = o.rn from ordered o where t.id = o.id and t.sort_order = 0;

create index if not exists tasks_user_sort_idx on tasks (user_id, sort_order);

-- category 컬럼은 더 이상 쓰지 않지만, 혹시 모를 롤백을 위해 남겨둔다.
-- 완전히 정리하고 싶으면 아래 주석을 풀어 실행:
-- alter table tasks drop column if exists category;

-- ── 3. tasks.duration_minutes 제거 ────────────────────────
--  소요시간은 schedule_entries에만 존재해야 한다 (날짜별로 다를 수 있으므로).
alter table tasks drop column if exists duration_minutes;

-- ── 4. LTG에 "달성하고자 하는 최종 상태" 추가 ─────────────
--  AI 브레이크다운이 제목뿐 아니라 이 설명을 참고해 더 정확히 쪼갠다.
alter table ltgs add column if not exists outcome text;

-- ── 5. 확인 ───────────────────────────────────────────────
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.tasks)    as tasks,
  (select count(*) from public.ltgs)     as ltgs;
