'use client'

import { useEffect, useState } from 'react'

export default function TicketPage() {
  const [ticketText, setTicketText] = useState<string | null>(null)

  useEffect(() => {
    const text = sessionStorage.getItem('pos_ticket')
    if (!text) {
      window.location.href = '/pos'
      return
    }
    setTicketText(text)
    const timer = setTimeout(() => {
      window.print()
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  if (ticketText === null) return null

  return (
    <div
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '12px',
        lineHeight: '1.4',
        width: '80mm',
        padding: '2mm',
        color: 'black',
        background: 'white',
      }}
    >
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {ticketText}
      </pre>
      <br />
      <br />
      <button
        onClick={() => { window.location.href = '/pos' }}
        style={{
          padding: '12px 24px',
          fontSize: '18px',
          border: '1px solid black',
          background: 'white',
          cursor: 'pointer',
        }}
      >
        &larr; Volver al POS
      </button>
    </div>
  )
}
