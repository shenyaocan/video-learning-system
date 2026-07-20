import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import DrawingCanvas from './DrawingCanvas'
import ToolBar from './ToolBar'
import PDFReader from './PDFReader'
import FeynmanChat from './FeynmanChat'

const API = '/api'

function lerp(start, end, t) {
  return start + (end - start) * t
}

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const VideoPlayerEnhanced = forwardRef(function VideoPlayerEnhanced({ videoName, videoSource, filePath, initialPdfPage, onAnnotationSaved, playbackTimeRef, initialTime, onEnterAnnotation }, ref) {
  console.log('VideoPlayerEnhanced props:', { videoName, initialPdfPage })
  const videoRef = useRef(null)
  const floatingVideoRef = useRef(null)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const pendingSeekRef = useRef(null)
  const lastSaveTimeRef = useRef(0)
  const lastActivityRef = useRef(Date.now())
  const cleanupTimeoutRef = useRef(null)
  const previewTimeoutRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 360 })
  const [saving, setSaving] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(2.3)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [buffering, setBuffering] = useState(false)
  const [bufferedRanges, setBufferedRanges] = useState([])
  const [annotations, setAnnotations] = useState([])
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null)

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#ff4444')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [isFloating, setIsFloating] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showPdfTools, setShowPdfTools] = useState(false)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(0)
  const [blurBlocks, setBlurBlocks] = useState([{ id: 1, x: 0, y: 0, width: 100, height: 100, visible: false }])
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [blurColor, setBlurColor] = useState('#000000')
  const [blurOpacity, setBlurOpacity] = useState(0.9)
  const isScrollingRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  


  const loadAnnotations = useCallback(async () => {
    if (!videoName) {
      setAnnotations([])
      return
    }
    try {
      const resp = await fetch(`${API}/annotations?video_name=${encodeURIComponent(videoName)}`)
      if (resp.ok) {
        const data = await resp.json()
        const sorted = [...data].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        setAnnotations(sorted)
      }
    } catch (err) {
      console.error('Failed to load annotations:', err)
    }
  }, [videoName])

  useEffect(() => {
    loadAnnotations()
  }, [loadAnnotations])

  const savePlaybackProgress = useCallback(async (time, dur) => {
    if (!videoName || !dur || dur <= 0) return
    try {
      await fetch(`${API}/video-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_name: videoName,
          current_time: time,
          duration: dur
        })
      })
    } catch (err) {
      console.error('Failed to save progress:', err)
    }
  }, [videoName])

  useImperativeHandle(ref, () => ({
    seekTo: (time) => {
      if (!time || time < 0) return
      const video = videoRef.current
      if (!video) return
      if (video.readyState >= 1) {
        video.currentTime = time
      } else {
        pendingSeekRef.current = time
      }
    },
    seekToPdfPage: (page) => {
      if (!page || page < 1) return
      console.log('VideoPlayerEnhanced: seekToPdfPage called with page:', page)
      setPdfPage(page)
      initialScrollDoneRef.current = false
    }
  }))

  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setCanvasSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) })
    
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 360
    const scale = Math.min(rect.width / vw, rect.height / vh)
    setCanvasSize({ w: Math.floor(vw * scale), h: Math.floor(vh * scale) })
  }, [])

  useEffect(() => {
    if (!videoName) return

    setLoading(true)
    setLoadError(null)
    setBuffering(false)

    let videoUrl
    
    if (filePath) {
      const encodedPath = filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
      videoUrl = `${API}/serve-file/${encodedPath}`
    } else {
      const source = videoSource || 'local'
      videoUrl = source === 'folder' 
        ? `${API}/video-folder/${encodeURIComponent(videoName)}`
        : `${API}/video/${encodeURIComponent(videoName)}`
    }
    
    const isPdfFile = videoName.toLowerCase().endsWith('.pdf')
    const isTsFile = videoName.toLowerCase().endsWith('.ts')
    
    console.log('File info:', { videoName, filePath, videoUrl, isPdfFile, isTsFile })
    
    if (isPdfFile) {
      const startPage = (initialPdfPage != null && initialPdfPage > 0) ? initialPdfPage : 1
      console.log('Loading PDF, startPage:', startPage, 'initialPdfPage:', initialPdfPage)
      setPdfPage(startPage)
      setShowPdfTools(false)
      setLoading(false)
      setLoadError(null)
      return
    }
    
    const video = videoRef.current
    if (!video) return
    
    console.log('Loading video:', videoUrl, isTsFile ? '(TS format)' : '')
    video.src = videoUrl
    video.playbackRate = playbackRate
    video.load()

    const onLoadedMetadata = () => {
      console.log('Video metadata loaded:', video.duration)
      setLoading(false)
      if (pendingSeekRef.current != null) {
        video.currentTime = pendingSeekRef.current
        pendingSeekRef.current = null
      }
    }

    const onCanPlay = () => {
      console.log('Video can play')
      setBuffering(false)
      video.volume = volume
    }

    const onWaiting = () => {
      setBuffering(true)
    }

    const onPlaying = () => {
      console.log('Video playing')
      setBuffering(false)
    }

    const onProgress = () => {
      if (video.buffered && video.buffered.length > 0) {
        const ranges = []
        for (let i = 0; i < video.buffered.length; i++) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i)
          })
        }
        setBufferedRanges(ranges)
      }
    }

    const onError = (e) => {
      console.error('Video error:', e, video.error)
      let errMsg = '视频加载失败'
      if (video.error) {
        if (video.error.code === 4) {
          errMsg = '视频格式不支持或文件损坏'
        } else if (video.error.code === 3) {
          errMsg = '视频解码失败'
        } else if (video.error.code === 2) {
          errMsg = '网络错误'
        }
      }
      setLoadError(errMsg)
      setLoading(false)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('progress', onProgress)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('error', onError)
    }
  }, [videoName, videoSource])

  useEffect(() => {
    if (playbackTimeRef) {
      playbackTimeRef.current = currentTime
    }
    const now = Date.now()
    if (now - lastSaveTimeRef.current > 5000) {
      lastSaveTimeRef.current = now
      savePlaybackProgress(currentTime, duration)
    }
  }, [currentTime, duration, playbackTimeRef, savePlaybackProgress])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate
    if (floatingVideoRef.current) floatingVideoRef.current.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration)
      }
      updateCanvasSize()
    }

    const onTime = () => {
      setCurrentTime(video.currentTime)
      if (playbackTimeRef) {
        playbackTimeRef.current = video.currentTime
      }
      const now = Date.now()
      if (now - lastSaveTimeRef.current > 5000) {
        lastSaveTimeRef.current = now
        savePlaybackProgress(video.currentTime, video.duration)
      }
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      savePlaybackProgress(video.currentTime, video.duration)
    }
    const onEnded = () => {
      savePlaybackProgress(video.currentTime, video.duration)
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      savePlaybackProgress(video.currentTime, video.duration)
    }
  }, [updateCanvasSize, playbackTimeRef, savePlaybackProgress])

  useEffect(() => {
    if (initialPdfPage != null && initialPdfPage > 0) {
      setPdfPage(initialPdfPage)
    }
  }, [initialPdfPage])

  useEffect(() => {
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [updateCanvasSize])

  useEffect(() => {
    if (initialTime > 0) {
      const video = videoRef.current
      if (!video) return
      if (video.readyState >= 1) {
        video.currentTime = initialTime
      } else {
        pendingSeekRef.current = initialTime
      }
    }
  }, [initialTime])

  useEffect(() => {
    setCurrentTime(0)
    setDuration(0)
    if (initialTime > 0) {
      pendingSeekRef.current = initialTime
    } else {
      pendingSeekRef.current = null
    }
  }, [videoName, initialTime])

  const cleanupVideoResources = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.src = ''
      video.load()
    }
    
    const floatVideo = floatingVideoRef.current
    if (floatVideo) {
      floatVideo.pause()
      floatVideo.src = ''
      floatVideo.load()
    }
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }
    
    setDuration(0)
    setCurrentTime(0)
    setBufferedRanges([])
    
    console.log('Video resources cleaned up')
  }, [])

  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
      
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current)
      }
      
      cleanupTimeoutRef.current = setTimeout(() => {
        const idleTime = Date.now() - lastActivityRef.current
        if (idleTime >= 5 * 60 * 1000) {
          const video = videoRef.current
          if (video && video.paused) {
            cleanupVideoResources()
          }
        }
      }, 5 * 60 * 1000)
    }

    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('touchstart', updateActivity)
    
    updateActivity()

    return () => {
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('touchstart', updateActivity)
      
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current)
      }
    }
  }, [cleanupVideoResources])

  useEffect(() => {
    return () => {
      cleanupVideoResources()
      
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current)
      }
      
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [cleanupVideoResources])

  const toggleBlurBlock = useCallback(() => {
    setBlurBlocks(prev => prev.map(block => ({
      ...block,
      visible: !block.visible
    })))
  }, [])

  const handleReview = useCallback(async (id, difficulty) => {
    try {
      const resp = await fetch(`${API}/annotations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      })
      if (resp.ok) {
        await loadAnnotations()
      }
    } catch (err) {
      console.error('Review failed:', err)
    }
  }, [loadAnnotations])

  const updateBlurBlockPosition = useCallback((id, x, y) => {
    setBlurBlocks(prev => prev.map(block => 
      block.id === id ? { ...block, x, y } : block
    ))
  }, [])

  const updateBlurBlockSize = useCallback((id, width, height) => {
    setBlurBlocks(prev => prev.map(block => 
      block.id === id ? { ...block, width: Math.max(20, width), height: Math.max(20, height) } : block
    ))
  }, [])

  const handlePlayPause = useCallback(() => {
    const targetVideo = isFloating && floatingVideoRef.current ? floatingVideoRef.current : videoRef.current
    if (!targetVideo) return
    
    if (!targetVideo.src) {
      let videoUrl
      if (filePath) {
        const encodedPath = filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
        videoUrl = `${API}/serve-file/${encodedPath}`
      } else {
        const source = videoSource || 'local'
        videoUrl = source === 'folder' 
          ? `${API}/video-folder/${encodeURIComponent(videoName)}`
          : `${API}/video/${encodeURIComponent(videoName)}`
      }
      targetVideo.src = videoUrl
      targetVideo.playbackRate = playbackRate
      targetVideo.load()
      targetVideo.play()
    } else {
      if (targetVideo.paused) targetVideo.play()
      else targetVideo.pause()
    }
  }, [videoName, videoSource, filePath, playbackRate, isFloating])

  const handleSeek = useCallback((delta) => {
    const targetVideo = isFloating && floatingVideoRef.current ? floatingVideoRef.current : videoRef.current
    if (!targetVideo || !duration) return
    const newTime = Math.max(0, Math.min(duration, targetVideo.currentTime + delta))
    targetVideo.currentTime = newTime
  }, [duration, isFloating])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          return
        }
        e.preventDefault()
        handlePlayPause()
      } else if (e.code === 'ArrowLeft') {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        e.preventDefault()
        handleSeek(-5)
      } else if (e.code === 'ArrowRight') {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        e.preventDefault()
        handleSeek(5)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePlayPause, handleSeek])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && selectedBlockId) {
        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y
        updateBlurBlockPosition(selectedBlockId, Math.max(0, newX), Math.max(0, newY))
      } else if (isResizing && selectedBlockId) {
        const newWidth = e.clientX - dragStart.x
        const newHeight = e.clientY - dragStart.y
        updateBlurBlockSize(selectedBlockId, newWidth, newHeight)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isResizing, selectedBlockId, dragStart, updateBlurBlockPosition, updateBlurBlockSize])

  const handleSliderChange = (e) => {
    const targetTime = parseFloat(e.target.value)
    if (isFloating && floatingVideoRef.current) {
      floatingVideoRef.current.currentTime = targetTime
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetTime
    }
  }

  const handleVolumeChange = useCallback((newVolume) => {
    const vol = Math.max(0, Math.min(1, newVolume))
    setVolume(vol)
    if (videoRef.current) {
      videoRef.current.volume = vol
    }
    if (floatingVideoRef.current) {
      floatingVideoRef.current.volume = vol
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      handleVolumeChange(0)
    } else {
      handleVolumeChange(1)
    }
  }, [volume, handleVolumeChange])

  useEffect(() => {
    if (isFloating && floatingVideoRef.current && videoRef.current) {
      const mainVideo = videoRef.current
      const floatVideo = floatingVideoRef.current
      
      mainVideo.pause()
      
      const isTsFile = videoName.toLowerCase().endsWith('.ts')
      const source = videoSource || 'local'
      const videoUrl = source === 'folder' 
        ? `${API}/video-folder/${encodeURIComponent(videoName)}`
        : `${API}/video/${encodeURIComponent(videoName)}`
      
      floatVideo.src = videoUrl
      floatVideo.volume = volume
      floatVideo.currentTime = mainVideo.currentTime
      floatVideo.playbackRate = mainVideo.playbackRate
      
      const wasPlaying = !mainVideo.paused
      
      const onLoadedMetadata = () => {
        if (wasPlaying) {
          floatVideo.play().catch(err => console.error('Float play error:', err))
        }
      }
      
      const onTimeUpdate = () => {
        setCurrentTime(floatVideo.currentTime)
        setDuration(floatVideo.duration || duration)
        if (playbackTimeRef) {
          playbackTimeRef.current = floatVideo.currentTime
        }
      }
      
      const onPlay = () => setPlaying(true)
      const onPause = () => {
        setPlaying(false)
        savePlaybackProgress(floatVideo.currentTime, floatVideo.duration)
      }
      
      floatVideo.addEventListener('loadedmetadata', onLoadedMetadata)
      floatVideo.addEventListener('timeupdate', onTimeUpdate)
      floatVideo.addEventListener('play', onPlay)
      floatVideo.addEventListener('pause', onPause)
      
      floatVideo.load()
      
      return () => {
        floatVideo.removeEventListener('loadedmetadata', onLoadedMetadata)
        floatVideo.removeEventListener('timeupdate', onTimeUpdate)
        floatVideo.removeEventListener('play', onPlay)
        floatVideo.removeEventListener('pause', onPause)
        
        if (!isFloating && mainVideo && floatVideo) {
          mainVideo.currentTime = floatVideo.currentTime
          setPlaying(!floatVideo.paused)
          setCurrentTime(floatVideo.currentTime)
          
          if (!floatVideo.paused) {
            mainVideo.play().catch(err => console.error('Main resume error:', err))
          }
        }
      }
    }
    
    if (!isFloating && floatingVideoRef.current && videoRef.current) {
      const mainVideo = videoRef.current
      const floatVideo = floatingVideoRef.current
      
      if (floatVideo.src) {
        mainVideo.currentTime = floatVideo.currentTime
        setCurrentTime(floatVideo.currentTime)
        
        if (!floatVideo.paused) {
          mainVideo.play().catch(err => console.error('Main resume error:', err))
        } else {
          setPlaying(false)
        }
      }
    }
  }, [isFloating])

  const handleSave = async () => {
    const isPdf = videoName && videoName.toLowerCase().endsWith('.pdf')
    
    if (isPdf) {
      setSaving(true)
      
      try {
        const encodedPath = filePath ? filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/') 
                                     : videoName.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
        const resp = await fetch(`${API}/pdf-page-image?path=${encodedPath}&page=${pdfPage}`)
        const result = await resp.json()
        
        if (!resp.ok || !result.ok) {
          console.error('PDF page render failed:', result.error)
          setSaving(false)
          return
        }
        
        const pageImageData = result.image
        const pageImage = new Image()
        pageImage.src = pageImageData
        
        await new Promise((resolve, reject) => {
          pageImage.onload = resolve
          pageImage.onerror = reject
        })
        
        const offCanvas = document.createElement('canvas')
        offCanvas.width = pageImage.width
        offCanvas.height = pageImage.height
        const offCtx = offCanvas.getContext('2d')
        
        offCtx.drawImage(pageImage, 0, 0)
        
        const drawCanvas = canvasRef.current?.canvas
        if (drawCanvas && drawCanvas.width > 0 && drawCanvas.height > 0) {
          offCtx.drawImage(drawCanvas, 0, 0, offCanvas.width, offCanvas.height)
        }
        
        const screenshot = offCanvas.toDataURL('image/png')
        
        const saveResp = await fetch(`${API}/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_name: videoName,
            video_source: videoSource || 'file_path',
            timestamp: pdfPage,
            screenshot_data: screenshot,
            pdf_page: pdfPage
          })
        })
        console.log('PDF annotation saved:', { pdfPage, saveRespOk: saveResp.ok })
        if (saveResp.ok) {
          onAnnotationSaved && onAnnotationSaved()
          loadAnnotations()
        }
      } catch (err) {
        console.error('PDF save failed:', err)
      } finally {
        setSaving(false)
      }
      return
    }
    
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
          video_source: videoSource,
          timestamp: video.currentTime,
          screenshot_data: screenshot
        })
      })
      if (resp.ok) {
        onAnnotationSaved && onAnnotationSaved()
        loadAnnotations()
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleFloatingSave = async () => {
    const video = floatingVideoRef.current
    if (!video) return
    setSaving(true)

    const offCanvas = document.createElement('canvas')
    offCanvas.width = video.videoWidth
    offCanvas.height = video.videoHeight
    const offCtx = offCanvas.getContext('2d')
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    const screenshot = offCanvas.toDataURL('image/png')

    try {
      const resp = await fetch(`${API}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_name: videoName,
          video_source: videoSource,
          timestamp: video.currentTime,
          screenshot_data: screenshot
        })
      })
      if (resp.ok) {
        onAnnotationSaved && onAnnotationSaved()
        loadAnnotations()
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const speedOptions = [1.0, 1.5, 1.7, 2.3]

  const handleAnnotationMarkerClick = (e, ann) => {
    e.stopPropagation()
    const targetVideo = isFloating && floatingVideoRef.current ? floatingVideoRef.current : videoRef.current
    if (targetVideo && ann.timestamp != null) {
      targetVideo.currentTime = ann.timestamp
    }
  }

  const handleAnnotationPreviewClick = (e, ann) => {
    e.stopPropagation()
    if (onEnterAnnotation) {
      onEnterAnnotation(ann)
    }
  }

  const isPdfFile = videoName && videoName.toLowerCase().endsWith('.pdf')
  
  return (
    <div className="player-enhanced">
      <div className="player-main-area">
        {isPdfFile ? (
          <PDFReader 
            filePath={filePath || videoName} 
            initialPage={pdfPage}
            currentPage={pdfPage}
            onPageChange={setPdfPage}
          />
        ) : (
          <div className="video-area" ref={containerRef} onClick={handlePlayPause}>
            <div className="video-wrapper">
              <video
                ref={videoRef}
                preload="auto"
                playsInline
                disablePictureInPicture
                x5-video-player-type="h5"
                x5-video-player-fullscreen="true"
                webkit-playsinline="true"
                x-webkit-airplay="allow"
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain'
                }}
              />
            {loading && (
              <div className="video-loading-overlay">
                <div className="loading-spinner"></div>
                <div>正在加载视频...</div>
              </div>
            )}
            {buffering && !loading && (
              <div className="video-loading-overlay">
                <div className="loading-spinner"></div>
                <div>缓冲中...</div>
              </div>
            )}
            {loadError && (
              <div className="video-loading-overlay">
                <div>❌ {loadError}</div>
              </div>
            )}
            {!loading && !loadError && !buffering && (
              <DrawingCanvas
                ref={canvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                tool={playing ? null : tool}
                color={color}
                strokeWidth={strokeWidth}
                disabled={playing}
              />
            )}
            {blurBlocks.filter(b => b.visible).map(block => (
              <div
                key={block.id}
                className={`blur-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                style={{
                  left: `${block.x}px`,
                  top: `${block.y}px`,
                  width: `${block.width}px`,
                  height: `${block.height}px`,
                  backgroundColor: blurColor,
                  opacity: blurOpacity
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setSelectedBlockId(block.id)
                  setIsDragging(true)
                  setDragStart({ x: e.clientX - block.x, y: e.clientY - block.y })
                }}
              >
                <div 
                  className="blur-block-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setIsResizing(true)
                    setDragStart({ x: e.clientX - block.x - block.width, y: e.clientY - block.y - block.height })
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        )}
        {!isPdfFile && (
        <div className="control-bar">
          <button className="btn" onClick={handlePlayPause} disabled={loading}>
            {playing ? '⏸' : '▶'}
          </button>
          <div className="progress-container">
            <div className="progress-buffered">
              {bufferedRanges.map((range, idx) => (
                <div
                  key={idx}
                  className="progress-buffered-segment"
                  style={{
                    left: `${(range.start / (duration || 1)) * 100}%`,
                    width: `${((range.end - range.start) / (duration || 1)) * 100}%`
                  }}
                />
              ))}
            </div>
            {!isPdfFile && annotations.map(ann => {
              if (!duration || ann.timestamp == null) return null
              const percent = (ann.timestamp / duration) * 100
              if (percent < 0 || percent > 100) return null
              return (
                <div
                  key={ann.id}
                  className="progress-annotation-marker"
                  style={{ left: `${percent}%` }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hoveredAnnotation === ann.id) {
                      setHoveredAnnotation(null)
                    } else {
                      setHoveredAnnotation(ann.id)
                    }
                  }}
                  title={`标注 ${formatTime(ann.timestamp)}`}
                >
                  <img src={`${API}/annotations/${ann.id}/image`} alt="" draggable="false" />
                </div>
              )
            })}
            <input
              className="progress-slider"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={currentTime}
              onChange={handleSliderChange}
            />
          </div>
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="speed-selector">
            {speedOptions.map(rate => (
              <button
                key={rate}
                className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
          <div 
            className="volume-control"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button 
              className="btn" 
              onClick={toggleMute}
              title={volume === 0 ? "取消静音" : "静音"}
            >
              {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            {showVolumeSlider && (
              <div className="volume-slider-container">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="volume-slider"
                />
              </div>
            )}
          </div>
          <button 
            className="btn" 
            onClick={() => setIsFloating(true)} 
            title="全屏播放"
          >
            ⛶
          </button>
          <button 
            className={`btn ${blurBlocks[0]?.visible ? 'active' : ''}`} 
            onClick={toggleBlurBlock} 
            title="遮盖头像"
          >
            🔲
          </button>
          {blurBlocks[0]?.visible && (
            <div className="blur-controls">
              <input
                type="color"
                value={blurColor}
                onChange={(e) => setBlurColor(e.target.value)}
                className="blur-color-picker"
                title="选择遮盖颜色"
              />
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={blurOpacity}
                onChange={(e) => setBlurOpacity(parseFloat(e.target.value))}
                className="blur-opacity-slider"
                title="透明度"
              />
            </div>
          )}
          <button className="btn btn-accent" onClick={handleSave} disabled={saving || loading}>
            {saving ? '保存中...' : '📷 标注截图'}
          </button>
        </div>
        )}
      </div>
      {!isPdfFile && (
      <div className="toolbar-side">
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
      )}

      {!isPdfFile && isFloating && (
        <div className="floating-overlay" onClick={() => {
          if (!hoveredAnnotation) {
            setIsFloating(false)
          }
        }}>
          <div className="floating-window" onClick={(e) => e.stopPropagation()}>
            <div className="floating-header">
              <span className="floating-title">{videoName}</span>
              <button className="floating-close-btn" onClick={() => setIsFloating(false)}>✕</button>
            </div>
            <div className="floating-video-area">
              <video
                ref={floatingVideoRef}
                preload="auto"
                playsInline
                disablePictureInPicture
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain'
                }}
              />
            </div>
            <div className="floating-control-bar">
              <button className="btn" onClick={handlePlayPause}>
                {playing ? '⏸' : '▶'}
              </button>
              <div className="progress-container">
                {annotations.map(ann => {
                  if (!duration || ann.timestamp == null) return null
                  const percent = (ann.timestamp / duration) * 100
                  if (percent < 0 || percent > 100) return null
                  return (
                    <div
                      key={ann.id}
                      className="progress-annotation-marker"
                      style={{ left: `${percent}%` }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (hoveredAnnotation === ann.id) {
                          setHoveredAnnotation(null)
                        } else {
                          setHoveredAnnotation(ann.id)
                        }
                      }}
                      title={`标注 ${formatTime(ann.timestamp)}`}
                    >
                      <img src={`${API}/annotations/${ann.id}/image`} alt="" draggable="false" />
                    </div>
                  )
                })}
                <input
                  className="progress-slider"
                  type="range"
                  min="0"
                  max={duration || 1}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSliderChange}
                />
              </div>
              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <div className="speed-selector">
                {speedOptions.map(rate => (
                  <button
                    key={rate}
                    className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
              <div 
                className="volume-control"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button 
                  className="btn" 
                  onClick={toggleMute}
                  title={volume === 0 ? "取消静音" : "静音"}
                >
                  {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                {showVolumeSlider && (
                  <div className="volume-slider-container">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="volume-slider"
                    />
                  </div>
                )}
              </div>
              <button 
                className="btn btn-accent" 
                onClick={handleFloatingSave} 
                disabled={saving || loading}
                title="标注截图"
              >
                {saving ? '...' : '📷 标注截图'}
              </button>
              <button 
                className="btn" 
                onClick={() => setIsFloating(false)} 
                title="退出全屏"
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
      )}
      {hoveredAnnotation && (() => {
        const ann = annotations.find(a => a.id === hoveredAnnotation)
        if (!ann || !duration) return null
        return (
          <>
            <div className="progress-annotation-overlay" onClick={() => {
              setHoveredAnnotation(null)
            }} />
            <div 
              className="progress-annotation-preview"
            >
            <div className="progress-annotation-preview-left">
              <img 
                src={`${API}/annotations/${ann.id}/image`} 
                alt="" 
                draggable="false"
                className="progress-annotation-preview-img"
              />
              <div className="progress-annotation-preview-body">
                <div className="progress-annotation-preview-info">
                  <p className="progress-annotation-preview-video-name">{ann.video_name}</p>
                  <p className="progress-annotation-preview-timestamp">
                    📍 {ann.pdf_page != null ? `第${ann.pdf_page}页` : formatTime(ann.timestamp)}
                  </p>
                  {ann.next_review_date && (
                    <p className="progress-annotation-preview-review-info">
                      🔄 下次复习: {new Date(ann.next_review_date).toLocaleDateString('zh-CN')}
                      {' · '}复习{ann.review_count || 0}次
                    </p>
                  )}
                </div>
                <div className="progress-annotation-preview-sm2">
                  <span className="progress-annotation-preview-sm2-label">记忆评分:</span>
                  <button className="save-sm2-btn again" onClick={() => handleReview(ann.id, 'again')}>🔁 重来</button>
                  <button className="save-sm2-btn hard" onClick={() => handleReview(ann.id, 'hard')}>😓 困难</button>
                  <button className="save-sm2-btn good" onClick={() => handleReview(ann.id, 'good')}>🙂 一般</button>
                  <button className="save-sm2-btn easy" onClick={() => handleReview(ann.id, 'easy')}>😊 容易</button>
                </div>
                <div className="progress-annotation-preview-actions">
                  <button
                    className="btn"
                    onClick={() => { 
                      const idx = annotations.findIndex(a => a.id === ann.id)
                      if (idx > 0) {
                        setHoveredAnnotation(annotations[idx - 1].id)
                      }
                    }}
                    disabled={annotations.findIndex(a => a.id === ann.id) <= 0}
                  >
                    上一题
                  </button>
                  <button
                    className="btn btn-accent"
                    onClick={() => {
                      const isPdf = ann.video_name && ann.video_name.toLowerCase().endsWith('.pdf')
                      if (isPdf) {
                        setPdfPage(ann.pdf_page)
                      } else if (isFloating && floatingVideoRef.current) {
                        floatingVideoRef.current.currentTime = ann.timestamp
                      } else if (videoRef.current) {
                        videoRef.current.currentTime = ann.timestamp
                      }
                      setHoveredAnnotation(null)
                    }}
                  >
                    {ann.pdf_page ? '📄 返回PDF' : '返回视频'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => { 
                      const idx = annotations.findIndex(a => a.id === ann.id)
                      if (idx < annotations.length - 1) {
                        setHoveredAnnotation(annotations[idx + 1].id)
                      }
                    }}
                    disabled={annotations.findIndex(a => a.id === ann.id) >= annotations.length - 1}
                  >
                    下一题
                  </button>
                </div>
              </div>
            </div>
            <div className="progress-annotation-preview-right">
              <FeynmanChat annotationId={ann.id} />
            </div>
          </div>
          </>
        )
      })()}
    </div>
  )
})

export default VideoPlayerEnhanced
