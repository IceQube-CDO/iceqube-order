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
        const cleanId = id => id ? String(id).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';
        const targetId = cleanId(dispatchData.orderId);
        const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id || o.id) === targetId);
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
        const cleanId = id => id ? String(id).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';
        const targetId = cleanId(completionData.orderId);
        const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id || o.id) === targetId);
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
                        po_number: 'GLOBAL_CONFIG_V2', // Protected from purge logic
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
                resolve({ _error: 'Timeout' });
            }, 5000);

            try {
                console.log("☁️ [Sync] Fetching latest Pricing Matrix (GLOBAL_CONFIG_V2) from Cloud...");
                
                // standard fetch but with strict no-cache headers. 
                // We add the apikey to the URL because some mobile browsers strip custom headers.
                const url = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=eq.CONFIG_PRICING_MATRIX&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=1&select=items,created_at&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });

                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        let parsedItems = data[0].items;
                        if (typeof parsedItems === 'string') {
                            try {
                                parsedItems = JSON.parse(parsedItems);
                            } catch (e) {
                                console.error("❌ [Sync] Failed to parse pricing items from string", e);
                            }
                        }
                        console.log("✅ [Sync] Pricing Matrix retrieved from Cloud:", parsedItems);
                        if (parsedItems) {
                            parsedItems._cloudCreatedAt = data[0].created_at;
                            resolve(parsedItems);
                        } else {
                            resolve({ _error: 'Empty items in record' });
                        }
                    } else {
                        console.log("ℹ️ [Sync] No cloud pricing record found (V2).");
                        resolve({ _error: 'No Record Found' });
                    }
                } else {
                    const errorText = await response.text();
                    const errMsg = `HTTP ${response.status}: ${errorText.substring(0, 100)}`;
                    console.warn("⚠️ [Sync] Cloud Fetch failed:", errMsg);
                    // EMERGENCY ALERT: Let the user see the exact error on their phone
                    if (window.location.href.includes('messenger')) {
                        alert("Sync Error: " + errMsg);
                    }
                    resolve({ _error: errMsg });
                }
            } catch (err) {
                clearTimeout(timeout);
                const errMsg = `Network: ${err.message}`;
                console.error("❌ [Sync] Network Error:", errMsg);
                if (window.location.href.includes('messenger')) {
                    alert("Sync Network Error: " + errMsg);
                }
                resolve({ _error: errMsg });
            }
        });
    },

    publishAppState: async function(key, data) {
        console.log(`📡 [Sync] Publishing App State to Cloud: ${key}`);
        
        // 1. Local Sync (Optional redundancy, usually caller sets localStorage first)
        ordersChannel.postMessage({ type: 'APP_STATE_UPDATED', key: key, payload: data });

        // 2. Cloud Sync
        if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
            try {
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        order_id: `CONFIG_${key.toUpperCase()}`,
                        customer_name: 'SYSTEM_CONFIG',
                        po_number: 'GLOBAL_CONFIG_V2', 
                        is_real: true, 
                        items: data
                    })
                });
                if (response.ok) {
                    console.log(`✅ [Sync] App State (${key}) Synced to Cloud Successfully`);
                } else {
                    console.error(`❌ [Sync] App State (${key}) Cloud Sync failed:`, response.status);
                }
            } catch (err) {
                console.error(`❌ [Sync] App State (${key}) Cloud Sync Network Error:`, err);
            }
        }
    },

    fetchCloudAppStates: async function() {
        if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            return {};
        }

        return new Promise(async (resolve) => {
            const timeout = setTimeout(() => resolve({}), 5000);
            try {
                const url = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=like.CONFIG_*&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=50&select=order_id,items,created_at&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });

                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        // Keep only the latest for each config key (data is ordered descending)
                        const latestConfigs = {};
                        data.forEach(record => {
                            if (!latestConfigs[record.order_id] && record.items) {
                                let parsedItems = record.items;
                                while (typeof parsedItems === 'string') {
                                    try { 
                                        const nextParse = JSON.parse(parsedItems); 
                                        if (typeof nextParse === 'string' && nextParse === parsedItems) break;
                                        parsedItems = nextParse;
                                    } catch(e) { break; }
                                }
                                if (typeof parsedItems === 'object' && parsedItems !== null) {
                                    parsedItems._cloudCreatedAt = record.created_at;
                                }
                                latestConfigs[record.order_id] = parsedItems;
                            }
                        });
                        resolve(latestConfigs);
                    } else {
                        resolve({});
                    }
                } else {
                    resolve({});
                }
            } catch (err) {
                clearTimeout(timeout);
                console.error("❌ [Sync] Fetch Cloud App States Network Error:", err);
                resolve({});
            }
        });
    },

    publishPurge: function() {
        console.log("📡 [Sync] Publishing System Purge");
        this.publishAppState('purge', { purged: true, timestamp: Date.now() });
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

    publishMessengerTest: function(data) {
        console.log("📡 [Sync] Requesting Messenger Test via Bridge:", data.recipientId);
        ordersChannel.postMessage({ type: 'MESSENGER_TEST', payload: data });
    },

    onMessengerEvent: function(callback) {
        ordersChannel.addEventListener('message', (event) => {
            if (event.data.type === 'MESSENGER_TEST') {
                callback(event.data);
            }
        });
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
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id || o.id) === targetId);
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
