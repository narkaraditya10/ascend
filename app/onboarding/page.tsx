'use client'

import { useState, useEffect } from 'react'
import { completeOnboarding } from '@/app/actions/onboarding'
import { saveNotificationSubscription } from '@/app/actions/notifications'
import { requestNotificationPermission, registerServiceWorker, subscribeUserToPush } from '@/lib/notifications'
import { assignArchetype, getBaselineStats, getArchetypeDescription } from '@/lib/utils'
import type { Archetype } from '@/lib/types'

const STRUGGLE_OPTIONS = [
  { value: 'consistency', label: "Can't stay consistent" },
  { value: 'direction', label: 'No direction or purpose' },
  { value: 'distraction', label: 'Constant distraction' },
  { value: 'confidence', label: 'Lack of confidence' },
  { value: 'energy', label: 'Low energy or physical weakness' },
  { value: 'scattered', label: 'Scattered and overwhelmed mind' },
]

const WINNING_OPTIONS = [
  { value: 'body', label: "A body I'm proud of" },
  { value: 'career', label: 'Real career or skill progress' },
  { value: 'mind', label: 'Control over my mind and emotions' },
  { value: 'respect', label: 'Become someone people respect' },
  { value: 'discipline', label: 'Unbreakable daily discipline' },
]

const KILLER_OPTIONS = [
  { value: 'fade', label: 'Start strong then fade' },
  { value: 'overthink', label: 'Overthink and never start' },
  { value: 'phone', label: 'Phone and entertainment distraction' },
  { value: 'badday', label: 'One bad day ruins everything' },
  { value: 'structure', label: 'No clear structure' },
]

const STAT_LABELS: Record<string, string> = {
  strength: 'STR',
  focus: 'FOC',
  discipline: 'DIS',
  confidence: 'CON',
  intelligence: 'INT',
  purpose: 'PUR',
  energy: 'ENE',
}

