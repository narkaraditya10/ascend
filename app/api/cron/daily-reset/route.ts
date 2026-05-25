import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKaizenThreshold, getRankFromLevel, getXPToNextLevel, formatTodayDate } from '@/lib/utils'
import { getUTCYesterdayString } from '@/lib/date'
import { updateStreak } from '@/lib/streakShield'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const today = formatTodayDate()
  const yesterday = getUTCYesterdayString()

  const { data: users } = await supabase
    .from('users')
    .select('id, current_streak, best_streak, last_active_date, consecutive_failures, penalty_tier, penalty_zone_active, penalty_zone_started_at')

  if (!users) return NextResponse.json({ ok: true, processed: 0 })

  let processed = 0

  for (const user of users) {
    // ── 1. Expire stale cycles ──────────────────────────────
    const { data: expiredSels } = await supabase
      .from('quest_selections')
      .select('cycle_number')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lt('expires_date', today)

    if (expiredSels && expiredSels.length > 0) {
      await supabase
        .from('quest_selections')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true)
        .lt('expires_date', today)

      const expiredCycleNums = [...new Set(expiredSels.map((s: { cycle_number: number }) => s.cycle_number))]
      for (const cn of expiredCycleNums) {
        await supabase
          .from('cycles')
          .update({ is_complete: true, ended_date: yesterday })
          .eq('user_id', user.id)
          .eq('cycle_number', cn)
          .eq('is_complete', false)
      }

      await supabase
        .from('users')
        .update({ needs_selection: true })
        .eq('id', user.id)
    }

    // ── 2. Penalty Zone timeout check ───────────────────────
    if (user.penalty_zone_active && user.penalty_zone_started_at) {
      const deadline = new Date(user.penalty_zone_started_at).getTime() + 12 * 3600 * 1000
      if (Date.now() >= deadline) {
        const { data: pzProfile } = await supabase
          .from('users')
          .select('level, current_xp')
          .eq('id', user.id)
          .single()

        const pzLevel    = pzProfile?.level     ?? 1
        const pzCurrentXP= pzProfile?.current_xp ?? 0
        const newLevel   = Math.max(1, pzLevel - 1)
        const newRank    = getRankFromLevel(newLevel)
        const newXPToNext= getXPToNextLevel(newLevel)

        await supabase
          .from('users')
          .update({
            penalty_zone_active: false,
            penalty_zone_completed: false,
            penalty_tier: 0,
            consecutive_failures: 0,
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

        // Log Penalty Zone timeout fail to history
        try {
          await supabase.from('penalty_history').insert({
            user_id: user.id,
            date: today,
            penalty_tier: 3,
            xp_lost: pzCurrentXP,
            level_before: pzLevel,
            level_after: newLevel,
            penalty_zone_triggered: true,
            penalty_zone_failed: true,
            penalty_zone_completed: false,
            notes: 'Penalty Zone timed out via daily-reset cron.',
          })
        } catch {}

        await pushNotify(user.id, 'Penalty Zone Failed', 'Consequences applied. The weak remain weak.', 'penalty')
        processed++
        continue
      }
    }

    // ── 3. Skip if already processed today ──────────────────
    if (user.last_active_date === today) {
      processed++
      continue
    }

    // ── 4. Get yesterday's completions ──────────────────────
    const { count: yesterdayCount } = await supabase
      .from('quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('date_assigned', yesterday)
      .eq('is_completed', true)

    const completed = yesterdayCount ?? 0

    const { data: activeSel } = await supabase
      .from('quest_selections')
      .select('cycle_number')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('expires_date', yesterday)
      .limit(1)
      .maybeSingle()

    const threshold = getKaizenThreshold(activeSel?.cycle_number ?? 1)

    // ── 5. Streak + shield update ───────────────────────────
    const result = await updateStreak(user.id, completed, threshold, supabase)
    const shieldConsumed = result?.shieldConsumed ?? false
    const shieldAwarded = result?.shieldAwarded ?? false

    const streakMaintained = completed >= threshold || shieldConsumed
    const weakDay = completed > 0 && completed < threshold

    if (shieldConsumed) {
      await supabase
        .from('users')
        .update({ pending_system_message: 'STREAK SHIELD CONSUMED. FAILURE ABSORBED. ONE CHANCE GIVEN.' })
        .eq('id', user.id)
    } else if (shieldAwarded) {
      await supabase
        .from('users')
        .update({ pending_system_message: 'STREAK SHIELD EARNED. 21 DAYS OF CONSISTENCY ACKNOWLEDGED. SHIELD ACTIVE.' })
        .eq('id', user.id)
    }

    // ── 6. Penalty calculation (skip if shield absorbed the day) ──
    let penaltyTriggered = false
    let newPenaltyTier = user.penalty_tier
    let newConsecutiveFailures = user.consecutive_failures
    const isInPenaltyZone = user.penalty_tier === 3

    if (!isInPenaltyZone && !shieldConsumed) {
      if (completed === 0 || (completed > 0 && completed < 2)) {
        // ── Tier 2: hard failure ──
        penaltyTriggered = true
        await supabase.rpc('apply_all_stat_penalty', {
          p_user_id: user.id,
          p_amount: 5,
        })

        newConsecutiveFailures = (user.consecutive_failures ?? 0) + 1

        if (newConsecutiveFailures >= 3) {
          // Escalate to Tier 3 — Penalty Zone
          newPenaltyTier = 3
          newConsecutiveFailures = 0
          await supabase
            .from('users')
            .update({
              penalty_tier: 3,
              consecutive_failures: 0,
              penalty_zone_active: true,
              penalty_zone_started_at: new Date().toISOString(),
              penalty_zone_active_time: 0,
            })
            .eq('id', user.id)

          // Log Tier 3 activation to history
          try {
            await supabase.from('penalty_history').insert({
              user_id: user.id,
              date: today,
              penalty_tier: 3,
              consecutive_failures: newConsecutiveFailures + 1, // value before reset
              penalty_zone_triggered: true,
              penalty_zone_completed: false,
              penalty_zone_failed: false,
            })
          } catch {}

          await pushNotify(
            user.id,
            'PENALTY ZONE',
            '3 consecutive failures. Penalty Zone activated. 2 hours. Now.',
            'penalty-zone',
            true,
          )
        } else {
          newPenaltyTier = 2
          await supabase.from('penalty_quests').insert({
            user_id: user.id,
            title: 'Face the Debt',
            description:
              'Complete a 90 minute focus session with phone in another room. No exceptions.',
            xp_reward: 120,
            date_assigned: today,
          })

          // Log Tier 2 to history
          try {
            await supabase.from('penalty_history').insert({
              user_id: user.id,
              date: today,
              penalty_tier: 2,
              consecutive_failures: newConsecutiveFailures,
              stats_reduced: { all_stats: 5 },
              penalty_quest_assigned: true,
              penalty_quest_completed: false,
              penalty_zone_triggered: false,
            })
          } catch {}

          await pushNotify(
            user.id,
            'Day Failed',
            'Penalty protocol active. Face it tomorrow. The debt is recorded.',
            'penalty',
          )
        }
      } else if (completed >= 2 && completed < threshold) {
        // ── Tier 1: partial failure ──
        penaltyTriggered = true
        const { data: missedQuests } = await supabase
          .from('quests')
          .select('stat_target')
          .eq('user_id', user.id)
          .eq('date_assigned', yesterday)
          .eq('is_completed', false)
          .not('stat_target', 'is', null)

        const uniqueStats = [...new Set((missedQuests ?? []).map((q) => q.stat_target).filter(Boolean))]
        const statsReducedMap: Record<string, number> = {}
        for (const stat of uniqueStats) {
          await supabase.rpc('decrement_stat', {
            p_user_id: user.id,
            p_stat: stat,
            p_amount: 2,
          })
          if (stat) statsReducedMap[stat] = 2
        }
        newPenaltyTier = 1

        // Log Tier 1 to history
        try {
          await supabase.from('penalty_history').insert({
            user_id: user.id,
            date: today,
            penalty_tier: 1,
            stats_reduced: Object.keys(statsReducedMap).length > 0 ? statsReducedMap : null,
            penalty_zone_triggered: false,
          })
        } catch {}
      } else if (completed >= threshold) {
        // Clear tier 1 on success
        if (user.penalty_tier === 1) {
          newPenaltyTier = 0
          newConsecutiveFailures = 0
        }
      }
    }

    // ── 7. Persist penalty tier (streak already written by updateStreak) ──
    const updatePayload: Record<string, unknown> = {
      consecutive_failures: newConsecutiveFailures,
    }
    if (newPenaltyTier !== user.penalty_tier && newPenaltyTier !== 3) {
      updatePayload.penalty_tier = newPenaltyTier
    }
    await supabase.from('users').update(updatePayload).eq('id', user.id)

    // ── 8. Save daily summary ───────────────────────────────
    await supabase.from('daily_summary').upsert(
      {
        user_id: user.id,
        date: yesterday,
        quests_completed: completed,
        total_xp_earned: 0,
        streak_maintained: streakMaintained,
        weak_day: weakDay,
        penalty_triggered: penaltyTriggered,
      },
      { onConflict: 'user_id,date' },
    )

    // ── 9. Generate today's quests from active selections ───
    const { data: activeSelections } = await supabase
      .from('quest_selections')
      .select('*, quest_pools(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('expires_date', today)

    const { count: existingCount } = await supabase
      .from('quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('date_assigned', today)

    if (existingCount !== null && existingCount > 0) {
      processed++
      continue
    }

    for (const sel of activeSelections ?? []) {
      const pool = sel.quest_pools
      if (!pool) continue

      const { count } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('date_assigned', today)
        .eq('quest_pool_id', pool.id)

      if (count && count > 0) continue

      await supabase.from('quests').insert({
        user_id: user.id,
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

    processed++
  }

  return NextResponse.json({ ok: true, processed })
}

async function pushNotify(
  userId: string,
  title: string,
  body: string,
  tag: string,
  renotify = false,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId, title, body, tag, renotify }),
    })
  } catch {}
}
