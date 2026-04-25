'use client'

import { useEffect, useState } from 'react'
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
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (localStorage.getItem(LS_KEY)) return

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setSubscribed(true)
        } else {
          setTimeout(() => {
            setVisible(true)
            requestAnimationFrame(() => setTimeout(() => setShow(true), 10))
          }, 5000)
        }
      })
    }).catch((err) => {
      console.warn('[PushPrompt] SW registration failed:', err)
      setTimeout(() => {
        setVisible(true)
        requestAnimationFrame(() => setTimeout(() => setShow(true), 10))
      }, 5000)
    })
  }, [])

  const handleActivar = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        localStorage.setItem(LS_KEY, 'denied')
        closeModal()
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
      closeModal()
    } catch (err) {
      console.error('[PushPrompt]', err)
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const closeModal = () => {
    setShow(false)
    setTimeout(() => setVisible(false), 300)
  }

  const handleClose = () => {
    localStorage.setItem(LS_KEY, 'dismissed')
    closeModal()
  }

  if (!visible || subscribed) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/50 backdrop-blur-sm',
        'transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0'
      )}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-auto',
          'flex flex-col items-center text-center gap-4',
          'transition-all duration-300',
          show ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        )}
      >
        <div className="text-5xl animate-bounce select-none">🔔</div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-sumak-brown leading-tight">
            ¡No te pierdas nuestras ofertas!
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Activá las notificaciones y recibí promociones exclusivas directo en tu celular
          </p>
        </div>

        <button
          onClick={handleActivar}
          disabled={loading}
          className={cn(
            'w-full py-3 px-6 rounded-full text-lg font-bold',
            'bg-sumak-gold text-sumak-brown',
            'hover:opacity-90 active:scale-95 transition-all',
            'disabled:opacity-60 disabled:cursor-not-allowed shadow-md'
          )}
        >
          {loading ? 'Activando...' : 'Activar notificaciones 🔔'}
        </button>

        <button
          onClick={handleClose}
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}
