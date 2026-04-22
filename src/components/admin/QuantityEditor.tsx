'use client'

import { useState } from 'react'
import { Minus, Plus, Loader2 } from 'lucide-react'

interface QuantityEditorProps {
  itemId: string
  current: number
  onUpdate: (id: string, newValue: number) => Promise<void>
}

export function QuantityEditor({ itemId, current, onUpdate }: QuantityEditorProps) {
  const [value, setValue] = useState(current)
  const [loading, setLoading] = useState(false)

  const update = async (newValue: number) => {
    if (newValue < 0) return
    setValue(newValue)
    setLoading(true)
    try {
      await onUpdate(itemId, newValue)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => update(value - 1)}
        disabled={loading || value === 0}
        className="w-7 h-7 rounded-full border-2 border-gray-300 hover:border-sumak-red hover:text-sumak-red flex items-center justify-center transition-all disabled:opacity-40"
      >
        <Minus size={12} />
      </button>

      <input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onBlur={() => update(value)}
        className="w-16 text-center border-2 border-gray-200 rounded-lg py-1 text-sm font-bold focus:border-sumak-red focus:outline-none"
        min={0}
      />

      <button
        onClick={() => update(value + 1)}
        disabled={loading}
        className="w-7 h-7 rounded-full bg-sumak-red hover:bg-sumak-red-dark text-white flex items-center justify-center transition-all disabled:opacity-40"
      >
        {loading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={12} />}
      </button>
    </div>
  )
}
