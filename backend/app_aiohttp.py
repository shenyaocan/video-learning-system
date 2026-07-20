import asyncio
import os
import json
import base64
import uuid
import subprocess
from datetime import datetime, timedelta
from aiohttp import web
import aiofiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(BASE_DIR, 'videos')
SAVE_DIR = os.path.join(BASE_DIR, 'save')
FRONTEND_DIR = os.path.join(BASE_DIR, '../frontend/dist')

os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(SAVE_DIR, exist_ok=True)

custom_folder = None

VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.ogv'}

MIME_MAP = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.flv': 'video/x-flv',
    '.ogv': 'video/ogg',
}


async def list_videos(request):
    videos = []
    if os.path.exists(VIDEO_DIR):
        for f in sorted(os.listdir(VIDEO_DIR)):
            ext = os.path.splitext(f)[1].lower()
            if f.startswith('.'):
                continue
            full = os.path.join(VIDEO_DIR, f)
            if os.path.isfile(full):
                videos.append({
                    'name': f,
                    'size': os.path.getsize(full),
                    'ext': ext
                })
    return web.json_response(videos)


async def set_folder(request):
    global custom_folder
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    path = data.get('path', '').strip()
    if not path:
        custom_folder = None
        return web.json_response({'ok': True, 'folder': None, 'message': '已清除自定义文件夹'})
    
    path = os.path.expanduser(path.strip('"\' '))
    path = os.path.abspath(path)
    
    if not os.path.isdir(path):
        return web.json_response({'error': f'路径不存在或不是有效目录: {path}'}, status=400)
    
    custom_folder = path
    count = sum(1 for f in os.listdir(path)
                if os.path.splitext(f)[1].lower() in VIDEO_EXTENSIONS
                and os.path.isfile(os.path.join(path, f)))
    
    return web.json_response({
        'ok': True,
        'folder': path,
        'count': count,
        'message': f'已设置文件夹，找到 {count} 个视频'
    })


async def list_folder_videos(request):
    if not custom_folder:
        return web.json_response([])
    
    videos = []
    for f in sorted(os.listdir(custom_folder)):
        ext = os.path.splitext(f)[1].lower()
        if ext not in VIDEO_EXTENSIONS:
            continue
        full = os.path.join(custom_folder, f)
        if os.path.isfile(full):
            videos.append({
                'name': f,
                'size': os.path.getsize(full),
                'ext': ext
            })
    return web.json_response(videos)


async def stream_video(request, filepath, mimetype):
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Video not found'}, status=404)
    
    file_size = os.path.getsize(filepath)
    range_header = request.headers.get('Range')
    
    if range_header:
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        if start >= file_size:
            return web.Response(status=416)
        
        end = min(end, file_size - 1)
        length = end - start + 1
        
        async def data_generator():
            async with aiofiles.open(filepath, 'rb') as f:
                await f.seek(start)
                remaining = length
                chunk_size = 2 * 1024 * 1024
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = await f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        
        response = web.StreamResponse(
            status=206,
            reason='Partial Content',
            headers={
                'Content-Type': mimetype,
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(length),
                'Cache-Control': 'public, max-age=86400',
            }
        )
        await response.prepare(request)
        async for chunk in data_generator():
            await response.write(chunk)
        return response
    else:
        async def data_generator():
            async with aiofiles.open(filepath, 'rb') as f:
                while True:
                    data = await f.read(2 * 1024 * 1024)
                    if not data:
                        break
                    yield data
        
        response = web.StreamResponse(
            status=200,
            headers={
                'Content-Type': mimetype,
                'Accept-Ranges': 'bytes',
                'Content-Length': str(file_size),
                'Cache-Control': 'public, max-age=86400',
            }
        )
        await response.prepare(request)
        async for chunk in data_generator():
            await response.write(chunk)
        return response


async def serve_folder_video(request):
    global custom_folder
    if not custom_folder:
        return web.json_response({'error': 'No custom folder configured'}, status=400)
    
    filename = request.match_info['filename']
    filepath = os.path.join(custom_folder, filename)
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Video not found'}, status=404)
    
    ext = os.path.splitext(filename)[1].lower()
    mimetype = MIME_MAP.get(ext, 'video/mp4')
    
    return await stream_video(request, filepath, mimetype)


async def serve_video(request):
    filename = request.match_info['filename']
    filepath = os.path.join(VIDEO_DIR, filename)
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Video not found'}, status=404)
    
    ext = os.path.splitext(filename)[1].lower()
    mimetype = MIME_MAP.get(ext, 'video/mp4')
    
    return await stream_video(request, filepath, mimetype)


