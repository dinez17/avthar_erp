# ==========================================================================
# Tiles ERP - upload the project to the production server from Windows.
#
# Windows has no rsync, so this stages a clean copy (no node_modules, no
# secrets), zips it, copies it up with scp, and extracts it on the server.
# Only built-in Windows tools are used: robocopy, Compress-Archive, scp, ssh.
#
# Usage, from PowerShell in the project folder:
#     .\scripts\upload.ps1 -Server root@163.128.112.105
#
# Re-run this for every deploy.
# ==========================================================================

[CmdletBinding()]
param(
    # user@host of the target server.
    [Parameter(Mandatory = $true)]
    [string]$Server,

    # Where the project lives on the server.
    [string]$RemotePath = '/opt/tiles-erp'
)

$ErrorActionPreference = 'Stop'

# Project root is the parent of the scripts folder this file sits in.
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Staging     = Join-Path $env:TEMP 'tiles-erp-upload'
$ZipPath     = Join-Path $env:TEMP 'tiles-erp.zip'

function Write-Step($msg) { Write-Host "[upload] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[upload] $msg" -ForegroundColor Yellow }

# --- preflight ------------------------------------------------------------
foreach ($cmd in @('scp', 'ssh')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd not found. Install the OpenSSH Client: Settings > System > " +
              "Optional features > Add a feature > OpenSSH Client."
    }
}

Write-Step "project root: $ProjectRoot"

# --- stage a clean copy ---------------------------------------------------
# robocopy /MIR mirrors the tree; /XD and /XF drop directories and files we must
# not ship. Excluding .env* matters most: secrets belong only on the server.
if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Path $Staging | Out-Null

Write-Step 'staging files (excluding node_modules, build output and secrets)'

$roboArgs = @(
    $ProjectRoot, $Staging, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP',
    '/XD', 'node_modules', 'dist', 'build', '.turbo', 'coverage', 'dev-dist',
          '.git', '.husky', 'backups', '_to_delete', 'certs',
    '/XF', '.env', '.env.local', '.env.production', '*.log'
)
robocopy @roboArgs | Out-Null

# robocopy uses exit codes 0-7 for success; 8+ is a real failure.
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

$fileCount = (Get-ChildItem $Staging -Recurse -File).Count
Write-Step "staged $fileCount files"

# Guard: a secret slipping into the archive would be published to the server
# outside the 600-permission file the deploy expects.
$leaked = Get-ChildItem $Staging -Recurse -Force -Filter '.env*' |
          Where-Object { $_.Name -notlike '*.example' }
if ($leaked) {
    throw "refusing to upload: secret files were staged -> $($leaked.FullName -join ', ')"
}

# --- zip ------------------------------------------------------------------
Write-Step 'compressing'
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $Staging '*') -DestinationPath $ZipPath -CompressionLevel Optimal

$sizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Step "archive is $sizeMb MB"

# --- upload ---------------------------------------------------------------
Write-Step "uploading to ${Server}:${RemotePath}"
scp $ZipPath "${Server}:/tmp/tiles-erp.zip"
if ($LASTEXITCODE -ne 0) { throw "scp failed with exit code $LASTEXITCODE" }

# --- extract on the server ------------------------------------------------
# `unzip -o` overwrites tracked files but leaves .env.production alone, since it
# is never in the archive. Scripts need the executable bit restored: Windows does
# not carry file modes through zip.
Write-Step 'extracting on the server'

$remoteCmd = @"
set -e
command -v unzip >/dev/null || (apt-get update -qq && apt-get install -y -qq unzip)
mkdir -p '$RemotePath'
unzip -oq /tmp/tiles-erp.zip -d '$RemotePath'
rm -f /tmp/tiles-erp.zip
chmod +x '$RemotePath/scripts/deploy.sh' '$RemotePath/scripts/backup-db.sh' '$RemotePath/docker/migrate-entrypoint.sh'
echo "extracted to $RemotePath"
ls -la '$RemotePath' | head -20
"@

ssh $Server $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "remote extract failed with exit code $LASTEXITCODE" }

# --- cleanup --------------------------------------------------------------
Remove-Item $Staging -Recurse -Force
Remove-Item $ZipPath -Force

Write-Step 'done'
Write-Host ''
Write-Host 'Next, on the server:' -ForegroundColor Green
Write-Host "  ssh $Server"
Write-Host "  cd $RemotePath && ./scripts/deploy.sh"
