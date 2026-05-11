import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ensureTodayQuests, checkDailyStreak, checkAndExpireCycles } from '@/app/actions/quests'
import { getMonarchProgress, getRankColor, formatTodayDate, getKaizenThreshold } from '@/lib/utils'
import DashboardClient from '@/app/components/DashboardClient'
import type { UserProfile, Stats, Quest, QuestPool, QuestSelection, CycleReportData, PoolCategory, PenaltyQuest } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileRes, statsRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('stats').select('*').eq('user_id', user.id).single(),
  ])

  const profile = profileRes.data as UserProfile | null
  const stats = statsRes.data as Stats | null
  if (!profile?.hunter_name) redirect('/onboarding')

  const today = formatTodayDate()

  // ── Check selection phase ────────────────────────────────────
  const { data: activeSelections } = await supabase
    .from('quest_selections')
    .select('*, quest_pools(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .gte('expires_date', today)

  const needsSelectionPhase =
    (profile.needs_selection === true) || !activeSelections || activeSelections.length === 0

  // Get last completed cycle for report
  const { data: lastCycle } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', user.id)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .single()

  const isFirstCycle = !lastCycle
  let cycleReport: CycleReportData | null = null

  if (needsSelectionPhase && lastCycle) {
    // Build cycle report from last cycle
    const { count: totalCompletions } = await supabase
      .from('quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_completed', true)
      .gte('date_assigned', lastCycle.started_date)

    cycleReport = {
      cycle: lastCycle,
      totalCompletions: totalCompletions ?? 0,
      totalDaysActive: lastCycle.total_days_active,
      bestStreak: profile.best_streak,
      newCycleNumber: lastCycle.cycle_number + 1,
    }
  }

  // ── Quest pools for selection UI ─────────────────────────────
  let questPoolsByCategory: Record<string, QuestPool[]> = {}
  let previousSelectionIds: string[] = []

  if (needsSelectionPhase) {
    const { data: pools } = await supabase
      .from('quest_pools')
      .select('*')
      .neq('category', 'elite')
      .order('difficulty', { ascending: true })

    if (pools) {
      for (const pool of pools) {
        const cat = pool.category as string
        if (!questPoolsByCategory[cat]) questPoolsByCategory[cat] = []
        questPoolsByCategory[cat].push(pool as QuestPool)
      }
    }

    // Previous selections so we can highlight upgrades in the UI
    if (lastCycle) {
      const { data: prevSels } = await supabase
        .from('quest_selections')
        .select('quest_pool_id, quest_pools(upgrade_group)')
        .eq('user_id', user.id)
        .eq('cycle_number', lastCycle.cycle_number)

      previousSelectionIds = (prevSels ?? []).map((s: { quest_pool_id: string }) => s.quest_pool_id)
    }
  }

  // ── Cycle expiry + streak check + quest generation ───────────
  await checkAndExpireCycles(user.id)
  if (!needsSelectionPhase) await checkDailyStreak(user.id)

  // ensureTodayQuests generates quests if missing and returns today's list
  const [ensureResult, penaltyQuestsRes] = await Promise.all([
    needsSelectionPhase
      ? Promise.resolve({ needsSelection: true, quests: [] as Quest[] })
      : ensureTodayQuests(user.id),
    supabase
      .from('penalty_quests')
      .select('*')
      .eq('user_id', user.id)
      .eq('date_assigned', today),
  ])

  const quests = ensureResult.quests
  const penaltyQuests = (penaltyQuestsRes.data ?? []) as PenaltyQuest[]

  // ── Cycle metadata for dashboard ─────────────────────────────
  const currentCycleNumber = needsSelectionPhase
    ? (lastCycle?.cycle_number ?? 0) + 1
    : (activeSelections?.[0] as QuestSelection)?.cycle_number ?? 1

  const kaizenThreshold = getKaizenThreshold(currentCycleNumber)

  const cycleExpiresDate =
    !needsSelectionPhase && activeSelections?.[0]
      ? (activeSelections[0] as QuestSelection).expires_date
      : null

  const daysSinceJoin =
    Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1

  return (
    <DashboardClient
      profile={profile}
      stats={stats}
      quests={(quests ?? []) as Quest[]}
      penaltyQuests={penaltyQuests}
      dayCount={daysSinceJoin}
      monarchProgress={getMonarchProgress(profile.level)}
      rankColor={getRankColor(profile.rank)}
      needsSelectionPhase={needsSelectionPhase}
      isFirstCycle={isFirstCycle}
      cycleReport={cycleReport}
      questPoolsByCategory={questPoolsByCategory as Record<PoolCategory, QuestPool[]>}
      previousSelectionIds={previousSelectionIds}
      currentCycleNumber={currentCycleNumber}
      kaizenThreshold={kaizenThreshold}
      cycleExpiresDate={cycleExpiresDate}
    />
  )
}
