import { useState, useRef, useEffect } from 'react'
import DrawingCanvas from './DrawingCanvas'
import ToolBar from './ToolBar'

const API = '/api'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function VideoPlayer({ videoName, videoSource, onSaveComplete }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoSize, setVideoSize] = useState({ w: 640, h: 360 })
  const [saving, setSaving] = useState(false)

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#ff4444')
  const [strokeWidth, setStrokeWidth] = useState(3)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      setDuration(video.duration)
      setVideoSize({ w: video.videoWidth, h: video.videoHeight })
    }
    const onTime = () => setCurrentTime(video.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [videoName])

  useEffect(() => {
    const resizeCanvas = () => {
      const video = videoRef.current
      const container = containerRef.current
      if (!video || !container) return
      const rect = container.getBoundingClientRect()
      const containerW = rect.width
      const containerH = rect.height
      const videoW = video.videoWidth || 640
      const videoH = video.videoHeight || 360
      const scale = Math.min(containerW / videoW, containerH / videoH)
      const w = Math.floor(videoW * scale)
      const h = Math.floor(videoH * scale)
      setVideoSize({ w, h })
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }

  const handleSeek = (e) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = parseFloat(e.target.value)
  }

  const handleSave = async () => {
    const video = videoRef.current
    if (!video) return
    setSaving(true)

    const offCanvas = document.createElement('canvas')
    offCanvas.width = video.videoWidth
    offCanvas.height = video.videoHeight
    const offCtx = offCanvas.getContext('2d')
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    const drawCanvas = canvasRef.current?.canvas
    if (drawCanvas) {
      offCtx.drawImage(drawCanvas, 0, 0, offCanvas.width, offCanvas.height)
    }

    const screenshot = offCanvas.toDataURL('image/png')

    try {
      const resp = await fetch(`${API}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_name: videoName,
          timestamp: video.currentTime,
          screenshot_data: screenshot
        })
      })
      if (resp.ok) {
        onSaveComplete && onSaveComplete()
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="video-container-wrapper" ref={containerRef}>
      <div
        className="video-container"
        style={{ width: videoSize.w, height: videoSize.h }}
      >
        <video
          ref={videoRef}
          src={videoSource === 'folder'
            ? `${API}/video-folder/${encodeURIComponent(videoName)}`
            : `${API}/video/${encodeURIComponent(videoName)}`}
          preload="metadata"
          style={{
            width: videoSize.w,
            height: videoSize.h
          }}
        />
        <DrawingCanvas
          ref={canvasRef}
          width={videoSize.w}
          height={videoSize.h}
          tool={playing ? null : tool}
          color={color}
          strokeWidth={strokeWidth}
          disabled={playing}
        />
        <div className="video-overlay-controls">
          <button className="btn" onClick={handlePlayPause}>
            {playing ? '⏸' : '▶'}
          </button>
          <input
            className="progress-slider"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
          />
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '💾 保存'}
          </button>
        </div>
        <div className="video-toolbar-right">
          <ToolBar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            strokeWidth={strokeWidth}
            onStrokeWidthChange={setStrokeWidth}
            canvasRef={canvasRef}
          />
        </div>
      </div>
    </div>
  )
}
