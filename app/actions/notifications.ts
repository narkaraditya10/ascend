'use server'

import { createClient } from '@/lib/supabase/server'

export async function sendPushNotification(params: {
  user_id: string
  title: string
  body: string
  tag?: string
  url?: string
  renotify?: boolean
}): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return false
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(params),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function saveNotificationSubscription(
  subscription: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, subscription }, { onConflict: 'user_id' })
}
