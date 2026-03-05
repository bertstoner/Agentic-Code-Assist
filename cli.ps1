# Agentic Code Assist - CLI launcher
# Usage: .\cli.ps1 [--model <name>] [--theme dark]

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Find Python - check common locations
$pythonCandidates = @(
    "python",
    "python3",
    "$scriptDir\venv\Scripts\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "V:\projects\codepilot\venv\Scripts\python.exe"
)

$python = $null
foreach ($candidate in $pythonCandidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $python = $candidate
        break
    } elseif (Test-Path $candidate) {
        $python = $candidate
        break
    }
}

if (-not $python) {
    Write-Error "Python not found. Install Python 3.10+ and run: pip install -r cli/requirements.txt"
    exit 1
}

# Install dependencies if needed
$checkImport = & $python -c "import rich, prompt_toolkit, openai" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing CLI dependencies..." -ForegroundColor Cyan
    & $python -m pip install -r "$scriptDir\cli\requirements.txt" -q
}

# Run the CLI
& $python "$scriptDir\cli\chat.py" @args
