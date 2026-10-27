@echo off
rem 构建尸潮防线 Android APK（等价于 python tools\android-build\build_apk.py）
setlocal
set "DIR=%~dp0"
python "%DIR%..\..\tools\android-build\build_apk.py" %*
endlocal
