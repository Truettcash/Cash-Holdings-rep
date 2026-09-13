param(
    [int]$PollSeconds = 300,
    [int]$BatchSize = 10
)

$ErrorActionPreference = "Continue"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $env:LOCALAPPDATA "CashHoldings\cash-cli"
$LogPath = Join-Path $LogDir "worker.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-WorkerLog([string]$Message) {
    $line = "$(Get-Date -Format o) $Message"
    Add-Content -Path $LogPath -Value $line
}

Write-WorkerLog "worker_start poll_seconds=$PollSeconds batch_size=$BatchSize"

while ($true) {
    try {
        & "$ScriptRoot\cash.ps1" worker drain --limit $BatchSize 2>&1 |
            ForEach-Object { Write-WorkerLog ([string]$_) }
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            Write-WorkerLog "drain_exit=$exit"
        }
    }
    catch {
        Write-WorkerLog "worker_error=$($_.Exception.Message)"
    }

    Start-Sleep -Seconds ([Math]::Max(30, $PollSeconds))
}
