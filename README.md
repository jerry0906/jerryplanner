# AI Scheduler (PWA)

계획하고(Allocator), 실행하고(Today), 되돌아보는 개인/가족용 스케줄러.
Android 홈 화면에 설치해 앱처럼 쓸 수 있습니다.

---

## 1. Supabase 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성 (무료 플랜)
2. **SQL Editor**에 `schema.sql` 내용을 붙여넣고 실행
   → 테이블, RLS 정책, 통계 뷰, (가입 시 저녁계획/아침브리핑 루틴 자동 생성 트리거)가 한 번에 만들어집니다
3. **Database → Extensions**에서 `pg_cron`, `pg_net` 활성화 (알림 스케줄링에 필요)
4. **Authentication → Providers**에서 Email 활성화
   - Google 로그인을 쓰려면 Google provider도 설정
   - 가족끼리만 쓸 거라면 **Authentication → Settings → "Enable email confirmations"**를 꺼두면 가입이 간편합니다
5. **Project Settings → API**에서 `Project URL`과 `anon public` 키 복사

## 2. Edge Functions 배포

API 키, VAPID 개인키는 전부 **서버(Edge Function)에만** 두고, 앱 번들에는 절대 넣지 않습니다.

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# ── Claude API ──────────────────────────────────
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# ── Web Push 알림 (VAPID 키, 아래 4번 참고) ──
npx web-push generate-vapid-keys   # public/private 키 한 쌍이 출력됨
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:you@example.com

# ── 배포 ──
supabase functions deploy ai
supabase functions deploy ics --no-verify-jwt   # 캘린더 앱이 로그인 없이 읽어야 해서 JWT 검증을 끈다
supabase functions deploy send-push
supabase functions deploy notify-cron
```

배포 후 `ai` 함수만 먼저 단독 테스트해 보면 편합니다:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/ai" \
  -H "Authorization: Bearer <로그인한 유저의 access_token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"classify_task","payload":{"title":"세금 신고 서류 정리"}}'
```

## 3. 캘린더 구독 (ICS)

Outlook·Google·Apple 캘린더에서 "인터넷 일정 구독"으로 Jerry Planner 일정을 볼 수 있습니다.

1. 앱의 ⚙️ 설정 → **캘린더 구독 (ICS)** → "구독 주소 만들기" → 주소 복사
2. Outlook → 캘린더 추가 → **웹에서 구독** → 주소 붙여넣기

- 배정된 일정(오늘 기준 -30일 ~ +90일)과 루틴(반복 일정)을 내보냅니다. 내보낼 태그는 설정에서 고릅니다.
- 읽기 전용·단방향이고, 캘린더 앱이 주기적으로 다시 읽어 가므로 반영까지 몇 시간 걸릴 수 있습니다.
- 주소에 든 토큰(`profiles.ics_token`)이 곧 열람 권한입니다. 유출되면 "주소 새로 만들기"로 교체하세요.

## 4. Web Push (VAPID)

브라우저가 지원하는 표준 푸시 방식이라 별도 서비스(FCM 등) 가입이 필요 없습니다.
2번에서 생성한 `VAPID_PUBLIC_KEY`를 `.env`에도 **똑같이** 넣어야 합니다 (아래 5번).

pg_cron이 5분마다 `notify-cron`을 호출하도록 SQL Editor에서 실행:

```sql
select cron.schedule(
  'notify-cron-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```
(`schema.sql` 맨 아래에도 동일한 문구가 주석으로 있습니다. service-role-key는 Project Settings → API에서 확인)

## 5. 앱 실행

```bash
cp .env.example .env    # 1번(Supabase)과 4번(VAPID public key) 값 채우기
npm install
npm run dev
```

## 6. 배포 & 휴대폰에 설치

```bash
npm run build
```

