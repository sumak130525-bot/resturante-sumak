'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

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

async function subscribeToPush(): Promise<boolean> {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('VAPID key not configured')

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })

  const subJson = sub.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
    }),
  })

  return res.ok
}

export function NotificationButton() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'blocked' | null>(null)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setSupported(true)
    }
  }, [])

  if (!supported) return null

  const handleClick = async () => {
    if (loading) return
    setFeedback(null)

    const permission = (typeof Notification !== 'undefined')
      ? Notification.permission
      : 'default'

    // Already denied
    if (permission === 'denied') {
      setShowBlockedModal(true)
      return
    }

    // Already granted — check subscription
    if (permission === 'granted') {
      setLoading(true)
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          setFeedback('success')
        } else {
          await subscribeToPush()
          localStorage.setItem(LS_KEY, 'subscribed')
          setFeedback('success')
        }
      } catch (err) {
        console.error('[NotificationButton]', err)
      } finally {
        setLoading(false)
      }
      return
    }

    // Default — request permission
    setLoading(true)
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        await subscribeToPush()
        localStorage.setItem(LS_KEY, 'subscribed')
        setFeedback('success')
      } else {
        localStorage.setItem(LS_KEY, 'denied')
        setShowBlockedModal(true)
      }
    } catch (err) {
      console.error('[NotificationButton]', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Notification button */}
      <button
        onClick={handleClick}
        disabled={loading || feedback === 'success'}
        title={t('enableNotifications')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-semibold',
          'transition-all duration-200',
          feedback === 'success'
            ? 'bg-sumak-gold/20 border border-sumak-gold/40 text-sumak-gold cursor-default'
            : 'bg-sumak-gold/15 border border-sumak-gold/30 text-sumak-gold hover:bg-sumak-gold/25 hover:border-sumak-gold/60 hover:scale-105',
          'disabled:opacity-60 disabled:cursor-not-allowed'
        )}
      >
        <span className="text-base leading-none">🔔</span>
        {loading
          ? '...'
          : feedback === 'success'
            ? t('notificationsEnabled')
            : t('enableNotifications')}
      </button>

      {/* Blocked modal */}
      {showBlockedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBlockedModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-auto flex flex-col gap-4">
            <div className="text-3xl text-center select-none">🔔</div>
            <h2 className="text-lg font-bold text-sumak-brown text-center leading-tight">
              {t('notificationsBlocked')}
            </h2>
            <p className="text-sm font-semibold text-gray-700">{t('notificationsBlockedInstructions')}</p>
            <ul className="text-sm text-gray-600 space-y-2 list-none">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">📱</span>
                <span>{t('notificationsBlockedMobile')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">💻</span>
                <span>{t('notificationsBlockedDesktop')}</span>
              </li>
            </ul>
            <button
              onClick={() => setShowBlockedModal(false)}
              className={cn(
                'w-full py-2.5 px-6 rounded-full text-sm font-bold',
                'bg-sumak-gold text-sumak-brown',
                'hover:opacity-90 active:scale-95 transition-all shadow-md'
              )}
            >
              {t('notificationsBlockedClose')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
