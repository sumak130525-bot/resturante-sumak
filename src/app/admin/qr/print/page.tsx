'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import html2canvas from 'html2canvas'

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://restaurante-sumak.vercel.app'
const MAPS_URL = 'https://www.google.com/maps/place/SUMAK/@-32.8949139,-68.8292403,19z/data=!4m6!3m5!1s0x967e09a1dd6eefdd:0x698ad41b5908215c!8m2!3d-32.8949528!4d-68.8286573!16s%2Fg%2F11xgssdlt9?entry=ttu&g_ep=EgoyMDI2MDYyNC4wIKXMDSoASAFQAw%3D%3D'

const TOTAL_MESAS = 20

// SVG icons matching the reference design
function MenuIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#2D5A27" />
      <path d="M14 30h20M16 28c0-6 3.5-10 8-10s8 4 8 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="16" r="1.5" fill="white" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="4" width="40" height="40" rx="6" fill="#2A2A2A" />
      <rect x="12" y="10" width="24" height="28" rx="3" stroke="white" strokeWidth="2" fill="none" />
      <line x1="16" y1="17" x2="32" y2="17" stroke="white" strokeWidth="1.5" />
      <line x1="16" y1="21" x2="32" y2="21" stroke="white" strokeWidth="1.5" />
      <line x1="16" y1="25" x2="28" y2="25" stroke="white" strokeWidth="1.5" />
      <line x1="16" y1="29" x2="26" y2="29" stroke="white" strokeWidth="1.5" />
      <line x1="12" y1="33" x2="36" y2="33" stroke="white" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M24 4C16.268 4 10 10.268 10 18c0 10.5 14 26 14 26s14-15.5 14-26c0-7.732-6.268-14-14-14z" fill="#B91C1C" />
      <circle cx="24" cy="18" r="6" fill="white" />
    </svg>
  )
}

function MesaCard({ mesa }: { mesa: number }) {
  const menuUrl = BASE_URL
  const ticketUrl = `${BASE_URL}/mesa/${mesa}`
  const mapsUrl = MAPS_URL

  return (
    <div
      className="mesa-card"
      style={{
        border: '2px dashed #999',
        borderRadius: 12,
        padding: '16px 12px 12px',
        width: 340,
        height: 220,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'white',
      }}
    >
      {/* Mesa number */}
      <div style={{ fontSize: 14, fontWeight: 800, color: '#222', marginBottom: 8, letterSpacing: 1 }}>
        MESA {mesa}
      </div>

      {/* Icons row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 50, marginBottom: 6 }}>
        <MenuIcon />
        <TicketIcon />
        <LocationIcon />
      </div>

      {/* QR codes row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ textAlign: 'center' }}>
          <QRCodeSVG value={menuUrl} size={90} bgColor="#ffffff" fgColor="#000000" level="M" />
          <div style={{ fontSize: 8, fontWeight: 700, color: '#444', marginTop: 2 }}>MENÚ</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <QRCodeSVG value={ticketUrl} size={90} bgColor="#ffffff" fgColor="#000000" level="M" />
          <div style={{ fontSize: 8, fontWeight: 700, color: '#444', marginTop: 2 }}>TICKET</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <QRCodeSVG value={mapsUrl} size={90} bgColor="#ffffff" fgColor="#000000" level="M" />
          <div style={{ fontSize: 8, fontWeight: 700, color: '#444', marginTop: 2 }}>UBICACIÓN</div>
        </div>
      </div>
    </div>
  )
}

export default function QRPrintPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Wait for QR codes to render
    setTimeout(() => setReady(true), 1000)
  }, [])

  const downloadImage = async () => {
    if (!containerRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(containerRef.current, {
        scale: 3, // High quality
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = 'QR-Mesas-Sumak.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('Error generating image:', e)
    } finally {
      setDownloading(false)
    }
  }

  const mesas = Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1)

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: 20 }}>
      {/* Controls */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 12 }}>
          QR Mesas — Sumak Restaurante
        </h1>
        <button
          onClick={downloadImage}
          disabled={downloading || !ready}
          style={{
            background: downloading ? '#999' : '#2D5A27',
            color: 'white',
            border: 'none',
            padding: '12px 32px',
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 'bold',
            cursor: downloading ? 'not-allowed' : 'pointer',
          }}
        >
          {downloading ? 'Generando...' : ready ? '⬇️ Descargar Imagen PNG' : 'Cargando QR...'}
        </button>
      </div>

      {/* Printable area */}
      <div
        ref={containerRef}
        style={{
          background: 'white',
          width: 740,
          margin: '0 auto',
          padding: '20px 16px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            justifyItems: 'center',
          }}
        >
          {mesas.map((mesa) => (
            <MesaCard key={mesa} mesa={mesa} />
          ))}
        </div>
      </div>
    </div>
  )
}
