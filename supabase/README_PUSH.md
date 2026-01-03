# Web Push (오프라인 푸시) 설정 가이드

이 프로젝트는 **브라우저를 완전히 닫아도** OS 푸시 알림을 받기 위해 Web Push(Push API)를 사용합니다.

## 1) Supabase DB 테이블 생성

Supabase SQL Editor에서 아래 파일 내용을 실행하세요:

- `supabase/sql/anticode_push_subscriptions.sql`

## 2) VAPID 키 생성

로컬에서 VAPID 키를 생성합니다:

```bash
npx web-push generate-vapid-keys
```

생성된 **Public Key**는 프론트에서 사용되며, **Private Key**는 서버(Edge Function)에서만 사용합니다.

## 3) Cloudflare Pages 환경변수 (프론트)

Cloudflare Pages > Project > Settings > Environment variables 에 아래를 추가하세요:

- `VAPID_PUBLIC_KEY`: (위에서 생성한 Public Key)
- `SUPABASE_URL`: (기존)
- `SUPABASE_KEY`: (기존)

빌드 시 `scripts/inject-env.js`가 `VITE_VAPID_PUBLIC_KEY` 플레이스홀더를 치환합니다.

## 4) Supabase Edge Function 배포

Supabase CLI로 배포 (예시):

```bash
supabase functions deploy push-send
```

Supabase Functions > Secrets 에 아래를 추가하세요:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (예: `mailto:admin@example.com`)

## 5) 동작 확인

1. 사이트 접속 → ⚙️ 환경설정 → **푸시 켜기**
2. 권한 허용
3. 다른 계정/기기에서 메시지 전송
4. 수신 기기는 브라우저를 닫은 상태에서도 OS 푸시가 뜹니다.

> 주의: iOS Safari는 Web Push 제약이 있습니다. iOS는 **홈 화면에 추가(PWA 설치)** 상태에서 가장 안정적으로 동작합니다.