`dist/` 폴더를 [Vercel](https://vercel.com)이나 [Netlify](https://netlify.com)에 올리면 됩니다 (둘 다 무료).
빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`, 환경변수는 `.env`와 동일하게 설정하세요.

배포된 주소를 **Android Chrome으로 열고 → 메뉴 → 홈 화면에 추가**하면 주소창 없이 앱처럼 실행됩니다.

> HTTPS에서만 PWA 설치·Web Push·알림 권한이 동작합니다. Vercel/Netlify는 기본으로 HTTPS를 제공합니다.

---

## 구조

```
src/
  lib/core.js           시간축 상수·계산, 태그/카테고리 정의
  lib/supabase.js       Supabase 클라이언트, Edge Function 호출 래퍼(ai/push), ICS 피드 주소
  hooks/useAuth.js      세션 구독(useSession) + 인증 액션(auth)
  hooks/useDayPlan.js   날짜 하나의 schedule_entries CRUD (Today/Allocator가 공유)
  hooks/useScheduler.js "오늘" 화면들이 쓰는 데이터 레이어 (tasks/ltgs + useDayPlan)
  hooks/useSettings.js  프로필, ICS 구독 피드, 푸시 구독 상태
  components/Timeline.jsx  타임라인 (Plan/Actual 두 모드)
  components/ui.jsx        헤더·태스크카드·축하효과·과부하 넛지·캡처시트
  screens/                 화면 7개 (Today/Allocator/Tasks/LTG/Stats/Auth/Settings)
  sw.js                    커스텀 서비스워커 (push, notificationclick)
  App.jsx                  인증 게이트 + 탭 네비게이션

supabase/functions/
  ai/                    LTG Breakdown(Sonnet), 태스크 자동분류(Haiku)
  ics/                   캘린더 구독용 ICS 피드 (토큰 URL, JWT 검증 없음)
  send-push/             테스트용 단발 푸시 발송
  notify-cron/           5분마다 실행, 저녁계획/아침브리핑 시각이 된 유저에게 발송
  _shared.ts, _push.ts   공용 유틸
```

### 알아둘 설계 결정

- **완료 여부**는 `schedule_entries.actual_duration`이 채워졌는지로 판단합니다.
  매일 반복되는 루틴은 날짜별로 완료 상태가 달라야 하므로 task가 아닌 entry에 둡니다.
- **낙관적 업데이트**: 드래그로 블록을 옮길 때마다 서버 응답을 기다리면 쓸 수 없이 느립니다.
  화면을 먼저 바꾸고 저장은 400ms 디바운스로 뒤따라갑니다.
- **루틴 자동 생성**: 앱을 열면 해당 날짜에 걸리는 반복 태스크의 entry가 없으면 자동으로 만듭니다.
- **기본 소요시간 1시간**: 타임라인에 드롭하면 60분으로 배정되고, 가장자리를 끌어 조정합니다.
- **과부하 확인**: 루틴을 제외한 오늘 할 일이 설정값(기본 6개, ⚙️ 설정에서 변경)을 넘으면
  한 번 팝업으로 "무리한 계획은 아닌지" 물어봅니다.
- **저녁 계획 / 아침 브리핑은 시스템 루틴**: 가입 시 `tasks.system_kind`로 표시된 두 루틴이 자동 생성됩니다.
  설정에서 시간을 바꾸면 이 루틴의 고정 시간도 같이 이동하고, `notify-cron`이 그 시간에 맞춰 푸시를 보냅니다.
- **캘린더 연동은 ICS 구독(단방향)**: 일정마다 UID를 고정(`entry-<id>`, `routine-<task id>`)해서
  캘린더가 피드를 다시 읽어도 중복되지 않고 갱신됩니다.
- **Allocator는 오늘/내일을 전환** 가능합니다. 저녁 계획은 보통 "내일"을 짜는 것이므로 기본값이 내일입니다.

---

## 아직 안 붙인 것

- 음성 캡처 (Web Speech API) — 지금은 텍스트 입력만
- 주간 통계 — 스키마에 뷰는 있고, 화면은 오늘 기준으로만 표시 중
- 장기 과제(계속 밀리는 항목) 자동 감지

1~2주 직접 써보면서 종이 시스템과 어긋나는 지점을 먼저 찾는 걸 권합니다.
