// Local Browser Sync Prototype using BroadcastChannel
// This allows the Customer App, Command Center, and Rider App to communicate instantly in the same browser.

const ORDERS_CHANNEL_NAME = 'iceqube_orders_sync';
const DELIVERIES_CHANNEL_NAME = 'iceqube_deliveries_sync';
const COMPLAINTS_CHANNEL_NAME = 'iceqube_complaints_sync';

// Initialize Channels
if (!window.BroadcastChannel) {
    console.warn("Warning: This browser does not support real-time sync (BroadcastChannel). Please use a modern browser.");
}

const ordersChannel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
const deliveriesChannel = new BroadcastChannel(DELIVERIES_CHANNEL_NAME);
const complaintsChannel = new BroadcastChannel(COMPLAINTS_CHANNEL_NAME);

console.log("🌐 [IceQube Sync] Channels Initialized:", ORDERS_CHANNEL_NAME, DELIVERIES_CHANNEL_NAME, COMPLAINTS_CHANNEL_NAME);

window.IceQubeSync = {
    // --- STATE & CALLBACKS ---
    _orderCallbacks: [],

    // --- PUBLISHERS ---
    
    publishNewOrder: function(orderData) {
        console.log("📡 [Sync] Publishing New Order:", orderData.order_id);
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        if (!existingOrders.find(o => o.order_id === orderData.order_id)) {
            orderData.is_real = true; 
            existingOrders.unshift(orderData);
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }
        ordersChannel.postMessage({ type: 'NEW_ORDER', payload: orderData });
    },

    publishDispatch: function(dispatchData) {
        console.log("📡 [Sync] Publishing Dispatch to Rider:", dispatchData.riderId);
        const existingDeliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
        dispatchData.is_real = true;
        existingDeliveries.push(dispatchData);
        localStorage.setItem('ice_deliveries', JSON.stringify(existingDeliveries));

        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const cleanId = id => id ? String(id).replace('#', '').trim() : '';
        const targetId = cleanId(dispatchData.orderId);
        const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
        if (orderIdx > -1) {
            existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
            existingOrders[orderIdx].rider = dispatchData.riderId;
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }

        deliveriesChannel.postMessage({ type: 'NEW_DISPATCH', payload: dispatchData });
    },

    publishDeliveryComplete: function(completionData) {
        console.log("📡 [Sync] Publishing Delivery Complete:", completionData.orderId);
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const orderIdx = existingOrders.findIndex(o => o.order_id === completionData.orderId);
        if (orderIdx > -1) {
            existingOrders[orderIdx].delivery_status = 'Delivered';
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }
        deliveriesChannel.postMessage({ type: 'DELIVERY_COMPLETED', payload: completionData });
    },

    publishDeliveryEvent: function(event) {
        console.log("📡 [Sync] Publishing Delivery Event:", event.type);
        deliveriesChannel.postMessage(event);
    },

    publishProfileUpdate: function(profile) {
        console.log("📡 [Sync] Publishing Profile Update:", profile.establishment);
        const directory = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');
        directory[profile.establishment] = profile;
        localStorage.setItem('iceqube_customer_profiles', JSON.stringify(directory));
        ordersChannel.postMessage({ type: 'PROFILE_UPDATED', payload: profile });
    },

    publishPricingUpdate: async function(matrix) {
        console.log("📡 [Sync] Publishing Pricing Matrix Update");
        
        // 1. Local Sync
        localStorage.setItem('iceqube_global_pricing', JSON.stringify(matrix));
        ordersChannel.postMessage({ type: 'PRICING_UPDATED', payload: matrix });

        // 2. Cloud Sync (Append-only strategy for maximum reliability)
        if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
            console.log("☁️ [Sync] Syncing Pricing Matrix to Cloud...");
            try {
                // We create a NEW record every time. This avoids permission issues with PATCH/UPSERT.
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        order_id: 'CONFIG_PRICING_MATRIX',
                        customer_name: 'SYSTEM_CONFIG',
                        po_number: 'GLOBAL_CONFIG_V1', // Protected from purge logic
                        is_real: true, // Mark as real so it's not purged
                        items: matrix
                    })
                });
                
                if (response.ok) {
                    console.log("✅ [Sync] Pricing Matrix Synced to Cloud Successfully");
                } else {
                    const err = await response.json().catch(() => ({}));
                    console.error("❌ [Sync] Cloud Sync failed with status:", response.status, err);
                    alert("Cloud Sync Failed: " + (err.message || response.statusText || "Unknown error"));
                }
            } catch (err) {
                console.error("❌ [Sync] Cloud Sync Network Error:", err);
                alert("Cloud Sync Network Error: " + err.message);
            }
        }
    },

    fetchCloudPricing: async function() {
        if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            return null;
        }

        return new Promise(async (resolve) => {
            // 5 second timeout to prevent app hang
            const timeout = setTimeout(() => {
                console.warn("⚠️ [Sync] Cloud Fetch timed out after 5s");
                resolve(null);
            }, 5000);

            try {
                console.log("☁️ [Sync] Fetching latest Pricing Matrix (GLOBAL_CONFIG_V1) from Cloud...");
                // Add cache-buster to bypass Messenger Webview caching
                const cacheBuster = new Date().getTime();
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=eq.CONFIG_PRICING_MATRIX&po_number=eq.GLOBAL_CONFIG_V1&order=created_at.desc&limit=1&select=items,created_at&cb=${cacheBuster}`, {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    cache: 'no-store'
                });

                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        console.log("✅ [Sync] Pricing Matrix retrieved from Cloud:", data[0].items);
                        // Attach the cloud timestamp for debugging
                        data[0].items._cloudCreatedAt = data[0].created_at;
                        resolve(data[0].items);
                    } else {
                        console.log("ℹ️ [Sync] No cloud pricing record found.");
                        resolve(null);
                    }
                } else {
                    console.warn("⚠️ [Sync] Cloud Fetch failed with status:", response.status);
                    resolve(null);
                }
            } catch (err) {
                clearTimeout(timeout);
                console.warn("⚠️ [Sync] Cloud Fetch Network Error:", err);
                resolve(null);
            }
        });
    },

    publishPurge: function() {
        console.log("📡 [Sync] Publishing System Purge");
        ordersChannel.postMessage({ type: 'SYSTEM_PURGE' });
    },

    publishComplaint: function(complaintData) {
        console.log("📡 [Sync] Publishing New Complaint:", complaintData.id);
        const complaints = JSON.parse(localStorage.getItem('ice_complaints') || '[]');
        if (!complaints.find(c => c.id === complaintData.id)) {
            complaints.unshift(complaintData);
            localStorage.setItem('ice_complaints', JSON.stringify(complaints));
        }
        complaintsChannel.postMessage({ type: 'NEW_COMPLAINT', payload: complaintData });
    },

    // --- SUBSCRIBERS ---

    onOrderEvent: function(callback) {
        this._orderCallbacks.push(callback);
        ordersChannel.onmessage = (event) => {
            console.log("📥 [Sync] Received Order Event (Broadcast):", event.data.type);
            this._orderCallbacks.forEach(cb => cb(event.data));
        };
    },

    onDeliveryEvent: function(callback) {
        deliveriesChannel.onmessage = (event) => {
            console.log("📥 [Sync] Received Delivery Event:", event.data.type);
            const data = event.data;
            const payload = data.payload;
            const cleanId = id => id ? String(id).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';

            if (data.type === 'NEW_DISPATCH') {
                const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                const targetId = cleanId(payload.orderId);
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
                if (orderIdx > -1) {
                    if (existingOrders[orderIdx].delivery_status === 'Pending') {
                        existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
                        existingOrders[orderIdx].rider = payload.riderId;
                        localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    }
                }
            }
            callback(data);
        };
    },

    onComplaintEvent: function(callback) {
        complaintsChannel.onmessage = (event) => {
            console.log("📥 [Sync] Received Complaint Event:", event.data.type);
            callback(event.data);
        };
    }
};

// Global Fallback for file:// protocol and cross-tab sync without BroadcastChannel
window.addEventListener('storage', (event) => {
    if (event.key === 'iceqube_global_pricing') {
        console.log("🔄 [Sync] Detected localStorage pricing update, triggering local callbacks.");
        if (window.IceQubeSync && event.newValue) {
            const newMatrix = JSON.parse(event.newValue);
            window.IceQubeSync._orderCallbacks.forEach(cb => cb({
                type: 'PRICING_UPDATED',
                payload: newMatrix
            }));
        }
    }
});
