function formatTime(seconds) {
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
    if (diffDays <= 0) return '已到达复习时间'
    if (diffDays === 1) return '明天复习'
    return `${diffDays}天后复习`
  } catch {
    return null
  }
}

export default function AnnotationCard({ annotation, onDelete, onReview, onReturnToVideo, reviewing }) {
  const imageUrl = `/api/annotations/${annotation.id}/image`

  return (
    <div className="annotation-card">
      <img
        className="card-image"
        src={imageUrl}
        alt={`标注 ${annotation.id}`}
        loading="lazy"
      />
      <div className="card-body">
        <div className="card-video" title={annotation.video_name}>
          {annotation.video_name || '未知视频'}
        </div>
        <div className="card-time">
          📍 {formatTime(annotation.timestamp || 0)}
        </div>
        {annotation.next_review_date && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
            🔄 {formatReviewDate(annotation.next_review_date)}
          </div>
        )}
        <div className="card-date">
          {annotation.date ? new Date(annotation.date).toLocaleString('zh-CN') : ''}
        </div>
      </div>
      <div className="card-actions">
        <div className="sm2-buttons" style={{ display: 'flex', gap: 6, marginRight: 8 }}>
          <button
            className={`sm2-btn again ${reviewing === annotation.id ? 'reviewing' : ''}`}
            onClick={(e) => { e.stopPropagation(); onReview && onReview(annotation.id, 'again') }}
            disabled={reviewing === annotation.id}
            title="再次见到 (重置)"
          >🔁</button>
          <button
            className={`sm2-btn hard ${reviewing === annotation.id ? 'reviewing' : ''}`}
            onClick={(e) => { e.stopPropagation(); onReview && onReview(annotation.id, 'hard') }}
            disabled={reviewing === annotation.id}
            title="困难"
          >😓</button>
          <button
            className={`sm2-btn good ${reviewing === annotation.id ? 'reviewing' : ''}`}
            onClick={(e) => { e.stopPropagation(); onReview && onReview(annotation.id, 'good') }}
            disabled={reviewing === annotation.id}
            title="中等"
          >🙂</button>
          <button
            className={`sm2-btn easy ${reviewing === annotation.id ? 'reviewing' : ''}`}
            onClick={(e) => { e.stopPropagation(); onReview && onReview(annotation.id, 'easy') }}
            disabled={reviewing === annotation.id}
            title="容易"
          >😊</button>
        </div>
        <button
          className="btn btn-sm"
          style={{ background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }}
          onClick={(e) => {
            e.stopPropagation()
            onReturnToVideo && onReturnToVideo(annotation.video_name, annotation.video_source, annotation.timestamp)
          }}
          title="返回视频播放位置"
        >
          ▶ 返回视频
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(annotation.id)
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}
