param(
  [string]$SupabaseDbUrl = $env:SUPABASE_DB_URL,
  [string]$OutDir = ".secrets\\backups",
  [string]$Prefix = $env:BACKUP_PREFIX
)

if (-not $SupabaseDbUrl) {
  Write-Error "SUPABASE_DB_URL env var is required (Postgres connection string)."
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$baseName = if ($Prefix) { "${Prefix}_$ts" } else { "supabase_$ts" }
$dumpPath = Join-Path $OutDir "$baseName.sql"
$gzPath = "$dumpPath.gz"

Write-Host "[Backup] Dumping DB to $dumpPath"
pg_dump "$SupabaseDbUrl" --no-owner --no-privileges --format=p --file="$dumpPath"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

Write-Host "[Backup] Compressing to $gzPath"
gzip -f "$dumpPath"
if ($LASTEXITCODE -ne 0) { throw "gzip failed" }

Write-Host "[Backup] Done: $gzPath"

# Optional upload to S3/R2 if AWS CLI is configured:
#   aws s3 cp "$gzPath" "s3://<bucket>/nanodoroshi/supabase/db/$($ts)/$baseName.sql.gz"
