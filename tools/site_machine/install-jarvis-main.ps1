$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Workspace = Join-Path $env:USERPROFILE "CashSiteMachine"
$Venv = Join-Path $Workspace ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Executable = Join-Path $Venv "Scripts\cash-site-machine.exe"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunName = "CashSiteMachineJarvisMain"

Write-Host "== Cash Site Machine / Jarvis Main =="

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3.11+ is required."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required for Framer External Agents."
}

$CashConfig = Join-Path $env:USERPROFILE ".cash-mcp\config.json"
$CashSession = Join-Path $env:USERPROFILE ".cash-mcp\session.json"
$RepoRoot = Resolve-Path (Join-Path $Root "..\..")
$Bootstrap = Join-Path $RepoRoot "runtime\bootstrap\bootstrap_cash_session.py"

if (-not (Test-Path $CashConfig)) {
  throw "Existing Cash MCP config not found at $CashConfig"
}

$NeedsBootstrap = $true
if (Test-Path $CashSession) {
  try {
    $SessionJson = Get-Content $CashSession -Raw | ConvertFrom-Json
    if ($SessionJson.refresh_token) {
      $NeedsBootstrap = $false
    }
  }
  catch {
    $NeedsBootstrap = $true
  }
}

if ($NeedsBootstrap) {
  if (-not (Test-Path $Bootstrap)) {
    throw "Cash MCP refresh session is missing and bootstrap script was not found at $Bootstrap"
  }

  Write-Host ""
  Write-Host "Cash MCP refresh session is missing."
  Write-Host "A fresh refresh-capable session will be created through Supabase Auth."
  $CashEmail = Read-Host "Cash login email"
  if (-not $CashEmail) {
    throw "Cash login email is required to bootstrap the session."
  }

  & python $Bootstrap --email $CashEmail
  if ($LASTEXITCODE -ne 0) {
    throw "Cash MCP session bootstrap failed."
  }

  if (-not (Test-Path $CashSession)) {
    throw "Cash MCP session bootstrap completed without creating $CashSession"
  }
}

New-Item -ItemType Directory -Force -Path $Workspace | Out-Null

if (-not (Test-Path $Python)) {
  python -m venv $Venv
}

& $Python -m pip install --upgrade pip
& $Python -m pip install --upgrade $Root

Write-Host "Installing/updating Framer External Agent skills..."
Push-Location $Workspace
try {
  npx -y @framer/agent setup
}
finally {
  Pop-Location
}

# Validate the existing Cash session against Supabase before starting the daemon.
Write-Host ""
Write-Host "Validating Cash MCP session..."
$StatusOutput = & $Executable status 2>&1
$StatusExit = $LASTEXITCODE

if ($StatusExit -ne 0) {
  $StatusText = ($StatusOutput | Out-String)

  if (
    $StatusText -match "refresh_token_not_found" -or
    $StatusText -match "Invalid Refresh Token" -or
    $StatusText -match "Cash MCP refresh session is missing" -or
    $StatusText -match "AUTH_INVALID"
  ) {
    Write-Host ""
    Write-Host "Stored Cash refresh session is invalid or revoked."
    Write-Host "Creating a fresh Supabase Auth session now."

    if (-not (Test-Path $Bootstrap)) {
      throw "Cash session is invalid and bootstrap script was not found at $Bootstrap"
    }

    $CashEmail = Read-Host "Cash login email"
    if (-not $CashEmail) {
      throw "Cash login email is required to refresh the local Cash session."
    }

    & python $Bootstrap --email $CashEmail
    if ($LASTEXITCODE -ne 0) {
      throw "Cash MCP session bootstrap failed."
    }

    Write-Host "Re-validating refreshed Cash session..."
    $StatusOutput = & $Executable status 2>&1
    $StatusExit = $LASTEXITCODE
  }
}

if ($StatusExit -ne 0) {
  $StatusOutput | Write-Host
  throw "Cash Site Machine auth validation failed. Daemon was not started."
}

# Per-user startup; no administrator elevation required.
$Command = '"' + $Executable + '" daemon'
New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name $RunName -Value $Command

# Stop any stale local worker instance and start the updated one hidden.
Get-Process -Name "cash-site-machine" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $Executable -ArgumentList "daemon" -WorkingDirectory $Workspace -WindowStyle Hidden

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Installed: Cash Site Machine - Jarvis Main"
Write-Host "Workspace: $Workspace"
Write-Host "Startup: per-user HKCU Run key (no admin required)"
Write-Host "Auth: existing ~/.cash-mcp owner session; no service-role key stored locally"
Write-Host ""
Write-Host "One-time Framer authorization:"
Write-Host "  Open Claude Code or Codex in $Workspace"
Write-Host "  Run /framer"
Write-Host "  Connect each Framer project this machine should control"
Write-Host ""
Write-Host "Verify:"
$StatusOutput | Write-Host
