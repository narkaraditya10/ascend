'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getRankFromLevel, getXPToNextLevel } from '@/lib/utils'
import { getUTCDateString } from '@/lib/date'

export async function completePenaltyZone() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  // Read active time before it gets reset to 0
  const { data: currentData } = await supabase
    .from('users')
    .select('penalty_zone_active_time')
    .eq('id', user.id)
    .single()
  const activeTime = currentData?.penalty_zone_active_time ?? 0

  await supabase
    .from('users')
    .update({
      penalty_zone_active: false,
      penalty_zone_completed: true,
      penalty_tier: 0,
      consecutive_failures: 0,
      penalty_zone_active_time: 0,
    })
    .eq('id', user.id)

  // Log to penalty_history (non-critical — table may not exist yet)
  try {
    await supabase.from('penalty_history').insert({
      user_id: user.id,
      date: getUTCDateString(),
      penalty_tier: 3,
      penalty_zone_triggered: true,
      penalty_zone_completed: true,
      penalty_zone_failed: false,
      penalty_zone_duration_seconds: activeTime,
    })
  } catch {}

  revalidatePath('/dashboard')
  return { success: true }
}

export async function failPenaltyZone() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { data: profile } = await supabase
    .from('users')
    .select('level, current_xp, penalty_zone_active')
    .eq('id', user.id)
    .single()

  if (!profile?.penalty_zone_active) return { success: false }

  const levelBefore = profile.level ?? 1
  const xpLost      = profile.current_xp ?? 0
  const newLevel    = Math.max(1, levelBefore - 1)
  const newRank     = getRankFromLevel(newLevel)
  const newXPToNext = getXPToNextLevel(newLevel)

  await supabase
    .from('users')
    .update({
      penalty_zone_active: false,
      penalty_zone_completed: false,
      penalty_tier: 0,
      consecutive_failures: 0,
      penalty_zone_active_time: 0,
      level: newLevel,
      rank: newRank,
      xp_to_next_level: newXPToNext,
      current_xp: 0,
    })
    .eq('id', user.id)

  await supabase.rpc('apply_all_stat_penalty', {
    p_user_id: user.id,
    p_amount: 10,
  })

  // Log to penalty_history
  try {
    await supabase.from('penalty_history').insert({
      user_id: user.id,
      date: getUTCDateString(),
      penalty_tier: 3,
      xp_lost: xpLost,
      level_before: levelBefore,
      level_after: newLevel,
      penalty_zone_triggered: true,
      penalty_zone_failed: true,
      penalty_zone_completed: false,
    })
  } catch {}

  revalidatePath('/dashboard')
  return {
    success: true,
    message: 'Penalty Zone failed. Consequences applied. The weak remain weak.',
  }
}

export async function completePenaltyQuest(penaltyQuestId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { data: pq } = await supabase
    .from('penalty_quests')
    .select('*')
    .eq('id', penaltyQuestId)
    .eq('user_id', user.id)
    .single()

  if (!pq || pq.is_completed) return { success: false }

  await supabase
    .from('penalty_quests')
    .update({ is_completed: true })
    .eq('id', penaltyQuestId)

  // Give XP reward
  const { data: profile } = await supabase
    .from('users')
    .select('current_xp, total_xp, level, xp_to_next_level')
    .eq('id', user.id)
    .single()

  if (profile) {
    let newCurrentXP = profile.current_xp + pq.xp_reward
    let newTotalXP = profile.total_xp + pq.xp_reward
    let newLevel = profile.level
    let newXPToNext = profile.xp_to_next_level

    while (newCurrentXP >= newXPToNext) {
      newCurrentXP -= newXPToNext
      newLevel++
      newXPToNext = getXPToNextLevel(newLevel)
    }

    const newRank = getRankFromLevel(newLevel)

    await supabase
      .from('users')
      .update({
        current_xp: newCurrentXP,
        total_xp: newTotalXP,
        level: newLevel,
        xp_to_next_level: newXPToNext,
        rank: newRank,
        penalty_tier: 0,
      })
      .eq('id', user.id)
  }

  // Log quest completion to penalty_history
  try {
    await supabase.from('penalty_history').insert({
      user_id: user.id,
      date: getUTCDateString(),
      penalty_tier: 2,
      penalty_quest_assigned: true,
      penalty_quest_completed: true,
    })
  } catch {}

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updatePenaltyActiveTime(seconds: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('users')
    .update({ penalty_zone_active_time: seconds })
    .eq('id', user.id)
}
