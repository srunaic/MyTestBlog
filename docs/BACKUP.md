## Supabase 데이터 로컬 1중 백업 운영 (ZIP + USB 이동)

목표: 지금은 **로컬 ZIP 1개만** 안정적으로 생성해서, 필요할 때 **관리자 USB/외장하드로 옮기는 방식**으로 운영합니다.

### 백업 위치(로컬)
- **기본 폴더**: `D:\Backup`
- **결과물(예시)**: `D:\Backup\nanodoroshi_backup_YYYY-MM-DD_HH-mm-ss.zip`

### 운영 방식(USB로 옮기기)
- 로컬에서 백업 ZIP 생성
- 생성된 ZIP을 **관리자 USB/외장하드로 수동 복사**
- 권장: USB에는 최소 2~3개 최신본만 유지(가장 최신 + 바로 전 + 1주 전)

---

## 실행 방법(로컬 ZIP 생성)

### 준비물
- Windows에 Postgres 클라이언트(`pg_dump`) 설치 필요
- 환경변수 설정(로컬에서만 사용)
  - `SUPABASE_DB_URL` (Postgres connection string, **절대 프론트에 넣지 말 것**)

### 실행

```powershell
cd "D:\CursorAIProject\nanodoroshi_blog"
$env:SUPABASE_DB_URL="여기에_연결문자열"
.\scripts\backup\run_backup_local_zip.ps1
```

---

## (나중에) 2~3중 백업으로 확장(옵션)
원하면 추후 아래를 추가로 구성할 수 있습니다.
- **Supabase 자체 백업(PITR/자동백업)**: 플랜/옵션에 따라 제공
- **Cloudflare R2 백업**: ZIP을 R2로 자동 업로드해 오프사이트 보관

---

## 복구 리허설(중요)
백업은 “떠놓는 것”만으로 끝이 아닙니다. 월 1회:
- ZIP 다운로드/해제
- 별도 Postgres에 restore 테스트
- 주요 테이블 row 수/무결성 확인
