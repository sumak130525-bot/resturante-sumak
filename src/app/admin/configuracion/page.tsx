'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Settings, Upload, Trash2, Image as ImageIcon, RefreshCw } from 'lucide-react'

export default function AdminConfiguracionPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchLogo = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/settings?key=ticket_logo')
    if (res.ok) {
      const data = await res.json()
      setLogoUrl(data[0]?.value ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogo() }, [fetchLogo])

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  // ── Subir logo ─────────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes (PNG, JPG, SVG…)')
      return
    }
    setError(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/admin/upload-logo', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al subir el logo')
    } else {
      setLogoUrl(data.url)
      showSuccess('Logo actualizado correctamente')
    }
    setUploading(false)
    // Reset input para poder subir la misma imagen de nuevo si fuese necesario
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Eliminar logo ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm('¿Eliminar el logo del ticket?')) return
    setDeleting(true)
    setError(null)
    const res = await fetch('/api/admin/upload-logo', { method: 'DELETE' })
    if (res.ok) {
      setLogoUrl(null)
      showSuccess('Logo eliminado')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Error al eliminar el logo')
    }
    setDeleting(false)
  }

  return (
    <AdminLayoutClient active="configuracion">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
            <Settings size={20} className="text-sumak-brown" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-sumak-brown">Configuración</h1>
        </div>

        {/* Feedback */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
            {success}
          </div>
        )}

        {/* Sección: Logo del ticket */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Logo para ticket de impresión</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            {/* Preview del logo actual */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">Logo actual</p>
              {loading ? (
                <div className="w-40 h-40 rounded-xl bg-gray-100 animate-pulse" />
              ) : logoUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Logo del ticket"
                    className="w-40 h-40 object-contain rounded-xl border border-gray-200 bg-gray-50 p-2"
                  />
                </div>
              ) : (
                <div className="w-40 h-40 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <ImageIcon size={28} className="opacity-40" />
                  <span className="text-xs">Sin logo</span>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap gap-3">
              {/* Input oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
              >
                <Upload size={15} />
                {uploading ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
              </button>

              {logoUrl && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 border border-red-200 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={15} />
                  {deleting ? 'Eliminando...' : 'Eliminar logo'}
                </button>
              )}

              <button
                onClick={fetchLogo}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red border border-gray-200 rounded-xl px-3 py-2.5 transition-colors"
              >
                <RefreshCw size={14} />
                Actualizar
              </button>
            </div>

            <p className="text-xs text-gray-400">
              El logo se mostrará en los tickets de impresión del POS. Se recomienda una imagen cuadrada en PNG o SVG, fondo transparente.
            </p>
          </div>
        </section>
      </div>
    </AdminLayoutClient>
  )
}