async def get_video_info(request):
    name = request.query.get('name', '')
    source = request.query.get('source', 'local')
    
    if not name:
        return web.json_response({'error': 'name required'}, status=400)
    
    directory = custom_folder if source == 'folder' else VIDEO_DIR
    if not directory:
        return web.json_response({'error': 'No folder configured'}, status=400)
    
    filepath = os.path.join(directory, name)
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Video not found'}, status=404)
    
    try:
        cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            filepath
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=10)
        
        if result.returncode != 0:
            return web.json_response({'error': 'ffprobe failed'}, status=500)
        
        info = json.loads(result.stdout.decode('utf-8'))
        fmt = info.get('format', {})
        duration = float(fmt.get('duration', 0))
        size = int(fmt.get('size', 0))
        
        video_stream = next(
            (s for s in info.get('streams', []) if s.get('codec_type') == 'video'),
            None
        )
        width = video_stream.get('width', 0) if video_stream else 0
        height = video_stream.get('height', 0) if video_stream else 0
        codec = video_stream.get('codec_name', '') if video_stream else ''
        
        with open(filepath, 'rb') as f:
            header = f.read(100)
            is_faststart = b'moov' in header
        
        return web.json_response({
            'duration': duration,
            'size': size,
            'width': width,
            'height': height,
            'codec': codec,
            'faststart': is_faststart
        })
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


