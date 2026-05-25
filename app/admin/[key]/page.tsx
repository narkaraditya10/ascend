import { createAdminClient } from '@/lib/supabase/admin'
import { getUTCDateString } from '@/lib/date'
import RefreshButton from './RefreshButton'
import UserCard from '@/components/admin/UserCard'
import type { UserProfile, Stats, Quest, Cycle } from '@/lib/types'
import type { PenaltyHistoryRow, QuestSummaryRow } from '@/components/admin/UserCard'

export const revalidate = 60

type DailySummaryRow = {
  user_id: string
  date: string
  streak_maintained: boolean
  weak_day: boolean
  quests_completed: number
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const { key } = await params

  if (key !== process.env.ADMIN_SECRET_KEY) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="font-display text-display-lg text-error">403</div>
          <div className="font-mono text-system-label text-on-surface-variant">
            ACCESS DENIED. INVALID CREDENTIALS.
          </div>
        </div>
      </div>
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="font-mono text-system-label text-error text-center space-y-2">
          <div>CONFIGURATION ERROR</div>
          <div className="text-outline">SUPABASE_SERVICE_ROLE_KEY not set</div>
        </div>
      </div>
    )
  }

  const supabaseAdmin = createAdminClient()
  const today = getUTCDateString()

  // 30-day window (UTC-safe)
  const now = new Date()
  const thirtyDaysAgoDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30),
  )
  const thirtyDaysAgoStr = `${thirtyDaysAgoDate.getUTCFullYear()}-${String(thirtyDaysAgoDate.getUTCMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgoDate.getUTCDate()).padStart(2, '0')}`

  console.log('[admin] today UTC:', today)
  console.log('[admin] 30-day window from:', thirtyDaysAgoStr)

  const [
    usersRes,
    allStatsRes,
    todayQuestsRes,
    recentSummariesRes,
    cyclesRes,
    penaltyHistoryRes,
    allQuestsRes,
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('stats').select('*'),
    supabaseAdmin.from('quests').select('*').eq('date_assigned', today),
    supabaseAdmin
      .from('daily_summary')
      .select('user_id, date, streak_maintained, weak_day, quests_completed')
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: true }),
    supabaseAdmin.from('cycles').select('*'),
    supabaseAdmin
      .from('penalty_history')
      .select('*')
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false }),
    supabaseAdmin
      .from('quests')
      .select('user_id, title, category, date_assigned, is_completed, xp_reward')
      .gte('date_assigned', thirtyDaysAgoStr)
      .order('date_assigned', { ascending: false }),
  ])

  // Collect query errors
  const errors: string[] = []
  if (usersRes.error)          errors.push(`users: ${usersRes.error.message}`)
  if (allStatsRes.error)       errors.push(`stats: ${allStatsRes.error.message}`)
  if (todayQuestsRes.error)    errors.push(`quests (today): ${todayQuestsRes.error.message}`)
  if (recentSummariesRes.error)errors.push(`daily_summary: ${recentSummariesRes.error.message}`)
  if (cyclesRes.error)         errors.push(`cycles: ${cyclesRes.error.message}`)
  if (allQuestsRes.error)      errors.push(`quests (history): ${allQuestsRes.error.message}`)
  // penalty_history may not exist yet — don't surface that specific error
  if (penaltyHistoryRes.error && !penaltyHistoryRes.error.message.includes('does not exist')) {
    errors.push(`penalty_history: ${penaltyHistoryRes.error.message}`)
  }

  const rawUsers       = (usersRes.data         ?? []) as UserProfile[]
  const allStats       = (allStatsRes.data       ?? []) as Stats[]
  const todayQuests    = (todayQuestsRes.data    ?? []) as Quest[]
  const recentSummaries= (recentSummariesRes.data?? []) as DailySummaryRow[]
  const cycles         = (cyclesRes.data         ?? []) as Cycle[]
  const penaltyHistory = (penaltyHistoryRes.data ?? []) as PenaltyHistoryRow[]
  const allQuests      = (allQuestsRes.data      ?? []) as QuestSummaryRow[]

  console.log('[admin] users:', rawUsers.length, '| today quests:', todayQuests.length,
    '| summaries:', recentSummaries.length, '| penalty_history:', penaltyHistory.length)
  if (errors.length) console.error('[admin] query errors:', errors)

  // ── Overview totals ─────────────────────────────────────────────────────────
  const activeToday = [
    ...new Set(todayQuests.filter((q) => q.is_completed).map((q) => q.user_id)),
  ].length
  const questsCompletedToday = todayQuests.filter((q) => q.is_completed).length
  const xpEarnedToday = todayQuests
    .filter((q) => q.is_completed)
    .reduce((sum, q) => sum + (q.xp_reward ?? 0), 0)
  const totalPenaltiesActive = rawUsers.filter((u) => u.penalty_tier > 0).length

  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <header className="border-b border-outline-variant px-8 py-4 flex justify-between items-center sticky top-0 bg-surface z-40">
        <div>
          <div className="font-mono text-system-label text-secondary tracking-widest">ASCEND SYSTEM</div>
          <h1 className="font-display text-headline-md text-on-surface">ADMIN CONSOLE</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-system-label text-outline">{today}</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
            <span className="font-mono text-system-label text-secondary">LIVE</span>
          </div>
          <RefreshButton />
        </div>
      </header>

      {/* DB error banner */}
      {errors.length > 0 && (
        <div className="mx-8 mt-6 border border-error/40 bg-error/10 p-4 flex flex-col gap-2">
          <div className="font-mono text-system-label text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">error</span>
            DATABASE QUERY ERRORS — CHECK SERVICE ROLE KEY AND TABLE PERMISSIONS
          </div>
          {errors.map((e) => (
            <div key={e} className="font-mono text-[10px] text-error/70">{e}</div>
          ))}
        </div>
      )}

      {/* ── Overview stat cards ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-5 gap-4 px-8 py-6">
        {[
          { label: 'TOTAL HUNTERS',     value: rawUsers.length,              color: 'text-primary',                                         icon: 'group'         },
          { label: 'ACTIVE TODAY',      value: activeToday,                  color: 'text-secondary',                                       icon: 'bolt'          },
          { label: 'QUESTS DONE TODAY', value: questsCompletedToday,         color: 'text-tertiary',                                        icon: 'check_circle'  },
          { label: 'XP EARNED TODAY',   value: xpEarnedToday.toLocaleString(),color: 'text-[#6CCBFF]',                                     icon: 'stars'         },
          { label: 'PENALTIES ACTIVE',  value: totalPenaltiesActive,         color: totalPenaltiesActive > 0 ? 'text-error' : 'text-secondary', icon: 'warning'   },
        ].map((stat) => (
          <div
            key={stat.label}
            className="card-gradient border border-outline-variant p-6 flex flex-col gap-3"
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-system-label text-on-surface-variant">{stat.label}</span>
              <span className="material-symbols-outlined text-outline-variant">{stat.icon}</span>
            </div>
            <div className={`font-display text-display-lg ${stat.color} leading-none`}>{stat.value}</div>
          </div>
        ))}
      </section>

      {/* ── Hunter records ────────────────────────────────────────────────────── */}
      <section className="px-8 pb-8">
        <h2 className="font-mono text-system-label text-on-surface-variant mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">person_search</span>
          HUNTER RECORDS
        </h2>

        {rawUsers.length === 0 && errors.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-[48px] text-outline mb-4 block">
              person_search
            </span>
            <div className="font-mono text-system-label text-outline">NO HUNTERS REGISTERED</div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {rawUsers.map((user) => {
              const userStats         = allStats.find((s) => s.user_id === user.id) ?? null
              const userTodayQuests   = todayQuests.filter((q) => q.user_id === user.id)
              const userSummaries     = recentSummaries.filter((s) => s.user_id === user.id)
              const userPenaltyHistory= penaltyHistory.filter((p) => p.user_id === user.id)
              const userAllQuests     = allQuests.filter((q) => q.user_id === user.id)
              const userCycle         = cycles.find((c) => c.user_id === user.id && !c.is_complete) ?? null

              return (
                <UserCard
                  key={user.id}
                  user={user}
                  userStats={userStats}
                  todayQuests={userTodayQuests}
                  summaries={userSummaries}
                  penaltyHistory={userPenaltyHistory}
                  allQuests={userAllQuests}
                  cycle={userCycle}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
