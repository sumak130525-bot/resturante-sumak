'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas. Intenta de nuevo.')
      setLoading(false)
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hero-gradient px-4 relative overflow-hidden">
      {/* Background rings */}
      <div className="absolute inset-0 bg-noise opacity-40" />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-sumak-gold/10 animate-spin-slow pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full border border-sumak-gold/8 animate-spin-slow pointer-events-none" style={{ animationDirection: 'reverse', animationDuration: '14s' }} />

      <div className="relative w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-gold-glow">
              <span className="font-serif font-bold text-3xl text-sumak-brown">S</span>
            </div>
            <div>
              <h1 className="font-serif font-bold text-3xl text-white tracking-wide">Sumak Admin</h1>
              <p className="text-white/50 text-sm mt-0.5">Panel de administración</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className="text-sumak-brown-light" />
            <p className="text-xs font-semibold text-sumak-brown-light tracking-wider uppercase">
              Acceso restringido
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sumak.com"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn('btn-primary w-full flex items-center justify-center gap-2 py-3.5')}
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Entrando…
                </>
              ) : (
                'Ingresar al panel'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/25 mt-6">
          Solo para administradores de Sumak Restaurante
        </p>
      </div>
    </div>
  )
}
