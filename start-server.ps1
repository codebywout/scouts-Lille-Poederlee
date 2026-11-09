# Start local PHP server with upload limits high enough for admin photos.
# Binds to 0.0.0.0 so phones on the same Wi-Fi can open the site.
Set-Location $PSScriptRoot

$port = 8000
$bind = "0.0.0.0:$port"

$lanIps = @(
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Select-Object -ExpandProperty IPAddress -Unique
)

Write-Host ""
Write-Host "Scouts lokale server" -ForegroundColor Cyan
Write-Host "  PC:     http://localhost:$port/"
foreach ($ip in $lanIps) {
    Write-Host "  Telefoon: http://${ip}:$port/  (zelfde Wi-Fi)"
}
Write-Host ""
Write-Host "Stoppen met Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S $bind router.php
