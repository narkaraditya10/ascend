import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const vapidPublicKey =
  Deno.env.get('VAPID_PUBLIC_KEY') ??
  Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ??
  ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidEmailRaw = Deno.env.get('VAPID_EMAIL') ?? ''
const vapidSubject = vapidEmailRaw.startsWith('mailto:')
  ? vapidEmailRaw
  : `mailto:${vapidEmailRaw}`

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

webpush.setVapidDetails(
  vapidSubject,
  vapidPublicKey,
  vapidPrivateKey,
)

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidEmailRaw) {
    return new Response('Missing VAPID configuration', { status: 500 })
  }

  const { user_id, title, body, tag, url, renotify } = await req.json()

  if (!user_id) {
    return new Response('Missing user_id', { status: 400 })
  }

  const { data: sub, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', user_id)
    .single()

  if (error || !sub?.subscription) {
    return new Response('No subscription found', { status: 404 })
  }

  try {
    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({ title, body, tag, url, renotify }),
    )
    return new Response('Sent', { status: 200 })
  } catch (err) {
    console.error('Push failed:', err)
    return new Response('Push failed', { status: 500 })
  }
})
