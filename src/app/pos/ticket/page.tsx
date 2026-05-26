'use client'
// v2 force deploy
import React, { useEffect, useState } from 'react'

// Map separator char from config to CSS border style
function sepCharToBorder(char: string): string {
  switch (char) {
    case '.': return 'dotted'
    case '*': return 'dashed'
    case '=': return 'double'
    case '-':
    default:  return 'solid'
  }
}

export default function TicketPage() {
  const [ticketText, setTicketText] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState('12px')
  const [fontFamily, setFontFamily] = useState("'Courier New', Courier, monospace")
  const [lineSpacing, setLineSpacing] = useState(4)
  const [headerBold, setHeaderBold] = useState(true)
  const [separatorChar, setSeparatorChar] = useState('-')
  const [separatorDouble, setSeparatorDouble] = useState(false)
  // Margins in mm → converted to px (1mm ≈ 3.78px)
  const [marginTop, setMarginTop] = useState(4)
  const [marginBottom, setMarginBottom] = useState(4)
  const [marginLeft, setMarginLeft] = useState(0)
  const [marginRight, setMarginRight] = useState(0)

  useEffect(() => {
    const text = sessionStorage.getItem('pos_ticket')
    if (!text) {
      window.location.href = '/pos'
      return
    }
    setTicketText(text)
    const logo = sessionStorage.getItem('pos_ticket_logo')
    if (logo) setLogoUrl(logo)
    const fs = sessionStorage.getItem('pos_ticket_fontsize')
    if (fs) setFontSize(fs)

    const ff = sessionStorage.getItem('pos_ticket_fontfamily')
    if (ff) {
      if (ff === 'sans-serif') setFontFamily('Arial, Helvetica, sans-serif')
      else if (ff === 'serif') setFontFamily("'Times New Roman', Times, serif")
      else setFontFamily("'Courier New', Courier, monospace")
    }

    const ls = sessionStorage.getItem('pos_ticket_linespacing')
    if (ls) setLineSpacing(Number(ls))

    const hb = sessionStorage.getItem('pos_ticket_headerbold')
    if (hb !== null) setHeaderBold(hb !== 'false')

    const sep = sessionStorage.getItem('pos_ticket_separator')
    if (sep) setSeparatorChar(sep)

    const sepd = sessionStorage.getItem('pos_ticket_separatordouble')
    if (sepd !== null) setSeparatorDouble(sepd === 'true')

    const mt = sessionStorage.getItem('pos_ticket_margintop')
    if (mt !== null) setMarginTop(Number(mt))
    const mb = sessionStorage.getItem('pos_ticket_marginbottom')
    if (mb !== null) setMarginBottom(Number(mb))
    const ml = sessionStorage.getItem('pos_ticket_marginleft')
    if (ml !== null) setMarginLeft(Number(ml))
    const mr = sessionStorage.getItem('pos_ticket_marginright')
    if (mr !== null) setMarginRight(Number(mr))

    setTimeout(() => window.print(), 400)
  }, [])

  if (ticketText === null) return null

  // lineSpacing stored as px value; convert to em-based lineHeight for pre
  const lineHeightValue = `calc(1.2em + ${lineSpacing}px)`

  // Convert mm to px (1mm ≈ 3.78px)
  const MM_TO_PX = 3.78
  const ptop = Math.round(marginTop * MM_TO_PX)
  const pbottom = Math.round(marginBottom * MM_TO_PX)
  const pleft = Math.round(marginLeft * MM_TO_PX)
  const pright = Math.round(marginRight * MM_TO_PX)

  const borderStyle = sepCharToBorder(separatorChar)

  // Shared style for every <pre> segment
  const preStyle: React.CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight: headerBold ? 'bold' : 'normal',
    lineHeight: lineHeightValue,
    color: 'black',
    margin: 0,
    whiteSpace: 'pre-wrap',
    width: '100%',
    boxSizing: 'border-box',
    paddingLeft: `${pleft}px`,
    paddingRight: `${pright}px`,
  }

  // Parse numeric font size (e.g. "12px" → 12) to compute header/footer size
  const fontSizePx = parseFloat(fontSize) || 12
  const headerFontSize = `${fontSizePx + 2}px`

  // Split the ticket text by separator markers
  const SEP_MARKER = '---SEP---'
  const segments = ticketText.split(SEP_MARKER)

  // Separator element (single or double)
  const renderSep = (key: number) => {
    if (separatorDouble) {
      return (
        <div key={`sep-${key}`} style={{ width: '100%', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', borderTop: `1px ${borderStyle} black`, marginBottom: '2px' }} />
          <div style={{ width: '100%', borderTop: `1px ${borderStyle} black` }} />
        </div>
      )
    }
    return (
      <div key={`sep-${key}`} style={{ width: '100%', borderTop: `1px ${borderStyle} black`, boxSizing: 'border-box' }} />
    )
  }

  return (
    <div style={{ background: 'white', margin: '0 auto', padding: 0, width: '72mm', overflow: 'hidden', boxSizing: 'border-box' }}>
      <style>{`@page { margin: 0; padding: 0; size: 72mm auto; } @media print { .no-print { display: none !important; } body, html { margin: 0; padding: 0; } }`}</style>
      {logoUrl && (
        <div style={{ textAlign: 'center', margin: 0, padding: '4px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Logo"
            style={{ maxWidth: '150px', height: 'auto', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
          />
        </div>
      )}

      {/* First segment gets top padding + centered; last segment gets bottom padding + centered */}
      {segments.map((segment, idx) => {
        const isFirst = idx === 0
        const isLast = idx === segments.length - 1
        const isHeaderOrFooter = isFirst || isLast
        const segStyle: React.CSSProperties = {
          ...preStyle,
          ...(isFirst ? { paddingTop: `${ptop}px` } : {}),
          ...(isLast ? { paddingBottom: `${pbottom}px` } : {}),
          ...(isHeaderOrFooter ? { textAlign: 'center', fontSize: headerFontSize } : { textAlign: 'left' }),
        }
        // Split segment into lines; TOTAL lines are right-aligned bold+large; price lines (leading spaces then $) are right-aligned
        const renderedLines = segment.split('\n').map((line, li) => {
          if (/TOTAL/i.test(line)) {
            return (
              <span key={li} style={{ display: 'block', textAlign: 'right', width: '100%', fontWeight: 'bold', fontSize: '1.3em' }}>
                {line.trim()}
              </span>
            )
          }
          if (/^\s+\$/.test(line)) {
            return (
              <span key={li} style={{ display: 'block', textAlign: 'right', width: '100%' }}>
                {line.trimStart()}
              </span>
            )
          }
          return <span key={li} style={{ display: 'block' }}>{line}</span>
        })
        return (
          <React.Fragment key={`frag-${idx}`}>
            {!isFirst && renderSep(idx)}
            <pre style={segStyle}>
              {renderedLines}
            </pre>
          </React.Fragment>
        )
      })}

      <div className="no-print" style={{ marginTop: '24px', display: 'flex', gap: '12px', flexDirection: 'column', alignItems: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '18px 40px',
            fontSize: '24px',
            fontWeight: 'bold',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            width: '100%',
            maxWidth: '300px',
          }}
        >
          🖨️ IMPRIMIR
        </button>
        <button
          onClick={() => { window.location.href = '/pos' }}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: 'white',
            color: '#666',
            border: '1px solid #ccc',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          ← Volver al POS
        </button>
      </div>
    </div>
  )
}
