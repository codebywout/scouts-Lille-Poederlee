# Local PHP server for LAN preview (PC + phone on the same Wi-Fi).
# Binds 0.0.0.0 so other devices can connect; does not expose the app to the internet.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Port = 8000
$env:SCOUTS_DEV_LIVE_RELOAD = '1'

function Get-ScoutsLanIPv4 {
    $filter = {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notmatch '(?i)vEthernet|WSL|Hyper-V|Docker|Default Switch|Loopback|VirtualBox|VMware|Bluetooth'
    }
    $candidates = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object $filter |
        Where-Object { $_.PrefixOrigin -ne 'WellKnown' } |
        Sort-Object -Property InterfaceMetric, SkipAsSource)
    if ($candidates.Count -eq 0) {
        $candidates = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object $filter |
            Sort-Object -Property InterfaceMetric, SkipAsSource)
    }
    # Prefer typical home/phone Wi-Fi ranges over leftover VPN/container nets.
    $preferred = @($candidates | Where-Object {
        $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*'
    })
    if ($preferred.Count -gt 0) {
        return [string] $preferred[0].IPAddress
    }
    if ($candidates.Count -gt 0) {
        return [string] $candidates[0].IPAddress
    }
    return $null
}

$lanIp = Get-ScoutsLanIPv4

Write-Host ''
Write-Host 'Scouts lokale preview' -ForegroundColor Green
Write-Host "  PC:     http://127.0.0.1:$Port/"
if ($lanIp) {
    Write-Host "  Telefoon (zelfde wifi): http://${lanIp}:$Port/" -ForegroundColor Cyan
} else {
    Write-Host '  Telefoon: kon geen LAN-IP vinden. Op de PC: ipconfig → IPv4-adres, dan http://DAT-IP:8000/' -ForegroundColor Yellow
}
Write-Host '  Live reload: aan (wijzigingen aan php/html/css/js/json herladen de browser).'
Write-Host ''
Write-Host 'Windows Firewall (eenmalig, als de telefoon niet verbindt):' -ForegroundColor DarkGray
Write-Host '  PowerShell als administrator:' -ForegroundColor DarkGray
Write-Host "  New-NetFirewallRule -DisplayName 'Scouts PHP dev :$Port' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private" -ForegroundColor DarkGray
Write-Host '  Stoppen: Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S "0.0.0.0:$Port" router.php
