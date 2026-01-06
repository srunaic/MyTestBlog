## Billing (Google Play Subscription + RevenueCat) — 초보용

### 핵심 구조
- 앱(클라): Google Play 결제는 **RevenueCat SDK**로 처리
- 서버(Supabase): RevenueCat **Webhook**를 받아 `app_entitlements` 테이블을 업데이트
- 앱은 DB의 `app_entitlements`를 읽어서 **Free/Pro 기능**을 분기

---

## 1) RevenueCat Webhook 설정(중요)
RevenueCat Dashboard → Project → Integrations → **Webhooks**
- Webhook URL: `https://<PROJECT_REF>.functions.supabase.co/revenuecat-webhook`
- (Optional) **Authorization header** 값 설정: 예) `Bearer YOUR_SECRET`

서버는 이 Authorization 값을 매 요청마다 검사합니다.

---

## 2) Supabase SQL (필수)
Supabase SQL Editor에서 실행:
- `supabase/sql/billing_entitlements.sql`
- `supabase/sql/anticode_channels_limit.sql` (유저별 채널 생성 제한: Free=3 / Pro=23)

---

## 3) Edge Function 배포
```bash
supabase functions deploy revenuecat-webhook --project-ref <YOUR_PROJECT_REF>
```

Secrets 설정 (Supabase 제한 때문에 SUPABASE_ prefix 사용 금지):
```bash
supabase secrets set --project-ref <YOUR_PROJECT_REF> \
  PROJECT_URL="https://<ref>.supabase.co" \
  SERVICE_ROLE_KEY="<service_role_key>" \
  REVENUECAT_WEBHOOK_AUTH="Bearer YOUR_SECRET"
```

---

## 4) 앱에서 “로그인 유저ID” 연결(중요)
RevenueCat의 `app_user_id`가 **너의 로그인 유저ID**와 같아야 합니다.
- 예: username / uid
- 웹훅의 `event.app_user_id` 값이 그대로 `app_entitlements.user_id`로 저장됩니다.

---

## 5) AntiCode(웹 클라)에서 플랜 갱신
`anticode.js`는 init에서 `refreshEntitlements()`를 호출해 Pro 여부를 동기화합니다.







