import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

webpush.setVapidDetails(
  'mailto:' + Deno.env.get('VAPID_EMAIL'),
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
)

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
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
