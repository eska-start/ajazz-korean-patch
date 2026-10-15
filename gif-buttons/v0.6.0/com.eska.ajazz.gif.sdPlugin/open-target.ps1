param([string]$OpenUri)
$ErrorActionPreference = 'Stop'
function Resolve-Browser([string]$Name) {
 $executables = @{chrome='chrome.exe';edge='msedge.exe';whale='whale.exe';firefox='firefox.exe'}
 if (-not $executables.ContainsKey($Name)) { throw '지원하지 않는 브라우저입니다.' }
 $exeName = $executables[$Name]
 foreach ($hive in @('HKCU:','HKLM:')) {
  foreach ($subkey in @('Software\Microsoft\Windows\CurrentVersion\App Paths\','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\')) {
   $key = "$hive\$subkey$exeName"
   if (Test-Path $key) { $found = (Get-Item $key).GetValue('').Trim('"'); if (Test-Path -LiteralPath $found -PathType Leaf) { return $found } }
  }
 }
 $relative = @{chrome='Google\Chrome\Application\chrome.exe';edge='Microsoft\Edge\Application\msedge.exe';whale='Naver\Naver Whale\Application\whale.exe';firefox='Mozilla Firefox\firefox.exe'}
 foreach ($base in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA)) {
  if ($base) { $candidate=Join-Path $base $relative[$Name];if(Test-Path -LiteralPath $candidate -PathType Leaf){return $candidate} }
 }
 throw "선택한 브라우저를 찾지 못했습니다: $Name. 설치 여부를 확인하거나 기본 브라우저를 선택해 주세요."
}
function Normalize-Folder([string]$Path) { return [IO.Path]::GetFullPath($Path).TrimEnd('\','/').ToLowerInvariant() }
function Focus-Folder([string]$Path) {
 $wanted=Normalize-Folder $Path
 $shell=New-Object -ComObject Shell.Application
 foreach ($window in $shell.Windows()) {
  try {
   if ([IO.Path]::GetFileName([string]$window.FullName) -ine 'explorer.exe') { continue }
   $shown=[string]$window.Document.Folder.Self.Path
   if ((Normalize-Folder $shown) -ne $wanted) { continue }
   Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AjazzGifWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
'@
   $handle=[IntPtr][long]$window.HWND
   if([AjazzGifWindow]::IsIconic($handle)){[AjazzGifWindow]::ShowWindow($handle,9)|Out-Null}
   $focused=[AjazzGifWindow]::SetForegroundWindow($handle)
   if(-not $focused){
    $processId=Get-Process explorer -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq $handle } | Select-Object -First 1 -ExpandProperty Id
    if($processId){$ws=New-Object -ComObject WScript.Shell;$ws.AppActivate([int]$processId)|Out-Null}
   }
   # Do not open a duplicate if Windows refuses foreground activation.
   return $true
  } catch { continue }
 }
 return $false
}
function Select-Target($Request) {
 if ($Request.kind -notin @('folder','file') -or [string]$Request.token -notmatch '^p[a-z0-9]{8,60}$') { throw '올바른 선택 요청이 아닙니다.' }
 $resultRoot=Join-Path $PSScriptRoot 'picker-results'
 New-Item -ItemType Directory -Force -Path $resultRoot | Out-Null
 $resultFile=Join-Path $resultRoot ($Request.token+'.json')
 $result=@{cancelled=$true}
 $owner=$null;$dialog=$null
 try {
  Add-Type -AssemblyName System.Windows.Forms
  $owner=New-Object Windows.Forms.Form
  $owner.ShowInTaskbar=$false;$owner.TopMost=$true;$owner.Opacity=0;$owner.Width=1;$owner.Height=1
  $owner.StartPosition='CenterScreen';$owner.Show()
  if($Request.kind -eq 'folder'){
   $dialog=New-Object Windows.Forms.FolderBrowserDialog
   $dialog.Description='버튼으로 열 폴더를 선택해 주세요.';$dialog.ShowNewFolderButton=$true
   if($Request.initial -and (Test-Path -LiteralPath $Request.initial -PathType Container)){$dialog.SelectedPath=[string]$Request.initial}
   if($dialog.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK){$result=@{cancelled=$false;path=$dialog.SelectedPath}}
  }else{
   $dialog=New-Object Windows.Forms.OpenFileDialog
   $dialog.Title='버튼으로 열 프로그램 또는 파일 선택';$dialog.Filter='모든 파일 (*.*)|*.*|프로그램 (*.exe)|*.exe|바로 가기 (*.lnk)|*.lnk'
   $dialog.CheckFileExists=$true;$dialog.Multiselect=$false
   if($Request.initial -and (Test-Path -LiteralPath $Request.initial -PathType Leaf)){$dialog.InitialDirectory=[IO.Path]::GetDirectoryName([string]$Request.initial);$dialog.FileName=[IO.Path]::GetFileName([string]$Request.initial)}
   if($dialog.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK){$result=@{cancelled=$false;path=$dialog.FileName}}
  }
 }catch{$result=@{error=$_.Exception.Message}}
 finally{
  if($dialog){$dialog.Dispose()};if($owner){$owner.Close();$owner.Dispose()}
  $json=$result|ConvertTo-Json -Compress
  [IO.File]::WriteAllText($resultFile+'.tmp',$json,(New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath ($resultFile+'.tmp') -Destination $resultFile -Force
  Get-ChildItem -LiteralPath $resultRoot -Filter 'p*.json' | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-1)} | Remove-Item -Force -ErrorAction SilentlyContinue
 }
}
try {
 $uri=[Uri]$OpenUri
 if($uri.Scheme -ne 'eskaajazzgif' -or $uri.Host -notin @('launch','folder','file','pick')){throw '지원하지 않는 열기 요청입니다.'}
 $encoded=$uri.AbsolutePath.TrimStart('/').Replace('-','+').Replace('_','/')
 while(($encoded.Length % 4) -ne 0){$encoded+='='}
 $decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
 if($uri.Host -eq 'pick'){Select-Target ($decoded|ConvertFrom-Json);exit 0}
 if($uri.Host -eq 'launch'){$request=$decoded|ConvertFrom-Json;$kind=[string]$request.kind;$targetPath=[string]$request.target}
 else{$kind=$uri.Host;$targetPath=$decoded;$request=@{folderMode='reuse'}}
 if($kind -eq 'website'){
  $webUri=[Uri]$targetPath
  if(-not $webUri.IsAbsoluteUri -or $webUri.Scheme -notin @('https','http') -or -not $webUri.Host){throw '올바른 웹사이트 주소가 아닙니다.'}
  if($targetPath.Contains('"')){throw '주소에 잘못된 문자가 있습니다.'}
  $browser=[string]$request.browser
  if(-not $browser -or $browser -eq 'default'){Start-Process -FilePath $webUri.AbsoluteUri}
  else{$browserExe=Resolve-Browser $browser;Start-Process -FilePath $browserExe -ArgumentList ('"'+$webUri.AbsoluteUri+'"')}
 } elseif($kind -in @('folder','file')){
  if($targetPath -notmatch '^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)' -or $targetPath -match '[\x00-\x1f"]'){throw '올바른 전체 경로가 아닙니다.'}
  if($kind -eq 'folder'){
   if(-not(Test-Path -LiteralPath $targetPath -PathType Container)){throw "폴더가 없습니다: $targetPath"}
   if($request.folderMode -ne 'new' -and (Focus-Folder $targetPath)){exit 0}
   Start-Process -FilePath 'explorer.exe' -ArgumentList ('/n,"'+$targetPath+'"')
  }else{
   if(-not(Test-Path -LiteralPath $targetPath -PathType Leaf)){throw "파일이 없습니다: $targetPath"}
   Start-Process -FilePath $targetPath
  }
 }else{throw '지원하지 않는 클릭 동작입니다.'}
} catch {
 $logRoot=Join-Path $env:LOCALAPPDATA 'AJAZZGIF'
 New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
 $_.Exception.Message|Set-Content -LiteralPath (Join-Path $logRoot 'last-open-error.txt') -Encoding UTF8
 Add-Type -AssemblyName System.Windows.Forms
 [Windows.Forms.MessageBox]::Show($_.Exception.Message,'AJAZZ GIF — 열기 실패')|Out-Null
 exit 1
}
