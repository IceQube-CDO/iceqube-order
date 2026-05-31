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

    findProfile: function(profiles, name, messengerId) {
        if (!profiles || typeof profiles !== 'object') return null;
        if (messengerId && profiles[messengerId] && typeof profiles[messengerId] === 'object') {
            return profiles[messengerId];
        }
        if (messengerId) {
            const found = Object.values(profiles).find(p => p && typeof p === 'object' && p.messengerId === messengerId);
            if (found) return found;
        }
        if (name) {
            const nameLower = name.trim().toLowerCase();
            const found = Object.values(profiles).find(p => p && typeof p === 'object' && p.establishment && p.establishment.trim().toLowerCase() === nameLower);
            if (found) return found;
        }
        return null;
    },

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
            existingOrders[orderIdx].delivery_status = dispatchData.status || 'Awaiting Acceptance';
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

publishProfileUpdate: async function(profile) {
        console.log("📡 [Sync] Publishing Profile Update:", profile.establishment);
        if (!profile.updatedAt) {
            profile.updatedAt = new Date().toISOString();
        }

        const key = profile.messengerId || profile.establishment;
        if (!key) return;

        const findProfile = window.IceQubeSync ? window.IceQubeSync.findProfile : this.findProfile;

        // 1. Update local directory first for immediate local responsiveness
        const localDirectory = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');
        const localExisting = findProfile ? findProfile(localDirectory, profile.establishment, profile.messengerId) : localDirectory[key];
        const existingKey = localExisting ? Object.keys(localDirectory).find(k => localDirectory[k] === localExisting) : null;

        if (!localExisting || !localExisting.updatedAt || new Date(profile.updatedAt) >= new Date(localExisting.updatedAt)) {
            // Delete old key if different from the new key
            if (existingKey && existingKey !== key) {
                delete localDirectory[existingKey];
            }
            // Clean up legacy keys if messengerId is newly added
            if (profile.messengerId && localDirectory[profile.establishment] && profile.establishment !== key) {
                delete localDirectory[profile.establishment];
            }
            localDirectory[key] = profile;
            localStorage.setItem('iceqube_customer_profiles', JSON.stringify(localDirectory));
        }

        // Broadcast to other tabs in the same browser session
        ordersChannel.postMessage({ type: 'PROFILE_UPDATED', payload: profile });

        // 2. Sync to cloud (Supabase)
        if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
            try {
                // Fetch the latest profile directory from the cloud
                const url = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_CUSTOMER_PROFILES&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=1&select=items&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                const res = await fetch(url, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                    }
                });

                let cloudDirectory = {};
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        let parsedItems = data[0].items;
                        while (typeof parsedItems === 'string') {
                            try {
                                parsedItems = JSON.parse(parsedItems);
                            } catch(e) { break; }
                        }
                        if (parsedItems && typeof parsedItems === 'object') {
                            cloudDirectory = parsedItems;
                        }
                    }
                }

                // If cloudDirectory is empty, fall back to using the local directory as the base
                if (Object.keys(cloudDirectory).length === 0) {
                    cloudDirectory = { ...localDirectory };
                }

                // Merge the new profile into the cloud directory
                const existingInCloud = findProfile ? findProfile(cloudDirectory, profile.establishment, profile.messengerId) : cloudDirectory[key];
                const cloudExistingKey = existingInCloud ? Object.keys(cloudDirectory).find(k => cloudDirectory[k] === existingInCloud) : null;

                if (!existingInCloud || !existingInCloud.updatedAt || new Date(profile.updatedAt) >= new Date(existingInCloud.updatedAt)) {
                    if (cloudExistingKey && cloudExistingKey !== key) {
                        delete cloudDirectory[cloudExistingKey];
                    }
                    if (profile.messengerId && cloudDirectory[profile.establishment] && profile.establishment !== key) {
                        delete cloudDirectory[profile.establishment];
                    }
                    cloudDirectory[key] = profile;
                }

                // Update local storage with the fully merged directory
                for (const [k, cloudProf] of Object.entries(cloudDirectory)) {
                    if (!cloudProf || typeof cloudProf !== 'object') continue;
                    const localProf = findProfile ? findProfile(localDirectory, cloudProf.establishment, cloudProf.messengerId) : localDirectory[k];
                    const localProfKey = localProf ? Object.keys(localDirectory).find(key => localDirectory[key] === localProf) : null;

                    if (!localProf || !localProf.updatedAt || (cloudProf.updatedAt && new Date(cloudProf.updatedAt) > new Date(localProf.updatedAt))) {
                        // Delete the old local location if it's different from the cloud key
                        if (localProfKey && localProfKey !== k) {
                            delete localDirectory[localProfKey];
                        }
                        localDirectory[k] = cloudProf;
                    }
                }
                
                // Clean up any remaining legacy keys locally
                for (const [k, localProf] of Object.entries(localDirectory)) {
                    if (localProf && typeof localProf === 'object' && localProf.messengerId && k !== localProf.messengerId) {
                        const targetProf = localDirectory[localProf.messengerId];
                        if (!targetProf || !targetProf.updatedAt || (localProf.updatedAt && new Date(localProf.updatedAt) > new Date(targetProf.updatedAt))) {
                            localDirectory[localProf.messengerId] = localProf;
                        }
                        delete localDirectory[k];
                    }
                }
                
                localStorage.setItem('iceqube_customer_profiles', JSON.stringify(localDirectory));

                // Save back to the cloud
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        order_id: 'CONFIG_ICEQUBE_CUSTOMER_PROFILES',
                        customer_name: 'SYSTEM_CONFIG',
                        po_number: 'GLOBAL_CONFIG_V2',
                        is_real: true,
                        items: localDirectory
                    })
                });

                if (response.ok) {
                    const rows = await response.json();
                    if (rows && rows.length > 0) {
                        localStorage.setItem('iceqube_customer_profiles_cloud_time', rows[0].created_at);
                    }
                    console.log("✅ [Sync] Customer Profiles directory Synced to Cloud Successfully");
                } else {
                    console.error("❌ [Sync] Customer Profiles Cloud Sync failed:", response.status);
                }
            } catch (err) {
                console.error("❌ [Sync] Customer Profiles Cloud Sync Network Error:", err);
            }
        }
    },

    fetchCloudCustomerProfiles: async function() {
        if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            return null;
        }

        return new Promise(async (resolve) => {
            const timeout = setTimeout(() => {
                console.warn("⚠️ [Sync] Cloud Customer Profiles Fetch timed out after 5s");
                resolve(null);
            }, 5000);

            try {
                console.log("☁️ [Sync] Fetching latest Customer Profiles from Cloud...");
                const url = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_CUSTOMER_PROFILES&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=1&select=items,created_at&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                    }
                });

                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        let parsedItems = data[0].items;
                        while (typeof parsedItems === 'string') {
                            try {
                                parsedItems = JSON.parse(parsedItems);
                            } catch (e) {
                                break;
                            }
                        }
                        resolve(parsedItems);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            } catch (err) {
                clearTimeout(timeout);
                resolve(null);
            }
        });
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
                    cache: 'no-store',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
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
                        'Prefer': 'return=representation'
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
                    const rows = await response.json();
                    if (rows && rows.length > 0) {
                        localStorage.setItem(`${key}_cloud_time`, rows[0].created_at);
                    }
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

        const configKeys = [
            'CONFIG_ICE_CASHFLOW',
            'CONFIG_ICEQUBE_CONSUMABLES',
            'CONFIG_ICEQUBE_ASSETS',
            'CONFIG_ICEQUBE_UTILITIES',
            'CONFIG_ICEQUBE_UTILITY_STATUS',
            'CONFIG_ICEQUBE_UTILITY_PAID_DATES',
            'CONFIG_ICEQUBE_MAINTENANCE_LOGS',
            'CONFIG_ICEQUBE_ICE_MACHINES',
            'CONFIG_ICEQUBE_RENTAL',
            'CONFIG_ICEQUBE_VACATION_MODE',
            'CONFIG_PURGE',
            'CONFIG_ICEQUBE_TEAM_MEMBERS',
            'CONFIG_ICEQUBE_CUSTOMER_PROFILES'
        ];

        const localKeyMappings = {
            'CONFIG_ICE_CASHFLOW': 'ice_cashflow',
            'CONFIG_ICEQUBE_CONSUMABLES': 'iceqube_consumables',
            'CONFIG_ICEQUBE_ASSETS': 'iceqube_assets',
            'CONFIG_ICEQUBE_UTILITIES': 'iceqube_utilities',
            'CONFIG_ICEQUBE_UTILITY_STATUS': 'iceqube_utility_status',
            'CONFIG_ICEQUBE_UTILITY_PAID_DATES': 'iceqube_utility_paid_dates',
            'CONFIG_ICEQUBE_MAINTENANCE_LOGS': 'iceqube_maintenance_logs',
            'CONFIG_ICEQUBE_ICE_MACHINES': 'iceqube_ice_machines',
            'CONFIG_ICEQUBE_RENTAL': 'iceqube_rental',
            'CONFIG_ICEQUBE_VACATION_MODE': 'iceqube_vacation_mode',
            'CONFIG_PURGE': 'ice_system_purged',
            'CONFIG_ICEQUBE_TEAM_MEMBERS': 'iceqube_team_members',
            'CONFIG_ICEQUBE_CUSTOMER_PROFILES': 'iceqube_customer_profiles'
        };

        return new Promise(async (resolve) => {
            const timeout = setTimeout(() => resolve({}), 6000);
            try {
                // Step 1: Query metadata (order_id and created_at) to see the latest timestamps in the cloud.
                // We fetch the latest metadata rows in a single batch query for efficiency and to respect browser concurrent connection limits.
                const metadataUrl = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=in.(${configKeys.join(',')})&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=60&select=order_id,created_at&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                
                let metaData = [];
                try {
                    const res = await fetch(metadataUrl, {
                        method: 'GET',
                        cache: 'no-store',
                        headers: {
                            'apikey': SUPABASE_CONFIG.ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                        }
                    });
                    if (res.ok) {
                        metaData = await res.json();
                    } else {
                        const errMsg = await res.text();
                        console.error("❌ [Sync] Batch metadata fetch failed:", res.status, errMsg);
                    }
                } catch (e) {
                    console.error("❌ [Sync] Batch metadata fetch network error:", e);
                }

                if (!metaData || metaData.length === 0) {
                    clearTimeout(timeout);
                    resolve({});
                    return;
                }

                // Find the latest cloud timestamp for each key
                const latestCloudTimes = {};
                metaData.forEach(row => {
                    if (!latestCloudTimes[row.order_id]) {
                        latestCloudTimes[row.order_id] = row.created_at;
                    }
                });

                // Step 2: Compare each key's cloud timestamp with local storage's stored cloud time.
                // If cloud time is newer, we need to fetch the full items payload for that key.
                const keysToFetch = [];
                for (const orderId of configKeys) {
                    const cloudTime = latestCloudTimes[orderId];
                    if (!cloudTime) continue; // No cloud record for this key

                    const localKey = localKeyMappings[orderId];
                    const localCloudTime = localStorage.getItem(`${localKey}_cloud_time`);

                    if (!localCloudTime || new Date(cloudTime) > new Date(localCloudTime)) {
                        keysToFetch.push(orderId);
                    }
                }

                // If nothing is out of date, return empty object (meaning no updates needed)
                if (keysToFetch.length === 0) {
                    console.log("☁️ [Sync] All app states are up-to-date with cloud.");
                    clearTimeout(timeout);
                    resolve({});
                    return;
                }

                console.log("☁️ [Sync] App states out of date. Fetching full payloads for:", keysToFetch);

                // Step 3: Fetch the latest full record (with items payload) for each out-of-date key.
                // We do these in parallel with limit=1 to ensure we get exactly the latest record for each key.
                const fetchPromises = keysToFetch.map(async (orderId) => {
                    try {
                        const fetchUrl = `${SUPABASE_CONFIG.URL}/rest/v1/orders?order_id=eq.${orderId}&po_number=eq.GLOBAL_CONFIG_V2&customer_name=neq.SYSTEM_CONFIG_CACHE_BUSTER_${Date.now()}&order=created_at.desc&limit=1&select=order_id,items,created_at&apikey=${SUPABASE_CONFIG.ANON_KEY}`;
                        const res = await fetch(fetchUrl, {
                            method: 'GET',
                            cache: 'no-store',
                            headers: {
                                'apikey': SUPABASE_CONFIG.ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                            }
                        });
                        if (res.ok) {
                            const rows = await res.json();
                            return rows && rows.length > 0 ? rows[0] : null;
                        }
                    } catch (e) {
                        console.error(`Error fetching cloud payload for ${orderId}:`, e);
                    }
                    return null;
                });

                const fetchedRecords = (await Promise.all(fetchPromises)).filter(Boolean);
                clearTimeout(timeout);

                if (fetchedRecords.length > 0) {
                    const latestConfigs = {};
                    fetchedRecords.forEach(record => {
                        if (record.items) {
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
                    existingOrders[orderIdx].delivery_status = payload.status || 'Awaiting Acceptance';
                    existingOrders[orderIdx].rider = payload.riderId;
                    localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
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
