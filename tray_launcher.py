import os
import sys
import threading
import webbrowser
import subprocess
import time

if sys.platform == 'win32':
    import ctypes
    ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)

try:
    from pystray import Icon, Menu, MenuItem
    from PIL import Image, ImageDraw
except ImportError:
    print("正在安装依赖...")
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pystray', 'pillow', '-q'])
    from pystray import Icon, Menu, MenuItem
    from PIL import Image, ImageDraw

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
APP_PY = os.path.join(BACKEND_DIR, 'app.py')

server_process = None
server_running = False
icon = None

def create_icon_image():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([8, 8, 56, 56], fill='#3b82f6', outline='#2563eb', width=2)
    draw.polygon([(24, 20), (24, 44), (44, 32)], fill='white')
    return img

def create_icon_image_stopped():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([8, 8, 56, 56], fill='#6b7280', outline='#4b5563', width=2)
    draw.rectangle([22, 22, 42, 42], fill='white')
    return img

def start_server():
    global server_process, server_running
    if server_running:
        return
    
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    
    if sys.platform == 'win32':
        server_process = subprocess.Popen(
            [sys.executable, APP_PY],
            cwd=BACKEND_DIR,
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    else:
        server_process = subprocess.Popen(
            [sys.executable, APP_PY],
            cwd=BACKEND_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    
    server_running = True
    update_icon()
    print("服务器已启动")

def stop_server():
    global server_process, server_running
    if server_process:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except:
            server_process.kill()
        server_process = None
    server_running = False
    update_icon()
    print("服务器已停止")

def update_icon():
    if icon:
        if server_running:
            icon.icon = create_icon_image()
            icon.title = "视频学习系统 - 运行中"
        else:
            icon.icon = create_icon_image_stopped()
            icon.title = "视频学习系统 - 已停止"

def open_browser():
    webbrowser.open('http://localhost:5010')

def toggle_server(icon_item, item):
    if server_running:
        stop_server()
    else:
        start_server()

def exit_app(icon_item, item):
    stop_server()
    if icon:
        icon.stop()
    sys.exit(0)

def setup_tray():
    global icon
    
    menu = Menu(
        MenuItem(lambda item: '停止服务器' if server_running else '启动服务器', toggle_server),
        MenuItem('打开网页', open_browser, enabled=lambda item: server_running),
        Menu.SEPARATOR,
        MenuItem('退出', exit_app)
    )
    
    icon = Icon(
        'video-learning',
        create_icon_image_stopped(),
        '视频学习系统',
        menu
    )
    
    start_server()
    
    time.sleep(2)
    if server_running:
        webbrowser.open('http://localhost:5010')
    
    icon.run()

if __name__ == '__main__':
    setup_tray()
