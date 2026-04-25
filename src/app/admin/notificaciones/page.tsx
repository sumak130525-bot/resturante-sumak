'use client'

import { useState, useEffect, useRef } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Bell, Send, Users, Image as ImageIcon, ChevronDown, Clock, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string
  title: string
  body: string
  image?: string
  url?: string
  sent: number
  sentAt: string
}

interface MenuItem {
  id: string
  name: string
  image_url: string | null
  category?: string
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    label: '🔥 Oferta del día',
    title: '🔥 Oferta del día',
    body: 'Hoy tenemos [plato] a precio especial. ¡Vení y aprovechá!',
  },
  {
    label: '🆕 Nuevo en el menú',
    title: '🆕 Nuevo en el menú',
    body: 'Probá nuestro nuevo [plato]. ¡Te va a encantar!',
  },
  {
    label: '🎉 Promoción especial',
    title: '🎉 Promoción especial',
    body: '2x1 en [categoría] hasta las [hora]. ¡No te lo pierdas!',
  },
]

// ─── Supabase anon client (solo para leer platos) ─────────────────────────────

function getSupabaseAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; sent?: number; message?: string } | null>(null)
  const [subscribers, setSubscribers] = useState<number | null>(null)

  // Templates dropdown
  const [templateOpen, setTemplateOpen] = useState(false)
  const templateRef = useRef<HTMLDivElement>(null)

  // Menu items for image picker
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // ── Load subscriber count ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/push/send')
      .then((r) => r.json())
      .then((d) => setSubscribers(d.count ?? 0))
      .catch(() => setSubscribers(0))
  }, [])

  // ── Load menu items ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseAnonClient()
    supabase
      .from('menu_items')
      .select('id, name, image_url, category')
      .order('name')
      .then(({ data }) => {
        if (data) setMenuItems(data as MenuItem[])
      }, () => {})
  }, [])

  // ── Load history from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sumak-push-history')
      if (stored) setHistory(JSON.parse(stored) as HistoryEntry[])
    } catch {}
  }, [])

  // ── Close dropdowns on outside click ────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setTemplateOpen(false)
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title)
    setBody(t.body)
    setTemplateOpen(false)
  }

  function pickMenuImage(item: MenuItem) {
    if (item.image_url) setImageUrl(item.image_url)
    setMenuOpen(false)
  }

  function saveToHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 20) // keep last 20
      try {
        localStorage.setItem('sumak-push-history', JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  function clearHistory() {
    setHistory([])
    try { localStorage.removeItem('sumak-push-history') } catch {}
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
          image: imageUrl.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({ ok: false, message: data.error || 'Error al enviar' })
      } else {
        const sentCount: number = data.sent ?? 0
        setResult({ ok: true, sent: sentCount, message: `Notificación enviada a ${sentCount} suscriptor(es)` })
        setSubscribers((prev) => (prev !== null ? prev - (data.removed ?? 0) : prev))
        saveToHistory({
          id: Date.now().toString(),
          title: title.trim(),
          body: body.trim(),
          image: imageUrl.trim() || undefined,
          url: url.trim() || undefined,
          sent: sentCount,
          sentAt: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
        })
      }
    } catch {
      setResult({ ok: false, message: 'Error de red al enviar' })
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const inputCls = cn(
    'w-full px-4 py-2.5 rounded-xl border border-gray-200',
    'text-sm text-gray-900 placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-sumak-gold/40 focus:border-sumak-gold',
    'transition-all'
  )

  return (
    <AdminLayoutClient active="notificaciones">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-sumak-gold" />
            Notificaciones Push
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Enviá ofertas y novedades a los clientes suscriptos
          </p>
        </div>

        {/* ── Suscriptores ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-sumak-gold/10 rounded-xl flex items-center justify-center">
            <Users size={26} className="text-sumak-gold" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Suscriptores activos</p>
            <p className="text-3xl font-extrabold text-gray-900">
              {subscribers === null ? '...' : subscribers}
            </p>
          </div>
          {subscribers !== null && subscribers > 0 && (
            <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-3 py-1 rounded-full">
              {subscribers} activo{subscribers !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Formulario ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Nueva notificación</h2>

            {/* Templates dropdown */}
            <div className="relative" ref={templateRef}>
              <button
                type="button"
                onClick={() => setTemplateOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-sumak-gold/10 text-sumak-brown hover:bg-sumak-gold/20 transition-colors'
                )}
              >
                Plantillas <ChevronDown size={13} />
              </button>
              {templateOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[240px] py-1">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                    >
                      <p className="font-medium text-gray-800">{t.label}</p>
                      <p className="text-xs text-gray-400 truncate">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Título */}
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
                className={inputCls}
              />
            </div>

            {/* Mensaje */}
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
                className={cn(inputCls, 'resize-none')}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/200</p>
            </div>

            {/* Imagen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <ImageIcon size={14} />
                Imagen <span className="text-gray-400 text-xs">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... (URL de imagen)"
                  className={cn(inputCls, 'flex-1')}
                />
                {/* Menu image picker */}
                {menuItems.length > 0 && (
                  <div className="relative shrink-0" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen((o) => !o)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-medium',
                        'bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap'
                      )}
                    >
                      Del menú <ChevronDown size={12} />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-56 max-h-64 overflow-y-auto py-1">
                        {menuItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => pickMenuImage(item)}
                            disabled={!item.image_url}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                              item.image_url
                                ? 'hover:bg-gray-50 text-gray-800'
                                : 'text-gray-300 cursor-not-allowed'
                            )}
                          >
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                            )}
                            <span className="truncate">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Image preview */}
              {imageUrl.trim() && (
                <div className="mt-2 relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl.trim()}
                    alt="Preview"
                    className="h-24 rounded-xl object-cover border border-gray-200"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* URL destino */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL destino <span className="text-gray-400 text-xs">(opcional)</span>
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://restaurante-sumak.vercel.app"
                className={inputCls}
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

        {/* ── Historial ── */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock size={16} className="text-gray-400" />
                Últimas enviadas
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} /> Limpiar
              </button>
            </div>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  {h.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{h.title}</p>
                    <p className="text-xs text-gray-500 truncate">{h.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-emerald-600">{h.sent} env.</p>
                    <p className="text-xs text-gray-400">{h.sentAt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AdminLayoutClient>
  )
}
