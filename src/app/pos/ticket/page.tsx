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
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{ticketText}</pre>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => { window.print() }}
          style={{
            padding: '16px 32px',
            fontSize: '22px',
            fontWeight: 'bold',
            border: '2px solid black',
            background: '#4CAF50',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '8px',
            flex: 1,
          }}
        >
          🖨️ IMPRIMIR
        </button>
        <button
          onClick={() => { window.location.href = '/pos' }}
          style={{
            padding: '16px 24px',
            fontSize: '18px',
            border: '1px solid black',
            background: 'white',
            cursor: 'pointer',
            borderRadius: '8px',
          }}
        >
          ← Volver
        </button>
      </div>
    </div>
  )
}
