$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

# Load .env
Get-Content ".env" | Where-Object { $_ -match "^\s*[^#]\S*=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
}

$env:NODE_ENV = "production"
node dist\index.cjs
