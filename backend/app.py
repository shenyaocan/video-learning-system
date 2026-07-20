from flask import Flask, request, jsonify, send_from_directory, Response, send_file, make_response
from flask_cors import CORS
import os
import json
import base64
import uuid
import subprocess
import mimetypes
import fitz
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote
import cv2
import numpy as np
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.before_request
def log_request():
    if 'feynman' in request.path or 'llm' in request.path:
        print(f"[Request] {request.method} {request.path}")

@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(405)
@app.errorhandler(500)
def handle_error(e):
    print(f"[Error] {e.code}: {request.method} {request.path}")
    return jsonify({'error': str(e.description) if hasattr(e, 'description') else str(e)}), e.code

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    traceback.print_exc()
    return jsonify({'error': f'服务器错误: {str(e)}'}), 500

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(BASE_DIR, 'videos')
SAVE_DIR = os.path.join(BASE_DIR, 'save')
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')

os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(SAVE_DIR, exist_ok=True)

def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {}

def save_config(config):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'Failed to save config: {e}')

custom_folders = []

_config = load_config()
if _config.get('lastFolderPaths'):
    for path in _config['lastFolderPaths']:
        if os.path.isdir(path):
            custom_folders.append(path)
            print(f"Loaded folder from config: {path}")

VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.ogv', '.ts', '.m3u8'}
PDF_EXTENSIONS = {'.pdf'}
MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | PDF_EXTENSIONS

def find_video_in_folders(filename, source='folder'):
    if source == 'local':
        return os.path.join(VIDEO_DIR, filename)
    if not custom_folders:
        return None
    for folder in custom_folders:
        test_path = os.path.join(folder, filename)
        if os.path.isfile(test_path):
            return test_path
    return None

MIME_MAP = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.flv': 'video/x-flv',
    '.ogv': 'video/ogg',
    '.ts': 'video/mp2t',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.pdf': 'application/pdf',
    '.mjs': 'application/javascript',
}

optimize_progress = {'total': 0, 'done': 0, 'current': '', 'status': 'idle'}
playlist = []

def detect_gpu_encoder():
    try:
        result = subprocess.run(
            ['ffmpeg', '-encoders'],
            capture_output=True, text=True, timeout=5
        )
        output = result.stdout
        
        if 'h264_nvenc' in output:
            return 'nvenc'
        elif 'h264_qsv' in output:
            return 'qsv'
        elif 'h264_amf' in output:
            return 'amf'
        else:
            return None
    except:
        return None

GPU_ENCODER = detect_gpu_encoder()
if GPU_ENCODER:
    print(f"GPU encoder detected: {GPU_ENCODER}")
else:
    print("No GPU encoder found, using CPU")


