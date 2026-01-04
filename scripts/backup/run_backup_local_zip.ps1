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

function Resolve-PgDumpPath {
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }

  # Common Windows install location(s): C:\Program Files\PostgreSQL\<version>\bin\pg_dump.exe
  $candidates = Get-ChildItem "C:\\Program Files\\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "bin\\pg_dump.exe" } |
    Where-Object { Test-Path $_ }

  if ($candidates -and $candidates.Count -gt 0) {
    # Prefer newest version folder name
    return ($candidates | Sort-Object { $_ } -Descending | Select-Object -First 1)
  }

  return $null
}

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$workDir = Join-Path $BackupRoot "${AppName}_backup_$ts"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$dbDir = Join-Path $workDir "db"
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

$dumpPath = Join-Path $dbDir "dump.sql"

Write-Host "[Backup] Creating DB dump..."
$pgDumpPath = Resolve-PgDumpPath
if (-not $pgDumpPath) {
  Write-Error @"
pg_dump was not found.

To enable local backups, install PostgreSQL client tools (includes pg_dump) and ensure it's on PATH.

Recommended (winget):
  winget install --id PostgreSQL.PostgreSQL -e

After install, restart PowerShell (or add Postgres bin to PATH) and rerun this script.
Typical path:
  C:\Program Files\PostgreSQL\<version>\bin
"@
  exit 1
}

& "$pgDumpPath" "$SupabaseDbUrl" --no-owner --no-privileges --format=p --file="$dumpPath"
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
