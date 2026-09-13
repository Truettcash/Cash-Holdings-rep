param(
    [switch]$NoStartup,
    [switch]$StartNow,
    [string]$SupabaseUrl = "https://ldijllskwwmyhhbzspmb.supabase.co",
    [string]$WorkerId = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $env:LOCALAPPDATA "CashHoldings\cash-cli"
$ConfigPath = Join-Path $ConfigDir "config.json"
$SecretPath = Join-Path $ConfigDir "service-role.dpapi"
$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupPath = Join-Path $StartupDir "CashHoldingsLocalWorker.cmd"

New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

if (-not $WorkerId) {
    $machine = if ($env:COMPUTERNAME) { $env:COMPUTERNAME.ToLowerInvariant() } else { "windows" }
    $WorkerId = "$machine-cash"
}

Write-Host "Cash Holdings local worker setup"
Write-Host "Project: $SupabaseUrl"
Write-Host "Worker:  $WorkerId"
Write-Host ""
Write-Host "Paste an elevated Cash Holdings Supabase backend key when prompted."
Write-Host "Preferred: an sb_secret_ key created for this local worker."
Write-Host "Legacy service_role also works. Do NOT use sb_publishable_ or anon."
Write-Host "The key is encrypted with Windows DPAPI for this user and is never written in plaintext."

$SecureSecret = Read-Host "Backend key (sb_secret_ or service_role)" -AsSecureString
if ($SecureSecret.Length -eq 0) {
    throw "Backend key cannot be empty."
}

$Encrypted = ConvertFrom-SecureString $SecureSecret
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($SecretPath, $Encrypted, $Utf8NoBom)

@{
    supabase_url = $SupabaseUrl.TrimEnd("/")
    worker_id = $WorkerId
    installed_at = (Get-Date).ToString("o")
    poll_seconds = 300
    batch_size = 10
} | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

Write-Host "Validating encrypted credential against Cash Holdings..."
& "$ScriptRoot\cash.ps1" status
if ($LASTEXITCODE -ne 0) {
    Remove-Item $SecretPath -Force -ErrorAction SilentlyContinue
    throw "Cash CLI validation failed. Encrypted secret was removed; no startup worker was installed."
}

& "$ScriptRoot\cash.ps1" worker heartbeat --mode install
if ($LASTEXITCODE -ne 0) {
    throw "Worker heartbeat failed. Startup worker was not installed."
}

if (-not $NoStartup) {
    $runner = Join-Path $ScriptRoot "run-worker.ps1"
    $cmd = "@echo off`r`nstart `"`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -PollSeconds 300 -BatchSize 10`r`n"
    Set-Content -Path $StartupPath -Value $cmd -Encoding ASCII
    Write-Host "Installed current-user startup launcher: $StartupPath"
}

if ($StartNow) {
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$ScriptRoot\run-worker.ps1`"",
        "-PollSeconds", "300",
        "-BatchSize", "10"
    )
    Write-Host "Local worker started."
}

Write-Host "Setup complete."
Write-Host "Queue status:"
& "$ScriptRoot\cash.ps1" worker status
