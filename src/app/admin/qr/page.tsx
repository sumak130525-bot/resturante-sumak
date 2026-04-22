'use client'

import { useState, useRef } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { QRCodeSVG } from 'qrcode.react'
import { Printer, QrCode, Plus, Trash2 } from 'lucide-react'

const BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}`
    : process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

interface QREntry {
  id: number
  mesa: string
  url: string
}

function buildUrl(mesa: string): string {
  if (!mesa.trim()) return BASE_URL
  return `${BASE_URL}?mesa=${encodeURIComponent(mesa.trim())}`
}

export default function AdminQRPage() {
  const [entries, setEntries] = useState<QREntry[]>([
    { id: 1, mesa: '', url: BASE_URL },
  ])
  const [nextId, setNextId] = useState(2)
  const printRef = useRef<HTMLDivElement>(null)

  const handleMesaChange = (id: number, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, mesa: value, url: buildUrl(value) } : e))
    )
  }

  const addEntry = () => {
    setEntries((prev) => [...prev, { id: nextId, mesa: '', url: BASE_URL }])
    setNextId((n) => n + 1)
  }

  const removeEntry = (id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

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
            .qr-grid { display: flex; flex-wrap: wrap; gap: 24px; padding: 24px; }
            .qr-card {
              border: 2px dashed #ccc;
              border-radius: 12px;
              padding: 20px;
              text-align: center;
              width: 200px;
              page-break-inside: avoid;
            }
            .qr-card h3 { font-size: 14px; font-weight: bold; margin-top: 10px; }
            .qr-card p { font-size: 11px; color: #666; margin-top: 4px; word-break: break-all; }
            svg { display: block; margin: 0 auto; }
            @media print {
              @page { margin: 1cm; }
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
          Cada QR apunta a la página pública del menú. Si ingresás un número de mesa,
          el QR incluirá el parámetro <code className="bg-gray-100 px-1 rounded">?mesa=N</code> y
          se mostrará en la página al cliente.
        </p>

        {/* Printable grid */}
        <div ref={printRef} className="qr-grid flex flex-wrap gap-6">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="qr-card bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 text-center w-[220px]"
            >
              <QRCodeSVG
                value={entry.url}
                size={160}
                bgColor="#ffffff"
                fgColor="#3B2B1A"
                level="M"
                includeMargin
              />
              {entry.mesa ? (
                <h3 className="font-bold text-sumak-brown mt-3 text-base">Mesa {entry.mesa}</h3>
              ) : (
                <h3 className="font-bold text-sumak-brown mt-3 text-base">Menú General</h3>
              )}
              <p className="text-[11px] text-gray-400 mt-1 break-all">{entry.url}</p>
            </div>
          ))}
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
                    placeholder="Ej: 1, 2, Terraza…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-gold/50"
                  />
                  <p className="text-[11px] text-gray-400 mt-1 truncate">{entry.url}</p>
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
