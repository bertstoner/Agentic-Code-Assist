#Requires -Version 5.1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Agentic Code Assist — Install ===" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

function Require-Command($cmd, $hint) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "Error: '$cmd' is required but not installed." -ForegroundColor Red
        Write-Host "  $hint"
        exit 1
    }
}

Require-Command "node"   "Install Node.js 18+ from https://nodejs.org"
Require-Command "npm"    "Comes with Node.js"
Require-Command "docker" "Install Docker Desktop from https://www.docker.com/products/docker-desktop"

$nodeMajor = [int]((node --version) -replace 'v(\d+).*','$1')
if ($nodeMajor -lt 18) {
    Write-Host "Error: Node.js 18+ is required (found $(node --version))" -ForegroundColor Red
    exit 1
}

# ── .env setup ────────────────────────────────────────────────────────────────

if (-not (Test-Path ".env")) {
    Write-Host "Setting up environment configuration..."
    Write-Host ""
    $apiKey = Read-Host "Enter your Cerebras API key (from https://console.cerebras.ai)"
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Host "Error: API key is required." -ForegroundColor Red
        exit 1
    }

    (Get-Content ".env.example") -replace "your-api-key-here", $apiKey | Set-Content ".env"
    Write-Host "Created .env" -ForegroundColor Green
} else {
    Write-Host ".env already exists — skipping."
}

Write-Host ""

# ── Database ──────────────────────────────────────────────────────────────────

Write-Host "Starting PostgreSQL..."

# Prefer 'docker compose' (v2), fall back to 'docker-compose' (v1)
$dc = @("docker", "compose")
try {
    & docker compose version 2>$null | Out-Null
} catch {
    $dc = @("docker-compose")
}

& $dc[0] ($dc[1..($dc.Length-1)] + @("up", "-d", "db"))

Write-Host -NoNewline "Waiting for PostgreSQL to be ready"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $result = & $dc[0] ($dc[1..($dc.Length-1)] + @("exec", "-T", "db", "pg_isready", "-U", "postgres")) 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ready" -ForegroundColor Green
        $ready = $true
        break
    }
    Write-Host -NoNewline "."
}

if (-not $ready) {
    Write-Host ""
    Write-Host "Error: PostgreSQL did not become ready in time." -ForegroundColor Red
    exit 1
}

Write-Host ""

# ── Node dependencies ─────────────────────────────────────────────────────────

Write-Host "Installing Node.js dependencies..."
npm install
Write-Host ""

# ── Database schema ───────────────────────────────────────────────────────────

Write-Host "Applying database schema..."

# Load .env into the current process environment
Get-Content ".env" | Where-Object { $_ -match "^\s*[^#]\S*=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $key   = $parts[0].Trim()
    $val   = $parts[1].Trim()
    [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
}

npm run db:push
Write-Host ""

# ── Build ─────────────────────────────────────────────────────────────────────

Write-Host "Building application..."
npm run build
Write-Host ""

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start (production):  npm start"
Write-Host "  Start (development): npm run dev"
Write-Host "  Stop database:       docker compose down"
Write-Host ""
