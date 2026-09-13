$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $env:LOCALAPPDATA "CashHoldings\cash-cli"
$ConfigPath = Join-Path $ConfigDir "config.json"
$LegacySecretPath = Join-Path $ConfigDir "service-role.dpapi"
$WorkerTokenPath = Join-Path $ConfigDir "worker-token.dpapi"

$Config = $null
if (Test-Path $ConfigPath) {
    $Config = Get-Content -Raw $ConfigPath | ConvertFrom-Json

    if (-not $env:SUPABASE_URL -and $Config.supabase_url) {
        $env:SUPABASE_URL = [string]$Config.supabase_url
    }
    if (-not $env:SUPABASE_PUBLISHABLE_KEY -and $Config.publishable_key) {
        $env:SUPABASE_PUBLISHABLE_KEY = [string]$Config.publishable_key
    }
    if (-not $env:CASH_WORKER_ID -and $Config.worker_id) {
        $env:CASH_WORKER_ID = [string]$Config.worker_id
    }
}

function Read-DpapiSecret([string]$Path, [string]$Label) {
    $Encrypted = [System.IO.File]::ReadAllText($Path).Trim()
    if ([string]::IsNullOrWhiteSpace($Encrypted)) {
        throw "Encrypted $Label is empty: $Path"
    }

    try {
        $SecureSecret = ConvertTo-SecureString -String $Encrypted -ErrorAction Stop
    }
    catch {
        throw "Encrypted $Label could not be decoded for the current Windows user. $($_.Exception.Message)"
    }

    $Credential = New-Object System.Management.Automation.PSCredential("cash", $SecureSecret)
    return $Credential.GetNetworkCredential().Password
}

$HasElevatedEnv = $env:SUPABASE_SECRET_KEY -or $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $HasElevatedEnv -and -not $env:CASH_WORKER_TOKEN) {
    if ((Test-Path $WorkerTokenPath) -and $Config) {
        $env:CASH_WORKER_TOKEN = Read-DpapiSecret $WorkerTokenPath "Cash Holdings worker token"
    }
    elseif ((Test-Path $LegacySecretPath) -and $Config) {
        # Backward-compatible fallback for older elevated local installs.
        $env:SUPABASE_SERVICE_ROLE_KEY = Read-DpapiSecret $LegacySecretPath "Cash Holdings service-role secret"
    }
}

$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) {
    $Python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $Python) {
    throw "Python 3 is required. Install Python or place it on PATH."
}

& $Python.Source "$ScriptRoot\cash.py" @args
exit $LASTEXITCODE
