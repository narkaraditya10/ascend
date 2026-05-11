'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getRankFromLevel, getXPToNextLevel } from '@/lib/utils'

export async function completePenaltyZone() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

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

  revalidatePath('/dashboard')
  return { success: true }
}

export async function failPenaltyZone() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { data: profile } = await supabase
    .from('users')
    .select('level, penalty_zone_active')
    .eq('id', user.id)
    .single()

  if (!profile?.penalty_zone_active) return { success: false }

  const newLevel = Math.max(1, (profile.level ?? 1) - 1)
  const newRank = getRankFromLevel(newLevel)
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
