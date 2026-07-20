import { useState, useEffect } from 'react'

const API = '/api'

export default function AnnotationReviewPanel({ videoName, refreshKey, onJumpToTime, onEnterAnnotation }) {
  const [annotations, setAnnotations] = useState([])
  const [loading, setLoading] = useState(true)

  console.log('AnnotationReviewPanel: rendering', { videoName, refreshKey, annotationCount: annotations.length, hasOnJumpToTime: !!onJumpToTime })

  useEffect(() => {
    console.log('AnnotationReviewPanel: useEffect', { videoName, refreshKey })
    if (videoName) {
      loadAnnotations()
    } else {
      setAnnotations([])
      setLoading(false)
    }
  }, [videoName, refreshKey])

  const loadAnnotations = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API}/annotations?video_name=${encodeURIComponent(videoName)}`)
      if (resp.ok) {
        const data = await resp.json()
        const sorted = [...data].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        setAnnotations(sorted)
      }
    } catch (err) {
      console.error('Failed to load annotations:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (e, annId) => {
    e.stopPropagation()
    if (!confirm('确定删除此标注？')) return
    try {
      const resp = await fetch(`${API}/annotations/${annId}`, {
        method: 'DELETE'
      })
      if (resp.ok) {
        setAnnotations(prev => prev.filter(a => a.id !== annId))
      } else {
        alert('删除失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  if (!videoName) {
    return (
      <div className="annotation-panel-empty">
        <div>📝 选择视频后显示标注</div>
      </div>
    )
  }

  if (loading) {
    return <div className="annotation-panel-empty">加载中...</div>
  }

  if (annotations.length === 0) {
    return (
      <div className="annotation-panel-empty">
        <div>📝 暂无标注</div>
      </div>
    )
  }

  return (
    <div className="annotation-thumb-strip">
      {annotations.map(ann => {
        const isPdf = ann.video_name && ann.video_name.toLowerCase().endsWith('.pdf')
        const displayTime = isPdf && ann.pdf_page != null
          ? `第${ann.pdf_page}页`
          : `${Math.floor(ann.timestamp / 60).toString().padStart(2, '0')}:${Math.floor(ann.timestamp % 60).toString().padStart(2, '0')}`
        return (
          <div
            key={ann.id}
            className="annotation-thumb-item"
            onClick={() => {
              onEnterAnnotation && onEnterAnnotation(ann)
            }}
            title="点击进入标注学习"
          >
            <img
              className="annotation-thumb-img"
              src={`${API}/annotations/${ann.id}/image`}
              alt=""
              draggable="false"
            />
            <button
              className="annotation-thumb-locate"
              onClick={(e) => {
                e.stopPropagation()
                const isPdf = ann.video_name && ann.video_name.toLowerCase().endsWith('.pdf')
                if (isPdf && onJumpToTime) {
                  onJumpToTime(ann.pdf_page, true)
                } else if (onJumpToTime) {
                  onJumpToTime(ann.timestamp, false)
                }
              }}
              title={`定位到 ${displayTime}`}
            >
              📍
            </button>
            <button
              className="annotation-thumb-delete"
              onClick={(e) => handleDelete(e, ann.id)}
              title="删除"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