const STAT_COLORS: Record<string, string> = {
  strength: '#6CCBFF',
  focus: '#8EF0FF',
  discipline: '#A78BFA',
  confidence: '#F59E0B',
  intelligence: '#34D399',
  purpose: '#EC4899',
  energy: '#F97316',
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [struggle, setStruggle] = useState('')
  const [winning, setWinning] = useState('')
  const [killer, setKiller] = useState('')
  const [archetype, setArchetype] = useState<Archetype | null>(null)
  const [hunterName, setHunterName] = useState('')
  const [commitmentText, setCommitmentText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (step === 5) {
      const timer = setTimeout(() => {
        const result = assignArchetype(struggle, killer)
        setArchetype(result)
        setStep(6)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [step, struggle, killer])

  async function handleFinish() {
    if (!archetype || !hunterName.trim() || !commitmentText.trim()) {
      setError('Complete all fields to proceed.')
      return
    }
    setLoading(true)
    setError('')
    const result = await completeOnboarding({ struggle, killer, winning, hunterName, commitmentText })
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 overflow-hidden">
      {step === 1 && <SplashStep onEnter={() => setStep(2)} />}
      {step === 2 && (
        <QuestionStep
          prompt="What is your biggest struggle right now?"
          options={STRUGGLE_OPTIONS}
          selected={struggle}
          onSelect={(v) => { setStruggle(v); setStep(3) }}
          stepNum="01"
        />
      )}
      {step === 3 && (
        <QuestionStep
          prompt="What does winning look like in 6 months?"
          options={WINNING_OPTIONS}
          selected={winning}
          onSelect={(v) => { setWinning(v); setStep(4) }}
          stepNum="02"
        />
      )}
      {step === 4 && (
        <QuestionStep
          prompt="What always kills your progress?"
          options={KILLER_OPTIONS}
          selected={killer}
          onSelect={(v) => { setKiller(v); setStep(5) }}
          stepNum="03"
        />
      )}
      {step === 5 && <ProcessingStep />}
      {step === 6 && archetype && (
        <ArchetypeReveal archetype={archetype} onContinue={() => setStep(7)} />
      )}
      {step === 7 && (
        <CommitmentStep
          archetype={archetype!}
          hunterName={hunterName}
          commitmentText={commitmentText}
          onHunterNameChange={setHunterName}
          onCommitmentChange={setCommitmentText}
          onContinue={() => setStep(8)}
          error={error}
        />
      )}
      {step === 8 && (
        <NotificationStep onContinue={() => setStep(9)} />
      )}
      {step === 9 && archetype && (
        <StatsReveal
          archetype={archetype}
          onBegin={handleFinish}
          loading={loading}
          error={error}
        />
      )}
    </div>
  )
}

function SplashStep({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="text-center fade-in-up">
      <div className="relative mb-12">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 rounded-full bg-aura-primary/20 blur-3xl animate-pulse" />
        </div>
        <div className="relative">
          <p className="text-xs tracking-[0.5em] text-text-secondary mb-6">SYSTEM ALERT</p>
          <h1
            className="text-5xl sm:text-6xl font-bold tracking-widest text-text-primary leading-tight mb-2"
            style={{ fontFamily: 'var(--font-rajdhani)' }}
          >
            THE SYSTEM
          </h1>
          <h1
            className="text-5xl sm:text-6xl font-bold tracking-widest text-highlight-1 leading-tight text-glow"
            style={{ fontFamily: 'var(--font-rajdhani)' }}
          >
            HAS FOUND YOU
          </h1>
        </div>
      </div>

      <p className="text-text-secondary text-sm tracking-wide max-w-xs mx-auto mb-10 leading-relaxed">
        A latent power signature has been detected. Hunter classification sequence is ready to begin.
      </p>

      <button
        onClick={onEnter}
        className="px-12 py-3.5 border border-aura-primary text-text-primary tracking-[0.3em] text-sm hover:bg-aura-primary/20 transition-all aura-glow-sm"
        style={{ fontFamily: 'var(--font-rajdhani)', fontWeight: 700 }}
      >
        ENTER
      </button>
    </div>
  )
}

function QuestionStep({
  prompt,
  options,
  selected,
  onSelect,
  stepNum,
}: {
  prompt: string
  options: { value: string; label: string }[]
  selected: string
  onSelect: (v: string) => void
  stepNum: string
}) {
  return (
    <div className="w-full max-w-lg fade-in-up">
      <p className="text-xs tracking-[0.4em] text-text-secondary mb-2">QUERY_{stepNum}</p>
      <h2
        className="text-2xl font-semibold text-text-primary mb-8 leading-snug"
        style={{ fontFamily: 'var(--font-rajdhani)' }}
      >
        {prompt}
      </h2>

      <div className="space-y-2.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`w-full text-left px-5 py-3.5 border rounded-sm text-sm tracking-wide transition-all ${
              selected === opt.value
                ? 'border-aura-primary bg-aura-primary/20 text-text-primary'
                : 'border-border bg-card text-text-secondary hover:border-aura-primary/50 hover:text-text-primary hover:bg-aura-primary/10'
            }`}
          >
            <span className="text-text-secondary/40 text-xs mr-3">›</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ProcessingStep() {
  return (
    <div className="text-center">
      <div className="relative mb-10">
        <div className="w-20 h-20 mx-auto border border-aura-primary/50 rounded-full flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-highlight-1/40"
            style={{ animation: 'spin 3s linear infinite' }}
          />
          <div className="w-2 h-2 rounded-full bg-highlight-1 animate-pulse" />
        </div>
      </div>

      <p
        className="text-xl font-semibold tracking-[0.3em] text-text-primary mb-4"
        style={{ fontFamily: 'var(--font-rajdhani)' }}
      >
        ANALYZING HUNTER PROFILE
      </p>

      <div className="flex items-center justify-center gap-2 text-text-secondary text-xs tracking-widest">
        {['Processing weakness matrix', 'Calibrating growth vector', 'Assigning archetype'].map(
          (line, i) => (
            <span
              key={i}
              className="opacity-0"
              style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.8}s forwards` }}
            >
              {i > 0 && <span className="mx-2 opacity-40">·</span>}
              {line}
            </span>
          )
        )}
      </div>
    </div>
  )
}

