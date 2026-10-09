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
if (-not (Test-Path $CashConfig)) {
  throw "Existing Cash MCP config not found at $CashConfig"
}
if (-not (Test-Path $CashSession)) {
  throw "Existing Cash MCP user session not found at $CashSession"
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
& $Executable status
