import { useState, useEffect, useRef, useCallback } from 'react'
import VideoPlayerEnhanced from '../components/VideoPlayerEnhanced'
import VideoListPanel from '../components/VideoListPanel'
import AnnotationReviewPanel from '../components/AnnotationReviewPanel'

export default function PlayerPage({ videoName, videoSource, filePath, pdfPage, onGoToSave, onSelectVideo, playbackTimeRef, initialTime, folderKey, playlistKey, activeAnnotationId, onClearActiveAnnotation }) {
  const [currentVideo, setCurrentVideo] = useState({ name: videoName, source: videoSource, filePath: filePath })
  const [videoStartTime, setVideoStartTime] = useState(initialTime || 0)
  const [currentPdfPage, setCurrentPdfPage] = useState(pdfPage || null)
  const [refreshKey, setRefreshKey] = useState(0)
  const playerRef = useRef(null)

  useEffect(() => {
    setCurrentVideo({ name: videoName, source: videoSource, filePath: filePath })
    setVideoStartTime(initialTime || 0)
    setCurrentPdfPage(pdfPage || null)
  }, [videoName, videoSource, filePath, initialTime, pdfPage])

  const handleSelectVideo = (name, source, startTime = 0, fp = null) => {
    setCurrentVideo({ name, source, filePath: fp })
    setVideoStartTime(startTime)
    if (onSelectVideo) onSelectVideo(name, source, fp)
  }

  const handleAnnotationSaved = () => {
    setRefreshKey(k => k + 1)
  }

  const handleJumpToTime = useCallback((value, isPdf = false) => {
    console.log('PlayerPage: handleJumpToTime called', { value, isPdf, hasRef: !!playerRef.current })
    const player = playerRef.current
    if (!player) {
      console.log('PlayerPage: playerRef.current is null')
      return
    }
    if (isPdf && typeof value === 'number') {
      console.log('PlayerPage: calling seekToPdfPage with', value)
      player.seekToPdfPage(value)
    } else {
      console.log('PlayerPage: calling seekTo with', value)
      player.seekTo(value)
    }
  }, [])

  const handleEnterAnnotation = (annotation) => {
    if (onGoToSave) {
      onGoToSave(annotation.video_name, annotation.id)
    }
  }

  const handleEnterLearning = () => {
    if (onGoToSave && activeAnnotationId) {
      onGoToSave(currentVideo.name, activeAnnotationId)
      if (onClearActiveAnnotation) onClearActiveAnnotation()
    }
  }

  return (
    <div className="player-page-left-right">
      <div className="left-panel">
        <VideoListPanel
          onSelectVideo={handleSelectVideo}
          selectedVideoName={currentVideo.name}
          playlistKey={playlistKey}
        />
      </div>
      <div className="right-panel">
        <div className="right-top">
          {currentVideo.name ? (
            <div className="player-wrapper">
              <VideoPlayerEnhanced
                ref={playerRef}
                key={`${currentVideo.name}|${currentVideo.source}|${currentVideo.filePath}|${currentPdfPage || 0}`}
                videoName={currentVideo.name}
                videoSource={currentVideo.source}
                filePath={currentVideo.filePath}
                initialPdfPage={currentPdfPage}
                onAnnotationSaved={handleAnnotationSaved}
                playbackTimeRef={playbackTimeRef}
                initialTime={videoStartTime}
                onEnterAnnotation={handleEnterAnnotation}
              />
            </div>
          ) : (
            <div className="player-placeholder">
              <div>🎬 暂无视频</div>
              <p>从左侧列表选择一个视频开始学习</p>
            </div>
          )}
        </div>
        <div className="right-bottom">
          <AnnotationReviewPanel
            videoName={currentVideo.name}
            refreshKey={refreshKey}
            onJumpToTime={handleJumpToTime}
            onEnterAnnotation={handleEnterAnnotation}
          />
        </div>
      </div>
    </div>
  )
}
