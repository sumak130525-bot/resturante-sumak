'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChefHat, LayoutGrid, ShoppingBag, LogOut, Menu as MenuIcon, X, ChevronLeft, ChevronRight, QrCode, Store, Bell, Tag, ArrowUpDown, Users, Settings, Sliders } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface AdminLayoutClientProps {
  children: React.ReactNode
  active: 'dashboard' | 'menu' | 'categorias' | 'ordenar' | 'orders' | 'qr' | 'loyverse' | 'notificaciones' | 'clientes' | 'configuracion' | 'modificadores'
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid, key: 'dashboard' as const },
  { href: '/admin/menu', label: 'Menú', icon: ChefHat, key: 'menu' as const },
  { href: '/admin/categorias', label: 'Categorías', icon: Tag, key: 'categorias' as const },
  { href: '/admin/ordenar', label: 'Ordenar TV', icon: ArrowUpDown, key: 'ordenar' as const },
  { href: '/admin/orders', label: 'Pedidos', icon: ShoppingBag, key: 'orders' as const },
  { href: '/admin/clientes', label: 'Clientes', icon: Users, key: 'clientes' as const },
  { href: '/admin/qr', label: 'Códigos QR', icon: QrCode, key: 'qr' as const },
  { href: '/admin/loyverse', label: 'Loyverse', icon: Store, key: 'loyverse' as const },
  { href: '/admin/modificadores', label: 'Modificadores', icon: Sliders, key: 'modificadores' as const },
  { href: '/admin/notificaciones', label: 'Notificaciones', icon: Bell, key: 'notificaciones' as const },
  { href: '/admin/configuracion', label: 'Configuración', icon: Settings, key: 'configuracion' as const },
]

interface SidebarProps {
  active: 'dashboard' | 'menu' | 'categorias' | 'ordenar' | 'orders' | 'qr' | 'loyverse' | 'notificaciones' | 'clientes' | 'configuracion' | 'modificadores'
  user: User | null
  onLogout: () => void
  collapsed: boolean
  onToggle: () => void
}

function Sidebar({ active, user, onLogout, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'bg-sumak-brown text-white flex flex-col h-full transition-all duration-300 ease-in-out relative',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className={cn('border-b border-white/10 flex items-center', collapsed ? 'p-3 justify-center' : 'p-6')}>
        {collapsed ? (
          <div className="w-10 h-10 bg-sumak-gold rounded-xl flex items-center justify-center font-serif font-bold text-sumak-brown text-lg flex-shrink-0">
            S
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sumak-gold rounded-xl flex items-center justify-center font-serif font-bold text-sumak-brown text-lg flex-shrink-0">
              S
            </div>
            <div>
              <p className="font-serif font-bold text-lg leading-tight">Sumak</p>
              <p className="text-xs text-amber-300">Panel Admin</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 space-y-1', collapsed ? 'p-2' : 'p-4')}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, key }) => (
          <a
            key={key}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center rounded-xl text-sm font-medium transition-all',
              collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3',
              active === key
                ? 'bg-sumak-gold text-sumak-brown'
                : 'text-amber-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && label}
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-white/10', collapsed ? 'p-2' : 'p-4')}>
        {!collapsed && (
          <div className="text-xs text-amber-400 mb-3 truncate">
            {user?.email}
          </div>
        )}
        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={cn(
            'flex items-center text-sm text-amber-300 hover:text-white transition-colors w-full',
            collapsed ? 'justify-center p-1' : 'gap-2'
          )}
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>

      {/* Toggle button (desktop) */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-sumak-brown border-2 border-white/20 rounded-full flex items-center justify-center text-white hover:bg-sumak-gold hover:text-sumak-brown hover:border-sumak-gold transition-all z-10"
        title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}

export function AdminLayoutClient({ children, active }: AdminLayoutClientProps) {
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
        <Sidebar
          active={active}
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex flex-col w-64">
            <Sidebar
              active={active}
              user={user}
              onLogout={handleLogout}
              collapsed={false}
              onToggle={() => setSidebarOpen(false)}
            />
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
