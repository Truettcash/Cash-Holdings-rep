param(
  [switch]$CloudPair
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Workspace = Join-Path $env:USERPROFILE "CashSiteMachine"
$Venv = Join-Path $Workspace ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Executable = Join-Path $Venv "Scripts\cash-site-machine.exe"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunName = "CashSiteMachineJarvisMain"

function Invoke-SiteMachineStatus {
  param([string]$Exe)

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = "status"
  $psi.WorkingDirectory = $Workspace
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void]$process.Start()

  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  return [PSCustomObject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout
    StdErr = $stderr
    Text = ($stdout + [Environment]::NewLine + $stderr)
  }
}

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
$Bootstrap = Join-Path $Root "site_machine\magic_link_bootstrap.py"

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
  Write-Host "Cash MCP refresh session is missing or invalid."
  Write-Host "A fresh refresh-capable session will be created with a Supabase magic link."
  $CashEmail = Read-Host "Cash magic-link email"
  if (-not $CashEmail) {
    throw "Cash magic-link email is required to bootstrap the session."
  }

  & python $Bootstrap --email $CashEmail
  if ($LASTEXITCODE -ne 0) {
    throw "Cash magic-link session bootstrap failed."
  }

  if (-not (Test-Path $CashSession)) {
    throw "Cash MCP session bootstrap completed without creating $CashSession"
  }
}

New-Item -ItemType Directory -Force -Path $Workspace | Out-Null

$Seed = Join-Path $Root "workspace_seed"
if (Test-Path $Seed) {
  Write-Host "Seeding/updating multi-site Site Factory workspace..."
  Copy-Item (Join-Path $Seed "AGENTS.md") (Join-Path $Workspace "AGENTS.md") -Force

  $FactorySeed = Join-Path $Seed "site-factory"
  $FactoryTarget = Join-Path $Workspace "site-factory"
  New-Item -ItemType Directory -Force -Path $FactoryTarget | Out-Null

  Copy-Item (Join-Path $FactorySeed "SYSTEM.md") (Join-Path $FactoryTarget "SYSTEM.md") -Force
  Copy-Item (Join-Path $FactorySeed "schemas") $FactoryTarget -Recurse -Force

  foreach ($dir in @("sites","patterns","observations","variants")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $FactoryTarget $dir) | Out-Null
  }
}

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
$CloudReady = $false

if ($CloudPair) {
  Write-Host ""
  Write-Host "Validating Cash MCP session..."
  $StatusResult = Invoke-SiteMachineStatus -Exe $Executable
  $StatusOutput = $StatusResult.Text
  $StatusExit = $StatusResult.ExitCode
  
  if ($StatusExit -ne 0) {
    $StatusText = $StatusResult.Text
  
    if (
      $StatusText -match "refresh_token_not_found" -or
      $StatusText -match "Invalid Refresh Token" -or
      $StatusText -match "Cash MCP refresh session is missing" -or
      $StatusText -match "AUTH_INVALID"
    ) {
      Write-Host ""
      Write-Host "Stored Cash refresh session is invalid or revoked."
      Write-Host "Creating a fresh Supabase magic-link session now."
  
      if (-not (Test-Path $Bootstrap)) {
        throw "Cash session is invalid and magic-link bootstrap was not found at $Bootstrap"
      }
  
      $CashEmail = Read-Host "Cash magic-link email"
      if (-not $CashEmail) {
        throw "Cash magic-link email is required to refresh the local Cash session."
      }
  
      & python $Bootstrap --email $CashEmail
      if ($LASTEXITCODE -ne 0) {
        throw "Cash magic-link session bootstrap failed."
      }
  
      Write-Host "Re-validating refreshed Cash session..."
      $StatusResult = Invoke-SiteMachineStatus -Exe $Executable
      $StatusOutput = $StatusResult.Text
      $StatusExit = $StatusResult.ExitCode
    }
  }
  
  $CloudReady = ($StatusExit -eq 0)
  $CloudReady = ($StatusExit -eq 0)
}
else {
  Write-Host ""
  Write-Host "Skipping Supabase cloud pairing."
  Write-Host "Jarvis Main will install in LOCAL-ONLY Site Machine mode."
  Write-Host "Run this installer later with -CloudPair when cloud queue pairing is needed."
}

if ($CloudReady) {
  # Per-user startup; no administrator elevation required.
  $Command = '"' + $Executable + '" daemon'
  New-Item -Path $RunKey -Force | Out-Null
  Set-ItemProperty -Path $RunKey -Name $RunName -Value $Command

  Get-Process -Name "cash-site-machine" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $Executable -ArgumentList "daemon" -WorkingDirectory $Workspace -WindowStyle Hidden
  Start-Sleep -Seconds 3
}
else {
  # Route around broken Supabase user-session bootstrap.
  # Local Framer/Claude/Codex execution remains fully usable; cloud queue pairing is deferred.
  Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "Cloud control-plane pairing is deferred (no auth required for local mode)."
  Write-Host "Jarvis Main is installed in LOCAL-ONLY Site Machine mode."
  Write-Host "Framer External Agent, Claude/Codex, Git, and local build tooling can be used now."
  Write-Host "No Supabase daemon will start until cloud auth is paired later."
}

Write-Host ""
Write-Host "Installed: Cash Site Machine - Jarvis Main"
Write-Host "Workspace: $Workspace"
Write-Host ("Mode: " + $(if ($CloudReady) { "cloud-connected" } else { "local-only" }))
Write-Host ""
Write-Host "One-time Framer authorization:"
Write-Host "  Open Claude Code or Codex in $Workspace"
Write-Host "  Run /framer"
Write-Host "  Connect each Framer project this machine should control"
Write-Host ""
Write-Host "Local verification:"
& $Executable local-status

if ($CloudReady) {
  Write-Host ""
  Write-Host "Cloud verification:"
  Write-Host $StatusOutput
}
