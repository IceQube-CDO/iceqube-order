// Supabase Edge Function: messenger-webhook
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")
const FB_API_URL = "https://graph.facebook.com/v19.0/me/messages"
const ADMIN_PSID = "26521276764196410"

function formatItems(itemsStr: string): string {
  try {
    const rawItems = JSON.parse(itemsStr);
    let parts: string[] = [];
    
    // FULL DICE
    const f = rawItems.fullDice || {};
    const f3 = (f.bag3kg || f['3kg'] || 0);
    const f1 = (f.bag1kg || f['1kg'] || 0);
    if (f3 > 0) parts.push(`${f3}x 3kg Full`);
    if (f1 > 0) parts.push(`${f1}x 1kg Full`);
    
    // HALF DICE
    const h = rawItems.halfDice || {};
    const h3 = (h.bag3kg || h['3kg'] || 0);
    const h1 = (h.bag1kg || h['1kg'] || 0);
    if (h3 > 0) parts.push(`${h3}x 3kg Half`);
    if (h1 > 0) parts.push(`${h1}x 1kg Half`);
    
    if (parts.length > 0) return parts.join(', ');
  } catch (e) {
    console.warn('Items parse failed in Edge Function:', e);
  }
  return 'Ice Products';
}

async function sendFBMessage(recipientId: string, text: string) {
  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: "RESPONSE"
  };
  
  console.log(`[Messenger] Sending to FB: ${recipientId}`);
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
      
      // Check if it's a Supabase Database Webhook trigger
      if (body.type === "INSERT" && body.table === "orders" && body.record) {
        const record = body.record;
        
        // Safeguard to only send for real/active orders
        if (record.is_real === false) {
          console.log(`[Webhook] Skipping notification for system test/mock order: ${record.order_id}`);
          return new Response(JSON.stringify({ success: true, message: "Skipped mock/test order" }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 200,
          });
        }

        const customerId = record.messenger_id;
        const itemsText = formatItems(record.items);
        
        const totalGross = Number(record.total_price || 0);
        const deliveryFee = Number(record.delivery_fee || 0);
        const heavyLoad = Number(record.priority_fee || 0);
        const subtotal = Math.max(0, totalGross - deliveryFee - heavyLoad);
        
        const msg = `❄️ ICEQUBE ORDER CONFIRMED!\n\n` +
                    `Deliver to: ${record.customer_name}\n` +
                    `Item: ${itemsText}\n` +
                    `Subtotal: ₱${subtotal.toFixed(2)}\n` +
                    `Delivery fee: ₱${deliveryFee.toFixed(2)}\n` +
                    (heavyLoad > 0 ? `Bulk Weight Fee: ₱${heavyLoad.toFixed(2)}\n` : '') +
                    `Total: ₱${totalGross.toFixed(2)}\n` +
                    `Payment: ${record.payment_method || 'Cash'}\n\n` +
                    `Thank you for your order!`;
        
        const results: any = {};
        
        // 1. Send to Customer
        if (customerId && customerId !== ADMIN_PSID) {
          try {
            results.customer = await sendFBMessage(customerId, msg);
          } catch (err) {
            results.customer_error = err.message;
            console.error(`[Webhook] Customer send failed:`, err);
          }
        } else {
          results.customer_skipped = "No valid customer messenger_id";
        }
        
        // 2. Always Send to Admin
        try {
          results.admin = await sendFBMessage(ADMIN_PSID, msg);
        } catch (err) {
          results.admin_error = err.message;
          console.error(`[Webhook] Admin copy send failed:`, err);
        }
        
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      }
      
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
