// Supabase Edge Function: messenger-webhook v2.0.0 (2026-05-21)
// v2: Added /send dedicated path to bypass Facebook platform webhook handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")
const FB_API_URL = "https://graph.facebook.com/v21.0/me/messages"
const ADMIN_PSIDS = ["26521276764196410", "32834231939557699", "712885031918698"];

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

async function sendTelegramMessage(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    return null;
  }
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
    const data = await res.json();
    console.log(`[Telegram] Send result:`, data);
    return data;
  } catch (e) {
    console.error("[Telegram] Send failed:", e);
    return { error: e.message };
  }
}

async function sendDiscordMessage(text: string) {
  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    return null;
  }
  
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text })
    });
    if (!res.ok) {
      console.error("[Discord] Webhook returned status:", res.status, await res.text());
    } else {
      console.log("[Discord] Webhook notification sent successfully");
    }
    return { success: res.ok };
  } catch (e) {
    console.error("[Discord] Send failed:", e);
    return { error: e.message };
  }
}

async function broadcastToBackups(text: string) {
  await Promise.allSettled([
    sendTelegramMessage(text),
    sendDiscordMessage(text)
  ]);
}

async function sendFBMessage(recipientId: string, text: string) {
  // Strategy: Try standard messaging first (works within 24h window),
  // then fall back to MESSAGE_TAG if outside window.
  // This avoids the HUMAN_AGENT approval issue from deprecated tags.
  
  const standardPayload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: "UPDATE"
  };
  
  console.log(`[Messenger] Sending to FB (standard): ${recipientId}`);
  const response = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(standardPayload),
  });
  
  const result = await response.json();
  
  if (response.ok) {
    return result;
  }
  
  // If standard messaging failed (outside 24h window), retry with tag
  const errorCode = result?.error?.code;
  const errorSubcode = result?.error?.error_subcode;
  console.warn(`[Messenger] Standard send failed for ${recipientId} (code: ${errorCode}, subcode: ${errorSubcode}). Retrying with POST_PURCHASE_UPDATE tag...`);
  
  const taggedPayload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: "MESSAGE_TAG",
    tag: "POST_PURCHASE_UPDATE"
  };
  
  const taggedResponse = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(taggedPayload),
  });
  
  const taggedResult = await taggedResponse.json();
  if (!taggedResponse.ok) {
    throw new Error(JSON.stringify(taggedResult));
  }
  return taggedResult;
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
    let parsedBody: any = null;
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
        parsedBody = fbBody;
        
        

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
      const body = parsedBody || await req.json().catch(() => ({}));
      
      // Check if it's a Supabase Database Webhook trigger
      if (body.type === "INSERT" && body.table === "orders" && body.record) {
        const record = body.record;
        
        // Safeguard to only send for real/active orders
        if (record.is_real === false || record.order_id === 'CONFIG_ICEQUBE_TEAM_MEMBERS' || record.customer_name === 'SYSTEM_CONFIG') {
          console.log(`[Webhook] Skipping notification for system test/mock/config order: ${record.order_id}`);
          return new Response(JSON.stringify({ success: true, message: "Skipped mock/test/config order" }), {
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
                                m.messengerAlertsEnabled !== false &&
                                (m.roleCategory === 'Admin Officer' || m.roleCategory === 'Operations Manager' || m.roleCategory === 'Systems Manager' || m.roleCategory === 'Admin' || m.roleCategory === 'Hub Staff') &&
                                m.messenger && typeof m.messenger === 'string' && /^\d+$/.test(m.messenger) &&
                                String(m.messenger) !== String(customerId))
                  .map((m: any) => m.messenger);
              }
            }
          } catch (err) {
            console.warn("Failed to fetch team members from cloud:", err);
          }
        }
        
        if (activeAdmins.length === 0) {
          activeAdmins = ADMIN_PSIDS.filter(id => String(id) !== String(customerId));
        }

        // 2. Send to ALL Admins (except the customer who placed the order to avoid double receipt)
        results.admins = {};
        const adminPromises = activeAdmins.map(async (adminPsid) => {
          try {
            results.admins[adminPsid] = await sendFBMessage(adminPsid, adminMsg);
          } catch (err) {
            results.admins[adminPsid] = { error: err.message };
            console.error(`[Webhook] Admin send failed for ${adminPsid}:`, err);
          }
        });
        await Promise.all(adminPromises);
        
        // Broadcast to backup channels (Telegram / Discord) in parallel
        await broadcastToBackups(adminMsg).catch(err => console.error("Backup broadcast failed:", err));
        
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      }
      if (body.action === 'test_tags') {
        const recipientId = body.recipientId;
        if (!recipientId) {
          return new Response(JSON.stringify({ error: "Missing recipientId" }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 400
          });
        }
        
        const tags = ["CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE"];
        const results: any = {};
        
        // 1. Try standard UPDATE
        try {
          const res = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: recipientId },
              message: { text: "Test: Standard UPDATE messaging" },
              messaging_type: "UPDATE"
            })
          });
          results["UPDATE"] = { status: res.status, body: await res.json() };
        } catch (e) {
          results["UPDATE"] = { error: e.message };
        }
        
        // 2. Try each tag
        for (const tag of tags) {
          try {
            const res = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: `Test: Tagged send using ${tag}` },
                messaging_type: "MESSAGE_TAG",
                tag: tag
              })
            });
            results[tag] = { status: res.status, body: await res.json() };
          } catch (e) {
            results[tag] = { error: e.message };
          }
        }
        
        const telegramConfigured = !!Deno.env.get("TELEGRAM_BOT_TOKEN") && !!Deno.env.get("TELEGRAM_CHAT_ID");
        const discordConfigured = !!Deno.env.get("DISCORD_WEBHOOK_URL");
        
        return new Response(JSON.stringify({ 
          success: true, 
          results,
          telegram_configured: telegramConfigured,
          discord_configured: discordConfigured
        }), {
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
                                m.messengerAlertsEnabled !== false &&
                                (m.roleCategory === 'Admin Officer' || m.roleCategory === 'Operations Manager' || m.roleCategory === 'Systems Manager' || m.roleCategory === 'Admin' || m.roleCategory === 'Hub Staff') &&
                                m.messenger && typeof m.messenger === 'string' && /^\d+$/.test(m.messenger) &&
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
          activeAdmins = ADMIN_PSIDS.filter(id => String(id) !== String(customerId));
        }
        
        const results: any = {};
        const broadcastPromises = activeAdmins.map(async (adminPsid) => {
          try {
            results[adminPsid] = await sendFBMessage(adminPsid, msgText);
          } catch (err) {
            results[adminPsid] = { error: err.message };
          }
        });
        await Promise.all(broadcastPromises);
        
        // Broadcast to backup channels (Telegram / Discord) in parallel
        await broadcastToBackups(msgText).catch(err => console.error("Backup broadcast failed:", err));
        
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      }
      
      if (body.action === 'send_delivery_confirmation') {
        const customerId = body.customerId || '';
        if (customerId && customerId !== '61557321703652' && customerId !== 'GUEST_WEB') {
            const msgText = `✅ DELIVERED!\n\nYour IceQube delivery has been successfully dropped off! Thank you for choosing IceQube. Stay cool! 🧊`;
            try {
                await sendFBMessage(customerId, msgText);
            } catch (err) {
                console.error("Delivery confirmation send failed", err);
            }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      }

      if (body.action === 'check_scheduled_reminders') {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        
        if (!supabaseUrl || !supabaseAnonKey) {
          return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 500,
          });
        }
        
        const queryUrl = `${supabaseUrl}/rest/v1/orders?delivery_schedule=neq.Immediate&or=%28reminder_sent.is.null,reminder_sent.eq.false%29`;
        
        let orders: any[] = [];
        try {
          const res = await fetch(queryUrl, {
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            }
          });
          if (res.ok) {
            orders = await res.json();
          } else {
            const errText = await res.text();
            console.error("[Reminder] Failed to fetch orders:", res.status, errText);
            if (errText.includes("reminder_sent") || errText.includes("column does not exist")) {
              return new Response(JSON.stringify({ 
                success: false, 
                error: "Missing database column: reminder_sent. Please run the SQL statement: ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;" 
              }), {
                headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
                status: 400,
              });
            }
          }
        } catch (err) {
          console.error("[Reminder] Fetch orders error:", err);
        }
        
        let activeAdmins: string[] = [];
        try {
          const res = await fetch(`${supabaseUrl}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_TEAM_MEMBERS&select=items`, {
            headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
          });
          if (res.ok) {
            const data = await res.json();
            let itemsData = data[0]?.items;
            if (typeof itemsData === 'string') {
              try { itemsData = JSON.parse(itemsData); } catch (e) {}
            }
            if (Array.isArray(itemsData)) {
              activeAdmins = itemsData
                .filter((m: any) => m.status === 'Active' && 
                              m.messengerAlertsEnabled !== false &&
                              (m.roleCategory === 'Admin Officer' || m.roleCategory === 'Operations Manager' || m.roleCategory === 'Systems Manager' || m.roleCategory === 'Admin' || m.roleCategory === 'Hub Staff') &&
                              m.messenger && typeof m.messenger === 'string' && /^\d+$/.test(m.messenger))
                .map((m: any) => m.messenger);
            }
          }
        } catch (err) {
          console.warn("[Reminder] Failed to fetch team members:", err);
        }
        
        if (activeAdmins.length === 0) {
          activeAdmins = [...ADMIN_PSIDS];
        }
        
        const parseScheduleToDate = (scheduleStr: string): Date | null => {
          if (!scheduleStr || scheduleStr === 'Immediate') return null;
          
          let cleanStr = scheduleStr.trim();
          // If the string does not end with a timezone (e.g. +08:00, Z), assume Asia/Manila (UTC+8)
          if (!/([+-]\d{2}:?\d{2}|Z)$/i.test(cleanStr)) {
            cleanStr += " +08:00";
          }
          
          let parsed = new Date(cleanStr);
          if (!isNaN(parsed.getTime())) return parsed;
          
          const parts = scheduleStr.trim().split(/\s+/);
          if (parts.length >= 2) {
            const dateStr = parts[0];
            const timeStr = parts[1];
            const ymd = dateStr.split('-');
            const hm = timeStr.split(':');
            if (ymd.length === 3) {
              const year = parseInt(ymd[0], 10);
              const month = parseInt(ymd[1], 10) - 1;
              const day = parseInt(ymd[2], 10);
              const hour = hm[0] ? parseInt(hm[0], 10) : 0;
              const minute = hm[1] ? parseInt(hm[1], 10) : 0;
              const second = hm[2] ? parseInt(hm[2], 10) : 0;
              // Construct using Date.UTC and then subtract 8 hours since it's local time (UTC+8)
              const utcMs = Date.UTC(year, month, day, hour, minute, second);
              parsed = new Date(utcMs - 8 * 60 * 60 * 1000);
              if (!isNaN(parsed.getTime())) return parsed;
            }
          }
          return null;
        };
        
        const now = new Date();
        const triggeredReminders: any[] = [];
        const activeStatuses = ['Pending', 'Awaiting Acceptance', 'Dispatched'];
        
        for (const order of orders) {
          if (order.is_real === false || order.order_id === 'CONFIG_ICEQUBE_TEAM_MEMBERS' || order.customer_name === 'SYSTEM_CONFIG') {
            continue;
          }
          
          if (!activeStatuses.includes(order.delivery_status)) {
            continue;
          }
          
          const schedDate = parseScheduleToDate(order.delivery_schedule);
          if (!schedDate) continue;
          
          const diffMinutes = (schedDate.getTime() - now.getTime()) / (1000 * 60);
          
          if (diffMinutes >= 45 && diffMinutes <= 75) {
            const itemsText = formatItems(order.items);
            const totalGross = Number(order.total_price || 0);
            const scheduleTimeStr = schedDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
            const scheduleDateStr = schedDate.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
            
            const adminMsg = `⏰ 1-HOUR SCHEDULED DELIVERY REMINDER ⏰\n` +
                             `---------------------------------------------\n` +
                             `👤 Customer: ${order.customer_name}\n` +
                             `📍 Address: ${order.delivery_address || 'N/A'}\n` +
                             `📦 Items: ${itemsText}\n` +
                             `💵 Total: ₱${totalGross.toFixed(2)} (${order.payment_method || 'Cash'})\n` +
                             `⏰ Scheduled For: ${scheduleDateStr}, ${scheduleTimeStr}\n` +
                             `🛵 Rider: ${order.rider || 'Unassigned'}.`;
            
            const adminPromises = activeAdmins.map(async (adminPsid) => {
              try {
                await sendFBMessage(adminPsid, adminMsg);
              } catch (err) {
                console.error(`[Reminder] Failed to send to admin ${adminPsid}:`, err);
              }
            });
            await Promise.all(adminPromises);
            
            // Broadcast to backup channels (Telegram / Discord) in parallel
            await broadcastToBackups(adminMsg).catch(err => console.error("[Reminder] Backup broadcast failed:", err));
            
            try {
              const patchRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseAnonKey,
                  'Authorization': `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ reminder_sent: true })
              });
              if (!patchRes.ok) {
                console.error(`[Reminder] Failed to mark order ${order.order_id} as sent:`, patchRes.status, await patchRes.text());
              }
            } catch (err) {
              console.error(`[Reminder] Error patching order ${order.order_id}:`, err);
            }
            
            triggeredReminders.push({ order_id: order.order_id, customer: order.customer_name, schedule: order.delivery_schedule });
          }
        }
        
        return new Response(JSON.stringify({ success: true, processed: triggeredReminders.length, reminders: triggeredReminders }), {
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

    // Strategy: Try standard UPDATE first, fall back to tagged if outside 24h window
    if (!messagingType || messagingType === "RESPONSE") {
      messagingType = "UPDATE";
    }

    const payload: any = {
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: messagingType
    }

    // Only attach tag if explicitly provided (not the default)
    if (tag && tag !== "CONFIRMED_ORDER_UPDATE" && messagingType === "MESSAGE_TAG") {
      payload.tag = tag;
    }

    console.log(`[Messenger] Relaying to FB: ${recipientId} (messaging_type: ${messagingType}, tag: ${tag || 'none'})`);
    
    let response = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    let result = await response.json()

    // If standard UPDATE failed, retry with MESSAGE_TAG + POST_PURCHASE_UPDATE
    if (!response.ok && messagingType === "UPDATE") {
      console.warn(`[Messenger] UPDATE failed for ${recipientId} (${result?.error?.code}). Retrying with POST_PURCHASE_UPDATE tag...`);
      const taggedPayload = {
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: "MESSAGE_TAG",
        tag: "POST_PURCHASE_UPDATE"
      };
      
      response = await fetch(`${FB_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taggedPayload),
      });
      result = await response.json();
    }

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
