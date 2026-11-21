import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

// Configure web-push
// NOTE: VAPID keys must be set in Supabase Secrets
// supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? 'BP1EzcLJvnJ9DOabaKNg85oNzIjQX1dj85Ht4JNSwCLxJ24MQBN0AXAwt2NqfYSzcrOWR9khMk8jlIKksuImydU';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? 'c4mQrtTznT6i_Uy9cHfxHE5dOe7JZuzk6L3i9Cw_7W4';

webpush.setVapidDetails(
  'mailto:admin@iceqube.com',
  vapidPublicKey,
  vapidPrivateKey
);

serve(async (req) => {
  try {
    const payload = await req.json()
    console.log("Received webhook payload:", payload)

    const orderData = payload.record || {}

    // Only alert for genuine NEW customer orders.
    // The app stores settings/config as rows in the `orders` table (CONFIG_*, SYSTEM_CONFIG,
    // is_real=false). Those writes happen on every app launch and must NOT trigger a push.
    const orderId = String(orderData.order_id || '')
    const isRealNewOrder =
      payload.type === 'INSERT' &&
      payload.table === 'orders' &&
      orderData.is_real !== false &&
      orderId !== '' &&
      !orderId.startsWith('CONFIG_') &&
      !String(orderData.customer_name || '').startsWith('SYSTEM_CONFIG') &&
      orderData.po_number !== 'GLOBAL_CONFIG_V2' &&
      orderData.po_number !== 'SYSTEM-GENERATED'

    if (!isRealNewOrder) {
      console.log(`Skipping push for non-order row: ${orderId || '(no id)'} [${payload.type}]`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch subscriptions
    const { data: subscriptions, error } = await supabaseClient
      .from('admin_push_subscriptions')
      .select('*')

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active subscriptions" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Prepare push payload
    const notificationPayload = JSON.stringify({
      title: 'New Order! 🛍️',
      body: `Order has been placed. Tap to view.`,
      url: '/admin_mobile.html'
    })

    // Broadcast push
    const results: any[] = []
    const sendPromises = subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth
        }
      }
      return webpush.sendNotification(pushSubscription, notificationPayload)
        .then(() => {
          results.push({ endpoint: sub.endpoint, status: 'success' })
        })
        .catch(async (err: any) => {
          console.error('Error sending push to endpoint', sub.endpoint, err)
          results.push({ endpoint: sub.endpoint, status: 'error', error: err.message || err.toString(), code: err.statusCode })
          // Remove dead subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseClient.from('admin_push_subscriptions').delete().eq('id', sub.id)
          }
        })
    })

    await Promise.all(sendPromises)

    return new Response(JSON.stringify({ success: true, notified: subscriptions.length, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Error processing webhook:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