async def optimize_video(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    name = data.get('name', '')
    source = data.get('source', 'local')
    
    if not name:
        return web.json_response({'error': 'name required'}, status=400)
    
    directory = custom_folder if source == 'folder' else VIDEO_DIR
    filepath = os.path.join(directory, name)
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Video not found'}, status=404)
    
    ext = os.path.splitext(filepath)[1].lower()
    if ext != '.mp4':
        return web.json_response({'error': '只支持MP4格式视频优化'}, status=400)
    
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
            os.replace(temp_path, filepath)
            return web.json_response({'ok': True, 'message': '视频优化完成'})
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            stderr = result.stderr.decode('utf-8', errors='replace') if result.stderr else ''
            return web.json_response({'error': f'优化失败: {stderr[:200]}'}, status=500)
    except subprocess.TimeoutExpired:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return web.json_response({'error': '优化超时'}, status=500)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return web.json_response({'error': str(e)}, status=500)


async def optimize_all_videos(request):
    global custom_folder
    try:
        data = await request.json()
    except:
        data = {}
    
    source = data.get('source', 'folder')
    directory = custom_folder if source == 'folder' else VIDEO_DIR
    
    if not directory or not os.path.isdir(directory):
        return web.json_response({'error': '文件夹未设置'}, status=400)
    
    results = {'success': 0, 'failed': 0, 'skipped': 0, 'errors': []}
    
    for filename in os.listdir(directory):
        if not filename.lower().endswith('.mp4'):
            continue
        
        filepath = os.path.join(directory, filename)
        if not os.path.isfile(filepath):
            continue
        
        with open(filepath, 'rb') as f:
            header = f.read(100)
            if b'moov' in header:
                results['skipped'] += 1
                continue
        
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
                os.replace(temp_path, filepath)
                results['success'] += 1
            else:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                results['failed'] += 1
                results['errors'].append(f'{filename}: 优化失败')
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            results['failed'] += 1
            results['errors'].append(f'{filename}: {str(e)}')
    
    return web.json_response(results)


async def list_annotations(request):
    video_name = request.query.get('video_name')
    if not video_name:
        return web.json_response([])
    
    safe_name = "".join(c for c in video_name if c.isalnum() or c in '._-')
    filepath = os.path.join(SAVE_DIR, f'{safe_name}.json')
    
    if not os.path.isfile(filepath):
        return web.json_response([])
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return web.json_response(json.load(f))
    except:
        return web.json_response([])


async def save_annotation(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    video_name = data.get('video_name')
    if not video_name:
        return web.json_response({'error': 'video_name required'}, status=400)
    
    safe_name = "".join(c for c in video_name if c.isalnum() or c in '._-')
    filepath = os.path.join(SAVE_DIR, f'{safe_name}.json')
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            annotations = json.load(f)
    except:
        annotations = []
    
    annotation = {
        'id': data.get('id') or str(uuid.uuid4()),
        'time': data.get('time', 0),
        'text': data.get('text', ''),
        'image': data.get('image'),
        'created_at': datetime.now().isoformat()
    }
    annotations.append(annotation)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(annotations, f, ensure_ascii=False, indent=2)
    
    return web.json_response(annotation)


async def update_annotation(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    video_name = data.get('video_name')
    annotation_id = data.get('id')
    
    if not video_name or not annotation_id:
        return web.json_response({'error': 'video_name and id required'}, status=400)
    
    safe_name = "".join(c for c in video_name if c.isalnum() or c in '._-')
    filepath = os.path.join(SAVE_DIR, f'{safe_name}.json')
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Annotation not found'}, status=404)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        annotations = json.load(f)
    
    for i, ann in enumerate(annotations):
        if ann.get('id') == annotation_id:
            annotations[i] = {**ann, **data, 'updated_at': datetime.now().isoformat()}
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(annotations, f, ensure_ascii=False, indent=2)
            return web.json_response(annotations[i])
    
    return web.json_response({'error': 'Annotation not found'}, status=404)


async def delete_annotation(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    video_name = data.get('video_name')
    annotation_id = data.get('id')
    
    if not video_name or not annotation_id:
        return web.json_response({'error': 'video_name and id required'}, status=400)
    
    safe_name = "".join(c for c in video_name if c.isalnum() or c in '._-')
    filepath = os.path.join(SAVE_DIR, f'{safe_name}.json')
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Annotation not found'}, status=404)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        annotations = json.load(f)
    
    annotations = [ann for ann in annotations if ann.get('id') != annotation_id]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(annotations, f, ensure_ascii=False, indent=2)
    
    return web.json_response({'ok': True})


async def sm2_review(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    video_name = data.get('video_name')
    annotation_id = data.get('annotation_id')
    difficulty = data.get('difficulty')
    
    if not all([video_name, annotation_id, difficulty]):
        return web.json_response({'error': 'Missing required fields'}, status=400)
    
    safe_name = "".join(c for c in video_name if c.isalnum() or c in '._-')
    filepath = os.path.join(SAVE_DIR, f'{safe_name}.json')
    
    if not os.path.isfile(filepath):
        return web.json_response({'error': 'Annotation not found'}, status=404)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        annotations = json.load(f)
    
    for i, ann in enumerate(annotations):
        if ann.get('id') == annotation_id:
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
                quality = 5
                if interval == 0:
                    interval = 1
                else:
                    interval = round(interval * ease_factor * 1.3)
                ease_factor = max(1.3, ease_factor + 0.15)
            else:
                return web.json_response({'error': 'Invalid difficulty'}, status=400)
            
            review_count += 1
            next_review = datetime.now() + timedelta(days=interval)
            
            annotations[i] = {
                **ann,
                'ease_factor': round(ease_factor, 2),
                'interval': interval,
                'review_count': review_count,
                'next_review_date': next_review.isoformat(),
                'last_review_date': datetime.now().isoformat()
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(annotations, f, ensure_ascii=False, indent=2)
            
            return web.json_response({
                'id': annotation_id,
                'ease_factor': ease_factor,
                'interval': interval,
                'review_count': review_count,
                'next_review_date': next_review.isoformat()
            })
    
    return web.json_response({'error': 'Annotation not found'}, status=404)


async def serve_spa(request):
    path = request.match_info.get('path', '')
    if path.startswith('api/'):
        return web.json_response({'error': 'Not found'}, status=404)
    
    if path and os.path.isfile(os.path.join(FRONTEND_DIR, path)):
        return web.FileResponse(os.path.join(FRONTEND_DIR, path))
    
    return web.FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))


def create_app():
    app = web.Application()
    
    app.router.add_get('/api/videos', list_videos)
    app.router.add_post('/api/set-folder', set_folder)
    app.router.add_get('/api/folder-videos', list_folder_videos)
    app.router.add_get('/api/video-folder/{filename:.*}', serve_folder_video)
    app.router.add_get('/api/video/{filename:.*}', serve_video)
    app.router.add_get('/api/video-info', get_video_info)
    app.router.add_post('/api/optimize-video', optimize_video)
    app.router.add_post('/api/optimize-all-videos', optimize_all_videos)
    app.router.add_get('/api/annotations', list_annotations)
    app.router.add_post('/api/annotations', save_annotation)
    app.router.add_put('/api/annotations', update_annotation)
    app.router.add_delete('/api/annotations', delete_annotation)
    app.router.add_post('/api/sm2-review', sm2_review)
    
    app.router.add_get('/{path:.*}', serve_spa)
    
    return app


if __name__ == '__main__':
    print(f"Video directory: {VIDEO_DIR}")
    print(f"Custom folder: {custom_folder or 'not set'}")
    print(f"Save directory: {SAVE_DIR}")
    print("Starting aiohttp server...")
    print("Access at: http://0.0.0.0:5010")
    
    app = create_app()
    web.run_app(app, host='0.0.0.0', port=5010)
