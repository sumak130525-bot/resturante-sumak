'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/lib/types'
import { Save, RefreshCw, Tv2, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'

const GRID_COLS = 6
const GRID_ROWS = 4
const TOTAL_CELLS = GRID_COLS * GRID_ROWS // 24

// ─── Types ─────────────────────────────────────────────────────────────────────

// grid[pos] = MenuItem | null   (pos 0-based index = display_order - 1)
type GridState = (MenuItem | null)[]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildGrid(items: MenuItem[]): GridState {
  const grid: GridState = Array(TOTAL_CELLS).fill(null)
  for (const item of items) {
    const order = item.display_order ?? 0
    if (order >= 1 && order <= TOTAL_CELLS) {
      grid[order - 1] = item
    }
  }
  return grid
}

function unassignedItems(items: MenuItem[], grid: GridState): MenuItem[] {
  const inGrid = new Set(grid.filter(Boolean).map((i) => i!.id))
  return items.filter((i) => !inGrid.has(i.id))
}


const CATEGORY_COLORS: Record<string, string> = {
  sopas: 'bg-orange-500',
  segundo: 'bg-blue-500',
  desayunos: 'bg-yellow-500',
  bebidas: 'bg-cyan-500',
  postres: 'bg-pink-500',
  'para-llevar': 'bg-purple-500',
  empanadas: 'bg-amber-500',
  'platos-principales': 'bg-green-600',
  acompanamientos: 'bg-lime-500',
}

function catColor(slug?: string): string {
  return slug ? (CATEGORY_COLORS[slug] ?? 'bg-gray-400') : 'bg-gray-400'
}

// ─── Dropdown for empty cell ───────────────────────────────────────────────────

interface CellDropdownProps {
  available: MenuItem[]
  onSelect: (item: MenuItem) => void
  onClose: () => void
}

function CellDropdown({ available, onSelect, onClose }: CellDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (available.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute z-50 top-full left-0 mt-1 w-52 bg-[#1a1815] border border-sumak-brown/40 rounded-xl shadow-2xl p-3"
      >
        <p className="text-xs text-gray-400 text-center">Todos los platos ya están en la grilla</p>
        <button onClick={onClose} className="mt-2 w-full text-xs text-gray-500 hover:text-white">
          Cerrar
        </button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-56 bg-[#1a1815] border border-sumak-brown/40 rounded-xl shadow-2xl overflow-hidden"
      style={{ maxHeight: '280px' }}
    >
      <div className="px-3 py-2 border-b border-sumak-brown/20 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#F5C842]">Elegir plato</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X size={12} />
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '230px' }}>
        {available.map((item) => (
          <button
            key={item.id}
            onClick={() => { onSelect(item); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sumak-brown/20 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-white/10">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className={cn('w-full h-full', catColor(item.categories?.slug))} />
              )}
            </div>
            <span className="text-sm text-white truncate">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Single Grid Cell ──────────────────────────────────────────────────────────

interface GridCellProps {
  index: number
  item: MenuItem | null
  available: MenuItem[]
  onPlace: (cellIndex: number, item: MenuItem) => void
  onRemove: (cellIndex: number) => void
  onMove: (from: number, to: number) => void
}

function GridCell({ index, item, available, onPlace, onRemove, onMove }: GridCellProps) {
  const [open, setOpen] = useState(false)

  const col = index % GRID_COLS
  const row = Math.floor(index / GRID_COLS)
  const canLeft = col > 0
  const canRight = col < GRID_COLS - 1
  const canUp = row > 0
  const canDown = row < GRID_ROWS - 1

  if (item) {
    return (
      <div className="relative group rounded-lg overflow-visible bg-[#1a1815] border border-white/10 aspect-square flex flex-col">
        {/* image */}
        <div className="flex-1 overflow-hidden">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover opacity-90" />
          ) : (
            <div className={cn('w-full h-full', catColor(item.categories?.slug))} />
          )}
        </div>

        {/* name overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
          <p className="text-white text-[9px] leading-tight truncate font-medium">{item.name}</p>
        </div>

        {/* controls — appear on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 bg-black/50 rounded-lg">
          {/* remove */}
          <button
            onClick={() => onRemove(index)}
            className="w-6 h-6 bg-sumak-red text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
            title="Quitar de la grilla"
          >
            <X size={12} />
          </button>
          {/* arrow row */}
          <div className="flex items-center gap-0.5 mt-0.5">
            <button
              onClick={() => canLeft && onMove(index, index - 1)}
              disabled={!canLeft}
              className="w-5 h-5 bg-white/20 text-white rounded flex items-center justify-center hover:bg-white/40 disabled:opacity-0 transition-all"
              title="Mover izquierda"
            >
              <ChevronLeft size={10} />
            </button>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => canUp && onMove(index, index - GRID_COLS)}
                disabled={!canUp}
                className="w-5 h-5 bg-white/20 text-white rounded flex items-center justify-center hover:bg-white/40 disabled:opacity-0 transition-all"
                title="Mover arriba"
              >
                <ChevronUp size={10} />
              </button>
              <button
                onClick={() => canDown && onMove(index, index + GRID_COLS)}
                disabled={!canDown}
                className="w-5 h-5 bg-white/20 text-white rounded flex items-center justify-center hover:bg-white/40 disabled:opacity-0 transition-all"
                title="Mover abajo"
              >
                <ChevronDown size={10} />
              </button>
            </div>
            <button
              onClick={() => canRight && onMove(index, index + 1)}
              disabled={!canRight}
              className="w-5 h-5 bg-white/20 text-white rounded flex items-center justify-center hover:bg-white/40 disabled:opacity-0 transition-all"
              title="Mover derecha"
            >
              <ChevronRight size={10} />
            </button>
          </div>
        </div>

        {/* position badge */}
        <div className="absolute top-0.5 left-0.5 bg-black/60 text-[8px] text-[#F5C842] font-bold px-1 rounded leading-tight pointer-events-none">
          {index + 1}
        </div>
      </div>
    )
  }

  // Empty cell
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full aspect-square rounded-lg border-2 border-dashed border-white/20 hover:border-[#F5C842]/60 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-0.5 group',
          open && 'border-[#F5C842]/80 bg-white/5'
        )}
        title={`Celda ${index + 1} — click para asignar plato`}
      >
        <span className="text-white/20 group-hover:text-[#F5C842]/60 text-lg font-light leading-none">+</span>
        <span className="text-[8px] text-white/15 group-hover:text-white/30">{index + 1}</span>
      </button>

      {open && (
        <CellDropdown
          available={available}
          onSelect={(item) => onPlace(index, item)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrdenarMenuPage() {
  const [allItems, setAllItems] = useState<MenuItem[]>([])
  const [grid, setGrid] = useState<GridState>(Array(TOTAL_CELLS).fill(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_items')
      .select('*, categories(*)')
      .eq('active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')
    if (data) {
      const items = data as MenuItem[]
      setAllItems(items)
      setGrid(buildGrid(items))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Place item in a cell (removes from wherever it was before)
  const handlePlace = useCallback((cellIndex: number, item: MenuItem) => {
    setGrid((prev) => {
      const next = [...prev]
      // Remove from old cell if already placed
      const oldIndex = next.findIndex((c) => c?.id === item.id)
      if (oldIndex !== -1) next[oldIndex] = null
      next[cellIndex] = item
      return next
    })
  }, [])

  // Remove item from cell → goes back to unassigned
  const handleRemove = useCallback((cellIndex: number) => {
    setGrid((prev) => {
      const next = [...prev]
      next[cellIndex] = null
      return next
    })
  }, [])

  // Move item from one cell to another (swap)
  const handleMove = useCallback((from: number, to: number) => {
    setGrid((prev) => {
      const next = [...prev]
      const tmp = next[from]
      next[from] = next[to]
      next[to] = tmp
      return next
    })
  }, [])

  // Save: items in grid get display_order = cellIndex+1, unassigned get 0
  const handleSave = async () => {
    setSaving(true)
    try {
      const updates: { id: string; display_order: number }[] = []

      // Grid items
      grid.forEach((item, i) => {
        if (item) updates.push({ id: item.id, display_order: i + 1 })
      })

      // Unassigned items → display_order = 0
      const unassigned = unassignedItems(allItems, grid)
      for (const item of unassigned) {
        updates.push({ id: item.id, display_order: 0 })
      }

      if (updates.length === 0) {
        showToast('No hay cambios que guardar', true)
        setSaving(false)
        return
      }

      const res = await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (res.ok) {
        showToast('Orden guardado correctamente', true)
        await fetchItems()
      } else {
        showToast('Error al guardar el orden', false)
      }
    } catch {
      showToast('Error de conexión', false)
    } finally {
      setSaving(false)
    }
  }

  const available = unassignedItems(allItems, grid)
  const assignedCount = grid.filter(Boolean).length

  return (
    <AdminLayoutClient active="ordenar">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Ordenar Menú Display</h1>
            <p className="text-gray-500 text-sm mt-1">
              Coloca los platos en las celdas de la TV. Las celdas vacías no aparecen en pantalla.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchItems}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sumak-brown text-white font-semibold text-sm hover:bg-sumak-brown/90 transition-colors disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Cargando platos...</div>
        ) : (
          <>
            {/* ── Interactive TV Grid ── */}
            <div className="bg-[#0d0c0b] rounded-2xl p-4 mb-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#F5C842] text-sm font-bold flex items-center gap-2">
                  <Tv2 size={16} />
                  Grilla TV (6×4) — {assignedCount} de {TOTAL_CELLS} celdas ocupadas
                </p>
              </div>

              {/* Row labels + grid */}
              <div className="flex gap-2">
                {/* Row labels */}
                <div
                  className="flex flex-col shrink-0"
                  style={{ gap: '6px' }}
                >
                  {Array.from({ length: GRID_ROWS }).map((_, r) => (
                    <div
                      key={r}
                      className="text-[10px] text-gray-500 font-medium flex items-center justify-end pr-1"
                      style={{ height: `calc((100% - ${(GRID_ROWS - 1) * 6}px) / ${GRID_ROWS})` }}
                    >
                      F{r + 1}
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div
                  className="flex-1"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                    gap: '6px',
                  }}
                >
                  {Array.from({ length: TOTAL_CELLS }).map((_, i) => (
                    <GridCell
                      key={i}
                      index={i}
                      item={grid[i]}
                      available={available}
                      onPlace={handlePlace}
                      onRemove={handleRemove}
                      onMove={handleMove}
                    />
                  ))}
                </div>
              </div>

              {/* Column numbers */}
              <div className="flex gap-2 mt-1 ml-8">
                {Array.from({ length: GRID_COLS }).map((_, c) => (
                  <div key={c} className="flex-1 text-center text-[9px] text-gray-600">
                    C{c + 1}
                  </div>
                ))}
              </div>

              <p className="text-gray-600 text-[10px] mt-3 text-center">
                Toca una celda vacía para asignar un plato · Pasa el cursor sobre un plato para moverlo o quitarlo
              </p>
            </div>

            {/* ── Unassigned Items ── */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sumak-brown text-base">
                  Platos sin asignar
                  <span className="ml-2 text-sm font-normal text-gray-400">({available.length})</span>
                </h2>
                <p className="text-xs text-gray-400">
                  Estos platos no aparecen en la TV (display_order = 0)
                </p>
              </div>

              {available.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">
                  Todos los platos activos están en la grilla
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {available.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 hover:bg-amber-50 hover:border-sumak-brown/30 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className={cn('w-full h-full', catColor(item.categories?.slug))} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-sumak-brown truncate max-w-[120px]">{item.name}</p>
                        <p className="text-xs text-gray-400 truncate">{item.categories?.name ?? '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bottom sticky save ── */}
            <div className="sticky bottom-4 mt-6 flex justify-center">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-sumak-brown text-white font-bold text-base shadow-lg hover:bg-sumak-brown/90 transition-all disabled:opacity-60 active:scale-95"
              >
                <Save size={18} />
                {saving ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-xl z-50 transition-all',
            toast.ok ? 'bg-green-600' : 'bg-red-600'
          )}
        >
          {toast.msg}
        </div>
      )}
    </AdminLayoutClient>
  )
}
