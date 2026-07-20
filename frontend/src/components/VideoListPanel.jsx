import { useState, useEffect, useRef } from 'react'

const API = '/api'
const PAGE_SIZE = 11
const LIST_PAGE_KEY = 'videoListPage'

export default function VideoListPanel({ onSelectVideo, selectedVideoName, playlistKey }) {
  const [playlist, setPlaylist] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [videoProgress, setVideoProgress] = useState({})
  const [annotationStats, setAnnotationStats] = useState({})
  const [selectedVideos, setSelectedVideos] = useState({})
  const [deleting, setDeleting] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  const totalPages = Math.ceil(playlist.length / PAGE_SIZE)
  const startIdx = (currentPage - 1) * PAGE_SIZE
  const paginatedVideos = playlist.slice(startIdx, startIdx + PAGE_SIZE)

  useEffect(() => {
    loadVideos()
  }, [playlistKey])

  useEffect(() => {
    localStorage.setItem(LIST_PAGE_KEY, currentPage.toString())
  }, [currentPage])

  useEffect(() => {
    if (selectedVideoName && playlist.length > 0 && !loading) {
      const videoIndex = playlist.findIndex(v => v.name === selectedVideoName)
      if (videoIndex !== -1) {
        const targetPage = Math.floor(videoIndex / PAGE_SIZE) + 1
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage)
        }
      }
    }
  }, [selectedVideoName, playlist, loading])

  useEffect(() => {
    if (selectedVideoName) {
      loadProgress()
    }
  }, [selectedVideoName])

  const loadProgress = async () => {
    try {
      const resp = await fetch(`${API}/video-progress`)
      if (resp.ok) {
        const data = await resp.json()
        setVideoProgress(data)
      }
    } catch (err) {
      console.error('Failed to load progress:', err)
    }
  }

  const loadVideos = async () => {
    setLoading(true)
    try {
      const [playlistResp, progressResp, statsResp] = await Promise.all([
        fetch(`${API}/playlist`),
        fetch(`${API}/video-progress`),
        fetch(`${API}/annotations/stats`)
      ])
      const playlistData = playlistResp.ok ? await playlistResp.json() : []
      const progressData = progressResp.ok ? await progressResp.json() : {}
      const statsData = statsResp.ok ? await statsResp.json() : {}
      setPlaylist(playlistData)
      setVideoProgress(progressData)
      setAnnotationStats(statsData)
      
      const newTotalPages = Math.ceil(playlistData.length / PAGE_SIZE)
      const savedPage = parseInt(localStorage.getItem(LIST_PAGE_KEY) || '1')
      if (savedPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages)
      } else if (savedPage < 1) {
        setCurrentPage(1)
      } else {
        setCurrentPage(savedPage)
      }
    } catch (err) {
      console.error('Failed to load videos:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleVideoSelection = (videoName, source) => {
    setSelectedVideos(prev => {
      const key = `${source}|${videoName}`
      const newSelected = { ...prev }
      if (newSelected[key]) {
        delete newSelected[key]
      } else {
        newSelected[key] = { name: videoName, source }
      }
      return newSelected
    })
  }

  const toggleSelectAll = () => {
    const allKeys = paginatedVideos.map(v => `${v.source}|${v.name}`)
    const allSelected = allKeys.every(key => selectedVideos[key])
    if (allSelected) {
      setSelectedVideos({})
    } else {
      setSelectedVideos(prev => {
        const newSelected = { ...prev }
        paginatedVideos.forEach(v => {
          newSelected[`${v.source}|${v.name}`] = { name: v.name, source: v.source }
        })
        return newSelected
      })
    }
  }

  const handleRemoveSelected = async () => {
    const selectedList = Object.values(selectedVideos)
    if (selectedList.length === 0) return
    if (!confirm(`确定要从视频列表中移除选中的 ${selectedList.length} 个视频吗？`)) return
    setDeleting(true)
    try {
      const resp = await fetch(`${API}/playlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: selectedList })
      })
      const result = await resp.json()
      if (resp.ok) {
        setSelectedVideos({})
        loadVideos()
      } else {
        alert(result.error || '移除失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setDeleting(false)
    }
  }

  const handleClearAll = async () => {
    if (playlist.length === 0) return
    if (!confirm(`确定要清空视频列表中的所有 ${playlist.length} 个视频吗？`)) return
    setDeleting(true)
    try {
      const resp = await fetch(`${API}/playlist/clear`, {
        method: 'POST'
      })
      const result = await resp.json()
      if (resp.ok) {
        setPlaylist([])
        setSelectedVideos({})
      } else {
        alert(result.error || '清空失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setDeleting(false)
    }
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const selectedCount = Object.keys(selectedVideos).length

  if (loading) {
    return (
      <div className="video-list-panel">
        <div className="video-list-header">
          <span>视频列表</span>
        </div>
        <div className="video-list-loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="video-list-panel">
      <div className="video-list-header">
        <span>视频列表</span>
        <span className="video-count">({playlist.length})</span>
        {playlist.length > 0 && (
          <>
            {!multiSelectMode ? (
              <button 
                className="btn btn-sm" 
                style={{ marginLeft: 'auto', marginRight: '8px' }}
                onClick={() => setMultiSelectMode(true)}
              >
                多选
              </button>
            ) : (
              <>
                <label className="select-all-label" style={{ marginLeft: 'auto', marginRight: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCount === paginatedVideos.length && paginatedVideos.length > 0}
                    onChange={toggleSelectAll}
                  />
                  全选
                </label>
                {selectedCount > 0 && (
                  <button 
                    className="btn btn-sm btn-danger" 
                    onClick={handleRemoveSelected}
                    disabled={deleting}
                    style={{ marginRight: '4px' }}
                  >
                    移除 ({selectedCount})
                  </button>
                )}
                <button 
                  className="btn btn-sm" 
                  onClick={() => {
                    setMultiSelectMode(false)
                    setSelectedVideos({})
                  }}
                >
                  取消
                </button>
              </>
            )}
            {!multiSelectMode && (
              <button 
                className="btn btn-sm btn-danger" 
                onClick={handleClearAll}
                disabled={deleting}
              >
                清空
              </button>
            )}
          </>
        )}
      </div>
      
      <div className="video-list-items">
        {paginatedVideos.length === 0 ? (
          <div className="no-videos-hint">
            暂无视频，请从播放目录添加
          </div>
        ) : (
          paginatedVideos.map(video => {
            const progress = videoProgress[video.name]
            const current_time = progress ? progress.current_time : 0
            const duration = progress ? progress.duration : 0
            const pct = duration > 0 ? Math.round((current_time / duration) * 100) : 0
            let circleColor = 'var(--text-dim)'
            if (duration > 0 && current_time > 0) {
              if (pct >= 90) circleColor = 'var(--success)'
              else if (pct >= 50) circleColor = 'var(--accent)'
              else circleColor = 'var(--warning)'
            }
            const formatTime = (s) => {
              if (!s || s <= 0) return '00:00'
              const m = Math.floor(s / 60)
              const sec = Math.floor(s % 60)
              return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
            }
            const astat = annotationStats[video.name]
            const totalAnnotations = astat ? astat.total : 0
            const reviewedAnnotations = astat ? astat.reviewed : 0
            const reviewPct = totalAnnotations > 0 ? Math.round((reviewedAnnotations / totalAnnotations) * 100) : 0
            const tooltipParts = []
            if (duration > 0) {
              tooltipParts.push(`播放: ${formatTime(current_time)} / ${formatTime(duration)} (${pct}%)`)
            } else {
              tooltipParts.push('播放: 暂无记录')
            }
            if (totalAnnotations > 0) {
              tooltipParts.push(`标注: ${totalAnnotations} 条`)
              tooltipParts.push(`已复习: ${reviewedAnnotations} 条 (${reviewPct}%)`)
            } else {
              tooltipParts.push('标注: 暂无')
            }
            const isSelected = selectedVideos[`${video.source}|${video.name}`]
            return (
              <div
                key={`${video.source}|${video.name}`}
                className={`video-list-item ${selectedVideoName === video.name ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
              >
                {multiSelectMode && (
                  <input
                    type="checkbox"
                    className="video-checkbox"
                    checked={isSelected}
                    onChange={() => toggleVideoSelection(video.name, video.source)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div 
                  className="video-item-content"
                  onClick={() => {
                    if (multiSelectMode) return
                    const progress = videoProgress[video.name]
                    const ct = progress ? progress.current_time : 0
                    const dur = progress ? progress.duration : 0
                    const progressPct = dur > 0 ? Math.round((ct / dur) * 100) : 0
                    const startTime = (progressPct >= 100 || progressPct === 0) ? 0 : ct
                    onSelectVideo(video.name, video.source, startTime, video.file_path)
                  }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div className="video-item-name" title={video.name}>
                    {video.name.length > 18 ? video.name.slice(0, 18) + '...' : video.name}
                  </div>
                  <div className="video-progress-ring" title={tooltipParts.join('\n')}>
                    <svg width="28" height="28" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" style={{ stroke: 'var(--border)' }} />
                      {duration > 0 && (
                        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
                          strokeDasharray={`${pct} 100`} pathLength="100"
                          transform="rotate(-90 18 18)"
                          style={{ stroke: circleColor, strokeLinecap: 'round' }} />
                      )}
                    </svg>
                    {duration > 0 && (
                      <span className="video-progress-text" style={{ color: circleColor }}>{pct}%</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      {totalPages > 1 && (
        <div className="video-list-pagination">
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ←
          </button>
          <span className="page-info">第 {currentPage} / {totalPages} 页</span>
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
