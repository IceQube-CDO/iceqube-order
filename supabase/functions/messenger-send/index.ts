// Supabase Edge Function: messenger-send
// Dedicated function for SENDING outgoing Messenger messages.
// Completely separate from messenger-webhook (which receives incoming Facebook events).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")
const FB_API_URL = "https://graph.facebook.com/v19.0/me/messages"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendFBMessage(recipientId: string, text: string) {
  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: "RESPONSE"
  };
  const response = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { recipientId, message } = body;

    if (!recipientId || !message) {
      return new Response(JSON.stringify({ error: "Missing recipientId or message" }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        status: 400,
      });
    }

    console.log(`[messenger-send] Sending to: ${recipientId}`);
    const result = await sendFBMessage(recipientId, message);
    console.log(`[messenger-send] Success:`, result);

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      status: 200,
    });
  } catch (error) {
    console.error(`[messenger-send] Error:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      status: 500,
    });
  }
})
