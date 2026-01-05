## Google Play 결제(구독) — 웹훅 없이 서버 검증(Pull Sync) 방식

### 구조(핵심)
- 앱은 Google Play Billing으로 결제/복구를 수행
- 앱은 결제/복구 후 **purchaseToken**을 서버(Supabase Edge Function)에 보내서 검증
- 서버는 Android Publisher API로 검증 후 `app_entitlements`를 업데이트
- 앱은 `app_entitlements`를 읽어 Free/Pro 기능을 분기

---

## 1) Supabase SQL (필수)
Supabase SQL Editor에서 실행:
- `supabase/sql/billing_entitlements.sql`
- `supabase/sql/play_billing.sql`
- `supabase/sql/anticode_channels_limit.sql` (유저별: Free=3 / Pro=23)

---

## 2) Google Cloud / Play Console 설정(필수)
1) Google Cloud에서 **Service Account** 생성
2) Service Account 키(JSON) 다운로드
3) Play Console → **API access**에서 서비스 계정을 연결하고,
   해당 서비스 계정에 앱에 대한 권한(구독/주문 조회 가능)을 부여

---

## 3) Edge Function 배포
```bash
supabase functions deploy play-verify-subscription --project-ref <YOUR_PROJECT_REF>
```

Secrets 설정:
```bash
supabase secrets set --project-ref <YOUR_PROJECT_REF> \
  PROJECT_URL="https://<ref>.supabase.co" \
  SERVICE_ROLE_KEY="<service_role_key>" \
  PLAY_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

(권장) 오픈 엔드포인트 남용 방지용 Authorization:
```bash
supabase secrets set --project-ref <YOUR_PROJECT_REF> \
  PLAY_VERIFY_AUTH="Bearer <random>"
```

---

## 4) 앱 → 서버 호출 (구매/복구 후)
Edge Function URL:
`https://<PROJECT_REF>.functions.supabase.co/play-verify-subscription`

요청 예시(JSON):
```json
{
  "userId": "my_username_or_uid",
  "packageName": "com.your.app",
  "productId": "pro_monthly",
  "purchaseToken": "PLAY_PURCHASE_TOKEN"
}
```

헤더(설정한 경우):
- `Authorization: Bearer <random>`

---

## 5) 갱신 전략(웹훅이 없으므로)
- 앱 시작/로그인 시 1회 sync
- 결제 성공 직후 sync
- 복구 버튼 누를 때 sync
- (선택) 하루 1회 sync





