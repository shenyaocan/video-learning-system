@echo off
chcp 65001 >nul
echo ========================================
echo   打包视频学习系统托盘启动器
echo ========================================
echo.

cd /d "%~dp0"

echo 正在安装打包工具...
pip install pyinstaller -q

echo 正在打包...
pyinstaller --noconfirm --onefile --windowed --name="视频学习系统" tray_launcher.py

echo.
echo ========================================
echo   打包完成！
echo   可执行文件位于: dist\视频学习系统.exe
echo ========================================
echo.
pause
