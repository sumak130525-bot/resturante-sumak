'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Settings, Upload, Trash2, Image as ImageIcon, RefreshCw } from 'lucide-react'
import { type TicketConfig, DEFAULT_TICKET_CONFIG } from '@/types/ticket-config'

export default function AdminConfiguracionPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Languages enabled toggle ───────────────────────────────────────────────
  const [languagesEnabled, setLanguagesEnabled] = useState(false)
  const [langLoading, setLangLoading] = useState(true)
  const [langSaving, setLangSaving] = useState(false)

  // ── Print server URL ───────────────────────────────────────────────────────
  const [printServerUrl, setPrintServerUrl] = useState('http://192.168.100.77:4000')
  const [printServerLoading, setPrintServerLoading] = useState(true)
  const [printServerSaving, setPrintServerSaving] = useState(false)
  const [printServerTesting, setPrintServerTesting] = useState(false)
  const [printServerStatus, setPrintServerStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')

  // ── Grid settings ──────────────────────────────────────────────────────────
  const [gridCols, setGridCols] = useState(6)
  const [gridRows, setGridRows] = useState(16)
  const [gridLoading, setGridLoading] = useState(true)
  const [gridSaving, setGridSaving] = useState(false)

  // ── Propina sugerida ───────────────────────────────────────────────────────
  const [tipEnabled, setTipEnabled] = useState(false)
  const [tipPercentages, setTipPercentages] = useState('10,15,20')
  const [tipLoading, setTipLoading] = useState(true)
  const [tipSaving, setTipSaving] = useState(false)

  // ── PIN cocina ─────────────────────────────────────────────────────────────
  const [cocinaPinRequired, setCocinaPinRequired] = useState(false)
  const [cocinaPinLoading, setCocinaPinLoading] = useState(true)
  const [cocinaPinSaving, setCocinaPinSaving] = useState(false)

  // ── Ticket config ──────────────────────────────────────────────────────────
  const [ticketConfig, setTicketConfig] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG)
  const [ticketConfigLoading, setTicketConfigLoading] = useState(true)
  const [ticketConfigSaving, setTicketConfigSaving] = useState(false)

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

  // Fetch languages_enabled on mount
  useEffect(() => {
    fetch('/api/settings/languages')
      .then((r) => r.json())
      .then((d) => {
        setLanguagesEnabled(d.enabled === true)
        setLangLoading(false)
      })
      .catch(() => setLangLoading(false))
  }, [])

  // Fetch print_server_url on mount
  useEffect(() => {
    fetch('/api/admin/settings?key=print_server_url')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        if (d[0]?.value) setPrintServerUrl(d[0].value)
        setPrintServerLoading(false)
      })
      .catch(() => setPrintServerLoading(false))
  }, [])

  // Fetch ticket config on mount
  useEffect(() => {
    fetch('/api/settings/ticket-config')
      .then((r) => r.json())
      .then((d) => {
        setTicketConfig({ ...DEFAULT_TICKET_CONFIG, ...d })
        setTicketConfigLoading(false)
      })
      .catch(() => setTicketConfigLoading(false))
  }, [])

  // Fetch grid settings on mount
  useEffect(() => {
    fetch('/api/admin/settings?key=grid_cols')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        const cols = d[0]?.value ? parseInt(d[0].value, 10) : 6
        if (!isNaN(cols)) setGridCols(cols)
      })
      .catch(() => {})
    fetch('/api/admin/settings?key=grid_rows')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        const rows = d[0]?.value ? parseInt(d[0].value, 10) : 16
        if (!isNaN(rows)) setGridRows(rows)
        setGridLoading(false)
      })
      .catch(() => setGridLoading(false))
  }, [])

  // Fetch tip + cocina PIN settings on mount
  useEffect(() => {
    fetch('/api/admin/settings?prefix=tip_suggestion')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        const enabled = d.find((s) => s.key === 'tip_suggestion_enabled')
        const pcts = d.find((s) => s.key === 'tip_suggestion_percentages')
        if (enabled) setTipEnabled(enabled.value === 'true')
        if (pcts) setTipPercentages(pcts.value)
        setTipLoading(false)
      })
      .catch(() => setTipLoading(false))

    fetch('/api/admin/settings?key=cocina_pin_required')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        setCocinaPinRequired(d[0]?.value === 'true')
        setCocinaPinLoading(false)
      })
      .catch(() => setCocinaPinLoading(false))
  }, [])

  const handleSaveTip = async () => {
    setTipSaving(true)
    setError(null)
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'tip_suggestion_enabled', value: String(tipEnabled) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'tip_suggestion_percentages', value: tipPercentages }),
        }),
      ])
      setSuccess('Configuración de propina guardada')
    } catch {
      setError('Error al guardar configuración de propina')
    } finally {
      setTipSaving(false)
    }
  }

  const handleSaveCocinaPIN = async () => {
    setCocinaPinSaving(true)
    setError(null)
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'cocina_pin_required', value: String(cocinaPinRequired) }),
      })
      setSuccess('Configuración de cocina guardada')
    } catch {
      setError('Error al guardar configuración de cocina')
    } finally {
      setCocinaPinSaving(false)
    }
  }



  const handleSaveGrid = async () => {
    setGridSaving(true)
    setError(null)
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'grid_cols', value: String(gridCols) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'grid_rows', value: String(gridRows) }),
        }),
      ])
      showSuccess('Configuración de grilla guardada')
    } catch {
      setError('Error al guardar configuración de grilla')
    }
    setGridSaving(false)
  }

  const handleSavePrintServer = async () => {
    setPrintServerSaving(true)
    setError(null)
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'print_server_url', value: printServerUrl.trim() }),
      })
      showSuccess('URL del servidor de impresión guardada')
      setPrintServerStatus('unknown')
    } catch {
      setError('Error al guardar URL del servidor de impresión')
    }
    setPrintServerSaving(false)
  }

  const handleTestPrintServer = async () => {
    setPrintServerTesting(true)
    setPrintServerStatus('unknown')
    try {
      const url = printServerUrl.trim().replace(/\/$/, '')
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
      setPrintServerStatus(res.ok ? 'ok' : 'error')
    } catch {
      setPrintServerStatus('error')
    }
    setPrintServerTesting(false)
  }

  const handleToggleLanguages = async (value: boolean) => {
    setLangSaving(true)
    const res = await fetch('/api/settings/languages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: value }),
    })
    if (res.ok) {
      setLanguagesEnabled(value)
      showSuccess(value ? 'Selector de idiomas habilitado' : 'Selector de idiomas deshabilitado')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al guardar configuración')
    }
    setLangSaving(false)
  }

  const handleSaveTicketConfig = async () => {
    setTicketConfigSaving(true)
    setError(null)
    const res = await fetch('/api/settings/ticket-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketConfig),
    })
    if (res.ok) {
      showSuccess('Configuración de ticket guardada')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al guardar configuración de ticket')
    }
    setTicketConfigSaving(false)
  }

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

  const inputClass = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  // Reusable toggle component
  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        value ? 'bg-sumak-brown' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )

  // Reusable toggle row
  const ToggleRow = ({
    label,
    desc,
    value,
    onChange,
  }: {
    label: string
    desc?: string | null
    value: boolean
    onChange: (v: boolean) => void
  }) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )

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

        {/* Sección: Idiomas */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Idiomas</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">Habilitar selector de idiomas</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Cuando está deshabilitado, todos los menús usan español y ocultan el selector de idioma.
                </p>
              </div>
              <button
                onClick={() => handleToggleLanguages(!languagesEnabled)}
                disabled={langLoading || langSaving}
                aria-pressed={languagesEnabled}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                  languagesEnabled ? 'bg-sumak-brown' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                    languagesEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Sección: Servidor de impresión */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Servidor de impresión local</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            {printServerLoading ? (
              <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  URL del print-server corriendo en la PC local. El POS intentará imprimir directo; si no está disponible, usará el flujo habitual (ventana del navegador).
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="flex-1">
                    <label className={labelClass}>URL del print-server</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={printServerUrl}
                      onChange={(e) => setPrintServerUrl(e.target.value)}
                      placeholder="http://192.168.100.77:4000"
                    />
                  </div>
                </div>
                {printServerStatus === 'ok' && (
                  <p className="text-xs text-green-600 font-semibold">✓ Servidor disponible</p>
                )}
                {printServerStatus === 'error' && (
                  <p className="text-xs text-red-500 font-semibold">✕ No se pudo conectar al servidor</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSavePrintServer}
                    disabled={printServerSaving}
                    className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
                  >
                    {printServerSaving ? 'Guardando...' : 'Guardar URL'}
                  </button>
                  <button
                    onClick={handleTestPrintServer}
                    disabled={printServerTesting}
                    className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {printServerTesting ? 'Probando...' : 'Probar conexión'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

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

        {/* Sección: Configuración del ticket impreso */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Configuración del ticket impreso</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-7">
            {ticketConfigLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* ── Ancho ──────────────────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Ancho en caracteres</label>
                    <select
                      className={inputClass}
                      value={ticketConfig.width}
                      onChange={(e) => setTicketConfig((c) => ({ ...c, width: Number(e.target.value) }))}
                    >
                      <option value={22}>22 — Térmica 58mm</option>
                      <option value={32}>32 — Térmica 80mm</option>
                    </select>
                  </div>
                </div>

                {/* ── Márgenes ──────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Márgenes</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className={labelClass}>Izquierdo (mm)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.marginLeft}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, marginLeft: Number(e.target.value) }))}
                      >
                        {[0, 2, 4, 6, 8].map((v) => <option key={v} value={v}>{v} mm</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Derecho (mm)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.marginRight}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, marginRight: Number(e.target.value) }))}
                      >
                        {[0, 2, 4, 6, 8].map((v) => <option key={v} value={v}>{v} mm</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Superior (mm)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.marginTop}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, marginTop: Number(e.target.value) }))}
                      >
                        {[0, 2, 4, 6, 8].map((v) => <option key={v} value={v}>{v} mm</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Inferior (mm)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.marginBottom}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, marginBottom: Number(e.target.value) }))}
                      >
                        {[0, 4, 8, 12, 16].map((v) => <option key={v} value={v}>{v} mm</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── Tipografía ─────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipografía</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Familia tipográfica</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.fontFamily}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, fontFamily: e.target.value }))}
                      >
                        <option value="monospace">Monoespaciada (Courier)</option>
                        <option value="sans-serif">Sans-serif (Arial)</option>
                        <option value="serif">Serif (Times)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Tamaño de fuente</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.fontSize}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, fontSize: e.target.value }))}
                      >
                        <option value="10px">Chico (10px)</option>
                        <option value="12px">Normal (12px)</option>
                        <option value="14px">Grande (14px)</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    <ToggleRow
                      label="Encabezado en negrita"
                      value={ticketConfig.headerBold}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, headerBold: v }))}
                    />
                    <ToggleRow
                      label="Total en negrita"
                      value={ticketConfig.totalBold}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, totalBold: v }))}
                    />
                    <ToggleRow
                      label="Items en negrita"
                      desc="Reservado para impresoras ESC/POS con soporte de negrita por línea."
                      value={ticketConfig.itemsBold}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, itemsBold: v }))}
                    />
                  </div>
                </div>

                {/* ── Espaciado ──────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Espaciado</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Espaciado entre líneas (px)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.lineSpacing}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, lineSpacing: Number(e.target.value) }))}
                      >
                        <option value={0}>0px — Sin extra</option>
                        <option value={2}>2px — Compacto</option>
                        <option value={4}>4px — Normal</option>
                        <option value={6}>6px — Amplio</option>
                        <option value={8}>8px — Extra amplio</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Espacio extra entre items</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.itemSpacing}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, itemSpacing: Number(e.target.value) }))}
                      >
                        <option value={0}>0 — Sin espacio extra</option>
                        <option value={2}>2px — Pequeño</option>
                        <option value={4}>4px — Normal</option>
                        <option value={6}>6px — Grande</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Espacio entre secciones (px)</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.sectionSpacing}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, sectionSpacing: Number(e.target.value) }))}
                      >
                        <option value={2}>2px — Compacto</option>
                        <option value={4}>4px — Normal</option>
                        <option value={6}>6px — Amplio</option>
                        <option value={8}>8px — Extra amplio</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── Separadores ────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Separadores</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className={labelClass}>Carácter separador</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.separator}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, separator: e.target.value }))}
                      >
                        <option value="-">Guiones (------)</option>
                        <option value="*">Asteriscos (******)</option>
                        <option value=".">Puntos (...........)</option>
                        <option value="=">Igual (======)</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <ToggleRow
                      label="Separador ancho completo"
                      desc="El separador ocupa todo el ancho del papel ignorando los márgenes."
                      value={ticketConfig.separatorFullWidth}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, separatorFullWidth: v }))}
                    />
                    <ToggleRow
                      label="Separador doble"
                      desc="Repite la línea separadora dos veces."
                      value={ticketConfig.separatorDouble}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, separatorDouble: v }))}
                    />
                  </div>
                </div>

                {/* ── Contenido ──────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contenido</p>
                  <div className="space-y-3">
                    <ToggleRow
                      label="Mostrar logo"
                      desc="Si no hay logo cargado, no se mostrará nada."
                      value={ticketConfig.showLogo}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showLogo: v }))}
                    />
                    <ToggleRow
                      label="Mostrar número de pedido"
                      value={ticketConfig.showOrderNumber}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showOrderNumber: v }))}
                    />
                    <ToggleRow
                      label="Mostrar fecha y hora"
                      value={ticketConfig.showDate}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showDate: v }))}
                    />
                    <ToggleRow
                      label="Mostrar número de mesa"
                      value={ticketConfig.showTableNumber}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showTableNumber: v }))}
                    />
                    <ToggleRow
                      label="Mostrar modalidad"
                      desc="Comer dentro / Para llevar."
                      value={ticketConfig.showDiningOption}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showDiningOption: v }))}
                    />
                    <ToggleRow
                      label="Mostrar método de pago"
                      value={ticketConfig.showPaymentMethod}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showPaymentMethod: v }))}
                    />
                    <ToggleRow
                      label="Mostrar nombre del cliente"
                      value={ticketConfig.showCustomerName}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showCustomerName: v }))}
                    />
                    <ToggleRow
                      label="Mostrar cantidad de personas"
                      value={ticketConfig.showPersons}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showPersons: v }))}
                    />
                    <ToggleRow
                      label="Agrupar items por persona (P1, P2…)"
                      desc="Cuando el pedido tiene más de una persona, agrupa los items bajo cada etiqueta."
                      value={ticketConfig.showPersonDetail}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showPersonDetail: v }))}
                    />
                    <ToggleRow
                      label="Mostrar nota del pedido"
                      value={ticketConfig.showOrderNote}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, showOrderNote: v }))}
                    />
                  </div>
                </div>

                {/* ── Textos ─────────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Textos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Encabezado línea 1</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={ticketConfig.header1}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, header1: e.target.value }))}
                        placeholder="SUMAK"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Encabezado línea 2</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={ticketConfig.header2}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, header2: e.target.value }))}
                        placeholder="Restaurante"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Pie del ticket línea 1</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={ticketConfig.footer1}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, footer1: e.target.value }))}
                        placeholder="Gracias por su visita!"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Pie del ticket línea 2</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={ticketConfig.footer2}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, footer2: e.target.value }))}
                        placeholder="Restaurante Sumak"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Impresión ──────────────────────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Impresión</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                    <div>
                      <label className={labelClass}>Líneas vacías antes del corte</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.feedLinesBeforeCut}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, feedLinesBeforeCut: Number(e.target.value) }))}
                      >
                        {[0, 1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} {v === 3 ? '(defecto)' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Alineación del encabezado</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.headerAlign}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, headerAlign: e.target.value as 'center' | 'left' }))}
                      >
                        <option value="center">Centro</option>
                        <option value="left">Izquierda</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Alineación del pie</label>
                      <select
                        className={inputClass}
                        value={ticketConfig.footerAlign}
                        onChange={(e) => setTicketConfig((c) => ({ ...c, footerAlign: e.target.value as 'center' | 'left' }))}
                      >
                        <option value="center">Centro</option>
                        <option value="left">Izquierda</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <ToggleRow
                      label="Corte automático"
                      desc="Envía comando de corte automático a la impresora (requiere soporte ESC/POS)."
                      value={ticketConfig.autoCut}
                      onChange={(v) => setTicketConfig((c) => ({ ...c, autoCut: v }))}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveTicketConfig}
                  disabled={ticketConfigSaving}
                  className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
                >
                  {ticketConfigSaving ? 'Guardando...' : 'Guardar configuración de ticket'}
                </button>
              </>
            )}
          </div>
        </section>

        {/* Sección: Servidor de impresión local */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Servidor de impresión local</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            {printServerLoading ? (
              <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  URL del servidor de impresión local (print-server). El POS intentará imprimir directo; si no responde, usa el flujo normal por navegador.
                </p>
                <div>
                  <label className={labelClass}>URL del servidor de impresión</label>
                  <input
                    type="url"
                    className={inputClass}
                    value={printServerUrl}
                    onChange={(e) => { setPrintServerUrl(e.target.value); setPrintServerStatus('unknown') }}
                    placeholder="http://192.168.100.77:4000"
                  />
                </div>
                {printServerStatus === 'ok' && (
                  <p className="text-xs text-green-600 font-semibold">✓ Servidor respondió correctamente</p>
                )}
                {printServerStatus === 'error' && (
                  <p className="text-xs text-red-600 font-semibold">✕ No se pudo conectar al servidor</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSavePrintServer}
                    disabled={printServerSaving}
                    className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
                  >
                    {printServerSaving ? 'Guardando...' : 'Guardar URL'}
                  </button>
                  <button
                    onClick={handleTestPrintServer}
                    disabled={printServerTesting}
                    className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {printServerTesting ? 'Probando...' : 'Probar conexión'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Sección: Configuración de grilla POS / Menu Display */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Grilla POS y Menu Display</h2>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            {gridLoading ? (
              <div className="space-y-3">
                <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  Define el número de columnas y filas de la grilla de productos. Se aplica en el POS y en las pantallas de menú (menu-display).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Columnas (3 – 12)</label>
                    <input
                      type="number"
                      min={3}
                      max={12}
                      className={inputClass}
                      value={gridCols}
                      onChange={(e) => {
                        const v = Math.max(3, Math.min(12, parseInt(e.target.value, 10) || 6))
                        setGridCols(v)
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Filas (4 – 30)</label>
                    <input
                      type="number"
                      min={4}
                      max={30}
                      className={inputClass}
                      value={gridRows}
                      onChange={(e) => {
                        const v = Math.max(4, Math.min(30, parseInt(e.target.value, 10) || 16))
                        setGridRows(v)
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">Total de celdas: {gridCols * gridRows}</p>
                <button
                  onClick={handleSaveGrid}
                  disabled={gridSaving}
                  className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
                >
                  {gridSaving ? 'Guardando...' : 'Guardar configuración de grilla'}
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Propina sugerida ── */}
        <section className="bg-white rounded-2xl shadow-card-rest border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings size={20} className="text-sumak-red" />
            Propina sugerida (pre-cuenta)
          </h2>
          {tipLoading ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTipEnabled(!tipEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tipEnabled ? 'bg-sumak-red' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tipEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {tipEnabled ? 'Activada' : 'Desactivada'}
                </span>
              </div>
              {tipEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Porcentajes sugeridos (separados por coma)
                  </label>
                  <input
                    type="text"
                    value={tipPercentages}
                    onChange={(e) => setTipPercentages(e.target.value)}
                    placeholder="10,15,20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sumak-red"
                  />
                  <p className="text-xs text-gray-400 mt-1">Ejemplo: 10,15,20 para 10%, 15% y 20%</p>
                </div>
              )}
              <button
                onClick={handleSaveTip}
                disabled={tipSaving}
                className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
              >
                {tipSaving ? 'Guardando...' : 'Guardar configuración de propina'}
              </button>
            </div>
          )}
        </section>

        {/* ── PIN cocina ── */}
        <section className="bg-white rounded-2xl shadow-card-rest border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings size={20} className="text-sumak-red" />
            Pantalla cocina — Acceso
          </h2>
          {cocinaPinLoading ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCocinaPinRequired(!cocinaPinRequired)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cocinaPinRequired ? 'bg-sumak-red' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cocinaPinRequired ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {cocinaPinRequired ? 'Requiere PIN para acceder a /cocina' : 'Acceso libre a /cocina (sin PIN)'}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Cuando está activado, el personal debe ingresar su PIN antes de ver la pantalla de cocina.
              </p>
              <button
                onClick={handleSaveCocinaPIN}
                disabled={cocinaPinSaving}
                className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
              >
                {cocinaPinSaving ? 'Guardando...' : 'Guardar configuración de cocina'}
              </button>
            </div>
          )}
        </section>
      </div>
    </AdminLayoutClient>
  )
}
