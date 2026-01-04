## Cloudflare R2 이미지 업로드 분리(무료 플랜용)

목표: Supabase Storage 사용을 최소화(또는 0)하여 **무료 플랜 한도 초과**를 방지합니다.  
업로드는 Cloudflare Worker가 R2에 저장하고, 이미지는 Worker URL로 서빙합니다(버킷 public 불필요).

---

### 1) Cloudflare R2 버킷 생성
- Cloudflare Dashboard → R2 → Create bucket
- 예: `nanodoroshi-uploads`

---

### 2) Worker 배포 (R2 업로드/서빙)
이 repo에 Worker 코드가 포함되어 있습니다:
- `cloudflare/r2-upload-worker/`

#### 배포 방법(예시)
PowerShell:

```powershell
cd "D:\CursorAIProject\nanodoroshi_blog\cloudflare\r2-upload-worker"
npx wrangler@latest login

# wrangler.toml에서 bucket_name을 네 버킷 이름으로 수정 후
npx wrangler@latest deploy
```

배포가 끝나면 Worker URL을 얻습니다(예: `https://nanodoroshi-r2-upload.<계정>.workers.dev`).

> 보안 강화(권장): `wrangler.toml`에 `ALLOWED_ORIGINS`를 설정해서 업로드를 특정 도메인에서만 허용하세요.

---

### 3) Cloudflare Pages 환경변수 추가(프론트)
Cloudflare Pages → Project → Settings → Environment variables에 추가:
- `R2_UPLOAD_BASE_URL` = (위 Worker URL)

예:
- `R2_UPLOAD_BASE_URL=https://nanodoroshi-r2-upload.<account>.workers.dev`

이 값은 `scripts/inject-env.js`가 빌드 시 `VITE_R2_UPLOAD_BASE_URL`로 주입합니다.

---

### 4) 동작 방식
- 블로그(`script.js`): 이미지 업로드 버튼 → Worker `/upload?folder=blog`로 업로드 → 반환된 `url`을 `image_url`에 저장
- 채팅(`anticode.js`): 이미지 업로드 → Worker `/upload?folder=chat`로 업로드 → 반환된 `url`을 메시지 `image_url`에 저장

---

### 5) 제한/주의
- Worker 업로드는 요청 본문 크기 제한이 있습니다. 기본은 **10MB**로 제한합니다.
  - Worker에서 `MAX_UPLOAD_BYTES`로 조절 가능
- 현재 프로젝트는 “클라이언트에서 직접 업로드” 구조라서, 악용 방지를 위해 `ALLOWED_ORIGINS` 설정을 권장합니다.


