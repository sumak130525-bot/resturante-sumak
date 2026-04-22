'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChefHat, LayoutGrid, ShoppingBag, LogOut, Menu as MenuIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface AdminLayoutClientProps {
  children: React.ReactNode
  active: 'dashboard' | 'menu' | 'orders'
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid, key: 'dashboard' as const },
  { href: '/admin/menu', label: 'Menú', icon: ChefHat, key: 'menu' as const },
  { href: '/admin/orders', label: 'Pedidos', icon: ShoppingBag, key: 'orders' as const },
]

interface SidebarProps {
  active: 'dashboard' | 'menu' | 'orders'
  user: User | null
  onLogout: () => void
}

function Sidebar({ active, user, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 bg-sumak-brown text-white flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sumak-gold rounded-xl flex items-center justify-center font-serif font-bold text-sumak-brown text-lg">
            S
          </div>
          <div>
            <p className="font-serif font-bold text-lg leading-tight">Sumak</p>
            <p className="text-xs text-amber-300">Panel Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, key }) => (
          <a
            key={key}
            href={href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
              active === key
                ? 'bg-sumak-gold text-sumak-brown'
                : 'text-amber-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="text-xs text-amber-400 mb-3 truncate">
          {user?.email}
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-amber-300 hover:text-white transition-colors w-full"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export function AdminLayoutClient({ children, active }: AdminLayoutClientProps) {
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar desktop */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar active={active} user={user} onLogout={handleLogout} />
      </div>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex flex-col w-64">
            <Sidebar active={active} user={user} onLogout={handleLogout} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 p-4 bg-sumak-brown text-white">
          <button onClick={() => setSidebarOpen(true)}>
            <MenuIcon size={20} />
          </button>
          <span className="font-serif font-bold">Sumak Admin</span>
        </div>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}
