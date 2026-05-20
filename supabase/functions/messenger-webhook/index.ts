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
    let recipientId, message, messagingType, tag;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("form") || req.method === "GET") {
      // Handle Form Data or URL Params (Bypass mode)
      const url = new URL(req.url);
      recipientId = url.searchParams.get("recipientId");
      message = url.searchParams.get("message");
      messagingType = url.searchParams.get("messaging_type");
      tag = url.searchParams.get("tag");

      if (!recipientId) {
        const formData = await req.formData().catch(() => new FormData());
        recipientId = formData.get("recipientId");
        message = formData.get("message");
        messagingType = formData.get("messaging_type") || messagingType;
        tag = formData.get("tag") || tag;
      }
    } else {
      // Handle Standard JSON
      const body = await req.json().catch(() => ({}));
      recipientId = body.recipientId;
      message = body.message;
      messagingType = body.messaging_type;
      tag = body.tag;
    }

    if (!recipientId || !message) {
      return new Response(JSON.stringify({ error: "Missing recipientId or message", received: { recipientId, message } }), {
        headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        status: 400,
      })
    }

    // Default to RESPONSE messaging type if not provided (Meta deprecated Message Tags in Feb 2026)
    if (!messagingType || messagingType === "MESSAGE_TAG") {
      messagingType = "RESPONSE";
    }

    const payload: any = {
      recipient: { id: recipientId },
      message: { text: message }
    }

    if (messagingType) {
      payload.messaging_type = messagingType;
    }
    if (tag && tag !== "CONFIRMED_ORDER_UPDATE") {
      payload.tag = tag;
    }

    console.log(`[Messenger] Relaying to FB: ${recipientId} (messaging_type: ${messagingType}, tag: ${tag})`);
    
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
