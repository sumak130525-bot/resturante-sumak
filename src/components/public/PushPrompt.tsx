'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const LS_KEY = 'push_prompt_dismissed'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

export function PushPrompt() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (localStorage.getItem(LS_KEY)) return

    // Registrar SW primero, luego verificar suscripción
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setSubscribed(true)
        } else {
          setTimeout(() => setVisible(true), 3000)
        }
      })
    }).catch((err) => {
      console.warn('[PushPrompt] SW registration failed:', err)
      setTimeout(() => setVisible(true), 3000)
    })
  }, [])

  const handleActivar = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        localStorage.setItem(LS_KEY, 'denied')
        setVisible(false)
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID key not configured')

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
        }),
      })

      localStorage.setItem(LS_KEY, 'subscribed')
      setSubscribed(true)
      setVisible(false)
    } catch (err) {
      console.error('[PushPrompt]', err)
      setVisible(false)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    localStorage.setItem(LS_KEY, 'dismissed')
    setVisible(false)
  }

  if (!visible || subscribed) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'bg-sumak-brown text-white',
        'flex items-center justify-between gap-3 px-4 py-3',
        'shadow-lg border-b border-sumak-gold/30',
        'animate-fade-up'
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Bell size={18} className="text-sumak-gold shrink-0" />
        <p className="text-sm font-medium truncate">
          ¿Querés recibir ofertas y novedades?
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleActivar}
          disabled={loading}
          className={cn(
            'px-3 py-1.5 rounded-pill text-xs font-semibold',
            'bg-sumak-gold text-sumak-brown',
            'hover:opacity-90 active:scale-95 transition-all',
            'disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          {loading ? 'Activando...' : 'Activar'}
        </button>
        <button
          onClick={handleClose}
          className="text-white/50 hover:text-white transition-colors p-1"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
