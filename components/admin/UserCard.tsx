'use client'

import { useState } from 'react'
import type { Stats, Quest, Cycle } from '@/lib/types'

// ── Local row shapes ─────────────────────────────────────────────────────────

type UserRow = {
  id: string
  hunter_name: string | null
  archetype: string | null
  rank: string
  level: number
  total_xp: number
  current_xp: number
  xp_to_next_level: number
  created_at: string
  current_streak: number
  best_streak: number
  penalty_tier: number
  consecutive_failures: number
  penalty_zone_active: boolean
  streak_shield_active: boolean
}

type DaySummaryRow = {
  user_id: string
  date: string
  streak_maintained: boolean
  weak_day: boolean
  quests_completed: number
}

export type PenaltyHistoryRow = {
  id: string
  user_id: string
  date: string
  penalty_tier: number
  consecutive_failures: number | null
  xp_lost: number | null
  stats_reduced: Record<string, number> | null
  level_before: number | null
  level_after: number | null
  penalty_quest_assigned: boolean | null
  penalty_quest_completed: boolean | null
  penalty_zone_triggered: boolean | null
  penalty_zone_completed: boolean | null
  penalty_zone_failed: boolean | null
  penalty_zone_duration_seconds: number | null
  notes: string | null
}

export type QuestSummaryRow = {
  user_id: string
  title: string
  category: string
  date_assigned: string
  is_completed: boolean
  xp_reward: number
}

interface UserCardProps {
  user: UserRow
  userStats: Stats | null
  todayQuests: Quest[]
  summaries: DaySummaryRow[]
  penaltyHistory: PenaltyHistoryRow[]
  allQuests: QuestSummaryRow[]
  cycle: Cycle | null
}

type Tab = 'overview' | 'today' | 'stats' | 'history' | 'penalties'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'OVERVIEW'  },
  { id: 'today',     label: 'TODAY'     },
  { id: 'stats',     label: 'STATS'     },
  { id: 'history',   label: 'HISTORY'   },
  { id: 'penalties', label: 'PENALTIES' },
]

const STAT_DEFS = [
  { key: 'strength',     color: '#FF6B6B' },
  { key: 'focus',        color: '#6CCBFF' },
  { key: 'discipline',   color: '#A78BFA' },
  { key: 'confidence',   color: '#34D399' },
  { key: 'intelligence', color: '#8EF0FF' },
  { key: 'purpose',      color: '#FFC432' },
  { key: 'energy',       color: '#FF9F50' },
] as const

