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
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#DC2626" />
      <path d="M14 30h20M16 28c0-6 3.5-10 8-10s8 4 8 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M24 18v-4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#EAB308" />
      <path d="M20 14l8 0M15 20l18 0M15 26l18 0M15 32l12 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <polygon points="24,10 26.5,17 34,17 28,21.5 30,29 24,24.5 18,29 20,21.5 14,17 21.5,17" fill="white" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#16A34A" />
      <rect x="13" y="10" width="22" height="28" rx="2" stroke="white" strokeWidth="2" fill="none" />
      <line x1="17" y1="16" x2="31" y2="16" stroke="white" strokeWidth="1.5" />
      <line x1="17" y1="20" x2="31" y2="20" stroke="white" strokeWidth="1.5" />
      <line x1="17" y1="24" x2="31" y2="24" stroke="white" strokeWidth="1.5" />
      <line x1="13" y1="30" x2="35" y2="30" stroke="white" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="17" y1="34" x2="31" y2="34" stroke="white" strokeWidth="1.5" />
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
        border: '1.5px solid #ccc',
        borderRadius: 8,
        padding: '8px 10px 6px',
        width: 350,
        height: 175,
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        position: 'relative',
      }}
    >
      {/* Mesa number top-left */}
      <div style={{ fontSize: 18, fontWeight: 900, color: '#111', marginBottom: 2 }}>
        {mesa}
      </div>

      {/* Icons + QR codes */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flex: 1, alignItems: 'flex-start' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}><MenuIcon /></div>
          <QRCodeSVG value={menuUrl} size={110} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}><TicketIcon /></div>
          <QRCodeSVG value={ticketUrl} size={110} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}><LocationIcon /></div>
          <QRCodeSVG value={mapsUrl} size={110} bgColor="#ffffff" fgColor="#000000" level="M" />
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
          width: 760,
          margin: '0 auto',
          padding: '16px 12px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
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
