# Script to get network information for sharing the server
Write-Host "🌐 Network Information for Luna Server" -ForegroundColor Cyan
Write-Host ""

# Get IPv4 addresses
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object IPAddress, InterfaceAlias

Write-Host "📍 Your IP Addresses:" -ForegroundColor Yellow
foreach ($ip in $ipAddresses) {
    Write-Host "   $($ip.IPAddress) ($($ip.InterfaceAlias))" -ForegroundColor White
}

Write-Host ""
Write-Host "🔗 Share these URLs with others:" -ForegroundColor Yellow
foreach ($ip in $ipAddresses) {
    $ipAddr = $ip.IPAddress
    Write-Host "   Betting Mode: http://$ipAddr:8787/rps_betting.html" -ForegroundColor Green
    Write-Host "   PvP Mode: http://$ipAddr:8787/rps_game.html" -ForegroundColor Green
    Write-Host "   VS Luna Mode: http://$ipAddr:8787/rps_vs_luna.html" -ForegroundColor Green
    Write-Host ""
}

Write-Host "⚠️  Important:" -ForegroundColor Red
Write-Host "   1. Make sure Windows Firewall allows port 8787" -ForegroundColor White
Write-Host "   2. Run 'open-firewall-port.ps1' as Administrator if needed" -ForegroundColor White
Write-Host "   3. Others must be on the same network (WiFi/LAN)" -ForegroundColor White
Write-Host "   4. Server must be running (node index.js)" -ForegroundColor White


