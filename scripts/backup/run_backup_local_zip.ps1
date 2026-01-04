param(
  [string]$SupabaseDbUrl = $env:SUPABASE_DB_URL,
  [string]$BackupRoot = "D:\\Backup",
  [string]$AppName = "nanodoroshi",
  [switch]$NoZip
)

if (-not $SupabaseDbUrl) {
  Write-Error "SUPABASE_DB_URL env var is required (Postgres connection string)."
  exit 1
}

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$workDir = Join-Path $BackupRoot "${AppName}_backup_$ts"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$dbDir = Join-Path $workDir "db"
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

$dumpPath = Join-Path $dbDir "dump.sql"

Write-Host "[Backup] Creating DB dump..."
pg_dump "$SupabaseDbUrl" --no-owner --no-privileges --format=p --file="$dumpPath"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

if ($NoZip) {
  Write-Host "[Backup] Done (no zip): $workDir"
  exit 0
}

$zipPath = Join-Path $BackupRoot "${AppName}_backup_$ts.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

Write-Host "[Backup] Zipping to $zipPath"
Compress-Archive -Path (Join-Path $workDir "*") -DestinationPath $zipPath -Force

Write-Host "[Backup] Cleaning temp folder: $workDir"
Remove-Item -Recurse -Force $workDir

Write-Host "[Backup] Done: $zipPath"
