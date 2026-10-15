$ErrorActionPreference = 'Stop'
$target = Join-Path $env:APPDATA 'HotSpot\StreamDock\plugins\com.eska.ajazz.wall.sdPlugin'
Get-Process -Name 'Stream Dock AJAZZ' -ErrorAction SilentlyContinue | Stop-Process -Force
$protocolRoot = 'HKCU:\Software\Classes\eskaajazzwall'
if (Test-Path $protocolRoot) {
 $existing = (Get-Item (Join-Path $protocolRoot 'shell\open\command') -ErrorAction SilentlyContinue).GetValue('')
 if ($existing -like '*com.eska.ajazz.wall.sdPlugin*open-target.ps1*' -or $existing -like '*com.eska.ajazz.wall.sdPlugin*open-hidden.vbs*') { Remove-Item -LiteralPath $protocolRoot -Recurse -Force }
}
if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
Write-Host 'GIF 플러그인을 제거했습니다. AJAZZ를 다시 실행해 주세요.'
