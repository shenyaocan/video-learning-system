import { useState, useEffect, useRef } from 'react'

export default function Calculator({ onClose }) {
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('0')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const popupRef = useRef(null)

  useEffect(() => {
    if (popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect()
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: window.innerHeight - rect.height - 100
      })
    }
  }, [])

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus()
    }
  }, [])

  const handleMouseDown = (e) => {
    if (e.target.closest('.calculator-close')) return
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y
    setPosition({ x: newX, y: newY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragOffset])

  const inputChar = (char) => {
    setExpression(prev => prev + char)
  }

  const clear = () => {
    setExpression('')
    setResult('0')
  }

  const backspace = () => {
    setExpression(prev => prev.slice(0, -1))
  }

  const calculate = () => {
    try {
      if (!expression) return
      
      let expr = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
      
      const evalResult = Function('"use strict"; return (' + expr + ')')()
      
      if (typeof evalResult === 'number' && isFinite(evalResult)) {
        const formatted = Number.isInteger(evalResult) 
          ? evalResult.toString() 
          : parseFloat(evalResult.toPrecision(12)).toString()
        setResult(formatted)
      } else {
        setResult('Error')
      }
    } catch (e) {
      setResult('Error')
    }
  }

  const scientificOperation = (op) => {
    try {
      let value
      let resultValue
      
      switch (op) {
        case 'sin':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.sin(value * Math.PI / 180)
          setExpression(`sin(${value})`)
          break
        case 'cos':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.cos(value * Math.PI / 180)
          setExpression(`cos(${value})`)
          break
        case 'tan':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.tan(value * Math.PI / 180)
          setExpression(`tan(${value})`)
          break
        case 'log':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.log10(value)
          setExpression(`log(${value})`)
          break
        case 'ln':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.log(value)
          setExpression(`ln(${value})`)
          break
        case 'sqrt':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = Math.sqrt(value)
          setExpression(`√(${value})`)
          break
        case 'sqr':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = value * value
          setExpression(`(${value})²`)
          break
        case 'cube':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = value * value * value
          setExpression(`(${value})³`)
          break
        case 'inv':
          value = parseFloat(result === '0' ? expression || '0' : result)
          resultValue = 1 / value
          setExpression(`1/(${value})`)
          break
        case 'fact':
          value = parseInt(result === '0' ? expression || '0' : result)
          resultValue = factorial(Math.abs(value))
          if (value < 0) resultValue = -resultValue
          setExpression(`${value}!`)
          break
        case 'pi':
          resultValue = Math.PI
          setExpression('π')
          break
        case 'e':
          resultValue = Math.E
          setExpression('e')
          break
        default:
          return
      }

      if (typeof resultValue === 'number' && isFinite(resultValue)) {
        const formatted = Number.isInteger(resultValue) 
          ? resultValue.toString() 
          : parseFloat(resultValue.toPrecision(12)).toString()
        setResult(formatted)
      } else {
        setResult('Error')
      }
    } catch (e) {
      setResult('Error')
    }
  }

  const factorial = (n) => {
    if (n === 0 || n === 1) return 1
    let result = 1
    for (let i = 2; i <= n; i++) {
      result *= i
    }
    return result
  }

  const handleKeyDown = (e) => {
    if (e.key >= '0' && e.key <= '9') {
      setExpression(prev => prev + e.key)
    } else if (e.key === '.') {
      setExpression(prev => prev + '.')
    } else if (e.key === '+') {
      inputChar('+')
    } else if (e.key === '-') {
      inputChar('-')
    } else if (e.key === '*') {
      inputChar('×')
    } else if (e.key === '/') {
      inputChar('÷')
    } else if (e.key === '(' || e.key === ')') {
      inputChar(e.key)
    } else if (e.key === 'Enter') {
      calculate()
    } else if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Backspace') {
      backspace()
    }
  }

  return (
    <div className="calculator-overlay" onClick={onClose}>
      <div 
        ref={popupRef}
        className="calculator-popup" 
        onClick={(e) => e.stopPropagation()} 
        onKeyDown={handleKeyDown} 
        tabIndex={0}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'move' : 'default'
        }}
      >
        <div className="calculator-header" onMouseDown={handleMouseDown}>
          <span>科学计算器</span>
          <button className="calculator-close" onClick={onClose}>×</button>
        </div>
        <div className="calculator-display-area">
          <div className="calculator-expression">{expression || '请输入数字和运算符'}</div>
          <div className="calculator-result">{result}</div>
        </div>
        <div className="calculator-buttons">
          <div className="calc-row">
            <button className="calc-btn" onClick={() => scientificOperation('sin')}>sin</button>
            <button className="calc-btn" onClick={() => scientificOperation('cos')}>cos</button>
            <button className="calc-btn" onClick={() => scientificOperation('tan')}>tan</button>
            <button className="calc-btn" onClick={() => scientificOperation('log')}>log</button>
            <button className="calc-btn" onClick={() => scientificOperation('ln')}>ln</button>
            <button className="calc-btn" onClick={() => scientificOperation('sqrt')}>√</button>
            <button className="calc-btn" onClick={() => scientificOperation('sqr')}>x²</button>
            <button className="calc-btn" onClick={() => scientificOperation('cube')}>x³</button>
            <button className="calc-btn" onClick={() => scientificOperation('inv')}>1/x</button>
            <button className="calc-btn" onClick={() => scientificOperation('fact')}>n!</button>
            <button className="calc-btn" onClick={() => scientificOperation('pi')}>π</button>
            <button className="calc-btn" onClick={() => scientificOperation('e')}>e</button>
          </div>
          <div className="calc-row">
            <button className="calc-btn" onClick={() => inputChar('(')}>(</button>
            <button className="calc-btn" onClick={() => inputChar(')')}>)</button>
            <button className="calc-btn" onClick={backspace}>⌫</button>
            <button className="calc-btn" onClick={clear}>C</button>
            <button className="calc-btn op" onClick={() => inputChar('÷')}>÷</button>
            <button className="calc-btn op" onClick={() => inputChar('×')}>×</button>
            <button className="calc-btn op" onClick={() => inputChar('-')}>−</button>
            <button className="calc-btn op" onClick={() => inputChar('+')}>+</button>
            <button className="calc-btn eq" onClick={calculate}>=</button>
          </div>
        </div>
      </div>
    </div>
  )
}
