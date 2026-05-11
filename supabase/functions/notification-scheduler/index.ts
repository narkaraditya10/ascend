import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

webpush.setVapidDetails(
  'mailto:' + Deno.env.get('VAPID_EMAIL'),
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
)

async function sendToUser(
  userId: string,
  title: string,
  body: string,
  tag: string,
  renotify = false,
) {
  const { data: sub } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId)
    .single()

  if (!sub?.subscription) return

  try {
    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({ title, body, tag, renotify }),
    )
  } catch {
    // Ignore send failures (stale subscription etc)
  }
}

Deno.serve(async (_req: Request) => {
  const now = new Date()
  const hour = now.getUTCHours()
  const today = now.toISOString().split('T')[0]

  // Get all users with push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id')

  if (!subscriptions?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
  }

  const userIds = subscriptions.map((s: { user_id: string }) => s.user_id)
  let sent = 0

  for (const userId of userIds) {
    const { data: user } = await supabase
      .from('users')
      .select('hunter_name, current_streak, penalty_tier, penalty_zone_active, penalty_zone_started_at')
      .eq('id', userId)
      .single()

    if (!user) continue

    const { count: completedToday } = await supabase
      .from('quests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('date_assigned', today)
      .eq('is_completed', true)

    const done = completedToday ?? 0

    const { data: activeSel } = await supabase
      .from('quest_selections')
      .select('cycle_number')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('expires_date', today)
      .limit(1)
      .maybeSingle()

    const cycleNumber = activeSel?.cycle_number ?? 1
    const thresholds = [0, 4, 5, 6, 7]
    const threshold = thresholds[Math.min(cycleNumber, 4)]

    const name = user.hunter_name ?? 'Hunter'

    // Penalty zone reminders
    if (user.penalty_zone_active && user.penalty_zone_started_at) {
      const startMs = new Date(user.penalty_zone_started_at).getTime()
      const hoursElapsed = (Date.now() - startMs) / 3600000
      const hoursRemaining = Math.max(0, 12 - hoursElapsed)

      if (hour % 2 === 0) { // Every 2 hours during active hours
        if (hour >= 7 && hour < 23) {
          await sendToUser(
            userId,
            'Penalty Zone Active',
            `${Math.ceil(hoursRemaining)} hours remaining. Complete or face consequences.`,
            'penalty-zone',
            true,
          )
          sent++
        }
      }
      continue
    }

    if (hour === 9 && done === 0) {
      const { count: totalQuests } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date_assigned', today)
      await sendToUser(
        userId,
        'System Active',
        `Your daily hunt is waiting. ${totalQuests ?? 0} quests assigned. Begin.`,
        'morning-reminder',
      )
      sent++
    } else if (hour === 14 && done < Math.floor(threshold / 2)) {
      const { count: total } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date_assigned', today)
      const remaining = (total ?? 0) - done
      await sendToUser(
        userId,
        `Hunter ${name}`,
        `${remaining} quests remaining. Momentum builds now. Don't fall behind.`,
        'midday-reminder',
      )
      sent++
    } else if (hour === 20 && done < threshold) {
      const { count: total } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date_assigned', today)
      const remaining = (total ?? 0) - done
      await sendToUser(
        userId,
        '3 Hours Remaining',
        `${remaining} quests unresolved. The system is watching. Finish the hunt.`,
        'evening-reminder',
      )
      sent++
    } else if (hour === 21 && user.current_streak > 3 && done < threshold) {
      await sendToUser(
        userId,
        'Streak At Risk',
        `${user.current_streak} day streak. Don't let it end tonight. One quest at a time.`,
        'streak-reminder',
      )
      sent++
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 })
})
