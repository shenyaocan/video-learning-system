import { useState, useRef, useEffect } from 'react'
import PlayerPage from './pages/PlayerPage'
import SavePage from './pages/SavePage'
import PlaylistModal from './components/PlaylistModal'

const API = '/api'

export default function App() {
  const [page, setPage] = useState('player')
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [selectedVideoSource, setSelectedVideoSource] = useState('local')
  const [selectedFilePath, setSelectedFilePath] = useState(null)
  const [selectedPdfPage, setSelectedPdfPage] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const playbackTimeRef = useRef(0)
  const [savedPlaybackTime, setSavedPlaybackTime] = useState(0)
  const [folderKey, setFolderKey] = useState(0)
  const [playlistKey, setPlaylistKey] = useState(0)
  const [openAnnotationId, setOpenAnnotationId] = useState(null)
  const [filterVideo, setFilterVideo] = useState(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState(null)

  useEffect(() => {
    setFolderKey(k => k + 1)
    loadLastWatched()
  }, [])

  const loadLastWatched = async () => {
    try {
      const resp = await fetch(`${API}/last-watched`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.video_name) {
          setSelectedVideo(data.video_name)
          setSelectedVideoSource('folder')
          setSavedPlaybackTime(data.current_time || 0)
        }
      }
    } catch (err) {
      console.error('Failed to load last watched video:', err)
    }
  }

  const goToSave = (videoName, annotationId = null) => {
    setSavedPlaybackTime(playbackTimeRef.current || 0)
    if (videoName) {
      setFilterVideo(videoName)
    } else {
      setFilterVideo(null)
    }
    setOpenAnnotationId(annotationId)
    setPage('save')
  }

  const goToPlayer = () => {
    setPage('player')
    setOpenAnnotationId(null)
    setFilterVideo(null)
  }

  const openModal = () => setIsModalOpen(true)
  const closeModal = () => setIsModalOpen(false)
  const handleFolderChanged = () => setFolderKey(k => k + 1)
  const handlePlaylistChanged = () => setPlaylistKey(k => k + 1)

  const handleReturnToVideo = (videoName, videoSource, timestamp, annotationId, pdfPage = null) => {
    setSavedPlaybackTime(timestamp || 0)
    setSelectedVideo(videoName)
    setSelectedVideoSource(videoSource || 'local')
    setActiveAnnotationId(annotationId || null)
    setSelectedPdfPage(pdfPage)
    setPage('player')
  }

  const handleSelectVideo = (name, source, filePath = null) => {
    setSavedPlaybackTime(0)
    setSelectedVideo(name)
    setSelectedVideoSource(source)
    setSelectedFilePath(filePath)
    setSelectedPdfPage(null)
    setPage('player')
    closeModal()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title" onClick={goToPlayer}>
            视频学习系统
          </h1>
        </div>
        <nav className="header-nav">
          <button
            className="btn-playlist"
            onClick={openModal}
          >
            📁 播放目录
          </button>
          <button
            className={`nav-btn ${page === 'player' ? 'active' : ''}`}
            onClick={goToPlayer}
          >
            播放器
          </button>
          <button
            className={`nav-btn ${page === 'save' ? 'active' : ''}`}
            onClick={() => goToSave()}
          >
            我的标注
          </button>
        </nav>
      </header>
      <main className="app-main">
        {page === 'player' ? (
          <PlayerPage
            videoName={selectedVideo}
            videoSource={selectedVideoSource}
            filePath={selectedFilePath}
            pdfPage={selectedPdfPage}
            onGoToSave={goToSave}
            onSelectVideo={handleSelectVideo}
            playbackTimeRef={playbackTimeRef}
            initialTime={savedPlaybackTime}
            folderKey={folderKey}
            playlistKey={playlistKey}
            activeAnnotationId={activeAnnotationId}
            onClearActiveAnnotation={() => setActiveAnnotationId(null)}
          />
        ) : (
          <SavePage 
            filterVideo={filterVideo} 
            onReturnToVideo={handleReturnToVideo} 
            openAnnotationId={openAnnotationId}
            onClearOpenAnnotation={() => setOpenAnnotationId(null)}
          />
        )}
      </main>
      <PlaylistModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSelectVideo={handleSelectVideo}
        onFolderChanged={handleFolderChanged}
        onPlaylistChanged={handlePlaylistChanged}
      />
    </div>
  )
}
