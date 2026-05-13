'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Device = 'pos' | 'cocina'

type SendStatus = 'idle' | 'recording' | 'sending' | 'sent' | 'error'

interface AudioMessage {
  id: string
  from_device: Device
  audio_url: string
  created_at: string
  played: boolean
}

interface WalkieTalkieProps {
  device: Device
  /** Optional: override button idle class (defaults to POS dark theme) */
  idleClassName?: string
}

// ─── Beep sound (short alert before playing voice message) ───────────────────

function playAlertBeep(ctx: AudioContext): void {
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.8, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    // ignore
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WalkieTalkie({ device, idleClassName }: WalkieTalkieProps) {
  const [status, setStatus] = useState<SendStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [incomingMsg, setIncomingMsg] = useState<AudioMessage | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayUrlRef = useRef<string | null>(null)

  const recording = status === 'recording'
  const sending = status === 'sending'

  // ── Unlock AudioContext on first interaction ──────────────────────────────
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext()
        }
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume()
        }
      } catch {
        // ignore
      }
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  // ── Play received audio ───────────────────────────────────────────────────
  const playAudio = useCallback(async (url: string) => {
    try {
      console.log('[walkie] playAudio →', url)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') await ctx.resume()

      // Play alert beep first
      playAlertBeep(ctx)

      // Wait 300ms then play voice
      await new Promise((r) => setTimeout(r, 300))

      const audio = new Audio(url)
      audio.crossOrigin = 'anonymous'
      await audio.play()
      console.log('[walkie] playAudio OK')
    } catch (err) {
      console.warn('[walkie] playAudio error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Error al reproducir: ${msg}`)
    }
  }, [])

  // ── Supabase Realtime subscription ───────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('walkie-talkie-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audio_messages' },
        async (payload) => {
          const msg = payload.new as AudioMessage
          console.log('[walkie] Realtime INSERT recibido:', msg)

          // Only handle messages sent TO this device (from the other)
          if (msg.from_device === device) {
            console.log('[walkie] Ignorando mensaje propio (from_device === device)')
            return
          }

          console.log('[walkie] Reproduciendo mensaje de', msg.from_device, '→', msg.id)
          replayUrlRef.current = msg.audio_url
          setIncomingMsg(msg)
          await playAudio(msg.audio_url)

          // Mark as played
          try {
            const supabaseAdmin = createClient()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabaseAdmin as any)
              .from('audio_messages')
              .update({ played: true })
              .eq('id', msg.id)
          } catch {
            // ignore
          }
        }
      )
      .subscribe((state) => {
        console.log('[walkie] Realtime channel state:', state)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [device, playAudio])

  // ── Stop recording and send ───────────────────────────────────────────────
  const stopAndSend = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }

    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') {
      console.warn('[walkie] stopAndSend: MediaRecorder inactivo')
      setStatus('idle')
      return
    }

    mr.onstop = async () => {
      setStatus('sending')
      console.log('[walkie] MediaRecorder stopped. Chunks:', chunksRef.current.length)

      try {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        console.log('[walkie] Blob size:', blob.size, 'type:', blob.type)

        if (blob.size < 100) {
          console.warn('[walkie] Blob demasiado pequeño, no se captó audio')
          setErrorMsg('No se captó audio. ¿Habilitaste el micrófono?')
          setStatus('error')
          return
        }

        const formData = new FormData()
        formData.append('audio', blob, `walkie-${Date.now()}.webm`)
        formData.append('from_device', device)

        console.log('[walkie] Enviando fetch POST /api/pos/audio ...')
        const res = await fetch('/api/pos/audio', {
          method: 'POST',
          body: formData,
        })

        console.log('[walkie] Fetch response status:', res.status)
        const data = await res.json().catch(() => ({}))
        console.log('[walkie] Fetch response body:', data)

        if (!res.ok) {
          const errText = (data as { error?: string }).error ?? `HTTP ${res.status}`
          console.error('[walkie] send error:', errText)
          setErrorMsg(`Error al enviar: ${errText}`)
          setStatus('error')
          return
        }

        setStatus('sent')
        // Reset to idle after 2s
        setTimeout(() => setStatus('idle'), 2000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[walkie] send exception:', err)
        setErrorMsg(`Error: ${msg}`)
        setStatus('error')
      } finally {
        // Release mic
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    mr.stop()
  }, [device])

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setErrorMsg(null)
    console.log('[walkie] startRecording — solicitando micrófono...')

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Tu navegador no soporta grabación de audio.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMsg('Tu navegador no soporta MediaRecorder.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      console.log('[walkie] Micrófono obtenido OK, tracks:', stream.getTracks().length)
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus'

      console.log('[walkie] Usando mimeType:', mimeType)

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          console.log('[walkie] Chunk recibido, size:', e.data.size, 'total chunks:', chunksRef.current.length)
        }
      }

      mr.start(100) // collect in 100ms chunks
      console.log('[walkie] MediaRecorder iniciado')
      setStatus('recording')

      // Auto-stop after 30 seconds
      maxTimerRef.current = setTimeout(() => {
        console.log('[walkie] Auto-stop por timeout 30s')
        stopAndSend()
      }, 30000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[walkie] microphone error:', err)
      setErrorMsg(`Sin micrófono: ${msg}`)
    }
  }, [stopAndSend])

  // ── Toggle (click to start, click to stop+send) ───────────────────────────
  const handleToggle = useCallback(() => {
    if (status === 'sending') return // ignore while sending

    if (status === 'error') {
      // Reset and start fresh
      setErrorMsg(null)
      setStatus('idle')
      return
    }

    if (recording) {
      console.log('[walkie] Toggle → STOP & SEND')
      stopAndSend()
    } else if (status === 'idle' || status === 'sent') {
      console.log('[walkie] Toggle → START RECORDING')
      startRecording()
    }
  }, [status, recording, stopAndSend, startRecording])

  // ── Replay last received ──────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    if (replayUrlRef.current) playAudio(replayUrlRef.current)
  }, [playAudio])

  const fromLabel = incomingMsg
    ? incomingMsg.from_device === 'pos' ? 'POS' : 'Cocina'
    : ''

  // ── Button label ──────────────────────────────────────────────────────────
  let subLabel: string | null = null
  if (status === 'recording') subLabel = 'Toca para enviar'
  else if (status === 'sending') subLabel = 'Enviando...'
  else if (status === 'sent') subLabel = 'Enviado ✓'
  else if (status === 'error') subLabel = 'Toca para reintentar'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        {/* Incoming message indicator */}
        {incomingMsg && (
          <div className="flex items-center gap-1.5 bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow animate-pulse">
            <span>Msj de {fromLabel}</span>
            <button
              onClick={handleReplay}
              className="ml-1 bg-white/20 hover:bg-white/40 rounded px-1.5 py-0.5 text-white font-black transition-all"
              title="Reproducir de nuevo"
            >
              ▶
            </button>
            <button
              onClick={() => setIncomingMsg(null)}
              className="ml-0.5 text-white/60 hover:text-white font-black"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={handleToggle}
          disabled={sending}
          title={recording ? 'Toca para enviar' : 'Toca para grabar'}
          className={`relative flex items-center justify-center w-9 h-9 rounded-lg font-bold text-lg transition-all active:scale-95 select-none touch-none ${
            recording
              ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-lg animate-pulse scale-105'
              : sending
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : status === 'sent'
                  ? 'bg-green-600 text-white'
                  : status === 'error'
                    ? 'bg-orange-500 text-white'
                    : idleClassName ?? 'bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light'
          }`}
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          {sending ? (
            <span className="text-sm font-black animate-spin inline-block">↻</span>
          ) : status === 'sent' ? (
            <span className="text-sm">✓</span>
          ) : status === 'error' ? (
            <span className="text-sm">!</span>
          ) : (
            <span>🎤</span>
          )}
          {recording && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 animate-ping" />
          )}
        </button>
      </div>

      {/* Sub-label */}
      {subLabel && (
        <span className={`text-[10px] font-semibold whitespace-nowrap ${
          status === 'error' ? 'text-orange-500' :
          status === 'sent' ? 'text-green-600' :
          status === 'recording' ? 'text-red-500' :
          'text-gray-400'
        }`}>
          {subLabel}
        </span>
      )}

      {/* Error detail */}
      {status === 'error' && errorMsg && (
        <span className="text-[10px] text-orange-400 max-w-[150px] text-center leading-tight">
          {errorMsg}
        </span>
      )}
    </div>
  )
}
