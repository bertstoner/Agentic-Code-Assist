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

Require-Command "node" "Install Node.js 18+ from https://nodejs.org"
Require-Command "npm"  "Comes with Node.js"

$nodeMajor = [int]((node --version) -replace 'v(\d+).*','$1')
if ($nodeMajor -lt 18) {
    Write-Host "Error: Node.js 18+ required (found $(node --version))" -ForegroundColor Red
    exit 1
}

# ── Database — prefer local PostgreSQL, fall back to Docker ───────────────────

$dbMode = ""
$pgPaths = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)

$psqlExe = $pgPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $psqlExe) {
    $psqlExe = (Get-Command psql -ErrorAction SilentlyContinue)?.Source
}

if ($psqlExe) {
    $dbMode = "local"
    Write-Host "Found local PostgreSQL: $psqlExe" -ForegroundColor Green

    # Add PostgreSQL bin to PATH for this session
    $pgBin = Split-Path $psqlExe
    $env:PATH = "$pgBin;$env:PATH"
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dbMode = "docker"
        Write-Host "Found Docker — will use containerised PostgreSQL" -ForegroundColor Green
    }
}

if (-not $dbMode) {
    # Try to auto-install PostgreSQL via winget
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "PostgreSQL not found — installing via winget..." -ForegroundColor Yellow
        winget install --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: winget install failed." -ForegroundColor Red; exit 1
        }
        # Re-check after install
        $psqlExe = $pgPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($psqlExe) {
            $dbMode = "local"
            $pgBin = Split-Path $psqlExe
            $env:PATH = "$pgBin;$env:PATH"
            Write-Host "PostgreSQL installed." -ForegroundColor Green
        } else {
            Write-Host "Error: PostgreSQL installed but psql.exe not found. Restart your terminal and re-run." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Error: Neither PostgreSQL nor Docker found." -ForegroundColor Red
        Write-Host ""
        Write-Host "Install one of:"
        Write-Host "  PostgreSQL: https://www.postgresql.org/download/"
        Write-Host "  Docker:     https://www.docker.com/products/docker-desktop"
        exit 1
    }
}

# ── .env setup ────────────────────────────────────────────────────────────────

if (-not (Test-Path ".env")) {
    Write-Host ""
    $apiKey = Read-Host "Enter your Cerebras API key (from https://console.cerebras.ai)"
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Host "Error: API key is required." -ForegroundColor Red
        exit 1
    }

    $dbUrl = "postgresql://postgres:postgres@localhost:5432/agentcodeassist"

    if ($dbMode -eq "local") {
        Write-Host ""
        Write-Host "Default DATABASE_URL: $dbUrl" -ForegroundColor Yellow
        $custom = Read-Host "Press Enter to accept or type a custom DATABASE_URL"
        if (-not [string]::IsNullOrWhiteSpace($custom)) { $dbUrl = $custom }
    }

    (Get-Content ".env.example") `
        -replace "your-api-key-here", $apiKey `
        -replace "postgresql://[^\r\n]*", $dbUrl `
        | Set-Content ".env"

    Write-Host "Created .env" -ForegroundColor Green
} else {
    Write-Host ".env already exists — skipping."
}

# Load .env into process environment
Get-Content ".env" | Where-Object { $_ -match "^\s*[^#]\S*=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
}

$port = if ($env:PORT) { $env:PORT } else { "5000" }

# ── Start database ─────────────────────────────────────────────────────────────

if ($dbMode -eq "docker") {
    Write-Host ""
    Write-Host "Starting PostgreSQL container..."
    docker compose up -d db

    Write-Host -NoNewline "Waiting for PostgreSQL"
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        docker compose exec -T db pg_isready -U postgres 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host " ready" -ForegroundColor Green; $ready = $true; break }
        Write-Host -NoNewline "."
    }
    if (-not $ready) {
        Write-Host ""; Write-Host "Timed out waiting for PostgreSQL." -ForegroundColor Red; exit 1
    }

} elseif ($dbMode -eq "local") {
    Write-Host ""
    Write-Host "Setting up local PostgreSQL database..."

    $pgBin = Split-Path $psqlExe
    $pgData = Join-Path (Split-Path $pgBin) "data"

    # Ensure the postgres service is running
    $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($svc) {
        if ($svc.Status -ne "Running") {
            Write-Host "Starting PostgreSQL service..."
            Start-Service $svc.Name -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }
    }

    # Test connection — if it fails, temporarily set trust auth to reset the password
    $pgReady = & "$pgBin\pg_isready.exe" -h 127.0.0.1 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PostgreSQL not responding — trying to start..." -ForegroundColor Yellow
        & "$pgBin\pg_ctl.exe" start -D $pgData 2>&1 | Out-Null
        Start-Sleep -Seconds 3
    }

    # Try connecting; if password fails, reset it via trust auth
    $testConn = & $psqlExe -U postgres -h 127.0.0.1 -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Resetting postgres password..." -ForegroundColor Yellow
        $hbaPath = Join-Path $pgData "pg_hba.conf"
        $hbaBackup = "$hbaPath.bak"
        Copy-Item $hbaPath $hbaBackup -Force

        $trustConf = @"
host all all 127.0.0.1/32 trust
host all all ::1/128 trust
local all all trust
"@
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($hbaPath, $trustConf, $utf8NoBom)

        # Reload config
        & $psqlExe -U postgres -h 127.0.0.1 -c "SELECT pg_reload_conf();" 2>&1 | Out-Null
        Start-Sleep -Seconds 1

        # Set password to match .env
        $dbPass = ($env:DATABASE_URL -replace '.*:([^@]+)@.*','$1')
        & $psqlExe -U postgres -h 127.0.0.1 -c "ALTER USER postgres WITH PASSWORD '$dbPass';" 2>&1 | Out-Null

        # Restore scram-sha-256
        Copy-Item $hbaBackup $hbaPath -Force
        & $psqlExe -U postgres -h 127.0.0.1 -c "SELECT pg_reload_conf();" 2>&1 | Out-Null
        Write-Host "Password reset." -ForegroundColor Green
    }

    # Extract DB name from DATABASE_URL
    $dbName = ($env:DATABASE_URL -split '/')[-1]
    $exists = & $psqlExe -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null
    if ($exists -ne "1") {
        & $psqlExe -U postgres -h 127.0.0.1 -c "CREATE DATABASE $dbName;" 2>&1 | Out-Null
        Write-Host "Created database '$dbName'" -ForegroundColor Green
    } else {
        Write-Host "Database '$dbName' already exists" -ForegroundColor Green
    }
}

# ── Node dependencies ─────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Installing Node.js dependencies..."
npm install

# ── Schema ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Applying database schema..."
npm run db:push

# ── Build ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Building application..."
npm run build

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Done! Run with: npm start" -ForegroundColor Green
Write-Host "Then open http://localhost:$port"
Write-Host ""
