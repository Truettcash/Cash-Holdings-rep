$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Workspace = Join-Path $env:USERPROFILE "CashSiteMachine"
$Venv = Join-Path $Workspace ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Executable = Join-Path $Venv "Scripts\cash-site-machine.exe"
$TaskName = "Cash Site Machine - Jarvis Main"

Write-Host "== Cash Site Machine / Jarvis Main =="

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3.11+ is required."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required for Framer External Agents."
}

New-Item -ItemType Directory -Force -Path $Workspace | Out-Null

if (-not (Test-Path $Python)) {
  python -m venv $Venv
}

& $Python -m pip install --upgrade pip
& $Python -m pip install $Root

Write-Host "Installing or updating Framer External Agent skills..."
Push-Location $Workspace
try {
  npx -y @framer/agent setup
}
finally {
  Pop-Location
}

if (-not $env:SUPABASE_URL) {
  Write-Warning "SUPABASE_URL is not set in this shell."
}
if (-not ($env:SUPABASE_SECRET_KEY -or $env:SUPABASE_SERVICE_ROLE_KEY)) {
  Write-Warning "Supabase backend key is not set in this shell."
}

$Action = New-ScheduledTaskAction -Execute $Executable -Argument "daemon" -WorkingDirectory $Workspace
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Always-on Cash Site OS local execution node on Jarvis Main" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installed: $TaskName"
Write-Host "Workspace: $Workspace"
Write-Host ""
Write-Host "One-time Framer authorization:"
Write-Host "  Open Claude Code or Codex in $Workspace"
Write-Host "  Run /framer"
Write-Host "  Connect each Framer project that this machine should control"
Write-Host ""
Write-Host "Verify:"
Write-Host "  $Executable status"
