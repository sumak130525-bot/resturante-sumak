'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageCircle, X, Volume2 } from 'lucide-react'

interface WhatsAppNotification {
  id: string
  phone: string
  message: string
  sender_name: string | null
  created_at: string
}

export default function WhatsAppNotifier() {
  const [notifications, setNotifications] = useState<WhatsAppNotification[]>([])
  const [visible, setVisible] = useState<WhatsAppNotification | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSeenRef = useRef<string>('')
  const [soundUnlocked, setSoundUnlocked] = useState(false)

  // Unlock audio on first interaction
  useEffect(() => {
    const unlock = () => {
      setSoundUnlocked(true)
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/whatsapp-notification.mp3')
        audioRef.current.volume = 0.8
      }
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    document.addEventListener('click', unlock)
    document.addEventListener('touchstart', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  const playSound = useCallback(() => {
    if (soundUnlocked && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [soundUnlocked])

  const markRead = useCallback(async (id: string) => {
    await fetch('/api/admin/whatsapp-notify', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }, [])

  const dismiss = useCallback((notif: WhatsAppNotification) => {
    setVisible(null)
    markRead(notif.id)
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
  }, [markRead])

  // Poll every 10 seconds
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch('/api/admin/whatsapp-notify')
        if (!res.ok) return
        const data: WhatsAppNotification[] = await res.json()
        if (cancelled) return

        if (data.length > 0) {
          const newest = data[0]
          // Only alert if it's a NEW notification we haven't seen
          if (newest.id !== lastSeenRef.current) {
            lastSeenRef.current = newest.id
            setNotifications(data)
            setVisible(newest)
            playSound()
          }
        }
      } catch { /* ignore */ }
    }

    check()
    const id = setInterval(check, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [playSound])

  if (!visible) {
    // Badge only if there are unread
    if (notifications.length === 0) return null

    return (
      <button
        onClick={() => setVisible(notifications[0])}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-full shadow-lg animate-bounce"
      >
        <MessageCircle size={18} />
        <span className="text-sm font-bold">{notifications.length}</span>
      </button>
    )
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-green-200 overflow-hidden animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-green-500">
        <div className="flex items-center gap-2 text-white">
          <MessageCircle size={18} />
          <span className="font-bold text-sm">WhatsApp</span>
          {!soundUnlocked && <Volume2 size={14} className="opacity-50" />}
        </div>
        <button onClick={() => dismiss(visible)} className="text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Message */}
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-1">
          {visible.sender_name || visible.phone} · {new Date(visible.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-sm text-gray-800 line-clamp-3">{visible.message}</p>
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={() => dismiss(visible)}
          className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium"
        >
          Cerrar
        </button>
        <a
          href={`https://wa.me/${visible.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => dismiss(visible)}
          className="flex-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium text-center"
        >
          Responder
        </a>
      </div>

      {/* More notifications */}
      {notifications.length > 1 && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-400">+{notifications.length - 1} mensajes más</p>
        </div>
      )}
    </div>
  )
}
