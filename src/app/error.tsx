'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-sumak-cream flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-6">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <span className="text-4xl">🍽️</span>
        </div>

        {/* Heading */}
        <div>
          <h2 className="font-serif font-bold text-2xl text-sumak-brown mb-2">
            Algo salió mal
          </h2>
          <p className="text-sumak-brown-light text-sm leading-relaxed">
            Hubo un problema al cargar la página. Por favor intenta de nuevo.
          </p>
          {error?.digest && (
            <p className="text-xs text-sumak-brown-pale mt-2 font-mono">
              Código: {error.digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-sumak-brown text-sumak-gold font-semibold rounded-pill text-sm hover:bg-sumak-brown-mid transition-all"
          >
            Intentar de nuevo
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 border border-sumak-brown/30 text-sumak-brown font-semibold rounded-pill text-sm hover:bg-sumak-cream-dark transition-all"
          >
            Recargar página
          </button>
        </div>
      </div>
    </div>
  )
}
