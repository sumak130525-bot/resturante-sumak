'use client'

import { useState, useRef } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { QRCodeSVG } from 'qrcode.react'
import { Printer, QrCode, Plus, Trash2 } from 'lucide-react'

const BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}`
    : process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

const MAPS_URL = 'https://www.google.com/maps/place/SUMAK/@-32.8949139,-68.8292403,19z/data=!4m6!3m5!1s0x967e09a1dd6eefdd:0x698ad41b5908215c!8m2!3d-32.8949528!4d-68.8286573!16s%2Fg%2F11xgssdlt9?entry=ttu&g_ep=EgoyMDI2MDYyNC4wIKXMDSoASAFQAw%3D%3D'

interface QREntry {
  id: number
  mesa: string
}

export default function AdminQRPage() {
  const [entries, setEntries] = useState<QREntry[]>([
    { id: 1, mesa: '1' },
  ])
  const [nextId, setNextId] = useState(2)
  const printRef = useRef<HTMLDivElement>(null)

  const handleMesaChange = (id: number, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, mesa: value } : e))
    )
  }

  const addEntry = () => {
    setEntries((prev) => [...prev, { id: nextId, mesa: String(nextId) }])
    setNextId((n) => n + 1)
  }

  const removeEntry = (id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const getTicketUrl = (mesa: string) => `${BASE_URL}/mesa/${encodeURIComponent(mesa.trim())}`
  const getMenuUrl = () => BASE_URL

  const handlePrint = () => {
    if (!printRef.current) return
    const printContent = printRef.current.innerHTML
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Códigos QR - Sumak Restaurante</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: sans-serif; background: white; }
            .qr-grid { display: flex; flex-wrap: wrap; gap: 24px; padding: 24px; justify-content: center; }
            .qr-card {
              border: 2px solid #3B2B1A;
              border-radius: 16px;
              padding: 20px 16px;
              text-align: center;
              width: 420px;
              page-break-inside: avoid;
            }
            .qr-card h2 { font-size: 22px; font-weight: bold; color: #3B2B1A; margin-bottom: 16px; }
            .qr-row { display: flex; justify-content: center; gap: 16px; }
            .qr-item { text-align: center; }
            .qr-item svg { display: block; margin: 0 auto; }
            .qr-label { font-size: 11px; font-weight: bold; color: #3B2B1A; margin-bottom: 6px; }
            @media print {
              @page { margin: 1cm; }
              .qr-card { break-inside: avoid; }
            }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 500)
  }

  return (
    <AdminLayoutClient active="qr">
      <div>
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <QrCode className="text-sumak-red" size={28} />
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">
              Códigos QR para Mesas
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={addEntry}
              className="flex items-center gap-2 bg-sumak-brown text-sumak-gold font-semibold px-4 py-2 rounded-xl text-sm hover:bg-sumak-brown-mid transition-colors"
            >
              <Plus size={16} />
              Agregar mesa
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-sumak-gold text-sumak-brown font-semibold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition-opacity"
            >
              <Printer size={16} />
              Imprimir todos
            </button>
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-6">
          Cada tarjeta incluye 3 códigos QR: <strong>Ticket digital</strong> de la mesa,
          <strong> Menú</strong> del restaurante y <strong>Google Maps</strong> para compartir ubicación.
          Imprimí y pegá en cada mesa.
        </p>

        {/* Printable grid */}
        <div ref={printRef} className="qr-grid flex flex-wrap gap-6 justify-center">
          {entries.map((entry) => {
            const mesa = entry.mesa.trim()
            if (!mesa) return null
            return (
              <div
                key={entry.id}
                className="qr-card bg-white rounded-2xl border-2 border-sumak-brown p-5 text-center"
                style={{ width: 420 }}
              >
                {/* Nombre de mesa */}
                <h2 className="font-serif text-xl font-bold text-sumak-brown mb-4">
                  Mesa {mesa}
                </h2>

                {/* 3 QR en fila horizontal: Menú, Ticket, Ubicación */}
                <div className="qr-row flex justify-center gap-4">
                  <div className="qr-item text-center">
                    <p className="qr-label text-[11px] font-bold text-sumak-brown mb-2">
                      📋 Menú
                    </p>
                    <QRCodeSVG
                      value={getMenuUrl()}
                      size={110}
                      bgColor="#ffffff"
                      fgColor="#3B2B1A"
                      level="M"
                      includeMargin
                    />
                  </div>
                  <div className="qr-item text-center">
                    <p className="qr-label text-[11px] font-bold text-sumak-brown mb-2">
                      🎫 Ticket
                    </p>
                    <QRCodeSVG
                      value={getTicketUrl(mesa)}
                      size={110}
                      bgColor="#ffffff"
                      fgColor="#3B2B1A"
                      level="M"
                      includeMargin
                    />
                  </div>
                  <div className="qr-item text-center">
                    <p className="qr-label text-[11px] font-bold text-sumak-brown mb-2">
                      📍 Ubicación
                    </p>
                    <QRCodeSVG
                      value={MAPS_URL}
                      size={110}
                      bgColor="#ffffff"
                      fgColor="#3B2B1A"
                      level="M"
                      includeMargin
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Config (not printed) */}
        <div className="mt-8 space-y-4 print:hidden">
          <h2 className="font-serif text-xl font-semibold text-sumak-brown">
            Configurar mesas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm"
              >
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Número de mesa
                  </label>
                  <input
                    type="text"
                    value={entry.mesa}
                    onChange={(e) => handleMesaChange(entry.id, e.target.value)}
                    placeholder="Ej: 1, 2, 3…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-gold/50"
                  />
                </div>
                {entries.length > 1 && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
