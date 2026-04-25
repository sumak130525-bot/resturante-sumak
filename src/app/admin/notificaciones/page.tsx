'use client'

import { useState, useEffect } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Bell, Send, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NotificacionesPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; sent?: number; message?: string } | null>(null)
  const [subscribers, setSubscribers] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/push/send')
      .then((r) => r.json())
      .then((d) => setSubscribers(d.count ?? 0))
      .catch(() => setSubscribers(0))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim() || undefined }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({ ok: false, message: data.error || 'Error al enviar' })
      } else {
        setResult({ ok: true, sent: data.sent, message: `Notificación enviada a ${data.sent} suscriptor(es)` })
        // Actualizar contador
        setSubscribers((prev) => (prev !== null ? prev - (data.removed ?? 0) : prev))
      }
    } catch {
      setResult({ ok: false, message: 'Error de red al enviar' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayoutClient active="notificaciones">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-sumak-gold" />
            Notificaciones Push
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Enviá ofertas y novedades a los clientes suscriptos
          </p>
        </div>

        {/* Suscriptores */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-sumak-gold/10 rounded-xl flex items-center justify-center">
            <Users size={22} className="text-sumak-gold" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Suscriptores activos</p>
            <p className="text-2xl font-bold text-gray-900">
              {subscribers === null ? '...' : subscribers}
            </p>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Nueva notificación</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: 50% en platos del día"
                required
                maxLength={80}
                className={cn(
                  'w-full px-4 py-2.5 rounded-xl border border-gray-200',
                  'text-sm text-gray-900 placeholder:text-gray-400',
                  'focus:outline-none focus:ring-2 focus:ring-sumak-gold/40 focus:border-sumak-gold',
                  'transition-all'
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje <span className="text-red-500">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ej: Hoy y mañana todos los platos principales con 50% de descuento"
                required
                maxLength={200}
                rows={3}
                className={cn(
                  'w-full px-4 py-2.5 rounded-xl border border-gray-200 resize-none',
                  'text-sm text-gray-900 placeholder:text-gray-400',
                  'focus:outline-none focus:ring-2 focus:ring-sumak-gold/40 focus:border-sumak-gold',
                  'transition-all'
                )}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/200</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL destino <span className="text-gray-400 text-xs">(opcional)</span>
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://restaurante-sumak.vercel.app"
                className={cn(
                  'w-full px-4 py-2.5 rounded-xl border border-gray-200',
                  'text-sm text-gray-900 placeholder:text-gray-400',
                  'focus:outline-none focus:ring-2 focus:ring-sumak-gold/40 focus:border-sumak-gold',
                  'transition-all'
                )}
              />
            </div>

            {/* Resultado */}
            {result && (
              <div
                className={cn(
                  'px-4 py-3 rounded-xl text-sm font-medium',
                  result.ok
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                )}
              >
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !title.trim() || !body.trim()}
              className={cn(
                'w-full flex items-center justify-center gap-2',
                'px-6 py-3 rounded-xl font-semibold text-sm',
                'bg-sumak-gold text-sumak-brown',
                'hover:opacity-90 active:scale-[0.98] transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Send size={16} />
              {loading ? 'Enviando...' : 'Enviar notificación'}
            </button>
          </form>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
