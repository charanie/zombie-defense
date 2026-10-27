@echo off
rem 尸潮防线 · 手机版启动器（Windows 桌面快捷方式也使用同样的参数）
rem 以独立应用窗口 + Android 手机 UA + 手机横屏尺寸运行本地 v1.5.0。
rem 想改窗口大小/方向：调整 --window-size（横屏 860,430；竖屏 430,880）。
setlocal
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "ROOT=%~dp0.."
start "" "%EDGE%" ^
  --app="file:///F:/ds%%20harness/games/zombie-defense/.agents/worktrees/feat/v1.5-map-fx/index.html" ^
  --window-size=860,430 ^
  --user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36" ^
  --user-data-dir="%ROOT%\.app-profile" ^
  --force-device-scale-factor=1
endlocal
