# Script to open Windows Firewall port 8787 for Luna Server
# Run as Administrator

Write-Host "🔥 Opening Windows Firewall port 8787..." -ForegroundColor Yellow

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Remove existing rule if any
netsh advfirewall firewall delete rule name="Luna Server Port 8787" 2>$null

# Add new firewall rule
netsh advfirewall firewall add rule name="Luna Server Port 8787" dir=in action=allow protocol=TCP localport=8787

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Firewall port 8787 opened successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Get your IP address: ipconfig | findstr IPv4" -ForegroundColor White
    Write-Host "   2. Share this URL with others: http://[YOUR_IP]:8787/rps_betting.html" -ForegroundColor White
    Write-Host "   3. Make sure they're on the same network (WiFi/LAN)" -ForegroundColor White
} else {
    Write-Host "❌ Failed to open firewall port!" -ForegroundColor Red
    exit 1
}


