param(
    [switch]$NoStartup,
    [switch]$StartNow,
    [string]$SupabaseUrl = "https://ldijllskwwmyhhbzspmb.supabase.co",
    [string]$SupabasePublishableKey = "sb_publishable_wmF0KqEkQ03ZiB17YQIJRg_fme_o4rg",
    [string]$WorkerId = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $env:LOCALAPPDATA "CashHoldings\cash-cli"
$ConfigPath = Join-Path $ConfigDir "config.json"
$WorkerTokenPath = Join-Path $ConfigDir "worker-token.dpapi"
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
Write-Host "Auth:    publishable key + DPAPI worker capability token"
Write-Host ""

if (-not (Test-Path $WorkerTokenPath)) {
    throw "Worker token not found at $WorkerTokenPath. Provision the DPAPI worker token before installing."
}

$EncryptedToken = [System.IO.File]::ReadAllText($WorkerTokenPath).Trim()
if ([string]::IsNullOrWhiteSpace($EncryptedToken)) {
    throw "Worker token file is empty: $WorkerTokenPath"
}

# Verify that the DPAPI payload is readable by this Windows user without ever
# printing or persisting the plaintext token.
try {
    $SecureToken = ConvertTo-SecureString -String $EncryptedToken -ErrorAction Stop
    $Credential = New-Object System.Management.Automation.PSCredential("cash", $SecureToken)
    if ([string]::IsNullOrWhiteSpace($Credential.GetNetworkCredential().Password)) {
        throw "decrypted token is empty"
    }
}
catch {
    throw "Worker token could not be decoded for the current Windows user. $($_.Exception.Message)"
}

@{
    supabase_url = $SupabaseUrl.TrimEnd("/")
    publishable_key = $SupabasePublishableKey
    worker_id = $WorkerId
    auth_mode = "worker_token_v1"
    installed_at = (Get-Date).ToString("o")
    poll_seconds = 300
    batch_size = 10
} | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

Write-Host "Validating worker capability gateway..."
& "$ScriptRoot\cash.ps1" worker status
if ($LASTEXITCODE -ne 0) {
    throw "Cash worker gateway validation failed. Token/config were left intact for diagnosis; no startup worker was installed."
}

Write-Host "Publishing worker heartbeat..."
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
