$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Get-Command python -ErrorAction SilentlyContinue

if (-not $Python) {
    $Python = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $Python) {
    throw "Python 3 is required. Install Python or place it on PATH."
}

& $Python.Source "$ScriptRoot\cash.py" @args
exit $LASTEXITCODE