function ArchetypeReveal({ archetype, onContinue }: { archetype: Archetype; onContinue: () => void }) {
  const info = getArchetypeDescription(archetype)

  const archetypeColors: Record<Archetype, string> = {
    'Silent Warrior': '#6CCBFF',
    'Dormant Titan': '#A78BFA',
    'Lost Hunter': '#F59E0B',
    'Broken Mage': '#EC4899',
    'Overthinker Rogue': '#34D399',
    'Iron Ghost': '#F97316',
  }
  const color = archetypeColors[archetype]

  return (
    <div className="w-full max-w-md text-center flicker-in">
      <p className="text-xs tracking-[0.5em] text-text-secondary mb-6">ARCHETYPE IDENTIFIED</p>

      <div className="relative mb-8">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ filter: `blur(40px)` }}
        >
          <div className="w-48 h-48 rounded-full opacity-30" style={{ background: color }} />
        </div>
        <h1
          className="relative text-4xl sm:text-5xl font-bold tracking-widest leading-tight"
          style={{ fontFamily: 'var(--font-rajdhani)', color }}
        >
          {archetype.toUpperCase()}
        </h1>
      </div>

      <div className="bg-card border border-border rounded-sm p-6 mb-8 text-left space-y-4">
        <p className="text-text-primary text-sm leading-relaxed">{info.description}</p>
        <div className="h-px bg-border" />
        <div>
          <p className="text-xs tracking-[0.3em] text-red-400/80 mb-1">PRIMARY WEAKNESS</p>
          <p className="text-text-secondary text-xs leading-relaxed">{info.weakness}</p>
        </div>
        <div>
          <p className="text-xs tracking-[0.3em] mb-1" style={{ color }}>
            GROWTH VECTOR
          </p>
          <p className="text-text-secondary text-xs leading-relaxed">{info.growth}</p>
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full py-3.5 text-sm tracking-[0.3em] font-semibold transition-all rounded-sm"
        style={{
          fontFamily: 'var(--font-rajdhani)',
          background: color + '22',
          border: `1px solid ${color}`,
          color: color,
        }}
      >
        ACCEPT CLASSIFICATION
      </button>
    </div>
  )
}

function CommitmentStep({
  archetype,
  hunterName,
  commitmentText,
  onHunterNameChange,
  onCommitmentChange,
  onContinue,
  error,
}: {
  archetype: Archetype
  hunterName: string
  commitmentText: string
  onHunterNameChange: (v: string) => void
  onCommitmentChange: (v: string) => void
  onContinue: () => void
  error: string
}) {
  return (
    <div className="w-full max-w-md fade-in-up">
      <p className="text-xs tracking-[0.4em] text-text-secondary mb-2">OATH_PROTOCOL</p>
      <h2
        className="text-2xl font-semibold text-text-primary mb-8"
        style={{ fontFamily: 'var(--font-rajdhani)' }}
      >
        Before you begin — make it real.
      </h2>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-text-secondary tracking-widest mb-1.5">
            CHOOSE YOUR DESIGNATION
          </label>
          <input
            value={hunterName}
            onChange={(e) => onHunterNameChange(e.target.value)}
            maxLength={20}
            className="w-full bg-bg-secondary border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-aura-primary transition-colors"
            placeholder="Your hunter name..."
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary tracking-widest mb-1.5">
            WHY DOES THIS ACTUALLY MATTER TO YOU?
          </label>
          <textarea
            value={commitmentText}
            onChange={(e) => onCommitmentChange(e.target.value)}
            rows={4}
            className="w-full bg-bg-secondary border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-aura-primary transition-colors resize-none leading-relaxed"
            placeholder="Write your oath. Be specific. Be honest. The system records everything."
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 tracking-wide border border-red-400/20 bg-red-400/5 px-3 py-2 rounded-sm">
            {error}
          </p>
        )}

        <button
          onClick={onContinue}
          disabled={!hunterName.trim() || !commitmentText.trim()}
          className="w-full bg-aura-primary hover:bg-aura-primary/80 disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-semibold tracking-widest py-3 rounded-sm transition-all"
          style={{ fontFamily: 'var(--font-rajdhani)' }}
        >
          SEAL THE OATH
        </button>
      </div>
    </div>
  )
}

