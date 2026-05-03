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
    // Auto-print after a short delay to let content render
    setTimeout(() => window.print(), 300)
  }, [])

  if (ticketText === null) return null

  return (
    <div style={{ background: 'white', margin: 0, padding: 0, minHeight: '100vh' }}>
      <style>{`@page { margin: 0; padding: 0; } @media print { .no-print { display: none !important; } body, html { margin: 0; padding: 0; } }`}</style>
      <pre style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '16px',
        fontWeight: 'bold',
        lineHeight: '1.5',
        color: 'black',
        margin: 0,
        whiteSpace: 'pre',
      }}>{ticketText}</pre>

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
