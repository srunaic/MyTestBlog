## Security Hardening Guide (Google Play / 운영용)

현재 프로젝트는 “커스텀 로그인(localStorage 세션) + anon key” 구조라서 **RLS를 켜기 어렵고**, DB 접근 제어가 사실상 “클라이언트 신뢰”에 가깝습니다.  
Google Play 출시/운영을 생각하면 아래 순서로 강화하는 게 안전합니다.

---

### 1) 목표
- DB 테이블을 **RLS ON**으로 전환
- 클라이언트는 **anon key + Supabase Auth 세션**만 사용
- 관리자/유료/길드 권한은 **서버 정책(RLS/Edge Function)**으로 강제
- 민감 키(service_role, R2 secret, VAPID private 등)는 **절대 프론트에 두지 않기**

---

### 2) 추천 전환 로드맵
#### 단계 A (지금, Free 방어)
- 채팅 메시지 보관 제한(채널당 300개)
- 이미지 업로드 R2 분리 + Origin 제한
- 무료/유료 기능 게이팅(클라이언트) + 관리자 예외

#### 단계 B (다음, 보안의 핵심)
- Supabase Auth 도입 (email/phone/OAuth 중 선택)
- `anticode_users`에 `auth_id uuid` 컬럼 추가하여 사용자 매핑
- 주요 테이블 RLS ON
- 길드/페이지/멤버 테이블도 RLS ON

#### 단계 C (운영 안정화)
- “업로드 Worker”에 인증(토큰) 붙이기
- Edge Function에서만 민감 작업 수행(관리자 기능, 대량 삭제 등)

---

### 3) RLS 설계 개요(핵심 아이디어)
Supabase Auth를 쓰면 `auth.uid()`로 “로그인한 사용자”를 DB에서 식별할 수 있습니다.

예시:
- `anticode_users.auth_id = auth.uid()`
- 모든 RLS는 이 매핑을 기준으로 `username`을 찾고 권한 판단

---

### 4) 주의
- RLS를 켜기 전에 반드시 “auth 매핑”을 먼저 완성해야 합니다.
- `service_role` 키는 Edge Function/서버에서만 사용해야 합니다.



