# 在 Windows 桌面创建「尸潮防线 手机版」应用快捷方式。
# 用 Edge 的应用窗口 + Android UA + 手机横屏尺寸打开本地 index.html。
# 用法（在本目录）：powershell -ExecutionPolicy Bypass -File tools\install-desktop-shortcut.ps1
param(
  [string]$Root = '',
  [string]$Name = '尸潮防线 手机版.lnk',
  [int]$Width = 860,
  [int]$Height = 430
)
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$Root = (Resolve-Path $Root).Path
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
if (-not (Test-Path $edge)) { throw 'Microsoft Edge not found.' }

$urlPath = ($Root -replace '\\', '/' -replace ' ', '%20')
$appUrl = 'file:///' + $urlPath + '/index.html'
$ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
$args = '--app="' + $appUrl + '" --window-size=' + $Width + ',' + $Height +
  ' --user-agent="' + $ua + '" --user-data-dir="' + $Root + '\.app-profile" --force-device-scale-factor=1'

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop $Name
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = $edge
$sc.Arguments = $args
$sc.WorkingDirectory = $Root
$icon = Join-Path $Root 'icons\app.ico'
if (Test-Path $icon) { $sc.IconLocation = $icon + ',0' }
$sc.Description = '尸潮防线 手机版（本地应用窗口）'
$sc.Save()
Write-Host ('created: ' + $lnkPath)
Write-Host ('app url: ' + $appUrl)
