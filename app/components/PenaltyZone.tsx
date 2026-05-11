'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { completePenaltyZone, failPenaltyZone, updatePenaltyActiveTime } from '@/app/actions/penalty'
import { sendLocalNotification } from '@/lib/notifications'

interface Props {
  startedAt: string
  initialActiveTime: number
}

const REQUIRED_SECONDS = 7200 // 2 hours
const TWELVE_HOURS_MS = 12 * 3600 * 1000
const MONO = { fontFamily: 'var(--font-share-tech-mono)' }
const RAJD = { fontFamily: 'var(--font-rajdhani)' }

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PenaltyZone({ startedAt, initialActiveTime }: Props) {
  const router = useRouter()
  const deadline = new Date(startedAt).getTime() + TWELVE_HOURS_MS

  const [activeSeconds, setActiveSeconds] = useState(initialActiveTime)
  const [completed, setCompleted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failMsg, setFailMsg] = useState('')
  const [timerResetMsg, setTimerResetMsg] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const activeSecondsRef = useRef(activeSeconds)
  activeSecondsRef.current = activeSeconds

  const isRestTime = (() => {
    const h = new Date().getHours()
    return h >= 23 || h < 7
  })()

  // ── Main timer ───────────────────────────────────────────
  useEffect(() => {
    if (completed || failed) return

    const id = setInterval(() => {
      const hour = new Date().getHours()
      if (hour >= 23 || hour < 7) return // rest period
      setActiveSeconds((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(id)
  }, [completed, failed])

  // ── Save timer to DB periodically ───────────────────────
  useEffect(() => {
    if (completed || failed) return
    const id = setInterval(() => {
      void updatePenaltyActiveTime(activeSecondsRef.current)
    }, 30000)
    return () => clearInterval(id)
  }, [completed, failed])

  // ── Check completion ─────────────────────────────────────
  useEffect(() => {
    if (activeSeconds >= REQUIRED_SECONDS && !completed && !failed) {
      handleComplete()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeconds])

  // ── Check 12-hour deadline ───────────────────────────────
  useEffect(() => {
    const check = () => {
      if (!completed && !failed && Date.now() >= deadline) {
        handleFail('Penalty Zone timed out.')
      }
    }
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, failed])

  // ── Visibility change: reset timer on leave ──────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !completed && !failed) {
        setActiveSeconds(0)
        void updatePenaltyActiveTime(0)
        setTimerResetMsg(true)
        sendLocalNotification('Timer reset. Return now.', 'You left the system. Focus broken.', 'penalty-zone')
        setTimeout(() => setTimerResetMsg(false), 3500)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [completed, failed])

  async function handleComplete() {
    if (isProcessing) return
    setIsProcessing(true)
    setCompleted(true)
    await completePenaltyZone()
    router.refresh()
  }

  async function handleFail(msg?: string) {
    if (isProcessing) return
    setIsProcessing(true)
    setFailed(true)
    const result = await failPenaltyZone()
    setFailMsg(msg ?? result?.message ?? 'Penalty Zone failed.')
    router.refresh()
  }

  const progressPct = Math.min(100, Math.round((activeSeconds / REQUIRED_SECONDS) * 100))
  const timeRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  const deadlineFormatted = formatTime(timeRemaining)

  if (completed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#070A12' }}>
        <div className="text-center max-w-sm">
          <p style={{ ...MONO, fontSize: '10px', letterSpacing: '3px', color: '#34d399', marginBottom: 24 }}>
            PENALTY CLEARED
          </p>
          <p style={{ ...RAJD, fontSize: '32px', fontWeight: 700, color: '#E7ECFF', lineHeight: 1.2, marginBottom: 16 }}>
            The system acknowledges<br />your endurance.
          </p>
          <p style={{ ...MONO, fontSize: '11px', color: '#8D96B8' }}>
            Resume your hunt.
          </p>
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#070A12' }}>
        <div className="text-center max-w-sm">
          <p style={{ ...MONO, fontSize: '10px', letterSpacing: '3px', color: '#ff6b6b', marginBottom: 24 }}>
            PENALTY FAILED
          </p>
          <p style={{ ...MONO, fontSize: '12px', color: '#8D96B8', lineHeight: 1.8 }}>
            {failMsg || 'Penalty Zone failed. Consequences applied.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: '#070A12', border: '1px solid rgba(255,107,107,0.15)' }}
    >
      {/* Header */}
      <p style={{ ...MONO, fontSize: '10px', letterSpacing: '4px', color: '#ff6b6b', marginBottom: 8 }}>
        PENALTY ZONE ACTIVE
      </p>
      <p style={{ ...MONO, fontSize: '10px', color: '#8D96B8', marginBottom: 40 }}>
        Stay active for 2 continuous hours
      </p>

      {/* Active timer */}
      <p
        style={{ ...RAJD, fontSize: '64px', fontWeight: 700, color: '#ff6b6b', lineHeight: 1, marginBottom: 8 }}
      >
        {formatTime(activeSeconds)}
      </p>
      <p style={{ ...MONO, fontSize: '9px', color: '#8D96B8', marginBottom: 32, letterSpacing: '2px' }}>
        ACTIVE TIME
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-2">
        <div className="flex justify-between mb-1">
          <span style={{ ...MONO, fontSize: '9px', color: '#8D96B8' }}>PROGRESS</span>
          <span style={{ ...MONO, fontSize: '9px', color: '#ff6b6b' }}>{progressPct}%</span>
        </div>
        <div style={{ height: 6, background: '#1A2035', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #ff6b6b80, #ff6b6b)',
              transition: 'width 1s linear',
              borderRadius: 3,
            }}
          />
        </div>
      </div>

      {/* Deadline */}
      <p style={{ ...MONO, fontSize: '10px', color: '#8D96B8', marginBottom: 24 }}>
        Window closes in{' '}
        <span style={{ color: '#ffc432' }}>{deadlineFormatted}</span>
      </p>

      {/* Rest period notice */}
      {isRestTime && (
        <div
          style={{
            background: 'rgba(75,45,189,0.1)',
            border: '1px solid rgba(75,45,189,0.3)',
            borderRadius: 6,
            padding: '10px 16px',
            marginBottom: 16,
            maxWidth: 280,
            textAlign: 'center',
          }}
        >
          <p style={{ ...MONO, fontSize: '10px', color: '#8D96B8' }}>
            Rest period. Timer paused until 7am.
          </p>
        </div>
      )}

      {/* Timer reset message */}
      {timerResetMsg && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,107,107,0.15)',
            border: '1px solid rgba(255,107,107,0.4)',
            borderRadius: 6,
            padding: '8px 16px',
          }}
        >
          <p style={{ ...MONO, fontSize: '11px', color: '#ff6b6b' }}>
            Focus broken. Timer reset.
          </p>
        </div>
      )}

      <p style={{ ...MONO, fontSize: '9px', color: '#4B2DBD', textAlign: 'center', maxWidth: 260 }}>
        Time does not count between 11pm and 7am
      </p>
    </div>
  )
}
