'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { RefreshCw, CheckCircle, AlertCircle, Loader2, ExternalLink, Package } from 'lucide-react'

type StatusData = {
  store: { name: string; city: string; address: string }
  loyverse_items_count: number
  menu_items_count: number
  mapped_count: number
  unmapped_count: number
  mapped: string[]
  unmapped: string[]
}

type SyncResult = {
  success?: boolean
  error?: string
  loyverse_receipt_id?: string
  unmapped?: string[]
}

export default function LoyversePage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [errorStatus, setErrorStatus] = useState<string | null>(null)

  const [syncOrderId, setSyncOrderId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    setErrorStatus(null)
    try {
      const res = await fetch('/api/loyverse/status')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setStatus(data)
    } catch (e: unknown) {
      setErrorStatus(e instanceof Error ? e.message : 'Error al cargar estado')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleSyncOrder = async () => {
    if (!syncOrderId.trim()) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/loyverse/sync-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: syncOrderId.trim() }),
      })
      const data = await res.json()
      setSyncResult(data)
    } catch {
      setSyncResult({ error: 'Error de red' })
    } finally {
      setSyncing(false)
    }
  }

  const mappingPct = status
    ? Math.round((status.mapped_count / Math.max(status.menu_items_count, 1)) * 100)
    : 0

  return (
    <AdminLayoutClient active="loyverse">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold text-gray-900">Integración Loyverse</h1>
            <p className="text-sm text-gray-500 mt-1">
              Estado de la conexión entre el sitio web y Loyverse POS
            </p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loadingStatus}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {/* Estado de la tienda */}
        {errorStatus ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">Error al conectar con Loyverse</p>
              <p className="text-xs text-red-600 mt-1">{errorStatus}</p>
            </div>
          </div>
        ) : loadingStatus ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-amber-700" />
            <span className="text-sm text-gray-500">Cargando estado...</span>
          </div>
        ) : status ? (
          <>
            {/* Info tienda */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Conectado a Loyverse</p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Tienda: <span className="font-medium">{status.store?.name}</span>
                    {status.store?.city && ` · ${status.store.city}`}
                  </p>
                  {status.store?.address && (
                    <p className="text-xs text-gray-400 mt-0.5">{status.store.address}</p>
                  )}
                </div>
                <a
                  href="https://loyverse.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-amber-700 hover:underline"
                >
                  Dashboard <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Métricas de mapeo */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Items en Loyverse', value: status.loyverse_items_count, color: 'text-blue-700 bg-blue-50' },
                { label: 'Items del menú web', value: status.menu_items_count, color: 'text-gray-700 bg-gray-50' },
                { label: 'Items mapeados', value: `${status.mapped_count}/${status.menu_items_count}`, color: 'text-green-700 bg-green-50' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl p-4 ${color.split(' ')[1]}`}>
                  <p className={`text-2xl font-bold ${color.split(' ')[0]}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Barra de progreso de mapeo */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Cobertura de mapeo</p>
                <span className="text-sm font-bold text-gray-900">{mappingPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${mappingPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {status.mapped_count} items del menú tienen coincidencia en Loyverse
                {status.unmapped_count > 0 && ` · ${status.unmapped_count} sin mapear`}
              </p>
            </div>

            {/* Items sin mapear */}
            {status.unmapped.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={16} className="text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">
                    Items sin mapear en Loyverse ({status.unmapped.length})
                  </p>
                </div>
                <p className="text-xs text-amber-700 mb-3">
                  Estos items del menú web no tienen un item con nombre similar en Loyverse.
                  Al sincronizar un pedido que los contenga, no se incluirán en el recibo.
                </p>
                <div className="flex flex-wrap gap-2">
                  {status.unmapped.map((name) => (
                    <span key={name} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-300">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Items mapeados */}
            {status.mapped.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Package size={16} className="text-green-600" />
                  <p className="text-sm font-semibold text-gray-800">
                    Items mapeados correctamente ({status.mapped.length})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {status.mapped.map((name) => (
                    <span key={name} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-200">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Sincronización manual */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Sincronizar pedido manual</h2>
          <p className="text-xs text-gray-500 mb-4">
            Ingresá el ID de un pedido de Supabase para enviarlo como recibo a Loyverse.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={syncOrderId}
              onChange={(e) => setSyncOrderId(e.target.value)}
              placeholder="UUID del pedido (ej: a1b2c3d4-...)"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={handleSyncOrder}
              disabled={syncing || !syncOrderId.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sincronizar
            </button>
          </div>

          {syncResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm ${syncResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {syncResult.success ? (
                <>
                  <p className="font-medium">Recibo creado en Loyverse</p>
                  {syncResult.loyverse_receipt_id && (
                    <p className="text-xs mt-0.5 opacity-80">ID: {syncResult.loyverse_receipt_id}</p>
                  )}
                  {syncResult.unmapped && syncResult.unmapped.length > 0 && (
                    <p className="text-xs mt-1 text-amber-700">
                      Items no mapeados: {syncResult.unmapped.join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <p>{syncResult.error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayoutClient>
  )
}
