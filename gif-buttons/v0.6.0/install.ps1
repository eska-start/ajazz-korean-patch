$ErrorActionPreference = 'Stop'
$pluginName = 'com.eska.ajazz.gif.sdPlugin'
$source = Join-Path $PSScriptRoot $pluginName
$root = Join-Path $env:APPDATA 'HotSpot\StreamDock\plugins'
$target = Join-Path $root $pluginName
if (-not (Test-Path (Join-Path $source 'manifest.json'))) { throw '압축을 완전히 해제한 후 실행해 주세요.' }
Get-Process -Name 'Stream Dock AJAZZ' -ErrorAction SilentlyContinue | Stop-Process -Force
New-Item -ItemType Directory -Force -Path $root | Out-Null
if (Test-Path $target) {
 $backupRoot = Join-Path $env:APPDATA 'HotSpot\StreamDock\GIF-Plugin-Backups'
 New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
 $backup = Join-Path $backupRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
 Move-Item -LiteralPath $target -Destination $backup
}
Copy-Item -LiteralPath $source -Destination $target -Recurse
$protocolRoot = 'HKCU:\Software\Classes\eskaajazzgif'
$handler = Join-Path $target 'open-hidden.vbs'
$command = '"' + $env:SystemRoot + '\System32\wscript.exe" //B //Nologo "' + $handler + '" "%1"'
if (Test-Path $protocolRoot) {
 $existing = (Get-Item (Join-Path $protocolRoot 'shell\open\command') -ErrorAction SilentlyContinue).GetValue('')
 if ($existing -and $existing -notlike '*com.eska.ajazz.gif.sdPlugin*open-target.ps1*' -and $existing -notlike '*com.eska.ajazz.gif.sdPlugin*open-hidden.vbs*') { throw '같은 이름의 URL 연결이 이미 있습니다. 덮어쓰지 않았습니다.' }
}
New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value 'URL:AJAZZ GIF Local Open'
New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path (Join-Path $protocolRoot 'shell\open\command') -Force | Out-Null
Set-Item -Path (Join-Path $protocolRoot 'shell\open\command') -Value $command
Write-Host 'GIF 버튼 0.6.0 설치 완료. 폴더·파일 열기 연결도 등록했습니다.' 
Write-Host 'AJAZZ를 열고 오른쪽 GIF 버튼 → GIF 버튼을 빈 버튼 하나에 배치해 주세요.'
Write-Host '초록색 점이 움직이는지 실제 기기에서 확인해 주세요.'
$paths = @("${env:ProgramFiles(x86)}\Stream Dock AJAZZ Global\Stream Dock AJAZZ.exe", "$env:ProgramFiles\Stream Dock AJAZZ Global\Stream Dock AJAZZ.exe")
foreach ($exe in $paths) { if (Test-Path $exe) { Start-Process -FilePath $exe; break } }
