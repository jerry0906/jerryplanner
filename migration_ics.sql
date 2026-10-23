-- ============================================================
--  Jerry Planner — Outlook 연동 제거 + ICS 구독 피드 추가
--  Supabase SQL Editor에 이 파일 전체를 붙여넣고 한 번 실행하세요.
--  (앱 배포 전후 아무 때나 실행해도 됩니다)
-- ============================================================

-- ── 1. ICS 구독 피드 ─────────────────────────────────────
--  ics_token: 구독 URL에 들어가는 비밀값. null이면 피드 꺼짐.
--  ics_tags : 피드로 내보낼 태그 (회사 캘린더에 개인 일정이 안 가도록 기본은 업무 계열만)
alter table profiles add column if not exists ics_token text unique;
alter table profiles add column if not exists ics_tags  type_tag[] not null default '{work,admin,ltg}';

-- ── 2. Outlook 직접 연동 제거 ────────────────────────────
drop table if exists outlook_connections;
alter table schedule_entries drop column if exists outlook_event_id;

-- ── 3. 확인 ───────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_name = 'profiles' and column_name in ('ics_token', 'ics_tags');
