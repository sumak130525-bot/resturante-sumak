'use client'

import { useEffect, useState } from 'react'

export default function ReceiptPage() {
  const [html, setHtml] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'printed' | 'fallback'>('loading')
  const [returnTo, setReturnTo] = useState('/pos')

  useEffect(() => {
    const stored = sessionStorage.getItem('pos_receipt_html')
    const thermalText = sessionStorage.getItem('pos_receipt_thermal')
    const returnPath = sessionStorage.getItem('pos_receipt_return') || '/pos'
    setReturnTo(returnPath)

    if (!stored && !thermalText) {
      window.location.href = '/pos'
      return
    }

    if (stored) setHtml(stored)

    // Intentar imprimir por térmica primero
    if (thermalText) {
      tryThermalPrint(thermalText).then((ok) => {
        if (ok) {
          setStatus('printed')
          // Limpiar
          sessionStorage.removeItem('pos_receipt_thermal')
          sessionStorage.removeItem('pos_receipt_html')
          sessionStorage.removeItem('pos_receipt_return')
        } else if (stored) {
          setStatus('fallback')
          setTimeout(() => window.print(), 400)
        } else {
          setStatus('fallback')
        }
      })
    } else if (stored) {
      setStatus('fallback')
      setTimeout(() => window.print(), 400)
    }
  }, [])

  if (status === 'printed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', fontFamily: 'system-ui' }}>
        <div style={{ fontSize: '48px' }}>✓</div>
        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a' }}>Recibo impreso</p>
        <button
          onClick={() => { window.location.href = returnTo }}
          style={{ padding: '14px 32px', fontSize: '16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', marginTop: '8px' }}
        >
          Volver
        </button>
      </div>
    )
  }

  if (html === null && status === 'loading') return null

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
        {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
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
            onClick={() => { window.location.href = returnTo }}
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
            Volver
          </button>
        </div>
      </div>
    </>
  )
}

async function tryThermalPrint(text: string): Promise<boolean> {
  try {
    const settingsRes = await fetch('/api/admin/settings?key=print_server_url')
    if (!settingsRes.ok) return false
    const data = await settingsRes.json()
    const url = Array.isArray(data) && data[0]?.value ? data[0].value as string : null
    if (!url) return false

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${url}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, cut: true, feedLines: 3, config: {} }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
