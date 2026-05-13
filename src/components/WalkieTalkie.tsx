'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Device = 'pos' | 'cocina'

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
  const [recording, setRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const [incomingMsg, setIncomingMsg] = useState<AudioMessage | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayUrlRef = useRef<string | null>(null)

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
    } catch (err) {
      console.warn('[walkie] playAudio error:', err)
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
          // Only handle messages sent TO this device (from the other)
          if (msg.from_device === device) return

          console.log('[walkie] Received from', msg.from_device, msg.id)
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [device, playAudio])

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording || sending) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.start(100) // collect in 100ms chunks
      setRecording(true)

      // Auto-stop after 30 seconds
      maxTimerRef.current = setTimeout(() => {
        stopAndSend()
      }, 30000)
    } catch (err) {
      console.warn('[walkie] microphone error:', err)
      alert('No se pudo acceder al micrófono. Verificá los permisos del navegador.')
    }
  }, [recording, sending]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording and send ───────────────────────────────────────────────
  const stopAndSend = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }

    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') {
      setRecording(false)
      return
    }

    mr.onstop = async () => {
      setRecording(false)
      setSending(true)

      try {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        if (blob.size < 100) {
          // Too small — probably no audio captured
          setSending(false)
          return
        }

        const formData = new FormData()
        formData.append('audio', blob, `walkie-${Date.now()}.webm`)
        formData.append('from_device', device)

        const res = await fetch('/api/pos/audio', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error('[walkie] send error:', data)
        }
      } catch (err) {
        console.error('[walkie] send error:', err)
      } finally {
        setSending(false)
        // Release mic
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    mr.stop()
  }, [device])

  // ── Pointer events (hold to talk) ────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    startRecording()
  }, [startRecording])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    if (recording) stopAndSend()
  }, [recording, stopAndSend])

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    if (recording) stopAndSend()
  }, [recording, stopAndSend])

  // ── Replay last received ──────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    if (replayUrlRef.current) playAudio(replayUrlRef.current)
  }, [playAudio])

  const fromLabel = incomingMsg
    ? incomingMsg.from_device === 'pos' ? 'POS' : 'Cocina'
    : ''

  return (
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

      {/* Push-to-talk button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        disabled={sending}
        title={recording ? 'Suelta para enviar' : 'Mantén para hablar'}
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg font-bold text-lg transition-all active:scale-95 select-none touch-none ${
          recording
            ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-lg animate-pulse scale-105'
            : sending
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : idleClassName ?? 'bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light'
        }`}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {sending ? (
          <span className="text-sm font-black animate-spin inline-block">↻</span>
        ) : (
          <span>🎤</span>
        )}
        {recording && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 animate-ping" />
        )}
      </button>
    </div>
  )
}
