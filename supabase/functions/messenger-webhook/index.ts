// Supabase Edge Function: messenger-webhook v2.0.0 (2026-05-21)
// v2: Added /send dedicated path to bypass Facebook platform webhook handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")
const FB_API_URL = "https://graph.facebook.com/v19.0/me/messages"

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
    messaging_type: "MESSAGE_TAG",
    tag: "POST_PURCHASE_UPDATE"
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
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    } })
  }

  try {
    let recipientId, message, messagingType, tag;
    const contentType = req.headers.get("content-type") || "";
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ── FACEBOOK PLATFORM INCOMING EVENTS (from Messenger users) ──
    // When a customer messages the IceQube page, Facebook POSTs here.
    // Respond with EVENT_RECEIVED to acknowledge. Route to /send for outgoing.
    console.log(`[Webhook] Request received. Method: ${req.method}, Pathname: ${pathname}`);
    if (req.method === "POST" && !pathname.endsWith("/send")) {
      const bodyText = await req.text();
      console.log(`[Webhook] Path does not end with /send. Body start: ${bodyText.substring(0, 50)}`);
      // Check if it's a Facebook platform event (has 'object' field)
      try {
        const fbBody = JSON.parse(bodyText);
        if (fbBody.object === "page" && fbBody.entry) {
          console.log("[Facebook] Incoming page event received. Entries:", fbBody.entry.length);
          return new Response("EVENT_RECEIVED", { status: 200 });
        }
        // Re-parse for our own use below (not a FB event, it's our own call via /send)
        // Fall through to existing JSON handling with the parsed body
        // We can't re-read the stream, so re-attach the body for downstream processing
        const body = fbBody;
        
        // Check if it's a Supabase Database Webhook trigger
        if (body.type === "INSERT" && body.table === "orders" && body.record) {
          const record = body.record;
          if (record.is_real === false) {
            console.log(`[Webhook] Skipping mock order: ${record.order_id}`);
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
          const msg = `❄️ ICEQUBE ORDER CONFIRMED!\n\nDeliver to: ${record.customer_name}\nItem: ${itemsText}\nSubtotal: ₱${subtotal.toFixed(2)}\nDelivery fee: ₱${deliveryFee.toFixed(2)}\n${heavyLoad > 0 ? `Bulk Weight Fee: ₱${heavyLoad.toFixed(2)}\n` : ''}Total: ₱${totalGross.toFixed(2)}\nPayment: ${record.payment_method || 'Cash'}\n\nThank you for your order!`;
          const adminMsg = `🚨 NEW ORDER ALERT!\n\nDeliver to: ${record.customer_name}\nItem: ${itemsText}\nTotal: ₱${totalGross.toFixed(2)}\nPayment: ${record.payment_method || 'Cash'}\n\nCheck the Control Room!`;
          const results: any = {};
          if (customerId) {
            try { results.customer = await sendFBMessage(customerId, msg); }
            catch (err) { results.customer_error = err.message; }
          } else { results.customer_skipped = "No messenger_id"; }
          results.admins = {};
          for (const adminPsid of ADMIN_PSIDS) {
            if (adminPsid === customerId) continue;
            try { results.admins[adminPsid] = await sendFBMessage(adminPsid, adminMsg); }
            catch (err) { results.admins[adminPsid] = { error: err.message }; }
          }
          return new Response(JSON.stringify({ success: true, results }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 200,
          });
        }

        // Direct send (recipientId + message)
        recipientId = body.recipientId;
        message = body.message;
        messagingType = body.messaging_type;
        tag = body.tag;
      } catch (e) {
        // Not JSON — fall through
      }
    }

    // ── DIAGNOSTIC: Find PSIDs from Facebook Page Conversations ──
    if (url.searchParams.get("action") === "find_psid") {
      console.log("[Diagnostic] Fetching Facebook Page conversations to find PSIDs...");
      try {
        const convResp = await fetch(
          `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time&limit=25&access_token=${FB_PAGE_ACCESS_TOKEN}`
        );
        const convData = await convResp.json();
        
        if (convData.error) {
          return new Response(JSON.stringify({ error: convData.error }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 400,
          });
        }

        // Extract unique participants with their PSIDs
        const participants: any[] = [];
        const seen = new Set();
        (convData.data || []).forEach((conv: any) => {
          (conv.participants?.data || []).forEach((p: any) => {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              participants.push({ psid: p.id, name: p.name, last_message: conv.updated_time });
            }
          });
        });

        return new Response(JSON.stringify({
          success: true,
          current_admin_psids: ADMIN_PSIDS,
          instructions: "Find YOUR name in the list below. The 'psid' next to your name is the correct PSID to add to ADMIN_PSIDS.",
          participants
        }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to query Facebook API", details: err.message }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 500,
        });
      }
    }

    // ── Facebook Webhook Verification (GET with hub.verify_token) ──
    if (req.method === "GET" && url.searchParams.get("hub.mode") === "subscribe") {
      const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "iceqube_verify_token";
      if (url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
        console.log("[Webhook] Facebook verification successful");
        return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (contentType.includes("form") || req.method === "GET") {
      // Handle Form Data or URL Params (Bypass mode)
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
        
        const adminMsg = `🚨 NEW ORDER ALERT!\n\n` +
                         `Deliver to: ${record.customer_name}\n` +
                         `Item: ${itemsText}\n` +
                         `Total: ₱${totalGross.toFixed(2)}\n` +
                         `Payment: ${record.payment_method || 'Cash'}\n\n` +
                         `Check the Control Room!`;

        const results: any = {};
        
        // 1. Send to Customer (whoever ordered gets the order confirmation message)
        // Prevent sending to the Facebook Page ID itself to avoid inbox spam
        if (customerId && customerId !== '61557321703652') {
          try {
            results.customer = await sendFBMessage(customerId, msg);
          } catch (err) {
            results.customer_error = err.message;
            console.error(`[Webhook] Customer send failed:`, err);
          }
        } else {
          results.customer_skipped = "No valid customer messenger_id";
        }
        
        let activeAdmins: string[] = [];
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        
        if (supabaseUrl && supabaseAnonKey) {
          try {
            const res = await fetch(`${supabaseUrl}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_TEAM_MEMBERS&select=items`, {
              headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
            });
            if (res.ok) {
              const data = await res.json();
              let itemsData = data[0].items;
              if (typeof itemsData === 'string') {
                try { itemsData = JSON.parse(itemsData); } catch (e) {}
              }
              if (Array.isArray(itemsData)) {
                activeAdmins = itemsData
                  .filter((m: any) => m.status === 'Active' && 
                                (m.roleCategory === 'Admin Officer' || m.roleCategory === 'Admin' || m.roleCategory === 'Hub Staff') &&
                                m.messenger && m.messenger.length > 5 && m.messenger !== 'N/A' &&
                                m.messenger !== customerId)
                  .map((m: any) => m.messenger);
              }
            }
          } catch (err) {
            console.warn("Failed to fetch team members from cloud:", err);
          }
        }
        
        if (activeAdmins.length === 0) {
          activeAdmins = ["26521276764196410", "32834231939557699", "712885031918698"].filter(id => id !== customerId);
        }

        // 2. Send to ALL Admins (except the customer who placed the order to avoid double receipt)
        results.admins = {};
        for (const adminPsid of activeAdmins) {
          try {
            results.admins[adminPsid] = await sendFBMessage(adminPsid, adminMsg);
          } catch (err) {
            results.admins[adminPsid] = { error: err.message };
            console.error(`[Webhook] Admin send failed for ${adminPsid}:`, err);
          }
        }
        
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      }
      if (body.action === 'broadcast_to_admins') {
        const customerId = body.customerId || '';
        const msgText = body.message || '🚨 NEW ORDER ALERT!';
        let activeAdmins: string[] = [];
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        
        if (supabaseUrl && supabaseAnonKey) {
          try {
            const res = await fetch(`${supabaseUrl}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_TEAM_MEMBERS&select=items`, {
              headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
            });
            if (res.ok) {
              const data = await res.json();
              let itemsData = data[0].items;
              if (typeof itemsData === 'string') {
                try { itemsData = JSON.parse(itemsData); } catch (e) {}
              }
              if (Array.isArray(itemsData)) {
                activeAdmins = itemsData
                  .filter((m: any) => m.status === 'Active' && 
                                (m.roleCategory === 'Admin Officer' || m.roleCategory === 'Admin' || m.roleCategory === 'Hub Staff') &&
                                m.messenger && m.messenger.length > 5 && m.messenger !== 'N/A' &&
                                m.messenger !== customerId)
                  .map((m: any) => m.messenger);
              }
            }
          } catch (err) {
            console.warn("Failed to fetch team members from cloud:", err);
          }
        }
        
        // Fallback to hardcoded list if fetch fails or no admins configured
        if (activeAdmins.length === 0) {
          activeAdmins = ["26521276764196410", "32834231939557699", "712885031918698"].filter(id => id !== customerId);
        }
        
        const results: any = {};
        for (const adminPsid of activeAdmins) {
          try {
            results[adminPsid] = await sendFBMessage(adminPsid, msgText);
          } catch (err) {
            results[adminPsid] = { error: err.message };
          }
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

    // Default to MESSAGE_TAG to bypass the 24h standard messaging window
    if (!messagingType || messagingType === "RESPONSE") {
      messagingType = "MESSAGE_TAG";
      if (!tag) tag = "POST_PURCHASE_UPDATE";
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
