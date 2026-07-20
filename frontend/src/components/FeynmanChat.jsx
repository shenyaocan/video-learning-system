import { useState, useEffect, useRef } from 'react'
import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

const API = '/api'

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) {
    return `今天 ${timeStr}`
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + timeStr
}

function MessageContent({ content, attachments, timestamp }) {
  return (
    <>
      {timestamp && <div className="feynman-message-time">{formatTime(timestamp)}</div>}
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ className, children }) => {
            if (className?.includes('language-mermaid')) {
              return <code className={className}>{children}</code>
            }
            return <code className={className}>{children}</code>
          },
          pre: ({ children }) => <pre>{children}</pre>,
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          h5: ({ children }) => <h5>{children}</h5>,
          h6: ({ children }) => <h6>{children}</h6>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          table: ({ children }) => <table className="md-table">{children}</table>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          hr: () => <hr />,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
        }}
      >
        {content}
      </ReactMarkdown>
      {attachments && attachments.length > 0 && (
        <div className="feynman-attachments">
          {attachments.map((att, idx) => (
            <div key={idx} className="feynman-attachment">
              {att.type === 'image' ? (
                <img src={att.content} alt={att.name} className="feynman-attachment-image" />
              ) : (
                <div className="feynman-attachment-file">
                  <span className="feynman-attachment-icon">📎</span>
                  <span className="feynman-attachment-name">{att.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}



const DEFAULT_TEMPLATES = [
  '你是一建经济考题专家，你分析题目，并给出解题思路和出3道考题',
  '请分析这道题目，给出详细的解题步骤和答案',
  '作为一名专业教师，请详细讲解这个知识点',
  '请针对图片内容，出5道选择题并给出答案解析',
  '请用通俗易懂的语言解释这个概念，并举例说明'
]

function getTemplatesFromStorage() {
  try {
    const stored = localStorage.getItem('feynman_templates')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load templates:', e)
  }
  return DEFAULT_TEMPLATES
}

function saveTemplatesToStorage(templates) {
  try {
    localStorage.setItem('feynman_templates', JSON.stringify(templates))
  } catch (e) {
    console.error('Failed to save templates:', e)
  }
}

export default function FeynmanChat({ annotationId, imageBase64 }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(getTemplatesFromStorage()[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    api_url: '',
    api_key: '',
    model_name: '',
    supports_vision: true
  })
  const [attachments, setAttachments] = useState([])
  const [templates, setTemplates] = useState(getTemplatesFromStorage())
  const [showTemplates, setShowTemplates] = useState(false)
  const [newTemplate, setNewTemplate] = useState('')
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    checkConfig()
    loadMessages()
  }, [annotationId])

  useEffect(() => {
    saveTemplatesToStorage(templates)
  }, [templates])

  const handleSelectTemplate = (template) => {
    setInput(template)
    setShowTemplates(false)
  }

  const handleAddTemplate = () => {
    if (newTemplate.trim()) {
      setTemplates(prev => [...prev, newTemplate.trim()])
      setNewTemplate('')
    }
  }

  const handleRemoveTemplate = (index) => {
    setTemplates(prev => prev.filter((_, i) => i !== index))
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const checkConfig = async () => {
    try {
      const resp = await fetch(`${API}/llm/config`)
      if (resp.ok) {
        const data = await resp.json()
        setConfigured(data.configured)
        setConfigForm({
          api_url: data.api_url || 'https://api.deepseek.com/v1/chat/completions',
          api_key: '',
          model_name: data.model_name || 'deepseek-chat',
          supports_vision: data.supports_vision !== false
        })
      }
    } catch (err) {
      console.error('Failed to check config:', err)
    }
  }

  const loadMessages = async () => {
    try {
      const resp = await fetch(`${API}/feynman/chat/${annotationId}`)
      if (resp.ok) {
        const data = await resp.json()
        setMessages(data.messages || [])
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  const handleSaveConfig = async () => {
    if (!configForm.api_key.trim()) {
      setError('请输入API密钥')
      return
    }
    try {
      const resp = await fetch(`${API}/llm/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm)
      })
      if (resp.ok) {
        setConfigured(true)
        setShowConfig(false)
        setError('')
      } else {
        const data = await resp.json()
        setError(data.error || '保存失败')
      }
    } catch (err) {
      setError('保存配置失败')
    }
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    const newAttachments = []
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file)
        newAttachments.push({
          type: 'image',
          name: file.name,
          content: base64
        })
      } else if (file.name.endsWith('.md') || file.name.endsWith('.txt') || 
                 file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
        const content = await readFileContent(file)
        newAttachments.push({
          type: 'document',
          name: file.name,
          content: content
        })
      }
    }
    setAttachments(prev => [...prev, ...newAttachments])
    e.target.value = ''
  }

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSend = async (retryCount = 0) => {
    if (!input.trim() && attachments.length === 0) return
    if (loading) return
    if (!configured) {
      setShowConfig(true)
      return
    }

    const userMessage = input.trim()
    const userAttachments = [...attachments]
    const userTimestamp = new Date().toISOString()
    console.log('[FeynmanChat] handleSend - imageBase64 length:', imageBase64 ? imageBase64.length : 0)
    console.log('[FeynmanChat] handleSend - messages.length:', messages.length)
    console.log('[FeynmanChat] handleSend - sending image:', messages.length === 0 && imageBase64)
    setInput('')
    setAttachments([])
    setLoading(true)
    setError('')

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 130000)
      
      const resp = await fetch(`${API}/feynman/chat/${annotationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          image_base64: messages.length === 0 ? imageBase64 || '' : '',
          attachments: userAttachments
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      const text = await resp.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        setError('服务器返回错误，请检查后端服务是否运行')
        setInput(userMessage)
        setAttachments(userAttachments)
        console.error('Server response:', text.substring(0, 200))
        return
      }
      
      if (resp.ok) {
        const assistantTimestamp = new Date().toISOString()
        setMessages(prev => [...prev, 
          { role: 'user', content: userMessage, attachments: userAttachments.length > 0 ? userAttachments : undefined, timestamp: userTimestamp },
          { role: 'assistant', content: data.reply, timestamp: assistantTimestamp }
        ])
      } else {
        const errorMsg = data.error || '发送失败'
        if (errorMsg.includes('超时') || errorMsg.includes('120秒') || errorMsg.includes('更换模型')) {
          if (retryCount < 3) {
            console.log(`[FeynmanChat] 超时错误，自动重试第 ${retryCount + 1} 次`)
            setError(`请求超时，正在重试第 ${retryCount + 1} 次...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
            setInput(userMessage)
            setAttachments(userAttachments)
            setLoading(false)
            handleSend(retryCount + 1)
            return
          } else {
            setError('请求超时，已重试3次，请稍后再试')
          }
        } else {
          setError(errorMsg)
        }
        setInput(userMessage)
        setAttachments(userAttachments)
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (retryCount < 3) {
          console.log(`[FeynmanChat] 请求超时，自动重试第 ${retryCount + 1} 次`)
          setError(`请求超时，正在重试第 ${retryCount + 1} 次...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
          setInput(userMessage)
          setAttachments(userAttachments)
          setLoading(false)
          handleSend(retryCount + 1)
          return
        } else {
          setError('请求超时，已重试3次，请稍后再试')
        }
      } else {
        setError('网络错误: ' + err.message)
      }
      setInput(userMessage)
      setAttachments(userAttachments)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('确定要清空对话记录吗？')) return
    try {
      await fetch(`${API}/feynman/chat/${annotationId}/clear`, { method: 'POST' })
      setMessages([])
    } catch (err) {
      console.error('Failed to clear chat:', err)
    }
  }

  const handleRestart = async () => {
    if (!confirm('确定要重新开始学习吗？当前对话将被清空。')) return
    try {
      await fetch(`${API}/feynman/chat/${annotationId}/clear`, { method: 'POST' })
      setMessages([])
    } catch (err) {
      console.error('Failed to restart:', err)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (showConfig) {
    return (
      <div className="feynman-config">
        <h4>配置大模型API</h4>
        <p className="feynman-config-hint">
          请配置大模型服务器信息以使用费曼学习法互动功能。
        </p>
        <div className="feynman-config-field">
          <label htmlFor="llm-api-url">服务器地址</label>
          <input
            id="llm-api-url"
            name="api_url"
            type="text"
            className="feynman-api-input"
            placeholder="如: https://api.deepseek.com/v1/chat/completions"
            value={configForm.api_url}
            onChange={(e) => setConfigForm(prev => ({ ...prev, api_url: e.target.value }))}
          />
        </div>
        <div className="feynman-config-field">
          <label htmlFor="llm-api-key">API密钥</label>
          <input
            id="llm-api-key"
            name="api_key"
            type="password"
            className="feynman-api-input"
            placeholder="请输入API密钥"
            value={configForm.api_key}
            onChange={(e) => setConfigForm(prev => ({ ...prev, api_key: e.target.value }))}
          />
        </div>
        <div className="feynman-config-field">
          <label htmlFor="llm-model-name">模型名称</label>
          <input
            id="llm-model-name"
            name="model_name"
            type="text"
            className="feynman-api-input"
            placeholder="如: deepseek-chat, gpt-4o, qwen-plus"
            value={configForm.model_name}
            onChange={(e) => setConfigForm(prev => ({ ...prev, model_name: e.target.value }))}
          />
        </div>
        <div className="feynman-config-field feynman-config-checkbox">
          <label>
            <input
              id="llm-supports-vision"
              name="supports_vision"
              type="checkbox"
              checked={configForm.supports_vision}
              onChange={(e) => setConfigForm(prev => ({ ...prev, supports_vision: e.target.checked }))}
            />
            <span>支持图片输入（Vision功能）</span>
          </label>
          <p className="feynman-config-hint">如GPT-4o、DeepSeek-VL等支持图片的模型请勾选</p>
        </div>
        {error && <div className="feynman-error">{error}</div>}
        <div className="feynman-config-actions">
          <button className="btn btn-sm" onClick={() => setShowConfig(false)}>取消</button>
          <button className="btn btn-sm btn-accent" onClick={handleSaveConfig}>保存</button>
        </div>
      </div>
    )
  }

  return (
    <div className="feynman-chat">
      <div className="feynman-header">
        <span>🎓 费曼学习法互动</span>
        <div className="feynman-header-actions">
          {configured && (
            <button className="btn btn-sm" onClick={() => setShowConfig(true)} title="设置">⚙️</button>
          )}
          {messages.length > 0 && (
            <>
              <button className="btn btn-sm" onClick={handleRestart} title="重新开始学习">🔄</button>
              <button className="btn btn-sm btn-danger" onClick={handleClear} title="清空对话">🗑️</button>
            </>
          )}
        </div>
      </div>
      
      {!configured ? (
        <div className="feynman-not-configured">
          <p>请先配置大模型API</p>
          <button className="btn btn-accent" onClick={() => setShowConfig(true)}>配置 API</button>
        </div>
      ) : (
        <>
          <div className="feynman-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`feynman-message ${msg.role}`}>
                <div className="feynman-message-content">
                  <MessageContent content={msg.content} attachments={msg.attachments} timestamp={msg.timestamp} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="feynman-message assistant">
                <div className="feynman-message-content feynman-loading">思考中...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {error && <div className="feynman-error">{error}</div>}
          
          {attachments.length > 0 && (
            <div className="feynman-attachments-preview">
              {attachments.map((att, idx) => (
                <div key={idx} className="feynman-attachment-preview">
                  {att.type === 'image' ? (
                    <img src={att.content} alt={att.name} />
                  ) : (
                    <span className="feynman-attachment-file-preview">
                      <span className="feynman-attachment-icon">📎</span>
                      <span>{att.name}</span>
                    </span>
                  )}
                  <button 
                    className="feynman-attachment-remove"
                    onClick={() => removeAttachment(idx)}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          
          <div className="feynman-input-area">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.md,.txt,.doc,.docx"
              multiple
              style={{ display: 'none' }}
              id="feynman-file-input"
            />
            <button 
              className="btn btn-sm feynman-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="添加附件"
            >
              📎
            </button>
            <div className="feynman-template-selector">
              <button 
                className="btn btn-sm feynman-template-btn"
                onClick={() => setShowTemplates(!showTemplates)}
                title="选择提示词模板"
              >
                📋
              </button>
              {showTemplates && (
                <div className="feynman-template-dropdown">
                  <div className="feynman-template-header">提示词模板</div>
                  <div className="feynman-template-list">
                    {templates.map((template, idx) => (
                      <div 
                        key={idx} 
                        className="feynman-template-item"
                        onClick={() => handleSelectTemplate(template)}
                      >
                        <span>{template}</span>
                        <button 
                          className="feynman-template-remove"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveTemplate(idx)
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <div className="feynman-template-add">
                    <input
                      type="text"
                      className="feynman-template-input"
                      placeholder="添加新模板..."
                      value={newTemplate}
                      onChange={(e) => setNewTemplate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTemplate()
                        }
                      }}
                    />
                    <button className="btn btn-sm btn-accent" onClick={handleAddTemplate}>添加</button>
                  </div>
                </div>
              )}
            </div>
            <textarea
              id="feynman-input"
              name="message"
              className="feynman-input"
              placeholder="输入您的问题..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button 
              className="btn btn-accent feynman-send-btn" 
              onClick={handleSend}
              disabled={loading || (!input.trim() && attachments.length === 0)}
            >
              发送
            </button>
          </div>
        </>
      )}
    </div>
  )
}