function utcStr(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default function UserCard({
  user, userStats, todayQuests, summaries, penaltyHistory, allQuests, cycle,
}: UserCardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const completedToday = todayQuests.filter((q) => q.is_completed).length
  const totalToday = todayQuests.length
  const xpToday = todayQuests
    .filter((q) => q.is_completed)
    .reduce((s, q) => s + (q.xp_reward ?? 0), 0)
  const daysSinceJoined = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24),
  )

  // Build 30-day activity grid (UTC-safe)
  const thirtyDays = Array.from({ length: 30 }, (_, i) => {
    const now = new Date()
    const target = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (29 - i)),
    )
    const dateStr = utcStr(target)

    const summary    = summaries.find((s) => s.date === dateStr)
    const dayQuests  = allQuests.filter((q) => q.date_assigned === dateStr)
    const completed  = dayQuests.filter((q) => q.is_completed).length
    const total      = dayQuests.length
    const xpEarned   = dayQuests
      .filter((q) => q.is_completed)
      .reduce((s, q) => s + (q.xp_reward ?? 0), 0)
    const penalty    = penaltyHistory.find((p) => p.date === dateStr)

    const status =
      !summary && completed === 0 ? 'none'
      : summary?.streak_maintained      ? 'success'
      : summary?.weak_day || completed > 0 ? 'weak'
      : 'failed'

    return { date: dateStr, day: target.getUTCDate(), summary, completed, total, xpEarned, penalty, status }
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="card-gradient border border-outline-variant relative overflow-hidden">

      {/* Penalty banner */}
      {user.penalty_tier > 0 && (
        <div className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 ${
          user.penalty_tier === 3
            ? 'bg-error/15 text-error border-b border-error/30'
            : user.penalty_tier === 2
              ? 'bg-error/10 text-error/80 border-b border-error/20'
              : 'bg-error/5 text-error/60 border-b border-error/10'
        }`}>
          <span className="material-symbols-outlined text-[14px]">warning</span>
          PENALTY TIER {user.penalty_tier}
          {user.penalty_zone_active && ' — PENALTY ZONE ACTIVE'}
          {(user.consecutive_failures ?? 0) > 0 &&
            ` — ${user.consecutive_failures} CONSECUTIVE FAILURES`}
        </div>
      )}

      {/* User header */}
      <div className="p-4 border-b border-outline-variant flex items-center gap-4">
        <div className="w-10 h-10 bg-[#6CCBFF]/10 border border-[#6CCBFF] flex items-center justify-center flex-shrink-0">
          <span className="font-display text-[16px] text-[#6CCBFF] font-bold">
            {user.hunter_name?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display text-headline-md text-on-surface">{user.hunter_name}</span>
            <span className="font-mono text-[10px] text-primary border border-primary/30 px-2 py-0.5">
              {user.rank} RANK
            </span>
            <span className="font-mono text-[10px] text-secondary">LVL {user.level}</span>
            {user.streak_shield_active && (
              <span className="font-mono text-[10px] text-[#6CCBFF] border border-[#6CCBFF]/30 px-2 py-0.5">
                SHIELD READY
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span className="font-mono text-[10px] text-secondary">{user.archetype}</span>
            <span className="font-mono text-[10px] text-outline">DAY {daysSinceJoined}</span>
            <span className="font-mono text-[10px] text-outline">STREAK {user.current_streak}d</span>
            <span className="font-mono text-[10px] text-outline">BEST {user.best_streak}d</span>
            <span className="font-mono text-[10px] text-[#6CCBFF]">
              {user.total_xp?.toLocaleString()} TOTAL XP
            </span>
          </div>
        </div>

        {/* Today completion ring */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <svg width="44" height="44">
            <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="22" cy="22" r="17" fill="none"
              stroke={
                completedToday >= totalToday && totalToday > 0
                  ? '#34d399'
                  : completedToday > 0
                    ? '#6CCBFF'
                    : 'rgba(255,255,255,0.06)'
              }
              strokeWidth="4"
              strokeDasharray={2 * Math.PI * 17}
              strokeDashoffset={2 * Math.PI * 17 * (1 - (totalToday > 0 ? completedToday / totalToday : 0))}
              transform="rotate(-90 22 22)"
            />
            <text x="22" y="26" textAnchor="middle" fill="#E7ECFF" fontSize="10" fontWeight="700">
              {completedToday}/{totalToday}
            </text>
          </svg>
          <span className="font-mono text-[9px] text-outline">TODAY</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              activeTab === tab.id
                ? 'text-secondary border-b-2 border-secondary bg-secondary/5'
                : 'text-outline hover:text-on-surface-variant'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <div className="p-4">

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'LEVEL',        value: user.level,                         color: 'text-primary'   },
              { label: 'TOTAL XP',     value: user.total_xp?.toLocaleString(),    color: 'text-[#6CCBFF]' },
              { label: 'CURR. STREAK', value: `${user.current_streak}d`,          color: 'text-tertiary'  },
              { label: 'BEST STREAK',  value: `${user.best_streak}d`,             color: 'text-on-surface'},
              { label: 'RANK',         value: user.rank,                          color: 'text-primary'   },
              { label: 'ARCHETYPE',    value: user.archetype ?? '—',              color: 'text-secondary' },
              {
                label: 'PENALTY TIER',
                value: `TIER ${user.penalty_tier}`,
                color: user.penalty_tier > 0 ? 'text-error' : 'text-secondary',
              },
              {
                label: 'CONSEC. FAILS',
                value: user.consecutive_failures ?? 0,
                color: (user.consecutive_failures ?? 0) > 0 ? 'text-error' : 'text-secondary',
              },
            ].map((item) => (
              <div key={item.label} className="bg-surface-container-low border border-outline-variant p-3">
                <div className="font-mono text-[9px] text-outline mb-1 uppercase">{item.label}</div>
                <div className={`font-display text-stat-value ${item.color}`}>{item.value}</div>
              </div>
            ))}

            {/* XP progress */}
            <div className="col-span-4 bg-surface-container-low border border-outline-variant p-3">
              <div className="flex justify-between font-mono text-[9px] mb-2">
                <span className="text-outline">XP TO NEXT LEVEL</span>
                <span className="text-secondary">{user.current_xp} / {user.xp_to_next_level}</span>
              </div>
              <div className="h-1 bg-surface-container-high">
                <div
                  className="h-full bg-secondary"
                  style={{
                    width: `${Math.min(
                      ((user.current_xp ?? 0) / (user.xp_to_next_level ?? 1)) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Cycle */}
            {cycle && (
              <div className="col-span-4 bg-surface-container-low border border-outline-variant p-3 flex gap-6">
                <div>
                  <div className="font-mono text-[9px] text-outline mb-1">CYCLE</div>
                  <div className="font-display text-stat-value text-primary">#{cycle.cycle_number}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-outline mb-1">STARTED</div>
                  <div className="font-mono text-system-label text-on-surface">{cycle.started_date}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-outline mb-1">COMPLETIONS</div>
                  <div className="font-display text-stat-value text-tertiary">{cycle.total_completions}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TODAY */}
        {activeTab === 'today' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center mb-4">
              <div>
                <span className="font-mono text-system-label text-secondary">
                  {completedToday}/{totalToday} QUESTS COMPLETE
                </span>
                <div className="font-mono text-[10px] text-[#6CCBFF] mt-1">+{xpToday} XP EARNED TODAY</div>
              </div>
              {completedToday === 0 && (
                <span className="font-mono text-[10px] text-error border border-error/30 px-2 py-1">
                  NO ACTIVITY
                </span>
              )}
            </div>

            {todayQuests.length === 0 ? (
              <div className="font-mono text-system-label text-outline text-center py-8">
                No quests generated for today
              </div>
            ) : (
              todayQuests.map((quest, i) => (
                <div
                  key={quest.id ?? i}
                  className={`flex items-center gap-3 p-3 border ${
                    quest.is_completed ? 'border-secondary/20 bg-secondary/5' : 'border-outline-variant'
                  }`}
                >
                  <div
                    className={`w-5 h-5 border flex-shrink-0 flex items-center justify-center ${
                      quest.is_completed ? 'bg-secondary/20 border-secondary' : 'border-outline-variant'
                    }`}
                  >
                    {quest.is_completed && (
                      <span className="material-symbols-outlined text-secondary text-[12px]">check</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-mono text-[11px] truncate ${
                      quest.is_completed ? 'text-on-surface-variant line-through' : 'text-on-surface'
                    }`}>
                      {quest.title}
                    </div>
                    <div className="font-mono text-[9px] text-outline mt-0.5 uppercase">{quest.category}</div>
                  </div>
                  <div className={`font-mono text-[11px] flex-shrink-0 ${
                    quest.is_completed ? 'text-[#6CCBFF]' : 'text-outline'
                  }`}>
                    {quest.is_completed ? `+${quest.xp_reward} XP` : `${quest.xp_reward} XP`}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* STATS */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-2 gap-3">
            {userStats ? (
              STAT_DEFS.map((stat) => {
                const val = (userStats as unknown as Record<string, number>)[stat.key] ?? 0
                return (
                  <div key={stat.key} className="bg-surface-container-low border border-outline-variant p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono text-[9px] text-outline uppercase">{stat.key}</span>
                      <span className="font-display text-stat-value text-on-surface">{val}</span>
                    </div>
                    <div className="h-1 bg-surface-container-high">
                      <div className="h-full" style={{ background: stat.color, width: `${Math.min(val, 100)}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-2 font-mono text-system-label text-outline text-center py-8">
                No stats data
              </div>
            )}
          </div>
        )}

        {/* HISTORY — 30-day grid */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="font-mono text-system-label text-outline">30-DAY ACTIVITY RECORD</div>

            <div className="flex gap-4">
              {[
                { cls: 'bg-secondary',      label: 'COMPLETED' },
                { cls: 'bg-tertiary/70',    label: 'WEAK DAY'  },
                { cls: 'bg-error/70',       label: 'FAILED'    },
                { cls: 'bg-surface-variant',label: 'NO DATA'   },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 ${item.cls}`} />
                  <span className="font-mono text-[9px] text-outline">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-10 gap-1">
              {thirtyDays.map((day, i) => (
                <div
                  key={i}
                  title={`${day.date}: ${day.completed}/${day.total} quests  +${day.xpEarned} XP${day.penalty ? `  Penalty T${day.penalty.penalty_tier}` : ''}`}
                  className={`aspect-square flex flex-col items-center justify-center cursor-help relative ${
                    day.status === 'success' ? 'bg-secondary/25 border border-secondary/40'
                    : day.status === 'weak'  ? 'bg-tertiary/20 border border-tertiary/30'
                    : day.status === 'failed'? 'bg-error/20 border border-error/30'
                    : 'bg-surface-variant/20 border border-outline-variant/20'
                  }`}
                >
                  <span className="font-mono text-[8px] text-on-surface-variant">{day.day}</span>
                  {day.penalty && (
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-error" />
                  )}
                </div>
              ))}
            </div>

            {/* Daily breakdown list */}
            <div className="space-y-1 mt-4">
              <div className="font-mono text-system-label text-outline mb-2">RECENT BREAKDOWN</div>
              {thirtyDays
                .filter((d) => d.total > 0)
                .slice()
                .reverse()
                .slice(0, 14)
                .map((day, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 border-b border-outline-variant/20"
                  >
                    <span className="font-mono text-[10px] text-outline w-20 flex-shrink-0">{day.date}</span>
                    <div className={`w-2 h-2 flex-shrink-0 ${
                      day.status === 'success' ? 'bg-secondary'
                      : day.status === 'weak'  ? 'bg-tertiary/70'
                      : day.status === 'failed'? 'bg-error'
                      : 'bg-surface-variant'
                    }`} />
                    <span className="font-mono text-[10px] text-on-surface flex-1">
                      {day.completed}/{day.total} quests
                    </span>
                    <span className="font-mono text-[10px] text-[#6CCBFF] w-20 text-right">
                      +{day.xpEarned} XP
                    </span>
                    {day.penalty && (
                      <span className="font-mono text-[10px] text-error w-24 text-right">
                        T{day.penalty.penalty_tier} PENALTY
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* PENALTIES */}
        {activeTab === 'penalties' && (
          <div className="space-y-4">
            <div className="font-mono text-system-label text-outline">PENALTY RECORD — LAST 30 DAYS</div>

            {/* Current status */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-container-low border border-outline-variant p-3">
                <div className="font-mono text-[9px] text-outline mb-1">CURRENT TIER</div>
                <div className={`font-display text-stat-value ${user.penalty_tier > 0 ? 'text-error' : 'text-secondary'}`}>
                  TIER {user.penalty_tier}
                </div>
              </div>
              <div className="bg-surface-container-low border border-outline-variant p-3">
                <div className="font-mono text-[9px] text-outline mb-1">CONSEC. FAILURES</div>
                <div className={`font-display text-stat-value ${(user.consecutive_failures ?? 0) > 0 ? 'text-error' : 'text-secondary'}`}>
                  {user.consecutive_failures ?? 0}
                </div>
              </div>
              <div className="bg-surface-container-low border border-outline-variant p-3">
                <div className="font-mono text-[9px] text-outline mb-1">PENALTY ZONE</div>
                <div className={`font-display text-stat-value ${user.penalty_zone_active ? 'text-error' : 'text-secondary'}`}>
                  {user.penalty_zone_active ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
            </div>

            {/* History list */}
            {penaltyHistory.length === 0 ? (
              <div className="font-mono text-system-label text-outline text-center py-8">
                No penalties recorded
              </div>
            ) : (
              <div className="space-y-3">
                {penaltyHistory.map((p, i) => (
                  <div key={p.id ?? i} className="border border-error/25 bg-error/5 p-4 space-y-3">

                    {/* Header */}
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-error text-[16px]">warning</span>
                        <span className="font-mono text-system-label text-error">{p.date}</span>
                        <span className="font-mono text-[10px] text-error border border-error/30 px-2 py-0.5">
                          TIER {p.penalty_tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(p.xp_lost ?? 0) > 0 && (
                          <span className="font-mono text-[10px] text-error">
                            -{p.xp_lost} XP LOST
                          </span>
                        )}
                        {p.level_before != null &&
                          p.level_after  != null &&
                          p.level_before !== p.level_after && (
                          <span className="font-mono text-[10px] text-error border border-error/30 px-2 py-0.5">
                            LEVEL {p.level_before} → {p.level_after}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Stats reduced */}
                      {p.stats_reduced && Object.keys(p.stats_reduced).length > 0 && (
                        <div className="space-y-1">
                          <div className="font-mono text-[9px] text-on-surface-variant uppercase">
                            Stats Reduced
                          </div>
                          {Object.entries(p.stats_reduced).map(([stat, val]) => (
                            <div key={stat} className="flex justify-between">
                              <span className="font-mono text-[9px] text-outline uppercase">{stat}</span>
                              <span className="font-mono text-[9px] text-error">-{val}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quest + zone status */}
                      <div className="space-y-2">
                        <div>
                          <div className="font-mono text-[9px] text-on-surface-variant uppercase mb-1">
                            Penalty Quest
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 border ${
                              p.penalty_quest_completed
                                ? 'bg-secondary/20 border-secondary'
                                : p.penalty_quest_assigned
                                  ? 'border-error/50'
                                  : 'border-outline-variant'
                            }`} />
                            <span className="font-mono text-[9px] text-outline">
                              {p.penalty_quest_completed
                                ? 'COMPLETED'
                                : p.penalty_quest_assigned
                                  ? 'NOT COMPLETED'
                                  : 'NOT ASSIGNED'}
                            </span>
                          </div>
                        </div>

                        {p.penalty_zone_triggered && (
                          <div>
                            <div className="font-mono text-[9px] text-on-surface-variant uppercase mb-1">
                              Penalty Zone
                            </div>
                            <div className={`font-mono text-[9px] ${
                              p.penalty_zone_completed ? 'text-secondary'
                              : p.penalty_zone_failed  ? 'text-error'
                              : 'text-tertiary'
                            }`}>
                              {p.penalty_zone_completed
                                ? `CLEARED (${Math.floor((p.penalty_zone_duration_seconds ?? 0) / 60)}m active)`
                                : p.penalty_zone_failed
                                  ? 'FAILED — STATS & LEVEL REDUCED'
                                  : 'TRIGGERED — IN PROGRESS'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
