import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { width, height, tool, color, strokeWidth, disabled },
  ref
) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const actions = useRef([])
  const redoStack = useRef([])
  const snapshot = useRef(null)

  const getCtx = () => canvasRef.current?.getContext('2d')
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = (canvasRef.current.width || width) / rect.width
    const scaleY = (canvasRef.current.height || height) / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const saveSnapshot = () => {
    const c = canvasRef.current
    if (!c) return
    snapshot.current = c.toDataURL()
  }

  const redraw = () => {
    const ctx = getCtx()
    if (!ctx) return
    const c = canvasRef.current
    ctx.clearRect(0, 0, c.width, c.height)
    for (const a of actions.current) {
      replayAction(ctx, a)
    }
  }

  const replayAction = (ctx, a) => {
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = a.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash(a.tool === 'eraser' ? [] : [])

    switch (a.tool) {
      case 'pen':
      case 'eraser': {
        if (!a.points || a.points.length < 2) break
        ctx.beginPath()
        ctx.moveTo(a.points[0].x, a.points[0].y)
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x, a.points[i].y)
        }
        ctx.stroke()
        break
      }
      case 'line': {
        ctx.beginPath()
        ctx.moveTo(a.x1, a.y1)
        ctx.lineTo(a.x2, a.y2)
        ctx.stroke()
        break
      }
      case 'rect': {
        const w = a.x2 - a.x1
        const h = a.y2 - a.y1
        ctx.beginPath()
        ctx.rect(a.x1, a.y1, w, h)
        ctx.stroke()
        break
      }
      case 'circle': {
        const rx = Math.abs(a.x2 - a.x1) / 2
        const ry = Math.abs(a.y2 - a.y1) / 2
        const cx = (a.x1 + a.x2) / 2
        const cy = (a.y1 + a.y2) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'arrow': {
        const dx = a.x2 - a.x1
        const dy = a.y2 - a.y1
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) break
        const ux = dx / len
        const uy = dy / len
        const headLen = Math.min(20, len * 0.3)
        ctx.beginPath()
        ctx.moveTo(a.x1, a.y1)
        ctx.lineTo(a.x2, a.y2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(a.x2, a.y2)
        ctx.lineTo(
          a.x2 - headLen * (ux * 0.866 - uy * 0.5),
          a.y2 - headLen * (uy * 0.866 + ux * 0.5)
        )
        ctx.moveTo(a.x2, a.y2)
        ctx.lineTo(
          a.x2 - headLen * (ux * 0.866 + uy * 0.5),
          a.y2 - headLen * (uy * 0.866 - ux * 0.5)
        )
        ctx.stroke()
        break
      }
      case 'text': {
        if (!a.text) break
        ctx.font = `${Math.max(14, a.strokeWidth * 6)}px sans-serif`
        ctx.fillText(a.text, a.x1, a.y1)
        break
      }
    }
  }

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (actions.current.length === 0) return
      redoStack.current.push(actions.current.pop())
      redraw()
    },
    redo: () => {
      if (redoStack.current.length === 0) return
      actions.current.push(redoStack.current.pop())
      redraw()
    },
    clear: () => {
      redoStack.current = []
      actions.current = []
      redraw()
    },
    get canvas() {
      return canvasRef.current
    }
  }))

  useEffect(() => {
    syncCanvasSize()
  }, [width, height])

  const syncCanvasSize = () => {
    const c = canvasRef.current
    if (!c) return
    if (c.width !== width || c.height !== height) {
      c.width = width
      c.height = height
    }
  }

  const handleMouseDown = (e) => {
    if (disabled || !tool) return
    isDrawing.current = true
    saveSnapshot()
    const pos = getPos(e)
    startPos.current = pos

    if (tool === 'text') {
      const text = window.prompt('输入标注文字:')
      if (text) {
        actions.current.push({
          tool, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y,
          color, strokeWidth, text
        })
        redoStack.current = []
        redraw()
      }
      isDrawing.current = false
      return
    }

    if (tool === 'pen' || tool === 'eraser') {
      actions.current.push({
        tool,
        color: tool === 'eraser' ? 'rgba(0,0,0,0)' : color,
        strokeWidth: tool === 'eraser' ? strokeWidth * 3 : strokeWidth,
        points: [pos]
      })
    } else {
      actions.current.push({
        tool,
        x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y,
        color, strokeWidth, points: null
      })
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing.current || disabled || !tool) return
    const pos = getPos(e)
    const lastAction = actions.current[actions.current.length - 1]

    if (tool === 'pen' || tool === 'eraser') {
      lastAction.points.push(pos)
    } else {
      lastAction.x2 = pos.x
      lastAction.y2 = pos.y
    }
    redraw()
  }

  const handleMouseUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    redoStack.current = []
    redraw()
  }

  const handleMouseLeave = handleMouseUp

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width,
        height,
        pointerEvents: disabled ? 'none' : 'auto',
        visibility: disabled ? 'hidden' : 'visible'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  )
})

export default DrawingCanvas
