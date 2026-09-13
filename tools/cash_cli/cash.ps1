$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $env:LOCALAPPDATA "CashHoldings\cash-cli"
$ConfigPath = Join-Path $ConfigDir "config.json"
$SecretPath = Join-Path $ConfigDir "service-role.dpapi"

if ((-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) -and (Test-Path $ConfigPath) -and (Test-Path $SecretPath)) {
    $Config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
    $Encrypted = [System.IO.File]::ReadAllText($SecretPath).Trim()

    if ([string]::IsNullOrWhiteSpace($Encrypted)) {
        throw "Encrypted Cash Holdings service-role secret is empty. Re-run install-worker.ps1 to provision it again."
    }

    try {
        $SecureSecret = ConvertTo-SecureString -String $Encrypted -ErrorAction Stop
    }
    catch {
        throw "Encrypted Cash Holdings service-role secret could not be decoded for the current Windows user. Re-run install-worker.ps1 to provision it again. $($_.Exception.Message)"
    }

    $Credential = New-Object System.Management.Automation.PSCredential("cash", $SecureSecret)

    if (-not $env:SUPABASE_URL) {
        $env:SUPABASE_URL = [string]$Config.supabase_url
    }
    if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
        $env:SUPABASE_SERVICE_ROLE_KEY = $Credential.GetNetworkCredential().Password
    }
    if (-not $env:CASH_WORKER_ID -and $Config.worker_id) {
        $env:CASH_WORKER_ID = [string]$Config.worker_id
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