class RealTimeVideoStabilizer:
    def __init__(self, smoothing_radius=30, max_features=200):
        self.smoothing_radius = smoothing_radius
        self.max_features = max_features
        self.prev_gray = None
        self.transforms = deque(maxlen=smoothing_radius)
        
    def stabilize_frame(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if self.prev_gray is None:
            self.prev_gray = gray
            return frame
        
        features = cv2.goodFeaturesToTrack(
            self.prev_gray,
            maxCorners=self.max_features,
            qualityLevel=0.01,
            minDistance=30,
            blockSize=3
        )
        
        if features is None or len(features) < 10:
            self.prev_gray = gray
            return frame
        
        curr_features, status, _ = cv2.calcOpticalFlowPyrLK(
            self.prev_gray, gray, features, None
        )
        
        idx = np.where(status == 1)[0]
        prev_pts = features[idx].reshape(-1, 2)
        curr_pts = curr_features[idx].reshape(-1, 2)
        
        transform, _ = cv2.estimateAffinePartial2D(prev_pts, curr_pts)
        
        if transform is not None:
            self.transforms.append(transform)
            smoothed_transform = self._smooth_transforms()
            
            stabilized_frame = cv2.warpAffine(
                frame,
                smoothed_transform,
                (frame.shape[1], frame.shape[0])
            )
        else:
            stabilized_frame = frame
        
        self.prev_gray = gray
        return stabilized_frame
    
    def _smooth_transforms(self):
        if len(self.transforms) == 0:
            return np.eye(2, 3)
        
        recent_transforms = list(self.transforms)[-self.smoothing_radius:]
        
        dx_values = []
        dy_values = []
        da_values = []
        
        for transform in recent_transforms:
            dx = transform[0, 2]
            dy = transform[1, 2]
            da = np.arctan2(transform[1, 0], transform[0, 0])
            
            dx_values.append(dx)
            dy_values.append(dy)
            da_values.append(da)
        
        avg_dx = np.mean(dx_values)
        avg_dy = np.mean(dy_values)
        avg_da = np.mean(da_values)
        
        avg_transform = np.array([
            [np.cos(avg_da), -np.sin(avg_da), avg_dx],
            [np.sin(avg_da), np.cos(avg_da), avg_dy]
        ], dtype=np.float64)
        
        return avg_transform
    
    def reset(self):
        self.prev_gray = None
        self.transforms.clear()


@app.route('/api/videos')
def list_videos():
    videos = []
    if os.path.exists(VIDEO_DIR):
        for f in sorted(os.listdir(VIDEO_DIR)):
            ext = os.path.splitext(f)[1].lower()
            if f.startswith('.'):
                continue
            if ext not in MEDIA_EXTENSIONS:
                continue
            full = os.path.join(VIDEO_DIR, f)
            if os.path.isfile(full):
                videos.append({
                    'name': f,
                    'size': os.path.getsize(full),
                    'ext': ext
                })
    return jsonify(videos)


@app.route('/api/playlist', methods=['GET'])
def get_playlist():
    return jsonify(playlist)


@app.route('/api/playlist/add', methods=['POST'])
def add_to_playlist():
    global playlist
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    videos = data.get('videos', [])
    for v in videos:
        key = f"{v.get('source', 'folder')}|{v.get('name')}"
        exists = any(item.get('name') == v.get('name') and item.get('source') == v.get('source') for item in playlist)
        if not exists:
            playlist.append({
                'name': v.get('name'),
                'size': v.get('size', 0),
                'source': v.get('source', 'folder'),
                'folder_path': v.get('folder_path', '')
            })
    config = load_config()
    config['playlist'] = playlist
    save_config(config)
    return jsonify({'ok': True, 'count': len(playlist)})


@app.route('/api/playlist/remove', methods=['POST'])
def remove_from_playlist():
    global playlist
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    videos = data.get('videos', [])
    for v in videos:
        playlist = [item for item in playlist if not (item.get('name') == v.get('name') and item.get('source') == v.get('source'))]
    config = load_config()
    config['playlist'] = playlist
    save_config(config)
    return jsonify({'ok': True, 'count': len(playlist)})


@app.route('/api/playlist/clear', methods=['POST'])
def clear_playlist():
    global playlist
    playlist = []
    config = load_config()
    config['playlist'] = []
    save_config(config)
    return jsonify({'ok': True})


@app.route('/api/set-folder', methods=['POST'])
def set_folder():
    global custom_folders
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    path = data.get('path', '').strip()
    if not path:
        custom_folders = []
        config = load_config()
        config['lastFolderPaths'] = []
        save_config(config)
        return jsonify({'ok': True, 'folders': [], 'message': '已清除所有文件夹'})
    path = os.path.expanduser(path.strip('"\' '))
    path = os.path.abspath(path)
    if not os.path.isdir(path):
        return jsonify({'error': f'路径不存在或不是有效目录: {path}'}), 400
    if path not in custom_folders:
        custom_folders.append(path)
    config = load_config()
    config['lastFolderPaths'] = custom_folders
    save_config(config)
    count = sum(1 for f in os.listdir(path)
                if os.path.splitext(f)[1].lower() in MEDIA_EXTENSIONS
                and os.path.isfile(os.path.join(path, f)))
    return jsonify({'ok': True, 'folder': path, 'video_count': count, 'folders': custom_folders})


@app.route('/api/remove-folder', methods=['POST'])
def remove_folder():
    global custom_folders
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    path = data.get('path', '').strip()
    if path in custom_folders:
        custom_folders.remove(path)
        config = load_config()
        config['lastFolderPaths'] = custom_folders
        save_config(config)
    return jsonify({'ok': True, 'folders': custom_folders})


@app.route('/api/folder-videos')
def list_folder_videos():
    if not custom_folders:
        return jsonify([])
    result = []
    for folder_path in custom_folders:
        if not os.path.isdir(folder_path):
            continue
        folder_name = os.path.basename(folder_path)
        if len(folder_name) > 8:
            folder_name = folder_name[:8] + '...'
        videos = []
        try:
            entries = sorted(os.listdir(folder_path))
        except OSError:
            continue
        for f in entries:
            if f.startswith('.'):
                continue
            full = os.path.join(folder_path, f)
            if not os.path.isfile(full):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext not in MEDIA_EXTENSIONS:
                continue
            videos.append({
                'name': f,
                'size': os.path.getsize(full),
                'ext': ext,
                'source': 'folder',
                'folder_path': folder_path
            })
        if videos:
            result.append({
                'folder_name': folder_name,
                'folder_path': folder_path,
                'videos': videos
            })
    return jsonify(result)


@app.route('/api/add-file-path', methods=['POST'])
def add_file_path():
    global playlist
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    
    path = data.get('path', '').strip()
    if not path:
        return jsonify({'error': '请输入文件路径'}), 400
    
    path = path.replace('\\', '/')
    path = os.path.normpath(path)
    
    if not os.path.isfile(path):
        return jsonify({'error': f'文件不存在: {path}'}), 400
    
    ext = os.path.splitext(path)[1].lower()
    if ext not in MEDIA_EXTENSIONS:
        return jsonify({'error': f'不支持的文件格式: {ext}'}), 400
    
    filename = os.path.basename(path)
    filesize = os.path.getsize(path)
    
    exists = any(item.get('file_path') == path for item in playlist)
    if exists:
        return jsonify({'error': '文件已在播放列表中'}), 400
    
    playlist.append({
        'name': filename,
        'size': filesize,
        'source': 'file_path',
        'file_path': path
    })
    
    config = load_config()
    config['playlist'] = playlist
    save_config(config)
    
    print(f"Added file path: {path}, size: {filesize}")
    
    return jsonify({
        'ok': True,
        'file': {
            'name': filename,
            'size': filesize,
            'path': path
        }
    })


@app.route('/api/serve-file/<path:filepath>')
def serve_file_by_path(filepath):
    print(f"Raw filepath from URL: {filepath}")
    
    filepath = unquote(filepath)
    print(f"After unquote: {filepath}")
    
    if filepath[0:2].endswith(':'):
        parts = filepath.split('/')
        filepath = parts[0] + '\\' + '\\'.join(parts[1:])
    
    print(f"Final filepath: {filepath}")
    
    if not os.path.isfile(filepath):
        print(f"ERROR: File not found: {filepath}")
        print(f"Directory exists: {os.path.exists(os.path.dirname(filepath))}")
        return jsonify({'error': f'File not found: {filepath}'}), 404
    
    ext = os.path.splitext(filepath)[1].lower()
    mimetype = MIME_MAP.get(ext, 'application/octet-stream')
    
    print(f"Serving file: {filepath}, size: {os.path.getsize(filepath)}, mime: {mimetype}")
    
    try:
        resp = send_file(filepath, mimetype=mimetype)
        resp.headers['Accept-Ranges'] = 'bytes'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    except Exception as e:
        print(f"Error serving file {filepath}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/pdf-page-image', methods=['GET', 'POST', 'OPTIONS'])
def pdf_page_image():
    if request.method == 'GET':
        pdf_path = request.args.get('path', '')
        page_num = int(request.args.get('page', 1))
    else:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400
        pdf_path = data.get('path', '')
        page_num = data.get('page', 1)
    
    pdf_path = pdf_path.replace('\\', '/')
    pdf_path = os.path.normpath(pdf_path)
    
    # 首先检查直接路径
    if not os.path.isfile(pdf_path):
        # 如果不是完整路径，尝试在视频目录中查找
        pdf_filename = os.path.basename(pdf_path)
        video_dir_path = os.path.join(VIDEO_DIR, pdf_filename)
        
        if os.path.isfile(video_dir_path):
            pdf_path = video_dir_path
        else:
            # 尝试在其他可能的目录中查找
            possible_paths = [
                os.path.join(BASE_DIR, pdf_filename),
                os.path.join(BASE_DIR, 'pdfs', pdf_filename),
                os.path.join(BASE_DIR, '..', pdf_filename),
                pdf_filename,  # 当前目录
                # 用户指定的PDF目录
                os.path.join('D:\\', 'software', 'PDFshuiyin', '去水印', pdf_filename),
                os.path.join('D:/', 'software', 'PDFshuiyin', '去水印', pdf_filename)
            ]
            
            found_path = None
            for path in possible_paths:
                if os.path.isfile(path):
                    found_path = path
                    break
            
            if found_path:
                pdf_path = found_path
            else:
                return jsonify({'error': f'PDF file not found: {pdf_path}'}), 404
    
    try:
        doc = fitz.open(pdf_path)
        if page_num < 1 or page_num > doc.page_count:
            doc.close()
            return jsonify({'error': f'Invalid page number: {page_num}, total: {doc.page_count}'}), 400
        
        page = doc[page_num - 1]
        total_pages = doc.page_count
        zoom = 1.5
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        doc.close()
        
        encoded = base64.b64encode(img_bytes).decode('utf-8')
        response_data = {
            'ok': True,
            'image': f'data:image/png;base64,{encoded}',
            'width': pix.width,
            'height': pix.height,
            'page': page_num,
            'page_count': total_pages
        }
        
        return jsonify(response_data)
    except Exception as e:
        print(f"PDF page render error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/pdf-file', methods=['GET'])
def pdf_file():
    pdf_path = request.args.get('path', '')
    pdf_path = pdf_path.replace('\\', '/')
    pdf_path = os.path.normpath(pdf_path)
    
    # 首先检查直接路径
    if not os.path.isfile(pdf_path):
        # 如果不是完整路径，尝试在视频目录中查找
        pdf_filename = os.path.basename(pdf_path)
        video_dir_path = os.path.join(VIDEO_DIR, pdf_filename)
        
        if os.path.isfile(video_dir_path):
            pdf_path = video_dir_path
        else:
            # 尝试在其他可能的目录中查找
            possible_paths = [
                os.path.join(BASE_DIR, pdf_filename),
                os.path.join(BASE_DIR, 'pdfs', pdf_filename),
                os.path.join(BASE_DIR, '..', pdf_filename),
                pdf_filename,  # 当前目录
                # 用户指定的PDF目录
                os.path.join('D:\\', 'software', 'PDFshuiyin', '去水印', pdf_filename),
                os.path.join('D:/', 'software', 'PDFshuiyin', '去水印', pdf_filename)
            ]
            
            found_path = None
            for path in possible_paths:
                if os.path.isfile(path):
                    found_path = path
                    break
            
            if found_path:
                pdf_path = found_path
            else:
                return jsonify({'error': f'PDF file not found: {pdf_path}'}), 404
    
    try:
        with open(pdf_path, 'rb') as f:
            pdf_data = f.read()
        
        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'inline'
        return response
    except Exception as e:
        print(f"PDF file error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/pdf-parse', methods=['GET', 'POST'])
def pdf_parse():
    if request.method == 'GET':
        pdf_path = request.args.get('path', '')
        page_num = int(request.args.get('page', 1))
    else:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400
        pdf_path = data.get('path', '')
        page_num = data.get('page', 1)
    
    pdf_path = pdf_path.replace('\\', '/')
    pdf_path = os.path.normpath(pdf_path)
    
    # 首先检查直接路径
    if not os.path.isfile(pdf_path):
        # 如果不是完整路径，尝试在视频目录中查找
        pdf_filename = os.path.basename(pdf_path)
        video_dir_path = os.path.join(VIDEO_DIR, pdf_filename)
        
        if os.path.isfile(video_dir_path):
            pdf_path = video_dir_path
        else:
            # 尝试在其他可能的目录中查找
            possible_paths = [
                os.path.join(BASE_DIR, pdf_filename),
                os.path.join(BASE_DIR, 'pdfs', pdf_filename),
                os.path.join(BASE_DIR, '..', pdf_filename),
                pdf_filename,  # 当前目录
                # 用户指定的PDF目录
                os.path.join('D:\\', 'software', 'PDFshuiyin', '去水印', pdf_filename),
                os.path.join('D:/', 'software', 'PDFshuiyin', '去水印', pdf_filename)
            ]
            
            found_path = None
            for path in possible_paths:
                if os.path.isfile(path):
                    found_path = path
                    break
            
            if found_path:
                pdf_path = found_path
            else:
                return jsonify({'error': f'PDF file not found: {pdf_path}'}), 404
    
    try:
        # 使用 PyMuPDF (fitz) 提取文本，更稳定可靠
        doc = fitz.open(pdf_path)
        total_pages = doc.page_count
        
        if page_num < 1 or page_num > total_pages:
            doc.close()
            return jsonify({'error': f'Invalid page number: {page_num}, total: {total_pages}'}), 400
        
        page = doc[page_num - 1]
        text_content = page.get_text()
        
        # 获取页面尺寸
        rect = page.rect
        
        doc.close()
        
        return jsonify({
            'ok': True,
            'text': text_content,
            'page': page_num,
            'total_pages': total_pages,
            'page_info': {
                'width': rect.width,
                'height': rect.height
            }
        })
    except Exception as e:
        print(f"PDF parse error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/delete-videos', methods=['POST'])
def delete_videos():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Invalid JSON'}), 400
    video_names = data.get('videos', [])
    source = data.get('source', 'folder')
    folder_path = data.get('folder_path', '')
    if not video_names:
        return jsonify({'error': 'No videos specified'}), 400
    deleted = []
    failed = []
    if source == 'folder' and folder_path:
        target_dir = folder_path
    elif source == 'folder':
        target_dir = custom_folders[0] if custom_folders else None
    else:
        target_dir = VIDEO_DIR
    if not target_dir or not os.path.isdir(target_dir):
        return jsonify({'error': 'Target directory not found'}), 400
    for name in video_names:
        if not name or '/' in name or '\\' in name:
            failed.append({'name': name, 'error': 'Invalid filename'})
            continue
        full_path = os.path.join(target_dir, name)
        if not os.path.isfile(full_path):
            failed.append({'name': name, 'error': 'File not found'})
            continue
        try:
            os.remove(full_path)
            deleted.append(name)
        except Exception as e:
            failed.append({'name': name, 'error': str(e)})
    return jsonify({'deleted': deleted, 'failed': failed})


@app.route('/api/clear-videos', methods=['POST'])
def clear_videos():
    data = request.get_json(silent=True) or {}
    source = data.get('source', 'folder')
    folder_path = data.get('folder_path', '')
    if source == 'folder' and folder_path:
        target_dir = folder_path
    elif source == 'folder':
        target_dir = custom_folders[0] if custom_folders else None
    else:
        target_dir = VIDEO_DIR
    if not target_dir or not os.path.isdir(target_dir):
        return jsonify({'error': 'Target directory not found'}), 400
    deleted = []
    failed = []
    for f in os.listdir(target_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext not in VIDEO_EXTENSIONS:
            continue
        full_path = os.path.join(target_dir, f)
        if not os.path.isfile(full_path):
            continue
        try:
            os.remove(full_path)
            deleted.append(f)
        except Exception as e:
            failed.append({'name': f, 'error': str(e)})
    return jsonify({'deleted': deleted, 'failed': failed})


@app.route('/api/browse')
def browse():
    import string
    from ctypes import windll
    path = request.args.get('path', '')
    if not path:
        drives = []
        bitmask = windll.kernel32.GetLogicalDrives()
        for letter in string.ascii_uppercase:
            if bitmask & 1:
                drives.append({'name': f'{letter}:\\', 'type': 'drive', 'path': f'{letter}:\\'})
            bitmask >>= 1
        return jsonify(drives)
    try:
        entries = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir() and not entry.name.startswith('.'):
                    entries.append({
                        'name': entry.name,
                        'type': 'folder',
                        'path': entry.path
                    })
        entries.sort(key=lambda x: x['name'].lower())
        return jsonify(entries)
    except PermissionError:
        return jsonify([])


@app.route('/api/video-info')
def video_info():
    name = request.args.get('name', '')
    source = request.args.get('source', 'local')
    if not name:
        return jsonify({'error': 'name required'}), 400
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filepath],
            capture_output=True, timeout=10
        )
        stdout_text = result.stdout.decode('utf-8', errors='replace')
        info = json.loads(stdout_text)
        fmt = info.get('format', {})
        duration = float(fmt.get('duration', 0))
        size = int(fmt.get('size', 0))
        video_stream = next((s for s in info.get('streams', []) if s.get('codec_type') == 'video'), None)
        width = video_stream.get('width', 0) if video_stream else 0
        height = video_stream.get('height', 0) if video_stream else 0
        codec = video_stream.get('codec_name', '') if video_stream else ''
        
        with open(filepath, 'rb') as f:
            header = f.read(100)
            is_faststart = b'moov' in header
        
        return jsonify({
            'duration': duration, 
            'size': size, 
            'width': width, 
            'height': height, 
            'codec': codec,
            'faststart': is_faststart
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/video-diagnose')
def video_diagnose():
    name = request.args.get('name', '')
    source = request.args.get('source', 'local')
    if not name:
        return jsonify({'error': 'name required'}), 400
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filepath],
            capture_output=True, timeout=10
        )
        info = json.loads(result.stdout.decode('utf-8'))
        
        video_stream = next((s for s in info.get('streams', []) if s.get('codec_type') == 'video'), None)
        audio_stream = next((s for s in info.get('streams', []) if s.get('codec_type') == 'audio'), None)
        
        diagnose = {
            'filename': name,
            'format': info.get('format', {}).get('format_name', ''),
            'duration': float(info.get('format', {}).get('duration', 0)),
            'size': int(info.get('format', {}).get('size', 0)),
            'bit_rate': int(info.get('format', {}).get('bit_rate', 0)),
            'video': {},
            'audio': {},
            'issues': []
        }
        
        if video_stream:
            fps_str = video_stream.get('r_frame_rate', '0/1')
            try:
                if '/' in fps_str:
                    num, den = fps_str.split('/')
                    fps = float(num) / float(den) if float(den) != 0 else 0
                else:
                    fps = float(fps_str)
            except:
                fps = 0
            
            diagnose['video'] = {
                'codec': video_stream.get('codec_name', ''),
                'profile': video_stream.get('profile', ''),
                'level': video_stream.get('level', ''),
                'width': video_stream.get('width', 0),
                'height': video_stream.get('height', 0),
                'fps': round(fps, 2),
                'pix_fmt': video_stream.get('pix_fmt', ''),
                'has_b_frames': video_stream.get('has_b_frames', 0) > 0,
                'time_base': video_stream.get('time_base', ''),
            }
            
            if fps > 30:
                diagnose['issues'].append(f'高帧率({fps}fps)可能导致解码压力')
            if diagnose['video']['has_b_frames']:
                diagnose['issues'].append('包含B帧，解码复杂度高')
            if video_stream.get('codec_name') not in ['h264', 'vp8', 'vp9', 'av1']:
                diagnose['issues'].append(f'编码格式{video_stream.get("codec_name")}可能不兼容浏览器')
        
        if audio_stream:
            diagnose['audio'] = {
                'codec': audio_stream.get('codec_name', ''),
                'sample_rate': audio_stream.get('sample_rate', ''),
                'channels': audio_stream.get('channels', 0),
            }
            
            if audio_stream.get('codec_name') not in ['aac', 'mp3', 'opus', 'vorbis']:
                diagnose['issues'].append(f'音频编码{audio_stream.get("codec_name")}可能不兼容浏览器')
        
        if not diagnose['issues']:
            diagnose['issues'].append('未发现明显问题')
        
        return jsonify(diagnose)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/fix-video', methods=['POST'])
def fix_video():
    try:
        data = request.json
    except:
        return jsonify({'error': 'Invalid JSON'}), 400
    
    name = data.get('name', '')
    source = data.get('source', 'local')
    if not name:
        return jsonify({'error': 'name required'}), 400
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    temp_path = filepath + '.fixing.mp4'
    
    try:
        cmd = [
            'ffmpeg',
            '-fflags', '+genpts+igndts+discardcorrupt',
            '-i', filepath,
            '-vf', 'fps=30,setsar=1',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-profile:v', 'main',
            '-level', '3.1',
            '-bf', '0',
            '-crf', '23',
            '-x264-params', 'keyint=60:min-keyint=30:scenecut=0',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-af', 'aresample=async=1:first_pts=0',
            '-movflags', '+faststart',
            '-vsync', 'cfr',
            '-r', '30',
            '-y', temp_path
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=600)
        
        if result.returncode == 0 and os.path.exists(temp_path):
            if replace_file_with_retry(temp_path, filepath):
                return jsonify({'ok': True, 'message': '视频修复完成'})
            else:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                return jsonify({'error': '文件被占用，请关闭播放器后重试'}), 500
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            stderr = result.stderr.decode('utf-8', errors='replace') if result.stderr else ''
            return jsonify({'error': f'修复失败: {stderr[:300]}'}), 500
    except subprocess.TimeoutExpired:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': '修复超时'}), 500
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500


def replace_file_with_retry(src, dst, max_retries=3):
    import time
    import shutil
    
    for attempt in range(max_retries):
        try:
            if os.path.exists(dst):
                os.remove(dst)
            shutil.move(src, dst)
            return True
        except PermissionError:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                return False
        except Exception:
            return False
    return False


@app.route('/api/optimize-video', methods=['POST'])
def optimize_video():
    name = request.json.get('name', '')
    source = request.json.get('source', 'local')
    if not name:
        return jsonify({'error': 'name required'}), 400
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    ext = os.path.splitext(filepath)[1].lower()
    if ext != '.mp4':
        return jsonify({'error': '只支持MP4格式视频优化'}), 400
    
    temp_path = filepath + '.optimizing.mp4'
    
    try:
        cmd = [
            'ffmpeg', '-i', filepath,
            '-c', 'copy',
            '-movflags', '+faststart',
            '-y', temp_path
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        
        if result.returncode == 0 and os.path.exists(temp_path):
            if replace_file_with_retry(temp_path, filepath):
                return jsonify({'ok': True, 'message': '视频优化完成'})
            else:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                return jsonify({'error': '文件被占用，请关闭播放器后重试'}), 500
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            stderr = result.stderr.decode('utf-8', errors='replace') if result.stderr else ''
            return jsonify({'error': f'优化失败: {stderr[:200]}'}), 500
    except subprocess.TimeoutExpired:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': '优化超时'}), 500
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500


def optimize_single_video(filepath, filename, use_gpu=True):
    result = {'filename': filename, 'success': False, 'error': None, 'skipped': False}
    
    try:
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filepath],
            capture_output=True, timeout=10
        )
        probe_info = json.loads(probe_result.stdout.decode('utf-8'))
        
        video_stream = next((s for s in probe_info.get('streams', []) if s.get('codec_type') == 'video'), None)
        if not video_stream:
            result['skipped'] = True
            return result
        
        fps_str = video_stream.get('r_frame_rate', '30/1')
        if '/' in fps_str:
            num, den = fps_str.split('/')
            fps = float(num) / float(den) if float(den) != 0 else 30
        else:
            fps = float(fps_str)
        
        has_b_frames = video_stream.get('has_b_frames', 0) > 0
        width = video_stream.get('width', 1280)
        height = video_stream.get('height', 720)
        bit_rate = int(probe_info.get('format', {}).get('bit_rate', 0))
        
        with open(filepath, 'rb') as f:
            header = f.read(100)
            has_faststart = b'moov' in header
        
        needs_transcode = fps < 25 or has_b_frames
        needs_faststart = not has_faststart
        
        if not needs_transcode and not needs_faststart:
            result['skipped'] = True
            return result
        
    except Exception as e:
        fps = 30
        needs_transcode = False
        needs_faststart = True
        bit_rate = 0
        width = 1280
        height = 720
    
    temp_path = filepath + '.optimizing.mp4'
    
    try:
        if needs_transcode:
            target_fps = 25 if fps < 25 else 30
            
            if bit_rate > 0:
                if bit_rate < 400000:
                    target_bitrate = 350000
                elif bit_rate < 1000000:
                    target_bitrate = int(bit_rate * 0.9)
                else:
                    target_bitrate = int(bit_rate * 0.8)
                target_bitrate_str = f'{target_bitrate // 1000}k'
            else:
                if width <= 640:
                    target_bitrate_str = '400k'
                elif width <= 854:
                    target_bitrate_str = '600k'
                elif width <= 1280:
                    target_bitrate_str = '800k'
                else:
                    target_bitrate_str = '1000k'
            
            if use_gpu and GPU_ENCODER == 'nvenc':
                cmd = [
                    'ffmpeg',
                    '-hwaccel', 'cuda',
                    '-hwaccel_output_format', 'cuda',
                    '-i', filepath,
                    '-vf', f'fps={target_fps},hwdownload,format=nv12',
                    '-c:v', 'h264_nvenc',
                    '-preset', 'p4',
                    '-tune', 'hq',
                    '-profile:v', 'high',
                    '-level', '4.1',
                    '-rc', 'vbr',
                    '-cq', '23',
                    '-b:v', target_bitrate_str,
                    '-maxrate', target_bitrate_str,
                    '-bufsize', f'{int(target_bitrate_str.replace("k", "")) * 4}k',
                    '-surfaces', '32',
                    '-delay', '8',
                    '-multipass', 'qres',
                    '-bf', '0',
                    '-c:a', 'aac',
                    '-b:a', '96k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    '-y', temp_path
                ]
            elif use_gpu and GPU_ENCODER == 'qsv':
                cmd = [
                    'ffmpeg',
                    '-hwaccel', 'qsv',
                    '-hwaccel_output_format', 'qsv',
                    '-i', filepath,
                    '-vf', f'fps={target_fps},hwdownload,format=nv12',
                    '-c:v', 'h264_qsv',
                    '-preset', 'medium',
                    '-profile:v', 'high',
                    '-bf', '0',
                    '-b:v', target_bitrate_str,
                    '-maxrate', target_bitrate_str,
                    '-bufsize', f'{int(target_bitrate_str.replace("k", "")) * 4}k',
                    '-c:a', 'aac',
                    '-b:a', '96k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    '-y', temp_path
                ]
            elif use_gpu and GPU_ENCODER == 'amf':
                cmd = [
                    'ffmpeg', '-i', filepath,
                    '-vf', f'fps={target_fps}',
                    '-c:v', 'h264_amf',
                    '-profile:v', 'high',
                    '-level', '4.1',
                    '-rc', 'vbr_latency',
                    '-qp_i', '22',
                    '-qp_p', '24',
                    '-bf', '0',
                    '-b:v', target_bitrate_str,
                    '-maxrate', target_bitrate_str,
                    '-bufsize', f'{int(target_bitrate_str.replace("k", "")) * 4}k',
                    '-c:a', 'aac',
                    '-b:a', '96k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    '-y', temp_path
                ]
            else:
                cmd = [
                    'ffmpeg', '-i', filepath,
                    '-vf', f'fps={target_fps}',
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-profile:v', 'main',
                    '-level', '3.1',
                    '-bf', '0',
                    '-b:v', target_bitrate_str,
                    '-maxrate', target_bitrate_str,
                    '-bufsize', f'{int(target_bitrate_str.replace("k", "")) * 2}k',
                    '-threads', '4',
                    '-c:a', 'aac',
                    '-b:a', '96k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    '-y', temp_path
                ]
        else:
            cmd = [
                'ffmpeg', '-i', filepath,
                '-c', 'copy',
                '-movflags', '+faststart',
                '-y', temp_path
            ]
        
        proc_result = subprocess.run(cmd, capture_output=True, timeout=600)
        
        if proc_result.returncode == 0 and os.path.exists(temp_path):
            if replace_file_with_retry(temp_path, filepath):
                result['success'] = True
            else:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                result['error'] = '文件被占用'
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            result['error'] = '优化失败'
            
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        result['error'] = str(e)
    
    return result


@app.route('/api/optimize-all-videos', methods=['POST'])
def optimize_all_videos():
    global optimize_progress
    
    source = request.json.get('source', 'folder')
    use_gpu = request.json.get('use_gpu', True)
    max_workers = request.json.get('max_workers', 4)
    
    directories = custom_folders if source == 'folder' else [VIDEO_DIR]
    if not directories:
        return jsonify({'error': '文件夹未设置'}), 400
    
    files_to_process = []
    for directory in directories:
        if not os.path.isdir(directory):
            continue
        for filename in os.listdir(directory):
            if filename.lower().endswith('.mp4'):
                filepath = os.path.join(directory, filename)
                if os.path.isfile(filepath):
                    files_to_process.append((filepath, filename))
    
    if not files_to_process:
        return jsonify({'success': 0, 'failed': 0, 'skipped': 0, 'errors': []})
    
    optimize_progress['total'] = len(files_to_process)
    optimize_progress['done'] = 0
    optimize_progress['current'] = ''
    optimize_progress['status'] = 'running'
    
    results = {'success': 0, 'failed': 0, 'skipped': 0, 'errors': []}
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(optimize_single_video, fp, fn, use_gpu): fn
            for fp, fn in files_to_process
        }
        
        for future in as_completed(futures):
            filename = futures[future]
            optimize_progress['current'] = filename
            
            try:
                result = future.result()
                optimize_progress['done'] += 1
                
                if result['skipped']:
                    results['skipped'] += 1
                elif result['success']:
                    results['success'] += 1
                else:
                    results['failed'] += 1
                    if result['error']:
                        results['errors'].append(f"{filename}: {result['error']}")
            except Exception as e:
                results['failed'] += 1
                results['errors'].append(f"{filename}: {str(e)}")
    
    optimize_progress['status'] = 'completed'
    return jsonify(results)


@app.route('/api/optimize-progress')
def get_optimize_progress():
    return jsonify(optimize_progress)


def generate_transcoded_stream(filepath, quality='medium'):
    quality_settings = {
        'low': {'resolution': '480:270', 'bitrate': '500k', 'audio_bitrate': '64k', 'fps': 24},
        'medium': {'resolution': '640:360', 'bitrate': '800k', 'audio_bitrate': '96k', 'fps': 25},
        'high': {'resolution': '854:480', 'bitrate': '1200k', 'audio_bitrate': '128k', 'fps': 30},
    }
    settings = quality_settings.get(quality, quality_settings['medium'])
    
    cmd = [
        'ffmpeg',
        '-i', filepath,
        '-vf', f'scale={settings["resolution"]}:force_original_aspect_ratio=decrease,fps={settings["fps"]}',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'fastdecode',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-b:v', settings['bitrate'],
        '-maxrate', settings['bitrate'],
        '-bufsize', str(int(settings['bitrate'].replace('k', '')) * 2) + 'k',
        '-g', '30',
        '-keyint_min', '30',
        '-c:a', 'aac',
        '-b:a', settings['audio_bitrate'],
        '-ar', '44100',
        '-ac', '2',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        '-'
    ]
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=1024 * 1024
    )
    
    try:
        while True:
            chunk = process.stdout.read(64 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        process.terminate()
        process.wait()


@app.route('/api/transcode-folder/<path:filename>')
def transcode_folder_video(filename):
    if not custom_folders:
        return jsonify({'error': 'No custom folder configured'}), 400
    filepath = None
    for folder in custom_folders:
        test_path = os.path.join(folder, filename)
        if os.path.isfile(test_path):
            filepath = test_path
            break
    if not filepath:
        return jsonify({'error': 'Video not found'}), 404
    
    quality = request.args.get('quality', 'medium')
    
    resp = Response(
        generate_transcoded_stream(filepath, quality),
        mimetype='video/mp4'
    )
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


@app.route('/api/transcode/<path:filename>')
def transcode_video(filename):
    filepath = os.path.join(VIDEO_DIR, filename)
    if not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    quality = request.args.get('quality', 'medium')
    
    resp = Response(
        generate_transcoded_stream(filepath, quality),
        mimetype='video/mp4'
    )
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


@app.route('/api/video-folder/<path:filename>')
def serve_folder_video(filename):
    if not custom_folders:
        print(f"ERROR: No custom folder configured for {filename}")
        return jsonify({'error': 'No custom folder configured'}), 400
    filepath = None
    for folder in custom_folders:
        test_path = os.path.join(folder, filename)
        if os.path.isfile(test_path):
            filepath = test_path
            break
    if not filepath:
        print(f"ERROR: Video not found in any folder: {filename}")
        return jsonify({'error': 'Video not found'}), 404
    ext = os.path.splitext(filename)[1].lower()
    mimetype = MIME_MAP.get(ext, 'video/mp4')
    print(f"Serving video: {filepath}, size: {os.path.getsize(filepath)}, mime: {mimetype}")
    try:
        resp = send_file(filepath, conditional=True, mimetype=mimetype)
        resp.headers['Accept-Ranges'] = 'bytes'
        return resp
    except Exception as e:
        print(f"Error serving video {filename}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/video/<path:filename>')
def serve_video(filename):
    filepath = os.path.join(VIDEO_DIR, filename)
    if not os.path.isfile(filepath):
        print(f"ERROR: Video not found: {filepath}")
        return jsonify({'error': 'Video not found'}), 404
    ext = os.path.splitext(filename)[1].lower()
    mimetype = MIME_MAP.get(ext, 'video/mp4')
    print(f"Serving video: {filepath}, size: {os.path.getsize(filepath)}, mime: {mimetype}")
    try:
        resp = send_file(filepath, conditional=True, mimetype=mimetype)
        resp.headers['Accept-Ranges'] = 'bytes'
        return resp
    except Exception as e:
        print(f"Error serving video {filename}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/video-formats')
def video_formats():
    return jsonify({
        'browser_supported': {
            'mp4': 'H.264 + AAC (最广泛支持)',
            'webm': 'VP8/VP9 + Vorbis/Opus',
            'ogg': 'Theora + Vorbis'
        },
        'container_formats': list(VIDEO_EXTENSIONS),
        'mime_types': MIME_MAP
    })


smooth_tasks = {}
smooth_tasks_lock = threading.Lock()

def run_smooth_video_task(task_id, name, source, playback_rate, filepath, output_path):
    try:
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', filepath],
            capture_output=True, text=True
        )
        probe_info = json.loads(probe_result.stdout)
        video_stream = next((s for s in probe_info.get('streams', []) if s.get('codec_type') == 'video'), None)
        
        if not video_stream:
            with smooth_tasks_lock:
                smooth_tasks[task_id] = {'status': 'failed', 'error': '无法获取视频信息'}
            return
        
        fps_str = video_stream.get('r_frame_rate', '30/1')
        if '/' in fps_str:
            num, den = fps_str.split('/')
            original_fps = float(num) / float(den)
        else:
            original_fps = float(fps_str)
        
        target_fps = original_fps
        
        encoder_args = []
        if GPU_ENCODER:
            encoder_args = ['-c:v', GPU_ENCODER]
        else:
            encoder_args = ['-c:v', 'libx264', '-preset', 'fast']
        
        if playback_rate > 1.0:
            video_filter = f"setpts=PTS/{playback_rate}"
            audio_filter = f"atempo={playback_rate}"
        else:
            video_filter = None
            audio_filter = None
        
        cmd = [
            'ffmpeg', '-i', filepath
        ]
        
        if video_filter:
            cmd.extend(['-filter:v', video_filter])
        
        if audio_filter:
            cmd.extend(['-filter:a', audio_filter])
        
        cmd.extend([
            '-c:a', 'aac', '-b:a', '192k',
            '-r', str(target_fps),
            '-y',
            '-movflags', '+faststart',
            *encoder_args,
            output_path
        ])
        
        print(f"Running smooth video command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        with smooth_tasks_lock:
            if result.returncode == 0 and os.path.exists(output_path):
                smooth_tasks[task_id] = {
                    'status': 'completed',
                    'output': os.path.basename(output_path),
                    'input_fps': original_fps,
                    'output_fps': target_fps
                }
            else:
                error_msg = result.stderr[:300] if result.stderr else 'Unknown error'
                smooth_tasks[task_id] = {'status': 'failed', 'error': error_msg}
                if os.path.exists(output_path):
                    os.remove(output_path)
                    
    except Exception as e:
        with smooth_tasks_lock:
            smooth_tasks[task_id] = {'status': 'failed', 'error': str(e)}
        if os.path.exists(output_path):
            os.remove(output_path)


@app.route('/api/smooth-video', methods=['POST'])
def smooth_video():
    try:
        data = request.json
    except:
        return jsonify({'error': 'Invalid JSON'}), 400
    
    name = data.get('name', '')
    source = data.get('source', 'local')
    playback_rate = data.get('playback_rate', 2.0)
    
    if not name:
        return jsonify({'error': 'name required'}), 400
    
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    output_filename = os.path.splitext(name)[0] + f'_smooth_{playback_rate}x.mp4'
    output_path = os.path.join(os.path.dirname(filepath), output_filename)
    
    if os.path.exists(output_path):
        return jsonify({
            'ok': True,
            'message': '视频已优化',
            'output': output_filename,
            'exists': True
        })
    
    with smooth_tasks_lock:
        for task_id, task in smooth_tasks.items():
            if task.get('name') == name and task.get('playback_rate') == playback_rate:
                if task.get('status') == 'processing':
                    return jsonify({
                        'ok': True,
                        'message': '正在处理中',
                        'task_id': task_id,
                        'status': 'processing'
                    })
                elif task.get('status') == 'completed':
                    return jsonify({
                        'ok': True,
                        'message': '视频已优化',
                        'output': task.get('output'),
                        'exists': True
                    })
    
    task_id = str(uuid.uuid4())
    
    with smooth_tasks_lock:
        smooth_tasks[task_id] = {
            'status': 'processing',
            'name': name,
            'playback_rate': playback_rate,
            'start_time': datetime.now().isoformat()
        }
    
    thread = threading.Thread(
        target=run_smooth_video_task,
        args=(task_id, name, source, playback_rate, filepath, output_path),
        daemon=True
    )
    thread.start()
    
    return jsonify({
        'ok': True,
        'message': '开始后台处理',
        'task_id': task_id,
        'status': 'processing'
    })


@app.route('/api/smooth-video-status/<task_id>', methods=['GET'])
def smooth_video_status(task_id):
    with smooth_tasks_lock:
        task = smooth_tasks.get(task_id)
        if not task:
            return jsonify({'error': '任务不存在'}), 404
        
        return jsonify({
            'ok': True,
            'task_id': task_id,
            'status': task.get('status'),
            'name': task.get('name'),
            'playback_rate': task.get('playback_rate'),
            'output': task.get('output'),
            'error': task.get('error'),
            'input_fps': task.get('input_fps'),
            'output_fps': task.get('output_fps')
        })


@app.route('/api/annotations', methods=['GET'])
def list_annotations():
    video_name = request.args.get('video_name')
    annotations = []
    if os.path.exists(SAVE_DIR):
        for f in sorted(os.listdir(SAVE_DIR), reverse=True):
            if f.endswith('.json'):
                try:
                    with open(os.path.join(SAVE_DIR, f), 'r', encoding='utf-8') as fh:
                        data = json.load(fh)
                    if video_name and data.get('video_name') != video_name:
                        continue
                    annotations.append({
                        'id': data.get('id', ''),
                        'video_name': data.get('video_name', ''),
                        'video_source': data.get('video_source', 'local'),
                        'timestamp': data.get('timestamp', 0),
                        'pdf_page': data.get('pdf_page'),
                        'date': data.get('date', ''),
                        'image_file': data.get('image_file', ''),
                        'note': data.get('note', ''),
                        'ease_factor': data.get('ease_factor', 2.5),
                        'interval': data.get('interval', 0),
                        'next_review_date': data.get('next_review_date'),
                        'review_count': data.get('review_count', 0)
                    })
                except (json.JSONDecodeError, IOError):
                    continue
    annotations.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(annotations)


@app.route('/api/annotations/stats', methods=['GET'])
def annotation_stats():
    stats = {}
    if os.path.exists(SAVE_DIR):
        for f in os.listdir(SAVE_DIR):
            if f.endswith('.json'):
                try:
                    with open(os.path.join(SAVE_DIR, f), 'r', encoding='utf-8') as fh:
                        data = json.load(fh)
                    video_name = data.get('video_name', '')
                    if video_name not in stats:
                        stats[video_name] = {'total': 0, 'reviewed': 0}
                    stats[video_name]['total'] += 1
                    if data.get('review_count', 0) > 0:
                        stats[video_name]['reviewed'] += 1
                except (json.JSONDecodeError, IOError):
                    continue
    return jsonify(stats)


@app.route('/api/annotations', methods=['POST'])
def save_annotation():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400

    annotation_id = str(uuid.uuid4())
    annotation_date = datetime.now().isoformat()

    image_data = data.get('screenshot_data', '')
    image_filename = f'{annotation_id}.png'
    if image_data:
        try:
            if ',' in image_data:
                image_data = image_data.split(',', 1)[1]
            image_binary = base64.b64decode(image_data)
            with open(os.path.join(SAVE_DIR, image_filename), 'wb') as f:
                f.write(image_binary)
        except (base64.binascii.Error, IOError) as e:
            return jsonify({'error': f'Image decode failed: {str(e)}'}), 400

    annotation = {
        'id': annotation_id,
        'video_name': data.get('video_name', ''),
        'video_source': data.get('video_source', 'local'),
        'timestamp': data.get('timestamp', 0),
        'pdf_page': data.get('pdf_page'),
        'date': annotation_date,
        'image_file': image_filename if image_data else '',
        'note': data.get('note', ''),
        'ease_factor': 2.5,
        'interval': 0,
        'next_review_date': None,
        'review_count': 0
    }
    print(f"Creating annotation: pdf_page={data.get('pdf_page')}, timestamp={data.get('timestamp')}")

    with open(os.path.join(SAVE_DIR, f'{annotation_id}.json'), 'w',
              encoding='utf-8') as f:
        json.dump(annotation, f, ensure_ascii=False, indent=2)

    return jsonify(annotation), 201


@app.route('/api/annotations/<annotation_id>/image')
def get_annotation_image(annotation_id):
    safe_id = os.path.basename(annotation_id)
    json_path = os.path.join(SAVE_DIR, f'{safe_id}.json')
    if not os.path.exists(json_path):
        return jsonify({'error': 'Not found'}), 404
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return jsonify({'error': 'Invalid annotation'}), 500
    image_file = data.get('image_file', '')
    if not image_file:
        return jsonify({'error': 'No image'}), 404
    return send_from_directory(SAVE_DIR, image_file)


@app.route('/api/annotations/<annotation_id>', methods=['DELETE'])
def delete_annotation(annotation_id):
    safe_id = os.path.basename(annotation_id)
    json_path = os.path.join(SAVE_DIR, f'{safe_id}.json')
    if not os.path.exists(json_path):
        return jsonify({'error': 'Not found'}), 404
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return jsonify({'error': 'Invalid annotation'}), 500
    img_path = os.path.join(SAVE_DIR, data.get('image_file', ''))
    if os.path.exists(img_path):
        os.remove(img_path)
    os.remove(json_path)
    return jsonify({'ok': True})


@app.route('/api/annotations/<annotation_id>/review', methods=['POST'])
def review_annotation(annotation_id):
    safe_id = os.path.basename(annotation_id)
    json_path = os.path.join(SAVE_DIR, f'{safe_id}.json')
    if not os.path.exists(json_path):
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400
    difficulty = data.get('difficulty')
    if difficulty not in ['again', 'hard', 'good', 'easy']:
        return jsonify({'error': 'Invalid difficulty'}), 400

    with open(json_path, 'r', encoding='utf-8') as f:
        ann = json.load(f)

    ease_factor = ann.get('ease_factor', 2.5)
    interval = ann.get('interval', 0)
    review_count = ann.get('review_count', 0)

    if difficulty == 'again':
        quality = 0
        interval = 0
        ease_factor = max(1.3, ease_factor - 0.2)
    elif difficulty == 'hard':
        quality = 2
        interval = max(1, interval * 0.8)
        ease_factor = max(1.3, ease_factor - 0.15)
    elif difficulty == 'good':
        quality = 3
        if interval == 0:
            interval = 1
        else:
            interval = round(interval * ease_factor)
        ease_factor = max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    elif difficulty == 'easy':
        quality = 4
        if interval == 0:
            interval = 2
        else:
            interval = round(interval * ease_factor * 1.3)
        ease_factor = max(1.3, ease_factor + (0.15 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

    review_count += 1
    next_review = datetime.now(timezone.utc) + timedelta(days=interval)
    next_review_iso = next_review.isoformat().replace('+00:00', 'Z')

    ann['ease_factor'] = ease_factor
    ann['interval'] = interval
    ann['review_count'] = review_count
    ann['next_review_date'] = next_review_iso

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(ann, f, ensure_ascii=False, indent=2)

    return jsonify({
        'id': annotation_id,
        'ease_factor': ease_factor,
        'interval': interval,
        'review_count': review_count,
        'next_review_date': next_review_iso
    })


@app.route('/api/stabilize-video', methods=['POST'])
def stabilize_video():
    try:
        data = request.json
    except:
        return jsonify({'error': 'Invalid JSON'}), 400
    
    name = data.get('name', '')
    source = data.get('source', 'local')
    if not name:
        return jsonify({'error': 'name required'}), 400
    
    filepath = find_video_in_folders(name, source)
    if not filepath or not os.path.isfile(filepath):
        return jsonify({'error': 'Video not found'}), 404
    
    temp_path = filepath + '.stabilizing.mp4'
    
    try:
        cap = cv2.VideoCapture(filepath)
        if not cap.isOpened():
            return jsonify({'error': 'Cannot open video file'}), 500
        
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_path, fourcc, fps, (width, height))
        
        stabilizer = RealTimeVideoStabilizer(smoothing_radius=30, max_features=200)
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            stabilized = stabilizer.stabilize_frame(frame)
            out.write(stabilized)
            frame_count += 1
        
        cap.release()
        out.release()
        
        if os.path.exists(temp_path):
            final_path = filepath.rsplit('.', 1)[0] + '_stabilized.mp4'
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(temp_path, final_path)
            return jsonify({
                'ok': True, 
                'message': '视频稳定完成',
                'output': os.path.basename(final_path),
                'frames_processed': frame_count
            })
        else:
            return jsonify({'error': 'Stabilization failed'}), 500
            
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500


@app.route('/api/config', methods=['GET'])
def get_config():
    config = load_config()
    return jsonify(config)


@app.route('/api/video-progress', methods=['GET', 'POST'])
def video_progress():
    config = load_config()
    if request.method == 'POST':
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400
        video_name = data.get('video_name')
        current_time = data.get('current_time', 0)
        duration = data.get('duration', 0)
        if not video_name:
            return jsonify({'error': 'video_name required'}), 400
        if 'videoProgress' not in config:
            config['videoProgress'] = {}
        config['videoProgress'][video_name] = {
            'current_time': current_time,
            'duration': duration,
            'updated_at': datetime.now().isoformat()
        }
        config['lastWatchedVideo'] = video_name
        save_config(config)
        return jsonify({'ok': True})
    else:
        return jsonify(config.get('videoProgress', {}))

@app.route('/api/last-watched', methods=['GET'])
def get_last_watched():
    config = load_config()
    last_video = config.get('lastWatchedVideo') or ''
    progress = config.get('videoProgress', {}).get(last_video, {}) if last_video else {}
    return jsonify({
        'video_name': last_video or None,
        'current_time': progress.get('current_time', 0),
        'duration': progress.get('duration', 0)
    })


FEYNMAN_CHAT_DIR = os.path.join(BASE_DIR, 'feynman_chats')
os.makedirs(FEYNMAN_CHAT_DIR, exist_ok=True)

def get_llm_config():
    config = load_config()
    return {
        'api_url': config.get('llm_api_url', 'https://api.deepseek.com/v1/chat/completions'),
        'api_key': config.get('llm_api_key', ''),
        'model_name': config.get('llm_model_name', 'deepseek-chat'),
        'supports_vision': config.get('llm_supports_vision', True)
    }

@app.route('/api/llm/config', methods=['GET', 'POST'])
def llm_config():
    config = load_config()
    if request.method == 'POST':
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400
        if data.get('api_url'):
            config['llm_api_url'] = data['api_url']
        if data.get('api_key'):
            config['llm_api_key'] = data['api_key']
        if data.get('model_name'):
            config['llm_model_name'] = data['model_name']
        if 'supports_vision' in data:
            config['llm_supports_vision'] = data['supports_vision']
        save_config(config)
        print(f"[LLM Config] Saved: api_url={data.get('api_url')}, model={data.get('model_name')}, has_key={bool(data.get('api_key'))}")
        return jsonify({'ok': True})
    else:
        llm_config_data = get_llm_config()
        return jsonify({
            'api_url': llm_config_data['api_url'],
            'model_name': llm_config_data['model_name'],
            'supports_vision': llm_config_data['supports_vision'],
            'configured': bool(llm_config_data['api_key'])
        })

@app.route('/api/feynman/test', methods=['GET', 'POST'])
def feynman_test():
    print(f"[Feynman Test] Method: {request.method}")
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        return jsonify({'status': 'ok', 'received': data, 'method': 'POST'})
    llm_cfg = get_llm_config()
    return jsonify({
        'status': 'ok',
        'api_url': llm_cfg['api_url'],
        'model': llm_cfg['model_name'],
        'has_key': bool(llm_cfg['api_key']),
        'method': 'GET'
    })

@app.route('/api/feynman/chat/<annotation_id>', methods=['GET', 'POST', 'OPTIONS'])
def feynman_chat(annotation_id):
    print(f"[Feynman] Received {request.method} request for annotation {annotation_id}")
    
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    chat_file = os.path.join(FEYNMAN_CHAT_DIR, f'{annotation_id}.json')
    
    if request.method == 'GET':
        if os.path.exists(chat_file):
            with open(chat_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        return jsonify({'messages': []})
    
    data = request.get_json(silent=True)
    if not data:
        print("[Feynman] Error: Invalid JSON")
        return jsonify({'error': 'Invalid JSON'}), 400
    
    user_message = data.get('message', '')
    image_base64 = data.get('image_base64', '')
    attachments = data.get('attachments', [])
    
    if not user_message and not attachments:
        return jsonify({'error': '消息不能为空'}), 400
    
    llm_cfg = get_llm_config()
    if not llm_cfg['api_key']:
        return jsonify({'error': '请先配置大模型API'}), 400
    
    chat_history = []
    if os.path.exists(chat_file):
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
            chat_history = chat_data.get('messages', [])
    
    messages = []
    
    if len(chat_history) == 0:
        messages.append({
            'role': 'system',
            'content': '''你是一位专业的辅导老师。请分析用户提供的标注图片，给出答案和解题思路，以及出3道考题。

数学公式格式要求：
- 使用 $...$ 表示行内公式（如 $F = ma$）
- 使用 $$...$$ 表示块级公式（如 $$E=mc^2$$）
- 不要使用 \\\\(...\\\\) 或 \\\\[...\\\\] 格式

请用中文回复，保持专业和清晰的语气。'''
        })
    else:
        messages.append({
            'role': 'system',
            'content': '''你是一位费曼学习法的辅导老师。你的任务是帮助学生通过"以教代学"的方式深入理解知识。

费曼学习法的核心步骤：
1. 选择一个概念
2. 用简单的语言向他人解释这个概念
3. 识别解释中的漏洞和困惑点
4. 回顾并简化解释

请引导学生：
- 用自己的话解释图片中的知识点
- 找出理解不清晰的地方
- 通过提问帮助学生深入思考
- 鼓励学生用更简单的方式表达

数学公式格式要求：
- 使用 $...$ 表示行内公式（如 $F = ma$）
- 使用 $$...$$ 表示块级公式（如 $$E=mc^2$$）
- 不要使用 \\\\(...\\\\) 或 \\\\[...\\\\] 格式

请用中文回复，保持友好和鼓励的语气。'''
        })
    
    for msg in chat_history:
        if msg['role'] in ['user', 'assistant']:
            messages.append({
                'role': msg['role'],
                'content': msg['content']
            })
    
    supports_vision = llm_cfg.get('supports_vision', True)
    
    user_content = []
    has_image_content = False
    
    if image_base64 and supports_vision:
        user_content.append({
            'type': 'image_url',
            'image_url': {'url': f'data:image/png;base64,{image_base64}'}
        })
        has_image_content = True
    
    for att in attachments:
        if att.get('type') == 'image' and supports_vision:
            img_data = att.get('content', '')
            if img_data.startswith('data:image'):
                user_content.append({
                    'type': 'image_url',
                    'image_url': {'url': img_data}
                })
                has_image_content = True
        elif att.get('type') == 'document':
            doc_content = att.get('content', '')
            doc_name = att.get('name', 'document')
            user_content.append({
                'type': 'text',
                'text': f'\n\n[附件: {doc_name}]\n{doc_content}'
            })
    
    if user_message:
        user_content.insert(0, {'type': 'text', 'text': user_message})
    
    if not user_content:
        user_content = [{'type': 'text', 'text': '请帮我分析这个知识点'}]
    
    if has_image_content and supports_vision:
        messages.append({
            'role': 'user',
            'content': user_content
        })
    else:
        text_parts = []
        for item in user_content:
            if item.get('type') == 'text':
                text_parts.append(item.get('text', ''))
        combined_text = '\n'.join(text_parts) or user_message or '请帮我分析这个知识点'
        messages.append({
            'role': 'user',
            'content': combined_text
        })
    
    try:
        import requests
        print(f"[Feynman] Calling API: {llm_cfg['api_url']}")
        print(f"[Feynman] Model: {llm_cfg['model_name']}")
        
        response = requests.post(
            llm_cfg['api_url'],
            headers={
                'Authorization': f'Bearer {llm_cfg["api_key"]}',
                'Content-Type': 'application/json'
            },
            json={
                'model': llm_cfg['model_name'],
                'messages': messages,
                'max_tokens': 2000,
                'temperature': 0.7
            },
            timeout=120
        )
        
        print(f"[Feynman] Response status: {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text[:500]
            print(f"[Feynman] Error response: {error_text}")
            return jsonify({'error': f'API调用失败({response.status_code}): {error_text}'}), 500
        
        result = response.json()
        if 'choices' not in result or len(result['choices']) == 0:
            print(f"[Feynman] No choices in response: {result}")
            return jsonify({'error': 'API返回格式错误'}), 500
        
        assistant_message = result['choices'][0]['message']['content']
        
        user_msg_to_save = {'role': 'user', 'content': user_message or '(附件消息)'}
        if attachments:
            user_msg_to_save['attachments'] = attachments
        chat_history.append(user_msg_to_save)
        chat_history.append({'role': 'assistant', 'content': assistant_message})
        
        with open(chat_file, 'w', encoding='utf-8') as f:
            json.dump({'messages': chat_history}, f, ensure_ascii=False, indent=2)
        
        return jsonify({'reply': assistant_message})
    
    except requests.exceptions.Timeout:
        print("[Feynman] Request timeout")
        return jsonify({'error': 'API请求超时(120秒)，请检查网络或更换模型'}), 500
    except requests.exceptions.ConnectionError as e:
        print(f"[Feynman] Connection error: {str(e)}")
        return jsonify({'error': f'无法连接到API服务器: {llm_cfg["api_url"]}'}), 500
    except requests.exceptions.RequestException as e:
        print(f"[Feynman] Request error: {str(e)}")
        return jsonify({'error': f'网络错误: {str(e)}'}), 500
    except KeyError as e:
        print(f"[Feynman] KeyError: {str(e)}")
        return jsonify({'error': f'API返回格式错误: {str(e)}'}), 500
    except Exception as e:
        print(f"[Feynman] Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'发生错误: {str(e)}'}), 500

@app.route('/api/feynman/chat/<annotation_id>/clear', methods=['POST'])
def clear_feynman_chat(annotation_id):
    chat_file = os.path.join(FEYNMAN_CHAT_DIR, f'{annotation_id}.json')
    if os.path.exists(chat_file):
        os.remove(chat_file)
    return jsonify({'ok': True})


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    config = load_config()
    if config.get('lastFolderPaths'):
        for path in config['lastFolderPaths']:
            if os.path.isdir(path):
                custom_folders.append(path)
                print(f"Loaded folder from config: {path}")
    if config.get('playlist'):
        playlist.extend(config['playlist'])
        print(f"Loaded {len(playlist)} videos from playlist")
    
    print(f"Video directory: {VIDEO_DIR}")
    print(f"Custom folders: {custom_folders if custom_folders else 'not set'}")
    print(f"Save directory: {SAVE_DIR}")
    
    print("\nRegistered API routes:")
    for rule in app.url_map.iter_rules():
        if 'feynman' in rule.rule or 'llm' in rule.rule:
            print(f"  {rule.methods} {rule.rule}")
    
    try:
        from waitress import serve
        print("Starting server with waitress (production mode)...")
        print("Access at: http://0.0.0.0:5010")
        print("Access at: http://127.0.0.1:5010")
        serve(app, host='0.0.0.0', port=5010, threads=8)
    except ImportError:
        print("waitress not installed, using Flask dev server")
        print("Install with: pip install waitress")
        app.run(debug=True, port=5010, host='0.0.0.0', threaded=True)
