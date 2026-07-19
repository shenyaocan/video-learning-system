@echo off
chcp 65001 >nul
echo ========================================
echo   视频学习系统 - 托盘启动器
echo ========================================
echo.

cd /d "%~dp0"

echo 正在检查依赖...
python -c "import pystray, PIL" 2>nul
if errorlevel 1 (
    echo 正在安装依赖，请稍候...
    pip install pystray pillow -q
)

echo 启动中...
start "" pythonw tray_launcher.py
exit