function StatsReveal({
  archetype,
  onBegin,
  loading,
  error,
}: {
  archetype: Archetype
  onBegin: () => void
  loading: boolean
  error: string
}) {
  const stats = getBaselineStats(archetype)

  return (
    <div className="w-full max-w-md text-center fade-in-up">
      <p className="text-xs tracking-[0.4em] text-text-secondary mb-2">BASELINE CALIBRATION</p>
      <h2
        className="text-2xl font-semibold text-text-primary mb-2"
        style={{ fontFamily: 'var(--font-rajdhani)' }}
      >
        Your Starting Stats
      </h2>
      <p className="text-text-secondary text-xs mb-8 tracking-wide">
        These are your baseline attributes as a {archetype}.
      </p>

      <div className="bg-card border border-border rounded-sm p-6 mb-6 space-y-3">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs w-8 text-right" style={{ color: STAT_COLORS[key] }}>
              {STAT_LABELS[key]}
            </span>
            <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${value}%`,
                  background: `linear-gradient(90deg, ${STAT_COLORS[key]}88, ${STAT_COLORS[key]})`,
                  boxShadow: `0 0 8px ${STAT_COLORS[key]}44`,
                }}
              />
            </div>
            <span className="text-xs text-text-secondary w-6 text-left">{value}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-4 tracking-wide border border-red-400/20 bg-red-400/5 px-3 py-2 rounded-sm">
          {error}
        </p>
      )}

      <button
        onClick={onBegin}
        disabled={loading}
        className="w-full bg-aura-primary hover:bg-aura-primary/80 disabled:opacity-50 text-text-primary font-bold tracking-widest py-4 rounded-sm transition-all aura-glow-sm"
        style={{ fontFamily: 'var(--font-rajdhani)', fontSize: '1rem' }}
      >
        {loading ? 'INITIALIZING SYSTEM...' : 'BEGIN ASCENSION'}
      </button>
    </div>
  )
}

function NotificationStep({ onContinue }: { onContinue: () => void }) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle')

  async function handleAllow() {
    setStatus('requesting')
    try {
      const granted = await requestNotificationPermission()
      if (granted) {
        await registerServiceWorker()
        try {
          const sub = await subscribeUserToPush()
          if (sub) await saveNotificationSubscription(sub.toJSON() as Record<string, unknown>)
        } catch {}
        setStatus('granted')
        setTimeout(onContinue, 1500)
      } else {
        setStatus('denied')
      }
    } catch {
      setStatus('denied')
    }
  }

  return (
    <div className="w-full max-w-md fade-in-up text-center">
      <p className="text-xs tracking-[0.4em] text-text-secondary mb-2">SYSTEM_NOTIFICATIONS</p>
      <h2
        className="text-2xl font-semibold text-text-primary mb-6"
        style={{ fontFamily: 'var(--font-rajdhani)' }}
      >
        The system requires access.
      </h2>
      <div className="bg-card border border-border rounded-sm p-6 mb-6 text-left">
        <p className="text-text-secondary text-sm leading-relaxed mb-4">
          The system requires permission to send you reminders and alerts. This is how it holds you accountable.
        </p>
        <div className="space-y-2 text-xs text-text-secondary/60">
          <p>· Daily hunt reminders at 9am, 2pm, 8pm</p>
          <p>· Streak at risk alerts</p>
          <p>· Penalty zone warnings and level-up notifications</p>
        </div>
      </div>

      {status === 'idle' && (
        <button
          onClick={handleAllow}
          className="w-full bg-aura-primary hover:bg-aura-primary/80 text-text-primary font-bold tracking-widest py-3 rounded-sm transition-all mb-3"
          style={{ fontFamily: 'var(--font-rajdhani)' }}
        >
          ALLOW NOTIFICATIONS
        </button>
      )}
      {status === 'requesting' && (
        <p className="text-text-secondary text-sm tracking-widest mb-3">REQUESTING PERMISSION...</p>
      )}
      {status === 'granted' && (
        <p style={{ color: '#34d399' }} className="text-sm tracking-widest mb-3">
          NOTIFICATIONS ENABLED. PROCEEDING...
        </p>
      )}
      {status === 'denied' && (
        <div className="mb-3">
          <p className="text-text-secondary/50 text-xs mb-4 leading-relaxed">
            Notifications disabled. You will receive no reminders.<br />
            The system will still record your failures.
          </p>
        </div>
      )}

      {(status === 'denied' || status === 'idle') && (
        <button
          onClick={onContinue}
          className="text-xs text-text-secondary/40 tracking-widest hover:text-text-secondary transition-colors"
        >
          {status === 'denied' ? 'CONTINUE →' : 'SKIP'}
        </button>
      )}
    </div>
  )
}
