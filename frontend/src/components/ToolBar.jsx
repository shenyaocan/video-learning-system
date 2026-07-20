import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import Calculator from './Calculator'

const COLORS = ['#ff4444', '#ff8c00', '#facc15', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ffffff', '#000000']

const TOOL_ICONS = {
  pen: '✏',
  line: '╱',
  rect: '▭',
  circle: '◯',
  arrow: '➤',
  text: 'T',
  eraser: '⌫'
}

export default function ToolBar({
  tool, onToolChange, color, onColorChange,
  strokeWidth, onStrokeWidthChange, canvasRef,
  horizontal = false
}) {
  const [inputValue, setInputValue] = useState(strokeWidth.toString())
  const [showCalculator, setShowCalculator] = useState(false)

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
  }

  const handleInputBlur = () => {
    let num = parseInt(inputValue)
    if (isNaN(num) || num < 1) num = 1
    if (num > 10) num = 10
    setInputValue(num.toString())
    onStrokeWidthChange(num)
  }

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    }
  }

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value)
    setInputValue(val.toString())
    onStrokeWidthChange(val)
  }

  return (
    <>
      <div className={`drawing-toolbar ${horizontal ? 'horizontal' : ''}`}>
        <div className="toolbar-column toolbar-tools">
          {Object.entries(TOOL_ICONS).map(([key, icon]) => (
            <button
              key={key}
              className={`tool-btn ${tool === key ? 'active' : ''}`}
              onClick={() => onToolChange(key)}
              title={key}
            >
              {icon}
            </button>
          ))}
          <div className="tool-separator" />
          <div className="tool-stroke-wrapper" title="线条粗细">
            <input
              type="range"
              className="tool-stroke-slider"
              min="1"
              max="10"
              value={strokeWidth}
              onChange={handleSliderChange}
            />
            <input
              type="text"
              className="tool-stroke-input"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
            />
          </div>
          <div className="tool-separator" />
          <button
            className="tool-btn"
            onClick={() => canvasRef.current?.undo()}
            title="撤销"
          >
            ↩
          </button>
          <button
            className="tool-btn"
            onClick={() => canvasRef.current?.redo()}
            title="重做"
          >
            ↪
          </button>
          <button
            className="tool-btn"
            onClick={() => canvasRef.current?.clear()}
            title="清空"
          >
            🗑
          </button>
          <button
            className="tool-btn"
            onClick={() => setShowCalculator(true)}
            title="计算器"
          >
            🔢
          </button>
        </div>
        <div className="toolbar-column toolbar-colors">
          {COLORS.map((c) => (
            <div
              key={c}
              className={`tool-color ${color === c ? 'active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
              title={c}
            />
          ))}
        </div>
      </div>
      {showCalculator && (
        <Calculator onClose={() => setShowCalculator(false)} />
      )}
    </>
  )
}
