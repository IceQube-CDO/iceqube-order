// Supabase Edge Function: messenger-proxy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")
const FB_API_URL = "https://graph.facebook.com/v19.0/me/messages"

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    } })
  }

  try {
    const { recipientId, message } = await req.json()

    if (!recipientId || !message) {
      return new Response(JSON.stringify({ error: "Missing recipientId or message" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      })
    }

    const payload = {
      recipient: { id: recipientId },
      message: { text: message },
    }

    const response = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    return new Response(JSON.stringify(result), {
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*'
      },
      status: response.status,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*'
      },
      status: 500,
    })
  }
})
