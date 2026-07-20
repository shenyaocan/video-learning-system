import { useState, useEffect, useCallback, useMemo } from 'react'
import FeynmanChat from '../components/FeynmanChat'

const API = '/api'

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatReviewDate(dateStr) {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return '需复习'
    if (diffDays === 1) return '明天'
    return `${diffDays}天后`
  } catch {
    return null
  }
}

function truncateName(name, maxLen = 10) {
  if (!name) return ''
  if (name.length <= maxLen) return name
  return name.slice(0, maxLen) + '...'
}

const FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'needReview', label: '待复习' },
  { key: 'reviewed', label: '已复习' },
  { key: 'mastered', label: '已掌握' }
]

export default function SavePage({ filterVideo, onReturnToVideo, openAnnotationId, onClearOpenAnnotation }) {
  const [annotations, setAnnotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [detailImageBase64, setDetailImageBase64] = useState('')
  const [reviewing, setReviewing] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeVideo, setActiveVideo] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedGroups, setExpandedGroups] = useState({})

  useEffect(() => {
    if (detail) {
      fetch(`${API}/annotations/${detail.id}/image`)
        .then(resp => resp.blob())
        .then(blob => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1]
            setDetailImageBase64(base64)
          }
          reader.readAsDataURL(blob)
        })
        .catch(err => console.error('Failed to load image:', err))
    } else {
      setDetailImageBase64('')
    }
  }, [detail])

  const loadAnnotations = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/annotations`)
      if (resp.ok) {
        let data = await resp.json()
        if (filterVideo) {
          data = data.filter((a) => a.video_name === filterVideo)
        }
        setAnnotations(data)
      }
    } catch (err) {
      console.error('Failed to load annotations:', err)
    } finally {
      setLoading(false)
    }
  }, [filterVideo])

  useEffect(() => {
    loadAnnotations()
  }, [loadAnnotations])

  useEffect(() => {
    if (openAnnotationId && annotations.length > 0) {
      const ann = annotations.find(a => a.id === openAnnotationId)
      if (ann) {
        setDetail(ann)
        if (onClearOpenAnnotation) onClearOpenAnnotation()
      }
    }
  }, [openAnnotationId, annotations, onClearOpenAnnotation])

  const groupedAnnotations = useMemo(() => {
    const groups = {}
    annotations.forEach(ann => {
      const key = ann.video_name || '未知视频'
      if (!groups[key]) groups[key] = []
      groups[key].push(ann)
    })
    return groups
  }, [annotations])

  const groupEntries = Object.entries(groupedAnnotations)

  const now = new Date()
  const stats = annotations.length > 0 ? {
    total: annotations.length,
    videos: groupEntries.length,
    needReview: annotations.filter(a => a.next_review_date && new Date(a.next_review_date) <= now).length,
    reviewed: annotations.filter(a => a.review_count > 0).length,
    totalReviews: annotations.reduce((sum, a) => sum + (a.review_count || 0), 0),
    mastered: annotations.filter(a => a.interval >= 21).length
  } : null

  const filteredAnnotations = useMemo(() => {
    let result = annotations
    if (activeVideo) {
      result = result.filter(a => (a.video_name || '未知视频') === activeVideo)
    }
    if (activeFilter === 'needReview') {
      result = result.filter(a => a.next_review_date && new Date(a.next_review_date) <= now)
    } else if (activeFilter === 'reviewed') {
      result = result.filter(a => a.review_count > 0)
    } else if (activeFilter === 'mastered') {
      result = result.filter(a => a.interval >= 21)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(a =>
        (a.video_name || '').toLowerCase().includes(q) ||
        formatTime(a.timestamp).includes(q)
      )
    }
    return result
  }, [annotations, activeVideo, activeFilter, searchQuery, now])

  const filteredGrouped = useMemo(() => {
    const groups = {}
    filteredAnnotations.forEach(ann => {
      const key = ann.video_name || '未知视频'
      if (!groups[key]) groups[key] = []
      groups[key].push(ann)
    })
    return groups
  }, [filteredAnnotations])

  const filteredGroupEntries = Object.entries(filteredGrouped)

  const toggleGroup = (videoName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [videoName]: !prev[videoName]
    }))
  }

  const detailIndex = detail ? annotations.findIndex(a => a.id === detail.id) : -1

  const handleDelete = async (id) => {
    try {
      const resp = await fetch(`${API}/annotations/${id}`, { method: 'DELETE' })
      if (resp.ok) {
        setAnnotations((prev) => prev.filter((a) => a.id !== id))
        if (detail && detail.id === id) setDetail(null)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handlePrev = () => {
    if (detailIndex <= 0) return
    setDetail(annotations[detailIndex - 1])
  }

  const handleNext = () => {
    if (detailIndex >= annotations.length - 1) return
    setDetail(annotations[detailIndex + 1])
  }

  const handleReview = async (id, difficulty) => {
    setReviewing(id)
    try {
      const resp = await fetch(`${API}/annotations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      })
      if (resp.ok) {
        await loadAnnotations()
        if (detail && detail.id === id) {
          const updated = await (await fetch(`${API}/annotations`)).json()
          const found = updated.find(a => a.id === id)
          if (found) setDetail(found)
        }
      }
    } catch (err) {
      console.error('Review failed:', err)
    } finally {
      setReviewing(null)
    }
  }

  if (loading) {
    return (
      <div className="save-page">
        <div className="save-loading">加载标注记录中...</div>
      </div>
    )
  }

  return (
    <div className="save-page">
      <div className="save-top-bar">
        <div className="save-top-left">
          <h2 className="save-page-title">我的标注</h2>
          <span className="save-page-subtitle">
            {filterVideo
              ? `视频: ${filterVideo} — ${annotations.length} 条标注`
              : `${groupEntries.length} 个视频 · 共 ${annotations.length} 条标注`}
          </span>
        </div>
        <div className="save-search-area">
          <span className="save-search-icon">🔍</span>
          <input
            className="save-search-input"
            type="text"
            placeholder="搜索视频名或时间..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="save-search-clear" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>
      </div>

      {stats && (
        <div className="save-stats">
          <div className="save-stat-item" onClick={() => { setActiveFilter('all'); setActiveVideo(null) }}>
            <span className="save-stat-value">{stats.total}</span>
            <span className="save-stat-label">总标注</span>
          </div>
          <div className="save-stat-item" onClick={() => { setActiveFilter('all'); setActiveVideo(null) }}>
            <span className="save-stat-value">{stats.videos}</span>
            <span className="save-stat-label">个视频</span>
          </div>
          <div className="save-stat-item save-stat-warn" onClick={() => setActiveFilter('needReview')}>
            <span className="save-stat-value warn">{stats.needReview}</span>
            <span className="save-stat-label">待复习</span>
          </div>
          <div className="save-stat-item" onClick={() => setActiveFilter('reviewed')}>
            <span className="save-stat-value">{stats.reviewed}</span>
            <span className="save-stat-label">已复习</span>
          </div>
          <div className="save-stat-item" onClick={() => setActiveFilter('all')}>
            <span className="save-stat-value">{stats.totalReviews}</span>
            <span className="save-stat-label">复习次数</span>
          </div>
          <div className="save-stat-item" onClick={() => setActiveFilter('mastered')}>
            <span className="save-stat-value">{stats.mastered}</span>
            <span className="save-stat-label">已掌握</span>
          </div>
        </div>
      )}

      <div className="save-filter-tabs">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`save-filter-tab ${activeFilter === opt.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {annotations.length === 0 ? (
        <div className="save-empty-state">
          <div className="save-empty-icon">📝</div>
          <div className="save-empty-text">
            {filterVideo ? '该视频暂无标注记录' : '暂无标注记录'}
          </div>
          <p className="save-empty-hint">
            在视频播放器中暂停并标注，然后保存即可在此查看
          </p>
        </div>
      ) : (
        <div className="save-main-layout">
          <div className="save-sidebar">
            <div className="save-sidebar-header">视频列表</div>
            <div className="save-sidebar-list">
              <div
                className={`save-sidebar-item ${!activeVideo ? 'active' : ''}`}
                onClick={() => setActiveVideo(null)}
              >
                <span className="save-sidebar-name">全部视频</span>
                <span className="save-sidebar-count">{annotations.length}</span>
              </div>
              {groupEntries.map(([videoName, anns]) => {
                const needReview = anns.filter(a => a.next_review_date && new Date(a.next_review_date) <= now).length
                return (
                  <div
                    key={videoName}
                    className={`save-sidebar-item ${activeVideo === videoName ? 'active' : ''}`}
                    onClick={() => setActiveVideo(videoName)}
                  >
                    <span className="save-sidebar-name" title={videoName}>{truncateName(videoName)}</span>
                    <span className="save-sidebar-count">{anns.length}</span>
                    {needReview > 0 && <span className="save-sidebar-dot" title={`${needReview}条待复习`} />}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="save-content">
            {filteredAnnotations.length === 0 ? (
              <div className="save-empty-state">
                <div className="save-empty-icon">🔍</div>
                <div className="save-empty-text">没有匹配的标注</div>
              </div>
            ) : (
              <div className="save-content-groups">
                {filteredGroupEntries.map(([videoName, anns]) => (
                  <div key={videoName} className="save-group">
                    <div
                      className={`save-group-header ${expandedGroups[videoName] ? 'expanded' : ''}`}
                      onClick={() => toggleGroup(videoName)}
                    >
                      <span className="save-group-arrow">{expandedGroups[videoName] ? '▼' : '▶'}</span>
                      <span className="save-group-name" title={videoName}>{truncateName(videoName)}</span>
                      <span className="save-group-count">{anns.length} 张</span>
                    </div>
                    {expandedGroups[videoName] !== false && (
                      <div className="save-group-content">
                        <div className="save-annotation-grid">
                          {anns.map((a) => {
                            const isDue = a.next_review_date && new Date(a.next_review_date) <= now
                            return (
                              <div
                                key={a.id}
                                className={`save-card ${detail && detail.id === a.id ? 'save-card-active' : ''}`}
                                onClick={() => {
                                  setDetail(a)
                                }}
                              >
                                <img
                                  className="save-card-img"
                                  src={`${API}/annotations/${a.id}/image`}
                                  alt=""
                                  loading="lazy"
                                />
                                <button
                                  className="save-card-locate-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onReturnToVideo && onReturnToVideo(a.video_name, a.video_source, a.timestamp, a.id, a.pdf_page)
                                  }}
                                  title="定位"
                                >
                                  📍
                                </button>
                                <button
                                  className="save-card-delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDelete(a.id)
                                  }}
                                  title="删除"
                                >
                                  ×
                                </button>
                                <div className="save-card-info-row">
                                  {a.pdf_page != null ? (
                                    <span className="save-card-time">第{a.pdf_page}页</span>
                                  ) : (
                                    <span className="save-card-time">{formatTime(a.timestamp)}</span>
                                  )}
                                  {a.review_count > 0 && (
                                    <span className="save-card-review-count" title={`复习${a.review_count}次`}>
                                      🔄{a.review_count}
                                    </span>
                                  )}
                                </div>
                                {a.next_review_date && (
                                  <div className={`save-card-review-tag ${isDue ? 'review-due' : ''}`}>
                                    {isDue ? '⚠ 需复习' : formatReviewDate(a.next_review_date)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detail && (
        <div className="save-detail-overlay" onClick={() => setDetail(null)}>
          <div className="save-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="save-detail-left">
              <img
                className="save-detail-image"
                src={`${API}/annotations/${detail.id}/image`}
                alt="标注详情"
              />
              <div className="save-detail-body">
                <div className="save-detail-info">
                  <p className="save-detail-video-name">{detail.video_name}</p>
                  <p className="save-detail-timestamp">
                    📍 {detail.pdf_page != null ? `第${detail.pdf_page}页` : formatTime(detail.timestamp)}
                  </p>
                  {detail.next_review_date && (
                    <p className="save-detail-review-info">
                      🔄 下次复习: {new Date(detail.next_review_date).toLocaleDateString('zh-CN')}
                      {' · '}复习{detail.review_count || 0}次
                    </p>
                  )}
                </div>
                <div className="save-detail-sm2">
                  <span className="save-sm2-label">记忆评分:</span>
                  <button className="save-sm2-btn again" onClick={() => handleReview(detail.id, 'again')} disabled={reviewing === detail.id}>🔁 重来</button>
                  <button className="save-sm2-btn hard" onClick={() => handleReview(detail.id, 'hard')} disabled={reviewing === detail.id}>😓 困难</button>
                  <button className="save-sm2-btn good" onClick={() => handleReview(detail.id, 'good')} disabled={reviewing === detail.id}>🙂 一般</button>
                  <button className="save-sm2-btn easy" onClick={() => handleReview(detail.id, 'easy')} disabled={reviewing === detail.id}>😊 容易</button>
                </div>
                <div className="save-detail-actions">
                  <button
                    className="btn"
                    onClick={() => { handlePrev() }}
                    disabled={detailIndex <= 0}
                  >
                    上一题
                  </button>
                  <button
                    className="btn btn-accent"
                    onClick={() => onReturnToVideo && onReturnToVideo(detail.video_name, detail.video_source, detail.timestamp, null, detail.pdf_page)}
                  >
                    {detail.pdf_page ? '📄 返回PDF' : '返回视频'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => { handleNext() }}
                    disabled={detailIndex >= annotations.length - 1}
                  >
                    下一题
                  </button>
                </div>
              </div>
            </div>
            <div className="save-detail-right">
              <FeynmanChat annotationId={detail.id} imageBase64={detailImageBase64} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
