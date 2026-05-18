'use client'

import { useEffect, useState } from 'react'

export default function ReceiptPage() {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('pos_receipt_html')
    if (!stored) {
      window.location.href = '/pos'
      return
    }
    setHtml(stored)
    setTimeout(() => window.print(), 400)
  }, [])

  if (html === null) return null

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: white; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 0; size: 72mm auto; }
          body, html { margin: 0; padding: 0; }
        }
      `}</style>
      <div
        style={{ background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', padding: '16px 0' }}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
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
            Imprimir
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
            Volver al POS
          </button>
        </div>
      </div>
    </>
  )
}
