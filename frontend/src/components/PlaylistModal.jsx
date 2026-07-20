import { useState, useEffect, useRef } from 'react'

const API = '/api'

export default function PlaylistModal({ isOpen, onClose, onSelectVideo, onFolderChanged, onPlaylistChanged }) {
  const [videos, setVideos] = useState([])
  const [folderGroups, setFolderGroups] = useState([])
  const [folderPath, setFolderPath] = useState('')
  const [settingFolder, setSettingFolder] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedVideos, setSelectedVideos] = useState({})
  const [adding, setAdding] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [filePath, setFilePath] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadVideos()
    }
  }, [isOpen])

  const loadVideos = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API}/videos`)
      if (resp.ok) {
        const data = await resp.json()
        setVideos(data)
      }
      const fvResp = await fetch(`${API}/folder-videos`)
      if (fvResp.ok) {
        const fvData = await fvResp.json()
        setFolderGroups(fvData)
      }
    } catch (err) {
      console.error('Failed to load videos:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSetFolder = async () => {
    const path = folderPath.trim()
    if (!path) {
      setFolderGroups([])
      setFolderError('')
      try {
        await fetch(`${API}/set-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '' })
        })
      } catch {}
      loadVideos()
      return
    }
    setSettingFolder(true)
    setFolderError('')
    try {
      const resp = await fetch(`${API}/set-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      const result = await resp.json()
      if (resp.ok && result.ok) {
        setFolderPath('')
        onFolderChanged && onFolderChanged()
        const fvResp = await fetch(`${API}/folder-videos`)
        if (fvResp.ok) {
          const fvData = await fvResp.json()
          setFolderGroups(fvData)
          setFolderError('')
        }
      } else {
        setFolderError(result.error || '加载失败')
      }
    } catch (err) {
      setFolderError('网络错误')
    } finally {
      setSettingFolder(false)
    }
  }

  const handleAddFilePath = async () => {
    const path = filePath.trim()
    if (!path) return
    
    setUploadingFile(true)
    setFolderError('')
    
    try {
      const resp = await fetch(`${API}/add-file-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      
      const result = await resp.json()
      if (resp.ok && result.ok) {
        setFilePath('')
        setFolderError('')
        loadVideos()
        onFolderChanged && onFolderChanged()
        onPlaylistChanged && onPlaylistChanged()
        alert(`成功添加文件: ${result.file.name}`)
      } else {
        setFolderError(result.error || '添加失败')
      }
    } catch (err) {
      console.error('Add file path error:', err)
      setFolderError('添加失败: ' + err.message)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleRemoveFolder = async (folderPath) => {
    if (!confirm(`确定要移除文件夹 "${folderPath}" 吗？`)) return
    try {
      await fetch(`${API}/remove-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      })
      setFolderGroups(prev => prev.filter(g => g.folder_path !== folderPath))
      onFolderChanged && onFolderChanged()
    } catch (err) {
      alert('网络错误')
    }
  }

  const handleClearAllFolders = async () => {
    if (!confirm('确定要清除所有文件夹吗？')) return
    try {
      await fetch(`${API}/set-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '' })
      })
      setFolderGroups([])
      onFolderChanged && onFolderChanged()
    } catch (err) {
      alert('网络错误')
    }
  }

  const toggleVideoSelection = (folderPath, videoName, videoSize) => {
    setSelectedVideos(prev => {
      const key = `${folderPath}|${videoName}`
      const newSelected = { ...prev }
      if (newSelected[key]) {
        delete newSelected[key]
      } else {
        newSelected[key] = { folderPath, videoName, videoSize }
      }
      return newSelected
    })
  }

  const toggleSelectAllInFolder = (folderPath, videoList) => {
    setSelectedVideos(prev => {
      const newSelected = { ...prev }
      const allSelected = videoList.every(v => newSelected[`${folderPath}|${v.name}`])
      if (allSelected) {
        videoList.forEach(v => delete newSelected[`${folderPath}|${v.name}`])
      } else {
        videoList.forEach(v => {
          newSelected[`${folderPath}|${v.name}`] = { 
            folderPath, 
            videoName: v.name, 
            videoSize: v.size 
          }
        })
      }
      return newSelected
    })
  }

  const handleAddToPlaylist = async () => {
    const selectedList = Object.values(selectedVideos)
    if (selectedList.length === 0) return
    setAdding(true)
    try {
      const videosToAdd = selectedList.map(item => ({
        name: item.videoName,
        size: item.videoSize,
        source: 'folder',
        folder_path: item.folderPath
      }))
      const resp = await fetch(`${API}/playlist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: videosToAdd })
      })
      const result = await resp.json()
      if (resp.ok) {
        setSelectedVideos({})
        onPlaylistChanged && onPlaylistChanged()
        alert(`已添加 ${selectedList.length} 个视频到视频列表`)
      } else {
        alert(result.error || '添加失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setAdding(false)
    }
  }

  const handleSelect = (name, source) => {
    onSelectVideo(name, source)
    onClose()
  }

  const selectedCount = Object.keys(selectedVideos).length

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>播放目录</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="folder-section">
            <input
              type="text"
              className="folder-input"
              placeholder="输入本地文件夹路径，如 C:/Videos"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetFolder()}
            />
            <div className="folder-buttons">
              <button className="btn btn-accent btn-sm" onClick={handleSetFolder} disabled={settingFolder}>
                {settingFolder ? '加载中...' : '加载文件夹'}
              </button>
              <button className="btn btn-sm" onClick={handleClearAllFolders}>清除全部</button>
            </div>
          </div>
          
          <div className="folder-section" style={{ marginTop: '12px' }}>
            <input
              type="text"
              className="folder-input"
              placeholder="输入本地文件路径，如 E:/Videos/test.mp4"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFilePath()}
            />
            <div className="folder-buttons">
              <button 
                className="btn btn-accent btn-sm" 
                onClick={handleAddFilePath} 
                disabled={uploadingFile}
              >
                {uploadingFile ? '添加中...' : '添加文件'}
              </button>
            </div>
            {folderError && <div className="folder-error">{folderError}</div>}
          </div>

          {selectedCount > 0 && (
            <div className="selected-actions">
              <span>已选中 {selectedCount} 个文件</span>
              <button 
                className="btn btn-sm btn-accent" 
                onClick={handleAddToPlaylist}
                disabled={adding}
              >
                添加到视频列表
              </button>
            </div>
          )}

          {loading ? (
            <div className="modal-loading">加载视频列表中...</div>
          ) : (
            <div className="video-list">
              {videos.length > 0 && (
                <div className="video-group">
                  <div className="video-group-title">默认视频 (backend/videos/)</div>
                  {videos.map(v => (
                    <div
                      key={v.name}
                      className="video-item"
                      onClick={() => handleSelect(v.name, 'local')}
                    >
                      <span className="video-name">{v.name}</span>
                      <span className="video-size">{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  ))}
                </div>
              )}
              {folderGroups.map(group => {
                const videoNames = group.videos.map(v => v.name)
                const allSelected = videoNames.length > 0 && videoNames.every(name => selectedVideos[`${group.folder_path}|${name}`])
                return (
                  <div key={group.folder_path} className="video-group folder-group">
                    <div className="video-group-header">
                      <div className="video-group-title" title={group.folder_path}>
                        {group.folder_name}
                        <span className="folder-video-count">({group.videos.length})</span>
                      </div>
                      <div className="video-group-actions">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleSelectAllInFolder(group.folder_path, group.videos)}
                          />
                          全选
                        </label>
                        <button 
                          className="btn btn-sm" 
                          onClick={() => handleRemoveFolder(group.folder_path)}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    {group.videos.map(v => {
                      const isSelected = selectedVideos[`${group.folder_path}|${v.name}`]
                      return (
                        <div
                          key={v.name}
                          className={`video-item ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="video-checkbox"
                            checked={isSelected}
                            onChange={() => toggleVideoSelection(group.folder_path, v.name, v.size)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span 
                            className="video-name" 
                            onClick={() => handleSelect(v.name, 'folder')}
                            style={{ cursor: 'pointer', flex: 1 }}
                          >
                            {v.name}
                          </span>
                          <span className="video-size">{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {videos.length === 0 && folderGroups.length === 0 && (
                <div className="no-videos">暂无视频文件</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
