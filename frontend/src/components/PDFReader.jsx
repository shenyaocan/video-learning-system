import { useState, useEffect, useRef, useCallback } from 'react'
import init, { LiteParse } from '@llamaindex/liteparse-wasm'

export default function PDFReader({ filePath, initialPage = 1, currentPage: externalPage, onPageChange }) {
  const [liteParser, setLiteParser] = useState(null)
  const [pdfDocument, setPdfDocument] = useState(null)
  const [pdfBytes, setPdfBytes] = useState(null)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pageTexts, setPageTexts] = useState({})
  const [pageImages, setPageImages] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const containerRef = useRef(null)
  const canvasRefs = useRef({})
  const pageRefs = useRef({})
  const observerRef = useRef(null)
  const externalPageRef = useRef(externalPage)
  externalPageRef.current = externalPage

  useEffect(() => {
    const initParser = async () => {
      try {
        await init()
        const parser = new LiteParse({
          ocrEnabled: false,
          outputFormat: 'json'
        })
        setLiteParser(parser)
      } catch (err) {
        console.error('LiteParse init error:', err)
        setError('PDF解析器初始化失败')
      }
    }
    initParser()
  }, [])

  useEffect(() => {
    const loadPdf = async () => {
      if (!filePath) return
      
      try {
        setLoading(true)
        setError(null)
        
        const encodedPath = filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
        
        // 先通过后端获取PDF信息（页数等）
        const pageInfoResponse = await fetch(`/api/pdf-page-image?path=${encodedPath}&page=1`)
        if (!pageInfoResponse.ok) {
          throw new Error(`Failed to fetch PDF info: ${pageInfoResponse.status}`)
        }
        const pageInfo = await pageInfoResponse.json()
        if (!pageInfo.ok) {
          throw new Error(pageInfo.error || 'Failed to get PDF info')
        }
        
        setTotalPages(pageInfo.page_count)
        
        if (initialPage > pageInfo.page_count) {
          setCurrentPage(pageInfo.page_count)
        }
        
        // 如果LiteParse可用，尝试解析文本
        if (liteParser) {
          try {
            const pdfResponse = await fetch(`/api/pdf-file?path=${encodedPath}`)
            if (pdfResponse.ok) {
              const blob = await pdfResponse.blob()
              const bytes = new Uint8Array(await blob.arrayBuffer())
              const result = await liteParser.parse(bytes)
              setPdfDocument(result)
              setPdfBytes(bytes)
            }
          } catch (parseErr) {
            console.warn('LiteParse parse failed, will use backend for text extraction:', parseErr)
          }
        }
        
        setLoading(false)
      } catch (err) {
        console.error('PDF loading error:', err)
        setError('PDF加载失败')
        setLoading(false)
      }
    }

    if (filePath) {
      loadPdf()
    }
  }, [filePath, liteParser, initialPage])

  useEffect(() => {
    const extractPageText = async () => {
      if (Object.keys(pageTexts).length > 0) return
      
      try {
        // 优先使用LiteParse的结果
        if (pdfDocument) {
          const texts = {}
          for (const page of pdfDocument.pages) {
            texts[page.pageNum] = page.text || ''
          }
          setPageTexts(texts)
          return
        }
        
        // 如果LiteParse不可用，回退到后端API
        if (!filePath) return
        
        const encodedPath = filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
        const texts = {}
        
        for (let p = 1; p <= totalPages; p++) {
          try {
            const response = await fetch(`/api/pdf-parse?path=${encodedPath}&page=${p}`)
            if (response.ok) {
              const data = await response.json()
              texts[p] = data.text || ''
            }
          } catch (err) {
            console.warn(`Failed to extract text for page ${p}:`, err)
            texts[p] = ''
          }
        }
        
        setPageTexts(texts)
      } catch (err) {
        console.error('PDF text extraction error:', err)
      }
    }

    if ((pdfDocument || filePath) && totalPages > 0) {
      extractPageText()
    }
  }, [pdfDocument, pageTexts, filePath, totalPages])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const results = []
    Object.entries(pageTexts).forEach(([pageNum, text]) => {
      if (text.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push({
          page: parseInt(pageNum),
          text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        })
      }
    })
    setSearchResults(results)
  }, [searchQuery, pageTexts])

  const handleSearchResultClick = (pageNum) => {
    navigateToPage(pageNum)
    setSearchQuery('')
  }

  useEffect(() => {
    if (onPageChange && currentPage !== initialPage) {
      onPageChange(currentPage)
    }
  }, [currentPage, initialPage, onPageChange])

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !pdfDocument) return
      
      const container = containerRef.current
      const scrollTop = container.scrollTop
      const pageHeight = container.clientHeight
      
      const estimatedPage = Math.floor(scrollTop / pageHeight) + 1
      const clampedPage = Math.max(1, Math.min(estimatedPage, totalPages))
      
      if (clampedPage !== currentPage) {
        setCurrentPage(clampedPage)
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [pdfDocument, totalPages, currentPage])

  useEffect(() => {
    if (externalPage == null || !pdfDocument || !containerRef.current) return
    if (externalPage === currentPage) return

    console.log('PDFReader: externalPage changed to', externalPage, 'currentPage is', currentPage)
    setCurrentPage(externalPage)

    const scrollToPage = () => {
      const container = containerRef.current
      if (!container) return
      const pageElements = container.querySelectorAll('.pdf-page-wrapper')
      const targetIndex = externalPage - 1
      if (targetIndex >= 0 && targetIndex < pageElements.length) {
        const targetElement = pageElements[targetIndex]
        if (targetElement) {
          console.log('PDFReader: scrolling to externalPage', externalPage)
          targetElement.scrollIntoView({ block: 'start', behavior: 'auto' })
        }
      }
    }

    setTimeout(scrollToPage, 200)
  }, [externalPage, pdfDocument])

  const renderPage = useCallback(async (pageNum) => {
    if (!filePath || canvasRefs.current[pageNum]) return
    
    try {
      const encodedPath = filePath.split(/[\\/]/).map(part => encodeURIComponent(part)).join('/')
      const url = `/api/pdf-page-image?path=${encodedPath}&page=${pageNum}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch page image: ${response.status}`)
      }
      const data = await response.json()
      if (data.ok && data.image) {
        canvasRefs.current[pageNum] = data.image
        setPageImages(prev => ({
          ...prev,
          [pageNum]: data.image
        }))
      }
    } catch (err) {
      console.error('Page render error:', err)
    }
  }, [filePath])

  useEffect(() => {
    if (!filePath || !totalPages) return
    
    for (let p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p >= 1 && p <= totalPages && !canvasRefs.current[p]) {
        renderPage(p)
      }
    }
  }, [filePath, currentPage, totalPages, renderPage])

  useEffect(() => {
    if (!filePath || !totalPages || !containerRef.current) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.page)
            if (pageNum && !canvasRefs.current[pageNum]) {
              renderPage(pageNum)
            }
          }
        })
      },
      {
        root: containerRef.current,
        rootMargin: '200px',
        threshold: 0.1
      }
    )

    observerRef.current = observer

    const observePages = () => {
      const pageElements = containerRef.current?.querySelectorAll('.pdf-page-wrapper')
      if (pageElements) {
        pageElements.forEach((el) => {
          observer.observe(el)
        })
      }
    }

    observePages()

    const observerConfig = { childList: true, subtree: true }
    const mutationObserver = new MutationObserver(observePages)
    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, observerConfig)
    }

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [filePath, totalPages, renderPage])

  const navigateToPage = useCallback((pageNum) => {
    if (pageNum < 1 || pageNum > totalPages) return

    setCurrentPage(pageNum)

    setTimeout(() => {
      if (!containerRef.current) return

      const container = containerRef.current
      const pageElements = container.querySelectorAll('.pdf-page-wrapper')
      const targetIndex = pageNum - 1

      if (targetIndex >= 0 && targetIndex < pageElements.length) {
        const targetElement = pageElements[targetIndex]
        if (targetElement) {
          targetElement.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      }
    }, 100)
  }, [totalPages])

  const scrollToPage = useCallback((pageNum) => {
    if (!containerRef.current || !pdfDocument) return
    
    const container = containerRef.current
    const pageHeight = container.clientHeight
    const scrollPosition = (pageNum - 1) * pageHeight
    
    container.scrollTo({ top: scrollPosition, behavior: 'smooth' })
  }, [pdfDocument])

  useEffect(() => {
    if (!pdfDocument || totalPages <= 0) return
    console.log('PDFReader: initialPage =', initialPage, 'totalPages =', totalPages, 'currentPage =', currentPage)

    const scrollToInitialPage = () => {
      if (!containerRef.current) {
        console.log('PDFReader: container not ready, retrying...')
        setTimeout(scrollToInitialPage, 200)
        return
      }

      const container = containerRef.current
      const pageElements = container.querySelectorAll('.pdf-page-wrapper')
      console.log('PDFReader: found', pageElements.length, 'page elements, currentPage =', currentPage)

      if (pageElements.length === 0) {
        setTimeout(scrollToInitialPage, 200)
        return
      }

      const targetIndex = initialPage - 1
      console.log('PDFReader: targetIndex =', targetIndex, 'scrollIntoView')
      if (targetIndex >= 0 && targetIndex < pageElements.length) {
        const targetElement = pageElements[targetIndex]
        if (targetElement) {
          targetElement.scrollIntoView({ block: 'start', behavior: 'auto' })
        }
      }
    }

    if (initialPage > 1 && initialPage !== currentPage) {
      console.log('PDFReader: scheduling scroll for initialPage =', initialPage)
      setTimeout(scrollToInitialPage, 500)
    }
  }, [initialPage, totalPages, pdfDocument, currentPage])

  if (loading) {
    return (
      <div className="pdf-reader-container">
        <div className="pdf-loading">
          <div className="spinner"></div>
          <span>加载PDF中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pdf-reader-container">
        <div className="pdf-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="pdf-reader-container">
      <div className="pdf-toolbar">
        <button 
          className="pdf-nav-btn" 
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          ◀
        </button>
        <span className="pdf-page-info">
          {currentPage} / {totalPages}
        </span>
        <button 
          className="pdf-nav-btn" 
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          ▶
        </button>
        <input
          type="number"
          className="pdf-page-input"
          min="1"
          max={totalPages}
          value={currentPage}
          onChange={(e) => navigateToPage(parseInt(e.target.value) || 1)}
        />
        <div className="pdf-search-wrapper">
          <input
            type="text"
            className="pdf-search-input"
            placeholder="搜索PDF内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="pdf-search-results">
              {searchResults.map((result, index) => (
                <div 
                  key={index}
                  className="pdf-search-result-item"
                  onClick={() => handleSearchResultClick(result.page)}
                >
                  <span className="pdf-search-result-page">第{result.page}页</span>
                  <span className="pdf-search-result-text">{result.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="pdf-content-container"
      >
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
          <div 
            key={pageNum} 
            className="pdf-page-wrapper"
            data-page={pageNum}
          >
            {canvasRefs.current[pageNum] ? (
              <img 
                src={canvasRefs.current[pageNum]} 
                alt={`Page ${pageNum}`}
                className="pdf-page-image"
              />
            ) : (
              <div className="pdf-page-loading">
                <div className="spinner-small"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
