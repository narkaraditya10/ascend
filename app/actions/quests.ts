'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  formatTodayDate,
  getRankFromLevel,
  getXPToNextLevel,
  getKaizenThreshold,
  getWeekNumber,
} from '@/lib/utils'
import { sendPushNotification } from '@/app/actions/notifications'
import type { QuestCompletionResult, Quest, QuestPool } from '@/lib/types'

// ── Daily quest generation ────────────────────────────────────

export async function generateDailyQuests(userId: string) {
  const supabase = await createClient()
  const today = formatTodayDate()

  // Clean up stale incomplete quests from previous days
  await supabase
    .from('quests')
    .delete()
    .eq('user_id', userId)
    .neq('date_assigned', today)
    .eq('is_completed', false)

  const { data: activeSelections } = await supabase
    .from('quest_selections')
    .select('*, quest_pools(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('expires_date', today)

  if (!activeSelections || activeSelections.length === 0) return

  // Quick check: if all expected quests already exist, skip generation
  const { count: todayCount } = await supabase
    .from('quests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date_assigned', today)

  if (todayCount !== null && todayCount >= activeSelections.length) return

  for (const sel of activeSelections) {
    const pool = sel.quest_pools
    if (!pool) continue

    const { count } = await supabase
      .from('quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('date_assigned', today)
      .eq('quest_pool_id', pool.id)

    if (count && count > 0) continue

    await supabase.from('quests').insert({
      user_id: userId,
      title: pool.title,
      description: pool.description,
      category: pool.category,
      quest_type: 'side',
      xp_reward: pool.xp_reward,
      stat_target: pool.stat_target,
      stat_reward: pool.stat_reward ?? 1,
      is_completed: false,
      date_assigned: today,
      date_completed: null,
      quest_pool_id: pool.id,
    })
  }

  // Elite quest: weekly rotation, E-rank (level 6+) only
  const { data: userProfile } = await supabase
    .from('users')
    .select('level, elite_quest_assigned_week')
    .eq('id', userId)
    .single()

  if (userProfile && userProfile.level >= 6) {
    const currentWeek = getWeekNumber()
    const { data: elitePools } = await supabase
      .from('quest_pools')
      .select('*')
      .eq('category', 'elite')
      .order('title')

    if (elitePools && elitePools.length > 0) {
      const weekIndex = currentWeek % elitePools.length
      const elitePool = elitePools[weekIndex]

      const { count: eliteExists } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date_assigned', today)
        .eq('quest_type', 'elite')

      if (!eliteExists || eliteExists === 0) {
        await supabase.from('quests').insert({
          user_id: userId,
          title: elitePool.title,
          description: elitePool.description,
          category: elitePool.category,
          quest_type: 'elite',
          xp_reward: elitePool.xp_reward,
          stat_target: elitePool.stat_target,
          stat_reward: elitePool.stat_reward ?? 2,
          is_completed: false,
          date_assigned: today,
          date_completed: null,
          quest_pool_id: elitePool.id,
        })

        // Record which week's quest was assigned so Monday rotation works correctly
        const assignedWeek = (userProfile as Record<string, unknown>).elite_quest_assigned_week as number | null
        if (assignedWeek !== currentWeek) {
          await supabase
            .from('users')
            .update({ elite_quest_assigned_week: currentWeek })
            .eq('id', userId)
        }
      }
    }
  }
}

// ── Ensure today's quests exist, generating if needed ────────
// Safe to call from both server components and client (via server action).
// Returns the quest list for today, generating from active selections if missing.

export async function ensureTodayQuests(userId: string): Promise<{ needsSelection: boolean; quests: Quest[] }> {
  const supabase = await createClient()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // If today's quests already exist, return them immediately
  const { count } = await supabase
    .from('quests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date_assigned', today)

  if (count && count > 0) {
    const { data: quests } = await supabase
      .from('quests')
      .select('*')
      .eq('user_id', userId)
      .eq('date_assigned', today)
      .order('is_completed', { ascending: true })
      .order('created_at', { ascending: true })
    return { needsSelection: false, quests: (quests ?? []) as Quest[] }
  }

  // No quests for today — check for active selections (any, not filtered by expiry)
  const { data: selections } = await supabase
    .from('quest_selections')
    .select('*, quest_pools(*)')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!selections || selections.length === 0) {
    return { needsSelection: true, quests: [] }
  }

  // Clean up stale incomplete quests from prior days
  await supabase
    .from('quests')
    .delete()
    .eq('user_id', userId)
    .neq('date_assigned', today)
    .eq('is_completed', false)

  // Build insert rows for each non-elite selection
  const questsToInsert = selections.flatMap((sel) => {
    const pool = sel.quest_pools as QuestPool | null
    if (!pool || pool.category === 'elite') return []
    return [{
      user_id: userId,
      quest_pool_id: sel.quest_pool_id,
      title: pool.title,
      description: pool.description,
      category: pool.category,
      quest_type: 'side' as const,
      xp_reward: pool.xp_reward,
      stat_target: pool.stat_target,
      stat_reward: pool.stat_reward ?? 1,
      is_completed: false,
      date_assigned: today,
      date_completed: null,
    }]
  })

  const insertedQuests: Quest[] = []

  if (questsToInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from('quests')
      .insert(questsToInsert)
      .select()

    if (error) {
      console.error('Quest generation error:', error)
      return { needsSelection: false, quests: [] }
    }

    if (inserted) insertedQuests.push(...(inserted as Quest[]))
  }

  // Elite quest: unlock at level 6+ (E-rank), weekly rotation keyed to account age
  const { data: userProfile } = await supabase
    .from('users')
    .select('level, created_at')
    .eq('id', userId)
    .single()

  if (userProfile && userProfile.level >= 6) {
    const { data: elitePools } = await supabase
      .from('quest_pools')
      .select('*')
      .eq('category', 'elite')
      .order('title')

    if (elitePools && elitePools.length > 0) {
      const weekNumber = Math.floor(
        (Date.now() - new Date(userProfile.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
      const elitePool = elitePools[weekNumber % elitePools.length] as QuestPool

      const { data: eliteInserted } = await supabase
        .from('quests')
        .insert({
          user_id: userId,
          quest_pool_id: elitePool.id,
          title: elitePool.title,
          description: elitePool.description,
          category: elitePool.category,
          quest_type: 'elite',
          xp_reward: elitePool.xp_reward,
          stat_target: elitePool.stat_target,
          stat_reward: elitePool.stat_reward ?? 2,
          is_completed: false,
          date_assigned: today,
          date_completed: null,
        })
        .select()
        .single()

      if (eliteInserted) insertedQuests.push(eliteInserted as Quest)
    }
  }

  return { needsSelection: false, quests: insertedQuests }
}

// ── Expire stale cycles on dashboard load ────────────────────

export async function checkAndExpireCycles(userId: string) {
  const supabase = await createClient()
  const today = formatTodayDate()

  const { data: expired } = await supabase
    .from('quest_selections')
    .select('cycle_number')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('expires_date', today)

  if (!expired || expired.length === 0) return

  await supabase
    .from('quest_selections')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('expires_date', today)

  const cycleNums = [...new Set(expired.map((s) => s.cycle_number))]
  for (const cn of cycleNums) {
    await supabase
      .from('cycles')
      .update({ is_complete: true, ended_date: today })
      .eq('user_id', userId)
      .eq('cycle_number', cn)
      .eq('is_complete', false)
  }

  await supabase
    .from('users')
    .update({ needs_selection: true })
    .eq('id', userId)
}

// ── Daily streak boundary check ───────────────────────────────
// Call once when the dashboard loads to evaluate yesterday's completions.

export async function checkDailyStreak(userId: string) {
  const supabase = await createClient()
  const today = formatTodayDate()

  const { data: profile } = await supabase
    .from('users')
    .select('current_streak, best_streak, last_active_date')
    .eq('id', userId)
    .single()

  if (!profile || profile.last_active_date === today) return

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { count: yesterdayCount } = await supabase
    .from('quests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date_assigned', yesterdayStr)
    .eq('is_completed', true)

  const completed = yesterdayCount ?? 0

  const { data: activeSelection } = await supabase
    .from('quest_selections')
    .select('cycle_number')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('expires_date', yesterdayStr)
    .limit(1)
    .maybeSingle()

  const threshold = getKaizenThreshold(activeSelection?.cycle_number ?? 1)

  let newStreak = profile.current_streak
  let newBestStreak = profile.best_streak
  let streakMaintained = false
  let weakDay = false

  if (completed === 0) {
    newStreak = 0
  } else if (completed >= threshold) {
    newStreak = profile.last_active_date === yesterdayStr
      ? profile.current_streak + 1
      : 1
    if (newStreak > newBestStreak) newBestStreak = newStreak
    streakMaintained = true
  } else {
    // Weak day: neither increment nor reset
    weakDay = true
  }

  await supabase
    .from('users')
    .update({ current_streak: newStreak, best_streak: newBestStreak, last_active_date: today })
    .eq('id', userId)

  // Save daily summary for yesterday (ignore error if table not yet created)
  await supabase.from('daily_summary').upsert(
    {
      user_id: userId,
      date: yesterdayStr,
      quests_completed: completed,
      total_xp_earned: 0,
      streak_maintained: streakMaintained,
      weak_day: weakDay,
      penalty_triggered: false,
    },
    { onConflict: 'user_id,date' },
  )
}

// ── Quest completion ──────────────────────────────────────────

export async function completeQuest(questId: string): Promise<QuestCompletionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, leveledUp: false, error: 'Not authenticated.' }

  const { data: quest } = await supabase
    .from('quests')
    .select('*')
    .eq('id', questId)
    .eq('user_id', user.id)
    .single()

  if (!quest || quest.is_completed) return { success: false, leveledUp: false }

  await supabase
    .from('quests')
    .update({ is_completed: true, date_completed: new Date().toISOString() })
    .eq('id', questId)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return { success: false, leveledUp: false }

  // XP + level calculation
  let newCurrentXP = profile.current_xp + quest.xp_reward
  let newTotalXP = profile.total_xp + quest.xp_reward
  let newLevel = profile.level
  let newXPToNext = profile.xp_to_next_level
  let leveledUp = false

  while (newCurrentXP >= newXPToNext) {
    newCurrentXP -= newXPToNext
    newLevel += 1
    newXPToNext = getXPToNextLevel(newLevel)
    leveledUp = true
  }

  const previousRank = getRankFromLevel(profile.level)
  const newRank = getRankFromLevel(newLevel)
  const rankChanged = newRank !== previousRank
  const eliteUnlocked = previousRank === 'F' && newRank === 'E'

  // Streak logic
  const today = formatTodayDate()

  const { data: activeSelection } = await supabase
    .from('quest_selections')
    .select('cycle_number')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .gte('expires_date', today)
    .limit(1)
    .maybeSingle()

  const cycleNumber = activeSelection?.cycle_number ?? 1
  const threshold = getKaizenThreshold(cycleNumber)

  const { count: completedToday } = await supabase
    .from('quests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('date_assigned', today)
    .eq('is_completed', true)

  // +1 because we just marked the quest complete
  const completedCount = (completedToday ?? 0) + 1

  let newStreak = profile.current_streak
  let newBestStreak = profile.best_streak
  const lastActive = profile.last_active_date

  if (completedCount >= threshold) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    if (lastActive === yesterdayStr || lastActive === today) {
      if (lastActive !== today) newStreak += 1
    } else {
      newStreak = 1
    }

    if (newStreak > newBestStreak) newBestStreak = newStreak
  }

  await supabase
    .from('users')
    .update({
      current_xp: newCurrentXP,
      total_xp: newTotalXP,
      level: newLevel,
      xp_to_next_level: newXPToNext,
      rank: newRank,
      current_streak: newStreak,
      best_streak: newBestStreak,
      last_active_date: today,
    })
    .eq('id', user.id)

  // Stat reward (+2 bonus on level up)
  if (quest.stat_target && quest.stat_reward) {
    const increment = leveledUp ? quest.stat_reward + 2 : quest.stat_reward
    await supabase.rpc('increment_stat', {
      p_user_id: user.id,
      p_stat: quest.stat_target,
      p_amount: increment,
    })
  }

  // Track cycle completion progress
  if (activeSelection) {
    await supabase
      .from('cycles')
      .upsert(
        { user_id: user.id, cycle_number: cycleNumber, started_date: today },
        { onConflict: 'user_id,cycle_number', ignoreDuplicates: false },
      )

    await supabase.rpc('increment_cycle_completions', {
      p_user_id: user.id,
      p_cycle_number: cycleNumber,
    })
  }

  // Save daily summary (ignore error if table not yet created)
  const { data: existingSummary } = await supabase
    .from('daily_summary')
    .select('total_xp_earned')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  await supabase.from('daily_summary').upsert(
    {
      user_id: user.id,
      date: today,
      quests_completed: completedCount,
      total_xp_earned: (existingSummary?.total_xp_earned ?? 0) + quest.xp_reward,
      streak_maintained: completedCount >= threshold,
      weak_day: completedCount > 0 && completedCount < threshold,
      penalty_triggered: false,
    },
    { onConflict: 'user_id,date' },
  )

  // Push notifications — fire and forget, don't block response
  if (leveledUp && newRank) {
    sendPushNotification({
      user_id: user.id,
      title: 'LEVEL UP',
      body: `You are now Level ${newLevel}. ${newRank} Hunter. The system acknowledges your growth.`,
      tag: 'level-up',
    }).catch(() => {})
  }

  revalidatePath('/dashboard')

  return {
    success: true,
    leveledUp,
    newLevel: leveledUp ? newLevel : undefined,
    newRank: leveledUp ? newRank : undefined,
    previousRank,
    rankChanged,
    eliteUnlocked,
    xpEarned: quest.xp_reward,
    statTarget: quest.stat_target,
    statReward: quest.stat_reward,
  }
}

// ── Quest un-complete ─────────────────────────────────────────

export async function uncompleteQuest(questId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: quest } = await supabase
    .from('quests')
    .select('*')
    .eq('id', questId)
    .eq('user_id', user.id)
    .single()

  if (!quest || !quest.is_completed) return

  await supabase
    .from('quests')
    .update({ is_completed: false, date_completed: null })
    .eq('id', questId)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return

  const newCurrentXP = Math.max(0, profile.current_xp - quest.xp_reward)
  const newTotalXP = Math.max(0, profile.total_xp - quest.xp_reward)

  await supabase
    .from('users')
    .update({ current_xp: newCurrentXP, total_xp: newTotalXP })
    .eq('id', user.id)

  revalidatePath('/dashboard')
}

// ── Save quest selections (start new cycle) ───────────────────

export async function saveQuestSelections(
  selections: { quest_pool_id: string; category: string }[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const today = formatTodayDate()
  const expiresDate = new Date()
  expiresDate.setDate(expiresDate.getDate() + 21)
  const expiresStr = expiresDate.toISOString().split('T')[0]

  const { data: lastCycle } = await supabase
    .from('cycles')
    .select('cycle_number')
    .eq('user_id', user.id)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .single()

  const cycleNumber = (lastCycle?.cycle_number ?? 0) + 1

  await supabase
    .from('quest_selections')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true)

  const rows = selections.map((s) => ({
    user_id: user.id,
    quest_pool_id: s.quest_pool_id,
    category: s.category,
    cycle_number: cycleNumber,
    selected_date: today,
    expires_date: expiresStr,
    is_active: true,
  }))

  const { error } = await supabase.from('quest_selections').insert(rows)
  if (error) return { error: error.message }

  await supabase
    .from('users')
    .update({ needs_selection: false })
    .eq('id', user.id)

  await supabase
    .from('cycles')
    .upsert(
      {
        user_id: user.id,
        cycle_number: cycleNumber,
        started_date: today,
        total_completions: 0,
        total_days_active: 0,
        is_complete: false,
      },
      { onConflict: 'user_id,cycle_number' },
    )

  revalidatePath('/dashboard')
  return { cycleNumber }
}
