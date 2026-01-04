## Supabase 데이터 3중 백업 운영 (로컬 ZIP + Supabase + Cloudflare)

목표: Supabase 장애/실수 삭제/랜섬웨어/계정 이슈가 있어도 **데이터를 복구**할 수 있게 3중 백업을 운영합니다.

### 1) 로컬 ZIP 백업 (D:\\Backup)
- DB를 `pg_dump`로 덤프 → ZIP으로 묶어서 `D:\\Backup`에 저장합니다.
- 실행 스크립트: `scripts/backup/run_backup_local_zip.ps1`

### 2) Supabase 자체 백업(자동 백업/PITR)
- Supabase 플랜/옵션에 따라 **자동 백업/PITR** 제공 여부가 다릅니다.
- 설정 위치(대시보드): Project → **Settings → Database** → Backups/PITR 관련 옵션 확인
- 제공되지 않는 플랜이면 1)과 3)을 반드시 운영하세요.

### 3) Cloudflare 백업 (R2 권장)
- 1)에서 만든 ZIP을 Cloudflare **R2**에 업로드하여 오프사이트 보관합니다.
- 권장 경로 예시:
  - `s3://<R2_BUCKET>/nanodoroshi/backups/<YYYY-MM-DD>/nanodoroshi_backup_<timestamp>.zip`

---

## 실행 방법(로컬 ZIP)

### 준비물
- Windows에 Postgres 클라이언트(`pg_dump`) 설치 필요
- 환경변수 설정(Secrets로 관리)
  - `SUPABASE_DB_URL` (Postgres connection string, **절대 프론트에 넣지 말 것**)

### 실행

```powershell
cd "D:\CursorAIProject\nanodoroshi_blog"
$env:SUPABASE_DB_URL="여기에_연결문자열"
.\scripts\backup\run_backup_local_zip.ps1
```

---

## Cloudflare R2 업로드(선택)
R2 업로드까지 자동화하려면, `aws` CLI(S3 호환) 또는 rclone 등을 사용합니다.
필요한 값(Secrets):
- `R2_BUCKET`
- `R2_ENDPOINT` (예: `https://<accountid>.r2.cloudflarestorage.com`)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

---

## 복구 리허설(중요)
백업은 “떠놓는 것”만으로 끝이 아닙니다. 월 1회:
- ZIP 다운로드/해제
- 별도 Postgres에 restore 테스트
- 주요 테이블 row 수/무결성 확인
