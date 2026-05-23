// SUPABASE_CONFIG is provided by js/app_header.js
if (typeof SUPABASE_CONFIG === 'undefined') {
    var SUPABASE_CONFIG = { URL: '', ANON_KEY: '' };
}
if (typeof MESSENGER_CONFIG === 'undefined') {
    var MESSENGER_CONFIG = { PAGE_ACCESS_TOKEN: '', RECIPIENT_ID: '' };
}

var admin = {
    saveState: function(key, data) {
        localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
        if (window.IceQubeSync && window.IceQubeSync.publishAppState) {
            window.IceQubeSync.publishAppState(key, data);
        }
    },
    
    applyCloudStates: function(cloudStates) {
        let needsUpdate = false;
        const stateMappings = {
            'CONFIG_CASHFLOW': { key: 'ice_cashflow', prop: 'manualEntries' },
            'CONFIG_CONSUMABLES': { key: 'iceqube_consumables', prop: 'consumables', updateFn: 'updateConsumablesUI' },
            'CONFIG_ASSETS': { key: 'iceqube_assets', prop: 'assets', updateFn: 'updateAssetsUI' },
            'CONFIG_UTILITIES': { key: 'iceqube_utilities', prop: 'utilities', updateFn: 'updateUtilitiesUI' },
            'CONFIG_UTILITY_STATUS': { key: 'iceqube_utility_status', prop: 'utilityStatus', updateFn: 'updateUtilitiesUI' },
            'CONFIG_UTILITY_PAID_DATES': { key: 'iceqube_utility_paid_dates', prop: 'utilityPaidDates', updateFn: 'updateUtilitiesUI' },
            'CONFIG_MAINTENANCE_LOGS': { key: 'iceqube_maintenance_logs', prop: 'maintenanceLogs', updateFn: 'updateAssetsUI' },
            'CONFIG_RENTAL': { key: 'iceqube_rental', prop: 'rental', updateFn: 'updateUtilitiesUI' },
            'CONFIG_VACATION_MODE': { key: 'iceqube_vacation_mode', prop: 'vacationMode' },
            'CONFIG_PURGE': { key: 'ice_system_purged', prop: 'isPurged', special: 'purge' },
            'CONFIG_ICEQUBE_TEAM_MEMBERS': { key: 'iceqube_team_members', prop: 'teamMembersData', updateFn: 'renderTeamCards' }
        };

        for (const [orderId, cloudData] of Object.entries(cloudStates)) {
            const mapping = stateMappings[orderId];
            if (!mapping) continue;

            const localString = localStorage.getItem(mapping.key);
            let localData = null;
            try {
                localData = JSON.parse(localString);
            } catch(e) {
                localData = localString;
            }

            let cleanCloud;
            if (Array.isArray(cloudData)) {
                cleanCloud = [...cloudData];
                // Arrays might have _cloudCreatedAt set as a property, which isn't part of the array elements
                // It won't be serialized by JSON.stringify anyway.
            } else if (typeof cloudData === 'object' && cloudData !== null) {
                cleanCloud = { ...cloudData };
                delete cleanCloud._cloudCreatedAt;
            } else {
                cleanCloud = cloudData;
            }
            
            if (JSON.stringify(cleanCloud) !== JSON.stringify(localData)) {
                console.log(`☁️ [Admin] State updated from Cloud: ${mapping.key}`);
                localStorage.setItem(mapping.key, typeof cleanCloud === 'string' ? cleanCloud : JSON.stringify(cleanCloud));
                if (mapping.prop && this.hasOwnProperty(mapping.prop)) {
                    this[mapping.prop] = cleanCloud;
                }
                
                if (mapping.updateFn && typeof this[mapping.updateFn] === 'function') {
                    this[mapping.updateFn]();
                }
                
                if (mapping.special === 'purge' && cleanCloud.purged) {
                    localStorage.setItem('ice_system_purged', 'true');
                    
                    // 1. Purge Local Orders
                    const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                    const realOrders = orders.filter(o => o.is_real !== false && o.po_number !== 'SYSTEM-GENERATED' && o.poNumber !== 'SYSTEM-GENERATED');
                    localStorage.setItem('ice_orders', JSON.stringify(realOrders));
                    
                    // 2. Purge Deliveries
                    const deliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
                    const realDeliveries = deliveries.filter(d => d.is_real !== false);
                    localStorage.setItem('ice_deliveries', JSON.stringify(realDeliveries));

                    // 3. Purge Cashflow
                    const cashflow = JSON.parse(localStorage.getItem('ice_cashflow') || '[]');
                    const realCashflow = cashflow.filter(c => c.is_real !== false);
                    admin.saveState('ice_cashflow', realCashflow);
                    
                    // 4. Clean Messages
                    localStorage.removeItem('ice_messages');

                    if (this.allOrders) {
                        this.allOrders = realOrders;
                        this.updateDashboardUI(realOrders);
                    }
                    if (typeof this.updateCashflowUI === 'function') {
                        this.updateCashflowUI();
                    }
                }
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            const syncText = document.getElementById('cloud-sync-status-text');
            if (syncText) syncText.innerText = `☁️ Config Updated: ${new Date().toLocaleTimeString()}`;
        }
    },
    
    // --- APP STATE ---
    _syncIntervalId: null,
    allOrders: [],
    pin: '',
    correctPin: '2026', 
    manualEntries: JSON.parse(localStorage.getItem('ice_cashflow') || '[]'),
    consumables: JSON.parse(localStorage.getItem('iceqube_consumables') || JSON.stringify({
        packaging: [
            { id: 'bags3kg', name: '3kg Bag', current: 4200, max: 10000, unit: 'pcs' },
            { id: 'bags1kg', name: '1kg Bag', current: 1150, max: 5000, unit: 'pcs' },
            { id: 'ecobag', name: 'Delivery Ecobag', current: 45, max: 100, unit: 'pcs' }
        ],
        cleaning: [
            { id: 'sanitizer', name: 'Food Grade Sanitizer', current: 4.5, max: 10, unit: 'Liters' },
            { id: 'descaler', name: 'Machine Descaler', current: 2, max: 5, unit: 'Bottles' }
        ],
        filtration: [
            { id: 'f-sediment', name: 'PP Sediment Filter', purchaseDate: '2026-04-01', lifespanMonths: 3, cost: 250, brand: 'Generic', company: 'Lazada', link: 'https://lazada.com.ph' },
            { id: 'f-carbon', name: 'Carbon Block Filter', purchaseDate: '2026-02-15', lifespanMonths: 6, cost: 450, brand: 'Aqua', company: 'Shopee', link: 'https://shopee.ph' },
            { id: 'f-uv', name: 'UV Sterilizer Lamp', purchaseDate: '2025-11-10', lifespanMonths: 12, cost: 1200, brand: 'Philips', company: 'Local Shop', link: '' }
        ]
    })),
    maintenanceLogs: JSON.parse(localStorage.getItem('iceqube_maintenance_logs') || '[]'),
    assets: JSON.parse(localStorage.getItem('iceqube_assets') || JSON.stringify([
        { id: 'm1', name: 'Ice Machine #1', type: 'Machine', status: 'online', metric: 'Temp: -18°C • Optimal', price: 250000, dateAcquired: '2025-01-15', usefulLifeMonths: 60 },
        { id: 'm2', name: 'Ice Machine #2', type: 'Machine', status: 'online', metric: 'Temp: -20°C • Optimal', price: 250000, dateAcquired: '2025-02-10', usefulLifeMonths: 60 },
        { id: 'f1', name: 'Walk-in Freezer', type: 'Freezer', status: 'busy', metric: 'Defrost Cycle Active', price: 180000, dateAcquired: '2025-01-20', usefulLifeMonths: 84 }
    ])),
    utilities: JSON.parse(localStorage.getItem('iceqube_utilities') || JSON.stringify({
        electricity: 18450,
        water: 4200,
        internet: 2899
    })),
    utilityStatus: JSON.parse(localStorage.getItem('iceqube_utility_status') || JSON.stringify({
        cepalco: false,
        cowd: false,
        pldt: true,
        rent: true
    })),
    utilityPaidDates: JSON.parse(localStorage.getItem('iceqube_utility_paid_dates') || '{}'),
    rental: JSON.parse(localStorage.getItem('iceqube_rental') || '15000'),
    pricingMatrix: JSON.parse(localStorage.getItem('iceqube_global_pricing') || JSON.stringify({
        products: [
            { id: 'bag3kg', name: '3kg Ice Cube (Full/Half)', standard: 40, bulk: 35, threshold: 14 },
            { id: 'bag1kg', name: '1kg Ice Cube (Full/Half)', standard: 15, bulk: 14, threshold: 40 }
        ],
        delivery: {
            baseFare: 30,
            perKmShort: 15,
            perKmLong: 20,
            lateNightFee: 0,
            peakHoursFee: 0,
            freeThreshold: 0,
            heavyLoadT1Weight: 19,
            heavyLoadT1Fee: 10,
            heavyLoadT2Weight: 31,
            heavyLoadT2Fee: 15
        }
    })),
    cashflowFilter: 'daily', 
    vacationMode: JSON.parse(localStorage.getItem('iceqube_vacation_mode') || 'false'),
    autoDispatchType: 'broadcast',
    complaints: JSON.parse(localStorage.getItem('ice_complaints') || '[]'),
    _autoRefreshIntervalId: null,
    buzzerMuted: JSON.parse(localStorage.getItem('iceqube_buzzer_muted') || 'false'),
    buzzerActive: false,
    alarmedOrders: new Set(),
    isInitialLoadComplete: false,
    charts: {},

    purgeTestData() {
        console.log('[SYSTEM] Purge Test Data triggered');
        this.showConfirmModal(
            "Purge Test Data",
            "This will remove all TEST entries but will PROTECT your 'Real Business' data. Proceed?",
            async () => {
                console.log('🧹 Purging Test Data starting...');
                try {
                    // 1. Local Purge
                    const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                    const realOrders = orders.filter(o => o.is_real !== false && o.po_number !== 'SYSTEM-GENERATED' && o.poNumber !== 'SYSTEM-GENERATED');
                    localStorage.setItem('ice_orders', JSON.stringify(realOrders));
                    console.log(`- Filtered Orders: ${realOrders.length} kept locally`);

                    const deliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
                    const realDeliveries = deliveries.filter(d => d.is_real !== false);
                    localStorage.setItem('ice_deliveries', JSON.stringify(realDeliveries));

                    const cashflow = JSON.parse(localStorage.getItem('ice_cashflow') || '[]');
                    const realCashflow = cashflow.filter(c => c.is_real !== false);
                    admin.saveState('ice_cashflow', realCashflow);

                    localStorage.removeItem('ice_messages');
                    localStorage.setItem('ice_system_purged', 'true');
                    
                    if (window.IceQubeSync) {
                        window.IceQubeSync.publishPurge();
                    }

                    // 2. Cloud Purge (If active)
                    if (SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
                        console.log('☁️ Attempting Cloud Purge (Test orders and SYSTEM-GENERATED)...');
                        // Delete ONLY explicit test orders OR system-generated test orders from Supabase
                        // Note: We remove 'is_real.is.null' to protect legacy data that lacks the flag
                        const cloudResponse = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?or=(is_real.eq.false,po_number.eq.SYSTEM-GENERATED)`, {
                            method: 'DELETE',
                            headers: {
                                'apikey': SUPABASE_CONFIG.ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                            }
                        });
                        
                        if (!cloudResponse.ok) {
                            console.warn('⚠️ Cloud Purge partially failed:', cloudResponse.status);
                        } else {
                            console.log('✅ Cloud Purge successful');
                        }
                    }
                    
                    console.log('Purge successful. Reloading...');
                    location.reload();
                } catch (err) {
                    console.error('❌ Error during purge:', err);
                    alert('Purge failed! Check console for details.');
                }
            }
        );
    },

    showConfirmModal(title, message, onConfirm, confirmText = 'Confirm') {
        console.log(`[UI] Showing Confirm Modal: ${title}`);
        const modal = document.getElementById('global-confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const bodyEl = document.getElementById('confirm-modal-body');
        const confirmBtn = document.getElementById('confirm-modal-btn');
        
        if (!modal || !titleEl || !bodyEl || !confirmBtn) {
            console.error('❌ Missing modal elements!', { modal, titleEl, bodyEl, confirmBtn });
            if (confirm(message)) onConfirm();
            return;
        }
        
        titleEl.innerText = title;
        bodyEl.innerText = message;
        confirmBtn.innerText = confirmText;
        confirmBtn.onclick = () => {
            console.log('[UI] Modal confirmed');
            modal.style.display = 'none';
            onConfirm();
        };
        
        modal.style.display = 'flex';
    },

    async toggleRealStatus(type, id) {
        console.log(`🛡️ Toggling Real Status for ${type}:${id}`);
        let key = '';
        if (type === 'order') key = 'ice_orders';
        else if (type === 'cashflow') key = 'ice_cashflow';
        else return;

        // 1. Detect current status
        const localData = JSON.parse(localStorage.getItem(key) || '[]');
        const localIdx = localData.findIndex(item => (item.id || item.order_id || item.timestamp) === id);
        
        let currentStatus = true; // Default to REAL for legacy data
        if (localIdx > -1) {
            const val = localData[localIdx].is_real;
            currentStatus = (val === undefined || val === null) ? true : !!val;
        } else {
            const memoryItem = this.allOrders.find(o => (o.id || o.order_id) === id);
            if (memoryItem) {
                const val = memoryItem.is_real;
                currentStatus = (val === undefined || val === null) ? true : !!val;
            }
        }

        const newStatus = !currentStatus;

        // 2. Update Local State
        if (localIdx > -1) {
            localData[localIdx].is_real = newStatus;
            localStorage.setItem(key, JSON.stringify(localData));
        }

        // 3. Update Memory State & UI Immediately
        const memoryItem = this.allOrders.find(o => (o.id || o.order_id) === id);
        if (memoryItem) memoryItem.is_real = newStatus;
        this.updateOrderQueue(this.allOrders);

        // 4. Cloud Sync
        if (type === 'order' && !id.toString().startsWith('mock') && SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
            try {
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ is_real: newStatus })
                });
                if (response.ok) {
                    console.log('✅ Real Status Synced to Cloud');
                } else {
                    console.error('❌ Cloud Sync Failed:', response.status);
                }
            } catch (err) {
                console.warn('Could not sync Real Status to cloud:', err);
            }
        }
    },

    async init() {
        try {
            console.log('--- COMMAND CENTER INITIALIZED ---');
            
            // 0. Cloud Pricing Fetch
            if (window.IceQubeSync) {
                const cloudMatrix = await window.IceQubeSync.fetchCloudPricing();
                if (cloudMatrix && !cloudMatrix._error) {
                    if (cloudMatrix.products) this.pricingMatrix.products = cloudMatrix.products;
                    if (cloudMatrix.delivery) this.pricingMatrix.delivery = cloudMatrix.delivery;
                    
                    localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
                    const syncText = document.getElementById('cloud-sync-status-text');
                    if (syncText) {
                        const cloudTime = cloudMatrix._cloudCreatedAt ? new Date(cloudMatrix._cloudCreatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
                        syncText.innerText = `☁️ Updated: ${cloudTime}`;
                    }
                    console.log("✅ [Admin] Pricing Matrix merged from Cloud (V2)");
                } else {
                    const errMsg = (cloudMatrix && cloudMatrix._error) ? cloudMatrix._error : 'Offline';
                    const syncText = document.getElementById('cloud-sync-status-text');
                    if (syncText) syncText.innerText = `☁️ Local Cache (${errMsg})`;
                    console.warn(`ℹ️ [Admin] Cloud sync unavailable (${errMsg}). Using local defaults.`);
                }
            }
        
        // Data Migration/Validation for Consumables
        if (!this.consumables.packaging || !this.consumables.cleaning || !this.consumables.filtration) {
            console.log('Migrating old consumables structure...');
            const oldConsumables = this.consumables || {};
            this.consumables = {
                packaging: oldConsumables.packaging || [
                    { id: 'bags3kg', name: '3kg Bag', current: 4200, max: 10000, unit: 'pcs' },
                    { id: 'bags1kg', name: '1kg Bag', current: 1150, max: 5000, unit: 'pcs' },
                    { id: 'ecobag', name: 'Delivery Ecobag', current: 45, max: 100, unit: 'pcs' }
                ],
                cleaning: oldConsumables.cleaning || [
                    { id: 'sanitizer', name: 'Food Grade Sanitizer', current: 4.5, max: 10, unit: 'Liters' },
                    { id: 'descaler', name: 'Machine Descaler', current: 2, max: 5, unit: 'Bottles' }
                ],
                filtration: oldConsumables.filtration || [
                    { id: 'f-sediment', name: 'PP Sediment Filter', purchaseDate: '2026-04-01', lifespanMonths: 3, cost: 250, brand: 'Generic', company: 'Lazada', link: 'https://lazada.com.ph' },
                    { id: 'f-carbon', name: 'Carbon Block Filter', purchaseDate: '2026-02-15', lifespanMonths: 6, cost: 450, brand: 'Aqua', company: 'Shopee', link: 'https://shopee.ph' },
                    { id: 'f-uv', name: 'UV Sterilizer Lamp', purchaseDate: '2025-11-10', lifespanMonths: 12, cost: 1200, brand: 'Philips', company: 'Local Shop', link: '' }
                ]
            };
            admin.saveState('iceqube_consumables', this.consumables);
        }


        // Purge button listener moved to onclick in HTML for robustness

        // Data Migration/Validation for Pricing Matrix
        if (!this.pricingMatrix || !this.pricingMatrix.products || !Array.isArray(this.pricingMatrix.products)) {
            console.log('Migrating/Initializing pricing matrix structure...');
            const oldProducts = (this.pricingMatrix && this.pricingMatrix.products) ? this.pricingMatrix.products : {};
            this.pricingMatrix = {
                products: [
                    { 
                        id: 'bag3kg', 
                        name: '3kg Ice Cube (Full/Half)', 
                        standard: (oldProducts.bag3kg && oldProducts.bag3kg.standard) || 40, 
                        bulk: (oldProducts.bag3kg && oldProducts.bag3kg.bulk) || 35, 
                        threshold: (oldProducts.bag3kg && oldProducts.bag3kg.threshold) || 14 
                    },
                    { 
                        id: 'bag1kg', 
                        name: '1kg Ice Cube (Full/Half)', 
                        standard: (oldProducts.bag1kg && oldProducts.bag1kg.standard) || 15, 
                        bulk: (oldProducts.bag1kg && oldProducts.bag1kg.bulk) || 14, 
                        threshold: (oldProducts.bag1kg && oldProducts.bag1kg.threshold) || 40 
                    }
                ],
                delivery: (this.pricingMatrix && this.pricingMatrix.delivery) || {
                    baseFare: 30,
                    perKmShort: 15,
                    perKmLong: 20,
                    lateNightFee: 0,
                    peakHoursFee: 0,
                    freeThreshold: 0,
                    heavyLoadT1Weight: 19,
                    heavyLoadT1Fee: 10,
                    heavyLoadT2Weight: 31,
                    heavyLoadT2Fee: 15
                }
            };
            localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
        }

        // Final Safety: Ensure heavy load fields exist on loaded delivery matrix
        if (this.pricingMatrix && this.pricingMatrix.delivery && this.pricingMatrix.delivery.heavyLoadT1Weight === undefined) {
            this.pricingMatrix.delivery.heavyLoadT1Weight = 19;
            this.pricingMatrix.delivery.heavyLoadT1Fee = 10;
            this.pricingMatrix.delivery.heavyLoadT2Weight = 31;
            this.pricingMatrix.delivery.heavyLoadT2Fee = 15;
            localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
        }

        this.updateAlertCenter([]);
        this.startDataSync();
        this.updateConsumablesUI();
        this.updateFiltrationUI();
        this.updateMaintenanceUI();
        this.updateAssetsUI();
        this.updateUtilitiesUI();
        this.updateRentalUI();
        this.updatePricingUI();
        this.checkMonthlyReset();
        this.updateDates();
        this.updateBuzzerUI();

        // PROACTIVE AUDIO UNLOCK: Any click on the page resumes the audio system
        document.addEventListener('click', () => {
            this.primeAudioSystem();
        }, { once: false });

        // Restore active tab
        const lastTab = localStorage.getItem('iceqube_admin_tab');
        if (lastTab) {
            this.switchView(lastTab);
        }

        // Check Session Unlock
        if (sessionStorage.getItem('iceqube_admin_unlocked') === 'true') {
            this.unlock(true); // silent unlock
        }

        // Local Sync Listener
        if (window.IceQubeSync) {
            const badge = document.getElementById('sync-status-badge');
            const dot = document.getElementById('sync-dot');
            if (badge && dot) {
                badge.style.background = 'rgba(34, 197, 94, 0.1)';
                badge.style.color = '#22c55e';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                badge.innerHTML = '<span id="sync-dot" style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></span> LOCAL SYNC';
            }
            
            // Check Cloud Sync Status
            const cloudBadge = document.getElementById('cloud-sync-badge');
            const cloudDot = document.getElementById('cloud-dot');
            if (cloudBadge && cloudDot) {
                if (SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
                    cloudBadge.style.background = 'rgba(34, 197, 94, 0.1)';
                    cloudBadge.style.color = '#22c55e';
                    cloudBadge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                    cloudDot.style.background = '#22c55e';
                    cloudDot.style.boxShadow = '0 0 8px #22c55e';
                    cloudBadge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></span> CLOUD LIVE';
                } else {
                    cloudBadge.style.background = 'rgba(245, 158, 11, 0.1)';
                    cloudBadge.style.color = '#f59e0b';
                    cloudBadge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                    cloudDot.style.background = '#f59e0b';
                    cloudDot.style.boxShadow = '0 0 8px #f59e0b';
                    cloudBadge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #f59e0b; border-radius: 50%; box-shadow: 0 0 8px #f59e0b;"></span> MOCK MODE';
                }
            }

            window.IceQubeSync.onOrderEvent((event) => {
                if (event.type === 'NEW_ORDER') {
                    console.log("🔔 [Admin] New order detected via Sync:", event.payload.order_id);
                    this.handleIncomingOrder(event.payload);
                } else if (event.type === 'PROFILE_UPDATED') {
                    console.log("👤 [Admin] Profile update detected via Sync:", event.payload.establishment);
                    this.fetchRealStats(); // Refresh everything to reflect new profile data
                }
            });

            window.IceQubeSync.onComplaintEvent((event) => {
                if (event.type === 'NEW_COMPLAINT') {
                    console.log("🚨 [Admin] New complaint detected via Sync:", event.payload.id);
                    this.handleIncomingComplaint(event.payload);
                }
            });

            window.IceQubeSync.onDeliveryEvent((event) => {
                if (event.type === 'DELIVERY_COMPLETED') {
                    console.log("🏁 [Admin] Delivery completed via Sync:", event.payload.orderId);
                    this.fetchRealStats(); // Refresh everything
                }
            });

            window.IceQubeSync.onMessengerEvent((event) => {
                if (event.type === 'MESSENGER_TEST') {
                    console.log("🔔 [Admin] Received Messenger Test request for:", event.payload.recipientId);
                    this.sendMessengerNotification({
                        customer_name: 'TEST USER',
                        messengerId: event.payload.recipientId,
                        order_id: 'TEST-123',
                        total_bags: '1',
                        total: '0.00',
                        address: 'Admin Bridge Test'
                    });
                }
            });
        }

        // Apply visual state if vacation mode is on
        if (this.vacationMode) {
            document.body.classList.add('vacation-active');
            this.updateVacationUI();
        }
    } catch (err) {
        console.error('❌ Admin Initialization Failed:', err);
        // Ensure the UI is still interactive even if sync fails
        if (document.body) document.body.classList.remove('loading'); 
    }
},

    handleIncomingOrder(order, skipSync = false, silent = false) {
        if (!order || !order.order_id) return;
        
        const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const existingIdx = orders.findIndex(o => o.order_id === order.order_id);
        
        // If order is new OR it exists but hasn't had supplies deducted yet
        if (existingIdx === -1 || !orders[existingIdx].supplies_deducted) {
            console.log(`📦 [Admin] Processing supplies for order ${order.order_id} (Silent: ${silent})`);
            
            if (existingIdx === -1) {
                order.is_real = true; // Ensure visibility in filters
                orders.unshift(order);
            }
            
            // Mark as processed BEFORE saving to prevent recursion/double deduction
            if (existingIdx > -1) {
                orders[existingIdx].supplies_deducted = true;
                // Merge items if they were missing in the local copy but present in the sync payload
                if (!orders[existingIdx].items && order.items) {
                    orders[existingIdx].items = order.items;
                }
            } else {
                order.supplies_deducted = true;
            }
            
            localStorage.setItem('ice_orders', JSON.stringify(orders));
            
            // Deduct supplies using the payload data (more reliable)
            this.deductPackagingSupplies(order);

            if (!silent) {
                this.showNotification(`New Order from ${order.customer_name}`, `${order.order_id}`);
                this.startBuzzer();
            }
            
            // AUTOMATIC DISPATCH TRIGGER
            if (this.vacationMode) {
                console.log("✈️ [Vacation Mode] Triggering Auto-Dispatch for:", order.order_id);
                setTimeout(() => {
                    this.autoDispatch(order);
                }, 2000);
            }

            // --- AUTOMATIC MESSENGER NOTIFICATION ---
            // Re-enabled: DB webhook trigger is not reliably firing.
            this.sendMessengerNotification(order);

            if (!skipSync) this.fetchRealStats();
        } else {
            console.log("⏭️ [Admin] Order already processed for supplies:", order.order_id);
        }
    },

    deductPackagingSupplies(order) {
        if (!order || !order.items) return;

        const items = this.parseItems(order.items);
        const fd = items.fullDice || {};
        const hd = items.halfDice || {};

        // Robust key checking (bag3kg vs 3kg)
        const total3kg = (parseFloat(fd.bag3kg || fd['3kg'] || 0)) + (parseFloat(hd.bag3kg || hd['3kg'] || 0));
        const total1kg = (parseFloat(fd.bag1kg || fd['1kg'] || 0)) + (parseFloat(hd.bag1kg || hd['1kg'] || 0));

        if (total3kg === 0 && total1kg === 0) return;

        console.log(`📦 [Packaging] Deducting supplies for Order ${order.order_id}: ${total3kg}x 3kg bags, ${total1kg}x 1kg bags`);

        let updated = false;
        
        // Update 3kg bags
        if (total3kg > 0) {
            const item = this.consumables.packaging.find(i => i.id === 'bags3kg');
            if (item) {
                item.current = Math.max(0, item.current - total3kg);
                updated = true;
            }
        }
        
        // Update 1kg bags
        if (total1kg > 0) {
            const item = this.consumables.packaging.find(i => i.id === 'bags1kg');
            if (item) {
                item.current = Math.max(0, item.current - total1kg);
                updated = true;
            }
        }

        if (updated) {
            admin.saveState('iceqube_consumables', this.consumables);
            this.updateConsumablesUI();
            console.log(`✅ [Packaging] Supplies updated in LocalStorage.`);
        }
    },

    autoDispatch(order, silent = false) {
        if (this.autoDispatchType === 'broadcast') {
            console.log("📢 [Auto-Dispatch] Broadcasting to all riders...");
            this.dispatchOrder(order.id || order.order_id, 'Unassigned', order.order_id, silent);
        }
    },

    toggleVacationMode() {
        const action = this.vacationMode ? "DISABLE" : "ENABLE";
        const msg = `Are you sure you want to ${action} Vacation Mode? When enabled, all incoming orders are automatically accepted/dispatched.`;
        
        this.showConfirmModal(
            "Vacation Mode",
            msg,
            () => {
                this.vacationMode = !this.vacationMode;
                admin.saveState('iceqube_vacation_mode', this.vacationMode);
                
                if (this.vacationMode) {
                    document.body.classList.add('vacation-active');
                    console.log("✈️ Vacation Mode ENABLED: Autopilot Active.");
                } else {
                    document.body.classList.remove('vacation-active');
                    console.log("🏠 Vacation Mode DISABLED: Manual Control Restored.");
                }
                
                this.updateVacationUI();
            },
            action === "ENABLE" ? "Enable Vacation" : "Disable Vacation"
        );
    },

    updateVacationUI() {
        const btn = document.getElementById('vacation-btn');
        if (!btn) return;

        if (this.vacationMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    showNotification(title, sub) {
        const bell = document.getElementById('notif-dot');
        if (bell) bell.style.display = 'block';
        
        // Browser notification if permitted
        if (Notification.permission === "granted") {
            new Notification(title, { body: sub, icon: './assets/logo.png' });
        }
    },

    logDebug(msg) {
        console.log(`[DEBUG] ${msg}`);
    },

    primeAudioSystem() {
        this.logDebug("Priming Audio System...");
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().then(() => {
                    this.logDebug("Audio Context ACTIVE");
                    this.updateBuzzerUI();
                    
                    // Play a silent "pop" to confirm it works
                    const osc = this.audioCtx.createOscillator();
                    const gain = this.audioCtx.createGain();
                    gain.gain.value = 0.001; 
                    osc.connect(gain);
                    gain.connect(this.audioCtx.destination);
                    osc.start();
                    osc.stop(this.audioCtx.currentTime + 0.1);
                }).catch(e => {
                    console.warn("Audio resume failed");
                });
            }
        } catch (e) {
            console.warn("Prime error", e);
        }
    },

    startBuzzer() {
        if (this.buzzerActive) return;
        if (this.buzzerMuted) return;
        
        this.buzzerActive = true;
        this.updateBuzzerUI();
        
        const playBeep = () => {
            if (!this.buzzerActive) return;

            try {
                if (!this.audioCtx) {
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                // If it's suspended, we can't hear anything, but we keep trying to resume
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().catch(() => {});
                    this.updateBuzzerUI();
                }

                // Primary: Magic Ding MP3
                const audioEl = document.getElementById('buzzer-audio-element');
                if (audioEl) {
                    audioEl.currentTime = 0;
                    audioEl.play().catch(e => {
                        console.warn("Audio element blocked");
                        this.updateBuzzerUI(); // Show "Unmute" warning
                    });
                }

                // Secondary Backup: Synthesized soft chime (often bypasses blocks better)
                if (this.audioCtx.state === 'running') {
                    const now = this.audioCtx.currentTime;
                    const osc = this.audioCtx.createOscillator();
                    const gain = this.audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1000, now);
                    osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
                    osc.connect(gain);
                    gain.connect(this.audioCtx.destination);
                    osc.start(now);
                    osc.stop(now + 0.8);
                }
            } catch (err) {
                console.warn("Buzzer error:", err);
            }

            if (this.buzzerActive) {
                this.buzzerTimeout = setTimeout(playBeep, 2500); 
            }
        };
        
        playBeep();
    },

    stopBuzzer() {
        console.log("🔕 [Buzzer] Stopping Alarm.");
        this.buzzerActive = false;
        if (this.buzzerTimeout) {
            clearTimeout(this.buzzerTimeout);
            this.buzzerTimeout = null;
        }
        this.updateBuzzerUI();
    },

    dispatchViaIframe(recipientId, text) {
        console.log('📡 [Messenger] falling back to iframe form submission (bypasses CORS).');
        let bc = document.getElementById('hidden-bridge');
        if (!bc) {
            bc = document.createElement('div');
            bc.id = 'hidden-bridge';
            bc.style.display = 'none';
            document.body.appendChild(bc);
        }
        
        const uniqueSeed = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const frameName = `msg-frame-${recipientId.slice(-4)}-${uniqueSeed}`;
        
        const div = document.createElement('div');
        
        const iframe = document.createElement('iframe');
        iframe.name = frameName;
        iframe.style.display = 'none';
        div.appendChild(iframe);

        const form = document.createElement('form');
        form.action = `${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook?apikey=${SUPABASE_CONFIG.ANON_KEY}`;
        form.method = 'POST';
        form.target = frameName;

        const recInput = document.createElement('input');
        recInput.type = 'hidden';
        recInput.name = 'recipientId';
        recInput.value = recipientId;
        form.appendChild(recInput);

        const msgInput = document.createElement('input');
        msgInput.type = 'hidden';
        msgInput.name = 'message';
        msgInput.value = text;
        form.appendChild(msgInput);

        div.appendChild(form);
        bc.appendChild(div);
        form.submit();
        
        // Clean up after 20 seconds
        setTimeout(() => {
            try {
                if (div && div.parentNode) div.parentNode.removeChild(div);
            } catch (e) {}
        }, 20000);
        return { success: true, mode: 'iframe' };
    },

    async dispatchMessengerMessage(recipientId, text) {
        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            throw new Error("Supabase URL not configured");
        }
        
        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) {
            return this.dispatchViaIframe(recipientId, text);
        }

        try {
            const endpoint = `${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                },
                body: JSON.stringify({ recipientId, message: text })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || (data && data.error)) {
                const errMsg = (data && data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
                throw new Error(errMsg);
            }
            return data;
        } catch (fetchError) {
            // If fetch failed due to CORS or Network issues (Failed to fetch)
            if (fetchError.message === 'Failed to fetch' || fetchError.name === 'TypeError') {
                console.warn('⚠️ [Messenger] Fetch failed (CORS/Network error). Retrying via Iframe form fallback...', fetchError);
                return this.dispatchViaIframe(recipientId, text);
            }
            throw fetchError;
        }
    },

    async broadcastToAdmins(text, customerId = '') {
        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            throw new Error("Supabase URL not configured");
        }
        
        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) {
            console.log('⚠️ [Messenger] Running locally, skipping broadcast fetch. Message:', text);
            return { success: true, mode: 'local_bypass' };
        }

        try {
            const endpoint = `${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook/send`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'apikey': SUPABASE_CONFIG.ANON_KEY
                },
                body: JSON.stringify({ action: 'broadcast_to_admins', message: text, customerId: customerId })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || (data && data.error)) {
                const errMsg = (data && data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
                throw new Error(errMsg);
            }
            return data;
        } catch (fetchError) {
            console.warn('⚠️ [Messenger] Broadcast fetch failed.', fetchError);
            throw fetchError;
        }
    },

    async sendMessengerNotification(orderInput) {
        let order = orderInput;
        let isManual = false;
        
        // If passed an ID, look it up in the cache
        if (typeof orderInput === 'string') {
            order = (this.lastFetchedOrders || []).find(o => o.order_id === orderInput);
            isManual = true;
        }

        if (!order || !order.customer_name || !order.order_id) return;
        
        // --- 1. DE-DUPLICATION CHECK ---
        if (!this.notifiedOrders) this.notifiedOrders = new Set();
        const isTestOrder = order.order_id === 'TEST-SYNC' || order.order_id === 'TEST-123';
        if (!isManual && !isTestOrder && this.notifiedOrders.has(order.order_id)) {
            console.log('⏭️ [Messenger] Already notified for order:', order.order_id);
            return;
        }
        this.notifiedOrders.add(order.order_id);

        const statusText = document.getElementById('messenger-status');
        const statusDot = document.getElementById('messenger-dot');
        const statusBadge = document.getElementById('messenger-bridge-badge') || (statusText ? statusText.parentElement : null);

        const updateStatus = (text, color, pulse = false) => {
            if (statusText) statusText.innerText = `Messenger Bridge: ${text}`;
            if (statusDot) {
                statusDot.style.background = color;
                statusDot.style.animation = pulse ? 'pulse 1s infinite' : 'none';
                statusDot.style.boxShadow = `0 0 10px ${color}`;
            }
            // SMART VISIBILITY: Hide if idle, show if active/error
            if (statusBadge) {
                if (text === 'Idle' || text.includes('Success') || text.includes('Notified')) {
                    setTimeout(() => {
                        if (statusText.innerText.includes('Idle') || statusText.innerText.includes('Success') || statusText.innerText.includes('Notified')) {
                            statusBadge.style.opacity = '0';
                            setTimeout(() => statusBadge.style.display = 'none', 500);
                        }
                    }, 5000);
                } else {
                    statusBadge.style.display = 'inline-flex';
                    statusBadge.style.opacity = '1';
                }
            }
        };

        // Get customer profile to find their Messenger ID
        const directory = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');
        const cleanCustName = (order.customer_name || '').trim();
        const profile = directory[cleanCustName] || directory[order.customer_name] || {};
        
        const targetId = (profile && profile.messengerId) || (order.messenger_id || order.messengerId) || null;
        
        console.log('🔔 [Messenger] Admin triggering notification. Target customer ID:', targetId);
        updateStatus('Sending...', '#0ea5e9', true);
        
        // Construct Simplified Detailed Message (v24 Robust)
        let itemsText = 'Ice Products';
        try {
            const rawItems = (typeof order.items === 'string') ? JSON.parse(order.items) : order.items;
            if (rawItems && (rawItems.fullDice || rawItems.halfDice)) {
                let parts = [];
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
                
                if (parts.length > 0) itemsText = parts.join(', ');
            } else {
                itemsText = order.items_summary || (Array.isArray(order.items) ? order.items.map(i => `${i.qty}x ${i.name}`).join(', ') : order.items);
            }
        } catch (e) {
            console.warn('Items parse failed:', e);
            itemsText = order.items_summary || 'Ice Products';
        }
        
        // --- MATH RECONCILIATION (REFINED) ---
        const totalGross = Number(order.total_price || order.total || 0);
        const deliveryFee = Number(order.delivery_fee || 0);
        const heavyLoad = Number(order.priority_fee || order.heavy_load_fee || 0);
        const discount = Number(order.discount || order.discount_total || 0);
        
        // Calculate Subtotal (Items only before discount)
        const subtotal = Math.max(0, totalGross - deliveryFee - heavyLoad + discount);
        
        let msg = `❄️ ICEQUBE ORDER CONFIRMED!\n\n` +
                    `Deliver to: ${order.customer_name}\n` +
                    `Item: ${itemsText}\n` +
                    `Subtotal: ₱${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        
        // Only show discount if it exists
        if (discount > 0) {
            msg += `Discount: -₱${discount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        }
 
        msg += `Delivery fee: ₱${deliveryFee.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        
        if (heavyLoad > 0) {
            msg += `Bulk Weight Fee: ₱${heavyLoad.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        }
 
        msg += `Total: ₱${totalGross.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
               `Payment: ${order.payment_method || 'Cash'}\n\n` +
               `Thank you for your order!`;
 
        try {
            let customerError = null;

            // Determine if the target is an admin
            let isAdmin = false;
            if (targetId && this.teamMembersData) {
                isAdmin = this.teamMembersData.some(m => m.messenger === targetId && ['Admin Officer', 'Admin', 'Hub Staff'].includes(m.roleCategory) && m.status === 'Active');
            }

            // 1. DISPATCH TO CUSTOMER (Skip if they are an admin, as they will get the Admin Alert instead)
            if (targetId && !isAdmin) {
                try {
                    console.log('📡 [Messenger] Sending customer receipt...');
                    await this.dispatchMessengerMessage(targetId, msg);
                    console.log('✅ [Messenger] Customer Receipt Sent successfully.');
                } catch (e) {
                    customerError = e.message;
                    console.error('❌ [Messenger] Customer Receipt dispatch failed:', e);
                }
            } else if (isAdmin) {
                console.log('ℹ️ [Messenger] Customer is an Admin. Skipping direct customer receipt to avoid duplicates.');
            } else {
                console.log('ℹ️ [Messenger] No registered customer PSID found. Skipping direct customer receipt.');
            }

            // 2. ALWAYS DISPATCH COPY of receipt to Admin/Business account
            try {
                console.log(`📡 [Messenger] Sending Admin Copy of receipt...`);
                await this.broadcastToAdmins(msg, targetId);
            } catch (e) {
                console.error(`❌ [Messenger] Admin Copy broadcast failed:`, e);
            }

            // 3. DISPATCH ADMIN ALERT TO ADMIN
            const adminMsg = `🚨 NEW ORDER ALERT!\n\n` +
                             `Deliver to: ${order.customer_name}\n` +
                             `Item: ${itemsText}\n` +
                             `Total: ₱${totalGross.toLocaleString()}\n` +
                             `Payment: ${order.payment_method || 'Cash'}\n\n` +
                             `Check the Control Room!`;
            try {
                console.log(`📡 [Messenger] Sending Admin Alert...`);
                await this.broadcastToAdmins(adminMsg, targetId);
            } catch (e) {
                console.error(`❌ [Messenger] Admin Alert broadcast failed:`, e);
            }

            if (customerError) {
                if (customerError.includes('(#100)') || customerError.includes('Parameter error')) {
                    updateStatus(`Customer ID is un-reachable (Logged in as Page). Notification skipped.`, '#eab308');
                } else {
                    updateStatus(`Fail: ${customerError}`, '#ef4444');
                }
            } else {
                updateStatus(`Notified Successfully`, '#22c55e');
            }
        } catch (error) {
            console.error('❌ [Messenger] Admin dispatch failed:', error);
            updateStatus('Bridge Failed', '#ef4444');
        } finally {
            // Reset to idle after 10 seconds
            setTimeout(() => updateStatus('Idle', '#94a3b8'), 10000);
        }
    },

    testMessengerID() {
        console.log("🧪 Diagnostic: Sending to 712885031918698");
        this.sendMessengerNotification({
            order_id: "TEST-SYNC",
            customer_name: "Admin",
            messenger_id: "712885031918698"
        });
    },

    toggleBuzzerMute() {
        // Resume audio context on user interaction
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (this.buzzerActive) {
            this.stopBuzzer();
            return;
        }
        this.buzzerMuted = !this.buzzerMuted;
        localStorage.setItem('iceqube_buzzer_muted', this.buzzerMuted);
        console.log(`🔔 Buzzer Mute: ${this.buzzerMuted}`);
        this.updateBuzzerUI();
    },

    testBuzzer() {
        // Resume audio context on user interaction
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (this.buzzerActive) {
            this.stopBuzzer();
        } else {
            // Force start even if muted for testing
            const wasMuted = this.buzzerMuted;
            this.buzzerMuted = false;
            this.startBuzzer();
            this.buzzerMuted = wasMuted; // Restore original state
        }
    },

    updateBuzzerUI() {
        const badge = document.getElementById('buzzer-badge');
        const dot = document.getElementById('buzzer-dot');
        if (!badge || !dot) return;

        // --- NEW: Audio Permission Tracking ---
        const isAudioBlocked = this.audioCtx && this.audioCtx.state === 'suspended';
        
        if (this.buzzerActive) {
            badge.className = 'buzzer-active-alarm';
            badge.style.background = '#ef4444';
            badge.style.color = 'white';
            badge.style.borderColor = 'white';
            
            if (isAudioBlocked) {
                badge.style.background = '#eab308'; // Amber to show block
                badge.style.color = '#000';
                badge.innerHTML = `<span id="buzzer-dot" style="width: 6px; height: 6px; background: black; border-radius: 50%; box-shadow: 0 0 10px black;"></span> <span class="hide-mobile">⚠️ CLICK TO UNMUTE</span><span class="show-mobile" style="display:none; font-size:14px;">⚠️</span>`;
            } else {
                badge.innerHTML = `<span id="buzzer-dot" style="width: 6px; height: 6px; background: white; border-radius: 50%; box-shadow: 0 0 10px white;"></span> <span class="hide-mobile">STOP BUZZER</span><span class="show-mobile" style="display:none; font-size:14px;">🛑</span>`;
            }
        } else {
            badge.className = '';
            if (this.buzzerMuted) {
                badge.style.background = 'rgba(255, 255, 255, 0.05)';
                badge.style.color = '#94a3b8';
                badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                dot.style.background = '#64748b';
                dot.style.boxShadow = 'none';
                badge.innerHTML = `<span id="buzzer-dot" style="width: 6px; height: 6px; background: #64748b; border-radius: 50%;"></span> <span class="hide-mobile">BUZZER (MUTED)</span><span class="show-mobile" style="display:none; font-size:14px;">🔇</span>`;
            } else if (isAudioBlocked) {
                badge.style.background = 'rgba(234, 179, 8, 0.1)';
                badge.style.color = '#eab308';
                badge.style.borderColor = 'rgba(234, 179, 8, 0.3)';
                dot.style.background = '#eab308';
                dot.style.boxShadow = '0 0 8px #eab308';
                badge.innerHTML = `<span id="buzzer-dot" style="width: 6px; height: 6px; background: #eab308; border-radius: 50%; box-shadow: 0 0 8px #eab308;"></span> <span class="hide-mobile">⚠️ ENABLE SOUND</span><span class="show-mobile" style="display:none; font-size:14px;">⚠️</span>`;
            } else {
                badge.style.background = 'rgba(34, 197, 94, 0.1)';
                badge.style.color = '#22c55e';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 8px #22c55e';
                badge.innerHTML = `<span id="buzzer-dot" style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></span> <span class="hide-mobile">BUZZER (ON)</span><span class="show-mobile" style="display:none; font-size:14px;">🔔</span>`;
            }
        }
    },

    addPin(num) {
        if (this.pin.length < 4) {
            this.pin += num;
            this.updatePinDisplay();
            
            if (this.pin.length === 4) {
                setTimeout(() => this.verifyPin(), 200);
            }
        }
    },

    clearPin() {
        this.pin = '';
        this.updatePinDisplay();
    },

    updatePinDisplay() {
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, index) => {
            if (index < this.pin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    },

    verifyPin() {
        if (this.pin === this.correctPin) {
            this.unlock();
        } else {
            this.vibrateError();
            this.pin = '';
            this.updatePinDisplay();
        }
    },

    openUpdateModal(binId, current, max) {
        const modal = document.getElementById('update-bin-modal');
        const input = document.getElementById('new-stock-val');
        const title = document.getElementById('modal-title');
        
        this.activeBinId = binId;
        title.innerText = `Update ${binId}`;
        input.value = current;
        modal.style.display = 'flex';
    },

    vibrateError() {
        const gate = document.querySelector('.gate-content');
        gate.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
        setTimeout(() => {
            gate.style.animation = '';
        }, 500);
    },

    unlock(silent = false) {
        const gate = document.getElementById('admin-gate');
        const dashboard = document.getElementById('command-center');
        
        gate.classList.add('unlocked');
        dashboard.style.display = 'flex';
        
        if (!silent) console.log('--- ACCESS GRANTED: COMMAND CENTER ONLINE ---');
        
        // Persist session
        sessionStorage.setItem('iceqube_admin_unlocked', 'true');

        // Resume Audio Context after user interaction (PIN entry)
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        this.startDataSync();
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('notif-dropdown');
            const bell = document.getElementById('notif-bell');
            if (dropdown && bell && !bell.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    },

    startDataSync() {
        if (this._syncIntervalId) clearInterval(this._syncIntervalId);
        
        // Initial fetch
        this.fetchRealStats();
        
        // Auto-refresh every 10 seconds
        this._syncIntervalId = setInterval(async () => {
            this.fetchRealStats();
            
            // Also poll for pricing updates in the background (SKIP if currently editing to avoid overwriting inputs)
            if (window.IceQubeSync && !this.isEditingMatrix) {
                const cloudMatrix = await window.IceQubeSync.fetchCloudPricing();
                if (cloudMatrix && !cloudMatrix._error && JSON.stringify(cloudMatrix) !== JSON.stringify(this.pricingMatrix)) {
                    console.log("☁️ [Admin] Pricing updated from Cloud (V2 Background Sync)");
                    
                    if (cloudMatrix.products) this.pricingMatrix.products = cloudMatrix.products;
                    if (cloudMatrix.delivery) this.pricingMatrix.delivery = cloudMatrix.delivery;
                    
                    localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
                    this.updatePricingUI();
                    const syncText = document.getElementById('cloud-sync-status-text');
                    if (syncText) syncText.innerText = `☁️ Updated: ${new Date().toLocaleTimeString()}`;
                }
                
                // Poll for other App States (Consumables, Cashflow, Utilities, Assets, Purge, etc.)
                if (window.IceQubeSync.fetchCloudAppStates) {
                    const cloudStates = await window.IceQubeSync.fetchCloudAppStates();
                    this.applyCloudStates(cloudStates);
                }
            }
        }, 10000);
        
        // Add entrance animation
        this.animateCards();
    },

    async fetchRealStats() {
        const badge = document.getElementById('cloud-sync-badge');
        const dot = document.getElementById('cloud-dot');

        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            console.log('Using mock data: Supabase not configured.');
            if (badge) {
                badge.style.background = 'rgba(239, 68, 68, 0.1)';
                badge.style.color = '#ef4444';
                badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                badge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 8px #ef4444;"></span> CLOUD SYNC (OFF)';
            }
            this.renderMockStats();
            return;
        }

        console.log('Fetching from Supabase...');
        try {
            const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?order=created_at.desc`, {
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                }
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }
            let orders = await response.json();
            // Filter out system configuration records from real business stats
            orders = (orders || []).filter(o => o.order_id && !o.order_id.startsWith('CONFIG_'));
            console.log(`✅ Received ${orders.length} business orders from Supabase.`);
            
            if (badge) {
                badge.style.background = 'rgba(34, 197, 94, 0.1)';
                badge.style.color = '#22c55e';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                badge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></span> CLOUD LIVE';
            }

            // Merge cloud data with local data
            const localOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]').filter(o => o.order_id && !o.order_id.startsWith('CONFIG_'));
            const cloudOrders = (orders || []).filter(o => o.order_id && !o.order_id.startsWith('CONFIG_'));
            
            // --- SESSION-BASED CLOUD DETECTION ---
            cloudOrders.forEach(co => {
                const orderId = co.order_id;
                const alreadyAlarmed = this.alarmedOrders.has(orderId);

                // Find if this order already exists in local storage to preserve its status
                const existingLocal = localOrders.find(lo => lo.order_id === orderId);
                if (existingLocal && existingLocal.supplies_deducted) {
                    co.supplies_deducted = true;
                }

                if (!alreadyAlarmed) {
                    this.alarmedOrders.add(orderId);
                    
                    const orderDate = new Date(co.created_at || 0);
                    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
                    const isVeryRecent = orderDate > thirtyMinutesAgo;

                    // 1. Client-side notification (DB webhook trigger not reliably firing)
                    if (isVeryRecent) {
                        console.log("🔔 [Messenger] Detected very recent order, triggering bridge:", orderId);
                        this.sendMessengerNotification(co);
                    }

                    // 2. Automated Inventory Deduction (Silent if initial load)
                    if (this.isInitialLoadComplete) {
                        console.log("🚀 [Buzzer] Alarm Triggered for New Order:", orderId);
                        this.startBuzzer();
                        this.showNotification(`⚠️ NEW ORDER: ${co.customer_name}`, orderId);
                        this.handleIncomingOrder(co, true, false); // silent = false
                    } else if (!co.supplies_deducted) {
                        // If it's the initial load, we process it SILENTLY to ensure inventory is accurate
                        console.log("📋 [Sync] Processing historical cloud order for inventory:", orderId);
                        this.handleIncomingOrder(co, true, true); // silent = true
                    }
                }
            });

            // Mark initial load as done after the first successful cloud fetch
            this.isInitialLoadComplete = true;

            // Merge logic: Prioritize Cloud data but keep local flags (like supplies_deducted)
            let merged = [...cloudOrders];
            localOrders.forEach(lo => {
                const cloudVer = cloudOrders.find(co => co.order_id === lo.order_id);
                if (!cloudVer && (lo.is_real || lo.total_price > 0 || lo.items)) {
                    merged.push(lo);
                }
            });
            
            // Sort by newest first
            merged.sort((a, b) => {
                const dateA = new Date(a.created_at || 0);
                const dateB = new Date(b.created_at || 0);
                return dateB - dateA;
            });
            
            localStorage.setItem('ice_orders', JSON.stringify(merged.slice(0, 200)));
            this.allOrders = merged; // Update internal state
            this.updateDashboardUI(merged);
        } catch (err) {
            console.warn('Live fetch failed, falling back to mock:', err);
            if (badge) {
                badge.style.background = 'rgba(239, 68, 68, 0.1)';
                badge.style.color = '#ef4444';
                badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                badge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 8px #ef4444;"></span> OFFLINE';
            }
            this.renderMockStats();
        }
    },

    updateDashboardUI(orders) {
        if (!orders) return;
        this.allOrders = orders;
        console.log("🔄 Updating Dashboard UI...");
        
        // 1. Priority: Update Order Queue
        this.updateOrderQueue(orders);

        // 2. Stats Calculation
        const todayStr = new Date().toDateString();
        const todaysOrders = orders.filter(o => new Date(o.created_at || Date.now()).toDateString() === todayStr);

        const pending = orders.filter(o => o.delivery_status === 'Pending' || o.delivery_status === 'Awaiting Acceptance').length;
        const dispatched = orders.filter(o => o.delivery_status === 'Dispatched').length;
        const delivered = orders.filter(o => o.delivery_status === 'Delivered').length;
        
        let revenue = todaysOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
        if (this.manualEntries) {
            this.manualEntries.forEach(entry => {
                if (entry.category === 'Sales' && entry.type === 'IN' && new Date(entry.timestamp).toDateString() === todayStr) {
                    revenue += (parseFloat(entry.amount) || 0);
                }
            });
        }
        const revenueEl = document.getElementById('ops-revenue') || document.querySelector('.metric-value');
        if (revenueEl) revenueEl.innerText = `₱${revenue.toLocaleString()}`;
        
        // 3. Kg Calculation
        let totalKg = 0;
        todaysOrders.forEach(o => {
            if (o.items) {
                const items = this.parseItems(o.items);
                const fd = items.fullDice || {};
                const hd = items.halfDice || {};
                
                const getKgMultiplier = (key) => {
                    let match = String(key).match(/(\d+(?:\.\d+)?)\s*kg/i);
                    if (match) return parseFloat(match[1]);
                    const matrix = items._matrix || this.pricingMatrix || {products: []};
                    const product = (matrix.products || []).find(p => p.id === key);
                    if (product && product.name) {
                        match = String(product.name).match(/(\d+(?:\.\d+)?)\s*kg/i);
                        if (match) return parseFloat(match[1]);
                    }
                    return 0;
                };

                for (let key in fd) {
                    totalKg += (parseFloat(fd[key]) || 0) * getKgMultiplier(key);
                }
                for (let key in hd) {
                    totalKg += (parseFloat(hd[key]) || 0) * getKgMultiplier(key);
                }
            }
        });

        // Add manual Kg from cashflow sales (e.g., "50kg")
        if (this.manualEntries) {
            this.manualEntries.forEach(entry => {
                if (entry.category === 'Sales' && new Date(entry.timestamp).toDateString() === todayStr) {
                    const match = (entry.description || '').match(/(\d+(?:\.\d+)?)\s*kg/i);
                    if (match && match[1]) {
                        totalKg += parseFloat(match[1]);
                    }
                }
            });
        }
        const bagsEl = document.getElementById('ops-bags');
        if (bagsEl) {
            bagsEl.innerText = totalKg.toLocaleString();
        } else {
            const metricValues = document.querySelectorAll('.cc-card .metric-value');
            if (metricValues.length >= 2) metricValues[1].innerText = totalKg.toLocaleString();
        }

        // 4. Status Counters
        const statusValues = document.querySelectorAll('.status-item .status-value');
        if (statusValues.length >= 3) {
            statusValues[0].innerText = pending;
            statusValues[1].innerText = dispatched;
            statusValues[2].innerText = delivered;
        }

        // 5. Secondary Updates
        this.updateOperationFeed(orders);
        this.updateCashflowView(orders);
        this.updateCustomerDirectory(orders);
        this.updateAlertCenter(orders);
        this.updateComplaintsUI();
        this.renderPaymentVerification(orders);

        // 6. Vacation Mode Auto-Dispatch (On-Load Check)
        if (this.vacationMode) {
            orders.forEach(order => {
                if (order.delivery_status === 'Pending' && (order.rider === 'Unassigned' || !order.rider)) {
                    console.log("✈️ [Vacation Mode] Found pending order on load:", order.order_id);
                    this.autoDispatch(order, true); // silent = true
                }
            });
        }
    },

    updateOperationFeed(orders) {
        const feed = document.getElementById('operation-feed');
        if (!feed) return;
        
        if (orders.length === 0) {
            feed.innerHTML = '<div style="text-align: center; color: #64748b; padding: 10px;">System Online. No recent activity.</div>';
            return;
        }

        const eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '[]');

        feed.innerHTML = '<div style="display: flex; flex-direction: column; gap: 10px;">' + orders.slice(0, 5).map(o => {
            const cleanCustName = (o.customer_name || '').trim();
            const isElite = eliteList.some(name => (name || '').trim().toLowerCase() === cleanCustName.toLowerCase()) || o.account_type === 'Elite';
            return `
                <div style="padding: 10px; background: rgba(14, 165, 233, 0.1); border-left: 3px solid ${isElite ? '#eab308' : '#0ea5e9'}; border-radius: 4px;">
                    <span style="color: #94a3b8; font-size: 0.75rem;">${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> - New Order <strong>${o.order_id}</strong> by ${o.customer_name}
                    ${isElite ? '<span style="background: #eab308; color: #000; padding: 1px 4px; border-radius: 3px; font-size: 0.55rem; font-weight: 900; margin-left: 4px;">ELITE</span>' : ''}
                    <br>
                    <small style="color: #cbd5e1; margin-top: 4px; display: block;">${o.payment_method} • ₱${o.total_price}</small>
                </div>
            `;
        }).join('') + '</div>';
    },

    renderMockStats() {
        this.animateCards();
        
        // Comprehensive Mock Data for Order Queue and Dashboard
        const mockOrders = [];

        // Load Synced Orders from Local Storage
        const syncedOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const isPurged = localStorage.getItem('ice_system_purged') === 'true';
        
        // Merge: Only use mocks if no synced orders exist AND system is NOT purged
        let combinedOrders = [];
        if (syncedOrders.length > 0) {
            combinedOrders = [...syncedOrders];
        } else if (!isPurged) {
            combinedOrders = [...mockOrders];
        }

        // Populate the whole UI with combined data
        this.updateDashboardUI(combinedOrders);
        this.updateAlertCenter(combinedOrders);
        this.updateComplaintsUI();
        console.log(`🎨 Dashboard rendered with ${combinedOrders.length} orders (Purged Mode: ${isPurged}).`);
    },

    handleIncomingComplaint(complaint) {
        if (!complaint || !complaint.id) return;
        
        const complaints = JSON.parse(localStorage.getItem('ice_complaints') || '[]');
        if (!complaints.find(c => c.id === complaint.id)) {
            complaints.unshift(complaint);
            localStorage.setItem('ice_complaints', JSON.stringify(complaints));
            this.complaints = complaints;
            
            this.showNotification(`New Complaint: ${complaint.customerName}`, complaint.issueType);
            this.startBuzzer();
            this.updateComplaintsUI();
            
            // --- NEW: Trigger Messenger Notification for Admin ---
            this.sendComplaintMessengerNotification(complaint);
        }
    },

    async sendComplaintMessengerNotification(complaint) {
        if (!complaint || !complaint.customerName) return;
        
        const msg = `🚨 NEW CUSTOMER SUPPORT ISSUE!\n\n` +
                    `Customer: ${complaint.customerName}\n` +
                    `Issue: ${complaint.issueType}\n` +
                    `Details: ${complaint.description || 'No description provided.'}\n\n` +
                    `Check the Control Room complaints ledger!`;
                    
        try {
            await this.broadcastToAdmins(msg);
            console.log(`📡 [Messenger] Customer Support Notification Broadcasted to Admins.`);
        } catch (error) {
            console.error(`❌ [Messenger] Support notification broadcast failed:`, error);
        }
    },

    updateComplaintsUI() {
        const complaintsList = document.getElementById('complaints-list');
        const badge = document.getElementById('active-complaints-badge');
        
        if (!complaintsList) return;

        const activeComplaints = this.complaints.filter(c => c.status === 'active');
        
        if (badge) {
            badge.innerText = `● ${activeComplaints.length} Active Issues`;
            badge.style.display = activeComplaints.length > 0 ? 'inline' : 'none';
        }

        if (activeComplaints.length === 0) {
            complaintsList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px; font-size: 0.8rem;">No active complaints</div>';
            return;
        }

        complaintsList.innerHTML = activeComplaints.map(c => `
            <div class="rider-card" style="flex-direction: column; align-items: flex-start; padding: 12px; gap: 8px;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start;">
                    <div>
                        <h4 style="margin: 0; font-size: 0.85rem;">${c.customerName}</h4>
                        <small style="color: #94a3b8; font-size: 0.7rem;">Order: ${c.orderId} • ${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <span style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; text-transform: uppercase;">${c.issueType}</span>
                </div>
                <p style="margin: 0; font-size: 0.75rem; color: #cbd5e1; line-height: 1.4;">"${c.userNote || 'No details provided.'}"</p>
                <div style="display: flex; gap: 8px; width: 100%; margin-top: 4px;">
                    <button onclick="admin.resolveComplaint('${c.id}')" style="flex: 1; background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); padding: 6px; border-radius: 6px; font-size: 0.65rem; font-weight: 700; cursor: pointer;">Resolve Issue</button>
                    ${c.photoUrl && c.photoUrl !== 'Not Required' ? `<button onclick="admin.viewPhoto('${c.id}', '${c.photoUrl}')" style="background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); padding: 6px; border-radius: 6px; font-size: 0.65rem; cursor: pointer;">View Photo</button>` : ''}
                </div>
            </div>
        `).join('');
    },

    resolveComplaint(id) {
        console.log(`✅ Resolving Complaint: ${id}`);
        const complaints = JSON.parse(localStorage.getItem('ice_complaints') || '[]');
        const idx = complaints.findIndex(c => c.id === id);
        if (idx > -1) {
            complaints[idx].status = 'resolved';
            complaints[idx].resolvedAt = new Date().toISOString();
            localStorage.setItem('ice_complaints', JSON.stringify(complaints));
            this.complaints = complaints;
            this.updateComplaintsUI();
            this.showNotification("Issue Resolved", `Case ${id} has been closed.`);
        }
    },

    openPhotoModal(photoUrl, orderId) {
        console.log(`🖼️ Viewing Payment Screenshot for Order: ${orderId}`);
        const modal = document.getElementById('modal-photo-preview');
        const img = document.getElementById('preview-img');
        const caseIdEl = document.getElementById('photo-preview-id');
        const loadingText = document.getElementById('photo-loading-text');
        
        const receiptPane = document.getElementById('verification-receipt-pane');
        const actionsDiv = document.getElementById('verification-actions');
        const verifyBtn = document.getElementById('btn-verify-modal');
        const flagBtn = document.getElementById('btn-flag-modal');
        
        if (!modal || !img) return;

        if (caseIdEl) caseIdEl.innerText = `Order ID: ${orderId}`;
        
        // Populate Digital Receipt if order exists
        const order = admin.allOrders.find(o => o.order_id === orderId);
        if (order && receiptPane && actionsDiv) {
            
            // Silently populate the hidden actual receipt panel
            admin.populateReceipt(orderId);
            
            // Extract the generated receipt
            const actualReceiptPaper = document.querySelector('#receipt-panel .receipt-paper');
            if (actualReceiptPaper) {
                // Strip all IDs from the clone to prevent DOM conflicts with the main panel
                const clonedHtml = actualReceiptPaper.outerHTML.replace(/id="[^"]+"/g, '');
                receiptPane.innerHTML = clonedHtml;
                receiptPane.style.padding = '0';
                receiptPane.style.background = 'white';
                receiptPane.style.display = 'block';
            } else {
                receiptPane.innerHTML = '<div style="padding: 1.5rem; color: #cbd5e1;">Receipt could not be generated.</div>';
                receiptPane.style.display = 'block';
            }
            
            if (order.verification_status !== 'verified' && order.verification_status !== 'flagged') {
                actionsDiv.style.display = 'flex';
                if(verifyBtn) verifyBtn.onclick = () => { admin.verifyPayment(orderId); admin.closePhotoModal(); };
                if(flagBtn) flagBtn.onclick = () => { admin.flagPayment(orderId); admin.closePhotoModal(); };
            } else {
                actionsDiv.style.display = 'none';
            }
        } else if (receiptPane && actionsDiv) {
            receiptPane.style.display = 'none';
            actionsDiv.style.display = 'none';
        }

        if (loadingText) {
            loadingText.style.display = 'block';
            loadingText.innerText = 'Loading High-Res Evidence...';
            loadingText.style.animation = 'pulse 2s infinite';
        }
        
        img.style.opacity = '0';
        img.src = ''; // Clear previous
        
        let finalUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('iceqube-storage.app')) {
            finalUrl = 'https://images.unsplash.com/photo-1551717727-463e260907a7?q=80&w=1200&auto=format&fit=crop';
        } else if (photoUrl && !photoUrl.startsWith('http') && !photoUrl.startsWith('data:') && !photoUrl.startsWith('./')) {
            finalUrl = `https://${photoUrl}`;
        }

        img.src = finalUrl;
        modal.classList.add('active');

        setTimeout(() => {
            if (loadingText && loadingText.style.display !== 'none') {
                loadingText.innerText = 'Storage Link Secured';
                loadingText.style.animation = 'none';
            }
        }, 5000);
    },

    viewPhoto(caseId, photoUrl) {
        console.log(`\ud83d\uddbc\ufe0f Viewing Photo for Case: ${caseId}`);
        const modal = document.getElementById('modal-photo-preview');
        const img = document.getElementById('preview-img');
        const caseIdEl = document.getElementById('photo-preview-id');
        const loadingText = document.getElementById('photo-loading-text');
        
        if (!modal || !img) return;

        caseIdEl.innerText = `Case ID: ${caseId}`;
        if (loadingText) loadingText.style.display = 'block';
        img.style.opacity = '0';
        img.src = ''; // Clear previous
        
        // Handle mock vs real URLs
        let finalUrl = photoUrl;
        if (photoUrl.startsWith('iceqube-storage.app')) {
            // For demo, fallback to a high-quality ice related image if it's the mock storage URL
            finalUrl = 'https://images.unsplash.com/photo-1551717727-463e260907a7?q=80&w=1200&auto=format&fit=crop';
        } else if (!photoUrl.startsWith('http') && !photoUrl.startsWith('data:')) {
            finalUrl = `https://${photoUrl}`;
        }

        console.log(`\ud83d\udd17 Final URL: ${finalUrl}`);
        img.src = finalUrl;
        modal.classList.add('active');

        // Safety timeout: if image hasn't loaded in 5 seconds, hide loading text anyway
        setTimeout(() => {
            if (loadingText && loadingText.style.display !== 'none') {
                console.log('\u23f3 Photo loading timed out, forcing UI update.');
                loadingText.innerText = 'Storage Link Secured (Evidence Ready)';
                loadingText.style.animation = 'none';
            }
        }, 5000);
    },

    closePhotoModal() {
        const modal = document.getElementById('modal-photo-preview');
        if (modal) modal.classList.remove('active');
    },

    animateCards() {
        const cards = document.querySelectorAll('.cc-card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
    },

    switchView(viewId) {
        localStorage.setItem('admin_last_tab', viewId);
        
        const views = {
            ops: document.getElementById('ops-view'),
            customers: document.getElementById('customer-view'),
            team: document.getElementById('team-view'),
            assets: document.getElementById('assets-view'),
            consumables: document.getElementById('consumables-view'),
            finance: document.getElementById('finance-view'),
            cashflow: document.getElementById('cashflow-view'),
            orders: document.getElementById('orders-view'),
            matrix: document.getElementById('matrix-view')
        };

        Object.keys(views).forEach(key => {
            if (views[key]) {
                if (key === viewId) {
                    views[key].style.display = views[key].classList.contains('cc-flex') ? 'flex' : 'grid';
                } else {
                    views[key].style.display = 'none';
                }
            }
        });

        // Update active tab styling
        document.querySelectorAll('.cc-tab').forEach(tab => {
            const onclick = tab.getAttribute('onclick');
            if (onclick && onclick.includes(`'${viewId}'`)) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Persist Tab
        localStorage.setItem('iceqube_admin_tab', viewId);
        
        if (viewId === 'assets') {
            this.updateMaintenanceUI();
            this.updateAssetsUI();
            this.updateUtilitiesUI();
            this.updateRentalUI();
        }
        if (viewId === 'consumables') {
            this.updateConsumablesUI();
            this.updateFiltrationUI();
        }
        if (viewId === 'finance') this.loadPnL('mtd');
        if (viewId === 'matrix') this.updatePricingUI();
        
        this.animateCards();
    },

    toggleReceipt(show, orderId = null) {
        const overlay = document.getElementById('receipt-overlay');
        const panel = document.getElementById('receipt-panel');
        if (!overlay || !panel) return;

        if (show && orderId) {
            this.populateReceipt(orderId);
        }

        if (show) {
            overlay.classList.add('active');
            panel.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            overlay.classList.remove('active');
            panel.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    },

    populateReceipt(orderId) {
        const clean = str => str ? String(str).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';
        const targetClean = clean(orderId);
        
        // Search in all possible sources
        const localOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        let order = (this.allOrders || []).find(o => clean(o.order_id) === targetClean || clean(o.id) === targetClean) || 
                    localOrders.find(o => clean(o.order_id) === targetClean || clean(o.id) === targetClean);

        // If still not found, check customer data nested orders
        if (!order && this.customerData) {
            for (const customer of this.customerData) {
                const found = customer.orders.find(o => clean(o.order_id) === targetClean || clean(o.id) === targetClean);
                if (found) {
                    order = found;
                    break;
                }
            }
        }

        if (!order) {
            console.error('[ADMIN] Order not found for receipt:', orderId);
            return;
        }

        try {
            console.log('[ADMIN] Populating receipt for:', order.order_id, order);

            // Basic Info
            const orderIdEl = document.getElementById('receipt-order-id');
            const dateEl = document.getElementById('receipt-date');
            const custNameEl = document.getElementById('receipt-customer-name');
            const custAddrEl = document.getElementById('receipt-customer-address');
            const itemsList = document.getElementById('receipt-items-list');
            const subtotalEl = document.getElementById('receipt-subtotal');
            const discountRow = document.getElementById('receipt-discount-row');
            const discountAmtEl = document.getElementById('receipt-discount-amount');
            const deliveryEl = document.getElementById('receipt-delivery');
            const totalEl = document.getElementById('receipt-total');
            const paymentMethodEl = document.getElementById('receipt-payment-method');

            if (orderIdEl) orderIdEl.innerText = order.order_id || `#${order.id}` || 'N/A';
            if (dateEl) dateEl.innerText = order.created_at ? new Date(order.created_at).toLocaleDateString('en-PH', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            }) : 'N/A';
            // Customer
            const clientLabel = document.querySelector('#receipt-panel .receipt-customer .section-label');
            const eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '[]');
            const cleanCustName = (order.customer_name || '').trim();
            const isElite = Array.isArray(eliteList) && (eliteList.some(name => (name || '').trim().toLowerCase() === cleanCustName.toLowerCase()) || order.account_type === 'Elite');
            
            if (clientLabel) clientLabel.innerText = isElite ? 'ELITE CLIENT DETAILS' : 'CLIENT DETAILS';
            if (custNameEl) custNameEl.innerText = order.customer_name || 'Customer';
            if (custAddrEl) {
                const addrText = order.delivery_address || order.address || 'No address provided';
                custAddrEl.innerHTML = (order.delivery_lat && order.delivery_lng) 
                    ? `<a href="https://www.google.com/maps/dir/?api=1&origin=8.5020476,124.660855&destination=${order.delivery_lat},${order.delivery_lng}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px;">${addrText}</a>` 
                    : addrText;
            }

            // Items - Use robust parsing
            const parsedItems = this.parseItems(order.items);
            const fd = parsedItems.fullDice || {};
            const hd = parsedItems.halfDice || {};
            
            // Map structured items using Snapshot (if available) or Global Matrix
            const itemEntries = [];
            const matrix = parsedItems._matrix || this.pricingMatrix;
            
            if (matrix && matrix.products) {
                const productList = Array.isArray(matrix.products) ? matrix.products : Object.values(matrix.products);
                
                productList.forEach(p => {
                    const fQty = parseFloat(fd[p.id]) || 0;
                    const hQty = parseFloat(hd[p.id]) || 0;
                    
                    // Determine which price was used (Bulk or Standard)
                    const totalQtyForThisProduct = fQty + hQty;
                    const usedPrice = (totalQtyForThisProduct >= p.threshold) ? p.bulk : p.standard;
                    
                    if (fQty > 0) {
                        itemEntries.push({ 
                            name: `${p.name.replace('(Full/Half)', '').trim()} (Full Dice)`, 
                            qty: fQty, 
                            price: usedPrice 
                        });
                    }
                    if (hQty > 0) {
                        itemEntries.push({ 
                            name: `${p.name.replace('(Full/Half)', '').trim()} (Half-Dice)`, 
                            qty: hQty, 
                            price: usedPrice 
                        });
                    }
                });
            }
            
            if (parsedItems.raw && itemEntries.length === 0) {
                itemEntries.push({ name: parsedItems.raw, qty: 1, price: parseFloat(order.subtotal || order.total_price) || 0 });
            }

            // Totals - Robust number parsing
            const parseMoney = val => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                return parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
            };

            const delivery = parseMoney(order.delivery_fee);
            const priority = parseMoney(order.priority_fee);
            const totalVal = parseMoney(order.total_price);
            let discount = parseMoney(order.discount_total);
            let subtotalVal = parseMoney(order.subtotal);

            // --- SMART DERIVATION FALLBACK ---
            if (discount === 0 && (this.customerData || localStorage.getItem('iceqube_customer_discounts'))) {
                const discounts = JSON.parse(localStorage.getItem('iceqube_customer_discounts') || '{}');
                const custName = order.customer_name || '';
                const expectedSubtotal = itemEntries.reduce((sum, item) => sum + (item.qty * item.price), 0);
                const actualPaidSubtotal = Math.max(0, totalVal - delivery - priority);

                if (expectedSubtotal > actualPaidSubtotal && actualPaidSubtotal > 0) {
                    discount = expectedSubtotal - actualPaidSubtotal;
                    subtotalVal = expectedSubtotal;
                }
            }

            if (subtotalVal === 0) {
                subtotalVal = Math.max(0, totalVal - delivery - priority + discount);
            }

            // Render Rows - Columnar Layout (Detailed Breakdown)
            let itemsHtml = `
                <div class="receipt-item-header" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; font-size: 0.6rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;">
                    <div>Item Description</div>
                    <div style="text-align: center;">Unit Cost</div>
                    <div style="text-align: center;">Quantity</div>
                    <div style="text-align: right;">Total</div>
                </div>
            `;

             itemEntries.forEach(item => {
                const qty = parseInt(item.qty) || 0;
                const unitPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
                let lineTotal = qty * unitPrice;
                if (itemEntries.length === 1) lineTotal = subtotalVal;

                const nameParts = (item.name || '').split(' (');
                const displayName = nameParts[0] || 'Item';
                const subLabel = nameParts[1] ? `(${nameParts[1]}` : '';

                itemsHtml += `
                    <div class="receipt-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 8px; margin-bottom: 12px; align-items: center; font-family: 'Outfit', sans-serif;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; line-height: 1.2;">
                            ${displayName}<br>
                            ${subLabel ? `<span style="font-size: 0.75rem; color: #64748b; font-weight: 500;">${subLabel}</span>` : ''}
                        </div>
                        <div style="text-align: center; font-size: 0.8rem; color: #64748b; font-weight: 500;">₱${unitPrice.toFixed(0)}</div>
                        <div style="text-align: center; font-size: 0.85rem; font-weight: 700; color: #0f172a;">${qty}</div>
                        <div style="text-align: right; font-weight: 800; font-size: 0.9rem; color: #0f172a;">₱${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </div>
                `;
            });
            
            if (itemEntries.length === 0 && order.items) {
                itemsHtml = `<div style="text-align: center; color: #64748b; font-size: 0.85rem;">${this.formatOrderItems(order)}</div>`;
            }

            if (itemsList) itemsList.innerHTML = itemsHtml || '<p style="text-align: center; color: #94a3b8; font-size: 0.8rem;">No items found</p>';
            if (subtotalEl) subtotalEl.innerText = `₱${subtotalVal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            
            if (discountRow) {
                if (discount > 0) {
                    discountRow.style.display = 'flex';
                    if (discountAmtEl) discountAmtEl.innerText = `-₱${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                } else {
                    discountRow.style.display = 'none';
                }
            }

            if (deliveryEl) deliveryEl.innerText = `₱${delivery.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            
            const priorityRow = document.getElementById('receipt-priority-fee-row');
            const priorityEl = document.getElementById('receipt-priority-fee');
            if (priorityRow && priorityEl) {
                if (priority > 0) {
                    priorityRow.style.display = 'flex';
                    priorityEl.innerText = `₱${priority.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                } else {
                    priorityRow.style.display = 'none';
                }
            }

            if (totalEl) totalEl.innerText = `₱${totalVal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            
            // Payment Tag Logic
            const methodEl = document.getElementById('receipt-payment-method');
            const iconEl = document.querySelector('.payment-tag .tag-icon');
            let method = order.payment_method || 'Cash on Delivery';
            let icon = '💵';
            
            if (method.toLowerCase().includes('purchase order') || method.toLowerCase().includes('po')) {
                method = 'Purchase Order';
                icon = '💳';
            } else if (method.toLowerCase().includes('gcash') || method.toLowerCase().includes('online')) {
                icon = '📱';
            }
            
            if (methodEl) methodEl.innerText = method;
            if (iconEl) iconEl.innerText = icon;
            
            const screenshotContainer = document.getElementById('receipt-payment-screenshot');
            const screenshotImg = document.getElementById('receipt-payment-img');
            
            if (screenshotContainer && screenshotImg) {
                const methodLower = method.toLowerCase();
                if (methodLower.includes('gcash') || methodLower.includes('online') || methodLower.includes('bank') || methodLower.includes('po') || methodLower.includes('purchase order') || methodLower.includes('wallet') || methodLower.includes('topup')) {
                    screenshotContainer.style.display = 'block';
                    
                    let imgSrc = order.payment_screenshot;
                    // Fallback for previous orders that didn't save the base64 string
                    if (!imgSrc && order.order_id && order.order_id.includes('85251')) {
                        imgSrc = './assets/mock_gcash_receipt.png';
                    }
                    
                    // Use actual screenshot if provided, otherwise a placeholder
                    screenshotImg.src = imgSrc || 'https://via.placeholder.com/400x600.png?text=Payment+Screenshot+Submitted';
                } else {
                    screenshotContainer.style.display = 'none';
                    screenshotImg.src = '';
                }
            }
            
        } catch (err) {
            console.error('[ADMIN] Error populating receipt:', err);
            // Fallback for totals if items loop failed
            document.getElementById('receipt-total').innerText = `₱${(parseFloat(order.total_price) || 0).toLocaleString()}`;
        }
    },

    printReceipt() {
        const receiptContent = document.querySelector('.receipt-paper').innerHTML;
        const printWindow = window.open('', '_blank', 'width=800,height=900');
        printWindow.document.write(`
            <html>
                <head>
                    <title>IceQube Receipt</title>
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; background: white; color: #0f172a; }
                        .receipt-logo { height: 40px; margin-bottom: 10px; }
                        .receipt-title h1 { margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.5rem; }
                        .receipt-title p { margin: 0; color: #0284c7; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
                        .receipt-header { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
                        .receipt-meta { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 0.75rem; color: #64748b; }
                        .meta-item strong { display: block; color: #0f172a; font-size: 0.9rem; margin-top: 4px; }
                        .section-label { font-size: 0.65rem; color: #94a3b8; font-weight: 800; margin-bottom: 10px; text-transform: uppercase; }
                        .receipt-customer { margin-bottom: 30px; }
                        .receipt-customer strong { display: block; font-size: 1rem; }
                        .receipt-customer p { margin: 4px 0 0 0; color: #64748b; font-size: 0.85rem; }
                        .receipt-item-header { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; font-size: 0.65rem; font-weight: 800; color: #94a3b8; }
                        .receipt-item-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 8px; margin-bottom: 12px; align-items: center; }
                        .receipt-item-row strong { font-family: 'Outfit', sans-serif; font-size: 0.85rem; }
                        .unit-cost, .qty { text-align: center; font-size: 0.85rem; }
                        .total { text-align: right; font-weight: 800; }
                        .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #64748b; }
                        .grand-total { border-top: 2px solid #0f172a; padding-top: 12px; margin-top: 12px; font-size: 1.1rem; color: #0f172a; font-weight: 900; }
                        .payment-tag { background: #f1f5f9; padding: 6px 12px; border-radius: 6px; display: inline-block; margin-top: 20px; font-size: 0.8rem; font-weight: 700; }
                        .receipt-footer { margin-top: 50px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                        .barcode { font-family: monospace; opacity: 0.3; margin-top: 15px; }
                        
                        /* Navigation Button Styles */
                        .no-print {
                            position: fixed;
                            bottom: 30px;
                            left: 50%;
                            transform: translateX(-50%);
                            z-index: 10000;
                        }
                        .back-app-btn {
                            background: #0f172a;
                            color: white;
                            border: none;
                            padding: 14px 28px;
                            border-radius: 50px;
                            font-family: 'Outfit', sans-serif;
                            font-size: 1rem;
                            font-weight: 700;
                            cursor: pointer;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            transition: all 0.2s ease;
                            text-decoration: none;
                        }
                        .back-app-btn:hover {
                            transform: scale(1.05);
                            background: #1e293b;
                        }
                        .back-app-btn:active {
                            transform: scale(0.95);
                        }
                        @media print {
                            .no-print { display: none !important; }
                        }
                    </style>
                </head>
                <body>
                    <div class="no-print">
                        <button onclick="window.close()" class="back-app-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            Back to Dashboard
                        </button>
                    </div>
                    <div class="receipt-paper">
                        ${receiptContent}
                    </div>
                    <script>
                        window.onload = function() {
                            if (!window.matchMedia('print').matches) {
                                window.print();
                                window.onafterprint = function() { window.close(); };
                            }
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    },

    loadPnL(period) {
        console.log(`📊 Loading P&L for period: ${period}`);
        
        // Update active button state
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.id === `btn-${period}`) btn.classList.add('active');
        });

        // Calculate real depreciation from assets
        const monthlyDep = this.assets.reduce((sum, a) => sum + ((a.price || 0) / (a.usefulLifeMonths || 60)), 0);
        const ytdMonths = new Date().getMonth() + 1;
        const totalUtils = this.utilities.electricity + this.utilities.water + this.utilities.internet;
        const totalOpEx = totalUtils + (this.rental || 0);

        // Calculate Real Revenue and Expenses from all available sources
        const syncedOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const manualEntries = JSON.parse(localStorage.getItem('ice_cashflow') || '[]');
        
        // 1. Process Automatic Entries from Orders (Revenue)
        const autoEntries = syncedOrders.map(o => {
            let amount = parseFloat(o.total_price) || 0;
            return {
                timestamp: o.created_at,
                category: 'Sales',
                type: 'IN',
                amount: amount
            };
        });

        const allEntries = [...autoEntries, ...manualEntries];
        
        // 2. Filter by period
        const now = new Date();
        const periodEntries = allEntries.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            if (period === 'mtd') {
                return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
            } else if (period === 'last_month') {
                const lastMonth = new Date();
                lastMonth.setMonth(now.getMonth() - 1);
                return entryDate.getMonth() === lastMonth.getMonth() && entryDate.getFullYear() === lastMonth.getFullYear();
            } else if (period === 'ytd') {
                return entryDate.getFullYear() === now.getFullYear();
            }
            return true;
        });

        // 3. Aggregate
        const realRevenue = periodEntries.filter(e => e.type === 'IN' && e.category === 'Sales').reduce((sum, e) => sum + e.amount, 0);
        const realOpEx = periodEntries.filter(e => e.type === 'OUT' && e.category !== 'COGS').reduce((sum, e) => sum + e.amount, 0);
        const realCOGS = periodEntries.filter(e => e.type === 'OUT' && e.category === 'COGS').reduce((sum, e) => sum + e.amount, 0);
        const realRiderPayouts = periodEntries.filter(e => e.type === 'OUT' && e.category === 'Rider Payout').reduce((sum, e) => sum + e.amount, 0);

        const isPurged = localStorage.getItem('ice_system_purged') === 'true';
        const p = {
            revenue: realRevenue || ((syncedOrders.length === 0 && !isPurged) ? 124500 : 0), 
            cogs: realCOGS || ((syncedOrders.length === 0 && !isPurged) ? 18500 : 0),
            opex: realOpEx || ((syncedOrders.length === 0 && !isPurged) ? 45200 : 0),
            depreciation: monthlyDep * (period === 'ytd' ? ytdMonths : 1),
            riderPayouts: realRiderPayouts || ((syncedOrders.length === 0 && !isPurged) ? 32000 : 0),
            utilities: totalOpEx * (period === 'ytd' ? ytdMonths : 1)
        };
        
        // Calculations
        const grossProfit = p.revenue - p.cogs;
        const ebitda = grossProfit - p.opex;
        const netProfit = ebitda - p.depreciation;
        const margin = ((netProfit / p.revenue) * 100).toFixed(1);

        // Update UI
        const heroProfit = document.getElementById('hero-net-profit');
        if (heroProfit) heroProfit.innerText = `₱${netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
        const marginEl = document.getElementById('operational-margin');
        if (marginEl) marginEl.innerText = `Margin: ${margin}%`;
        
        const updateText = (id, val, isNeg = false) => {
            const el = document.getElementById(id);
            if (el) el.innerText = (isNeg ? '-₱' : '₱') + val.toLocaleString(undefined, {minimumFractionDigits: 2});
        };

        updateText('pnl-revenue', p.revenue);
        updateText('pnl-cogs', p.cogs, true);
        updateText('pnl-gross-profit', grossProfit);
        updateText('pnl-opex', p.opex, true);
        updateText('pnl-ebitda', ebitda);
        updateText('pnl-depreciation', p.depreciation, true);
        updateText('pnl-final-net', netProfit);

        // Expense Distribution
        updateText('exp-rider', p.riderPayouts);
        updateText('exp-utilities', p.utilities);
        updateText('exp-cogs', p.cogs);
        updateText('exp-depreciation', p.depreciation);

        // Progress Bars
        const totalExp = p.riderPayouts + p.utilities + p.cogs + p.depreciation;
        const updateBar = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${(val / totalExp * 100)}%`;
        };

        updateBar('bar-rider', p.riderPayouts);
        updateBar('bar-utilities', p.utilities);
        updateBar('bar-cogs', p.cogs);
        updateBar('bar-depreciation', p.depreciation);

        // --- NEW: Update Charts ---
        this.updateCharts(p, period, allEntries);
    },

    updateCharts(p, period, allEntries) {
        // 1. Expense Donut Chart
        const donutCtx = document.getElementById('expenseDonutChart')?.getContext('2d');
        if (donutCtx) {
            const data = {
                labels: ['Riders', 'Utilities', 'COGS', 'Depreciation'],
                datasets: [{
                    data: [p.riderPayouts, p.utilities, p.cogs, p.depreciation],
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#64748b'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            };

            if (this.charts.expenseDonut) {
                this.charts.expenseDonut.data = data;
                this.charts.expenseDonut.update();
            } else {
                if (typeof Chart !== 'undefined') {
                    this.charts.expenseDonut = new Chart(donutCtx, {
                        type: 'doughnut',
                        data: data,
                        options: {
                            cutout: '70%',
                            plugins: { legend: { display: false } },
                            responsive: true,
                            maintainAspectRatio: false
                        }
                    });
                }
            }
        }

        // 2. Profit Trend Chart
        const trendCtx = document.getElementById('profitTrendChart')?.getContext('2d');
        if (trendCtx) {
            const monthlyData = this.groupEntriesByMonth(allEntries);
            const labels = Object.values(monthlyData).map(m => m.label);
            const profits = Object.values(monthlyData).map(m => m.profit);
            const revenues = Object.values(monthlyData).map(m => m.revenue);

            const data = {
                labels: labels,
                datasets: [
                    {
                        label: 'Net Profit',
                        data: profits,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 0
                    },
                    {
                        label: 'Gross Revenue',
                        data: revenues,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderDash: [5, 5],
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            };

            if (this.charts.profitTrend) {
                this.charts.profitTrend.data = data;
                this.charts.profitTrend.update();
            } else {
                if (typeof Chart !== 'undefined') {
                    this.charts.profitTrend = new Chart(trendCtx, {
                        type: 'line',
                        data: data,
                        options: {
                            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                            scales: {
                                y: { display: false },
                                x: { 
                                    grid: { display: false },
                                    ticks: { color: '#64748b', font: { size: 10 } }
                                }
                            },
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: { intersect: false, mode: 'index' }
                        }
                    });
                }
            }
        }

        // 3. Waterfall Chart (Floating Bars)
        const waterfallCtx = document.getElementById('waterfallChart')?.getContext('2d');
        if (waterfallCtx) {
            const netProfit = p.revenue - p.cogs - p.opex - p.depreciation;
            const grossProfit = p.revenue - p.cogs;
            const ebitda = grossProfit - p.opex;

            const data = {
                labels: ['Revenue', 'COGS', 'OpEx', 'Dep.', 'Net'],
                datasets: [{
                    label: 'Amount',
                    data: [
                        [0, p.revenue],                         // Revenue
                        [grossProfit, p.revenue],              // COGS (Steps down)
                        [ebitda, grossProfit],                 // OpEx (Steps down)
                        [netProfit, ebitda],                   // Dep. (Steps down)
                        [0, netProfit]                         // Net Profit
                    ],
                    backgroundColor: (ctx) => {
                        const idx = ctx.dataIndex;
                        if (idx === 0) return '#22c55e'; // Revenue
                        if (idx === 4) return netProfit >= 0 ? '#22c55e' : '#ef4444'; // Net
                        return '#64748b'; // Intermediates
                    },
                    borderRadius: 4,
                    borderSkipped: false
                }]
            };

            if (this.charts.waterfall) {
                this.charts.waterfall.data = data;
                this.charts.waterfall.update();
            } else {
                if (typeof Chart !== 'undefined') {
                    this.charts.waterfall = new Chart(waterfallCtx, {
                        type: 'bar',
                        data: data,
                        options: {
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { 
                                    grid: { color: 'rgba(255,255,255,0.05)' },
                                    ticks: { color: '#64748b', font: { size: 10 } }
                                },
                                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }
                            },
                            responsive: true,
                            maintainAspectRatio: false
                        }
                    });
                }
            }
        }
    },

    groupEntriesByMonth(entries) {
        const months = {};
        const now = new Date();
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = { revenue: 0, expenses: 0, profit: 0, label: d.toLocaleString('default', { month: 'short' }) };
        }

        entries.forEach(e => {
            const d = new Date(e.timestamp);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (months[key]) {
                if (e.type === 'IN' && e.category === 'Sales') months[key].revenue += e.amount;
                else if (e.type === 'OUT') months[key].expenses += e.amount;
            }
        });

        Object.keys(months).forEach(k => {
            months[k].profit = months[k].revenue - months[k].expenses;
        });

        return months;
    },


    unlockVault() {
        console.log('🔐 Authenticating Vault Access...');
        const vault = document.getElementById('salary-vault');
        const overlay = document.getElementById('vault-lock');
        
        // In production, this would trigger a prompt for a secondary PIN or biometric
        const secondaryPin = prompt("Enter secondary Owner PIN to view Payroll:");
        
        if (secondaryPin === "8888") { // Mock secondary pin
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                vault.classList.remove('vault-locked');
                console.log('🔓 Vault Unlocked. Payroll data visible.');
            }, 500);
        } else {
            alert("Unauthorized. Access Denied.");
        }
    },

    showRiderQR(name, phone) {
        document.getElementById('modal-rider-name').innerText = name;
        document.getElementById('modal-rider-phone').innerText = phone;
        document.getElementById('payout-modal').style.display = 'flex';
        console.log(`🏦 Preparing Payout for ${name}...`);
    },

    showRiderAppQR() {
        const modal = document.getElementById('rider-app-modal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('📲 Showing Rider App Access QR Code');
        } else {
            console.error('❌ Rider App Modal not found!');
        }
    },

    updateCustomerDirectory(orders) {
        const listContainer = document.getElementById('customer-directory-list');
        if (!listContainer) return;

        const eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '[]');
        const profiles = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');

        const customers = {};
        orders.forEach(order => {
            if (!order.customer_name) return;
            const name = order.customer_name.trim();
            if (!customers[name]) {
                const cleanName = name.trim();
                const profile = profiles[cleanName] || profiles[name] || {};
                customers[name] = {
                    name: name,
                    address: profile.address || order.delivery_address || 'No Address Provided',
                    phone: profile.contactNumber || order.contact_number || order.customer_phone || 'No Phone provided',
                    contactPerson: profile.contactPerson || order.receiver_name || name,
                    totalRevenue: 0,
                    orders: [],
                    firstOrderDate: order.created_at,
                    lastOrderDate: order.created_at,
                    isElite: eliteList.some(elName => (elName || '').trim().toLowerCase() === name.toLowerCase())
                };
            }
            customers[name].totalRevenue += parseFloat(order.total_price) || 0;
            customers[name].orders.push(order);
            
            if (new Date(order.created_at) < new Date(customers[name].firstOrderDate)) {
                customers[name].firstOrderDate = order.created_at;
            }
            if (new Date(order.created_at) > new Date(customers[name].lastOrderDate)) {
                customers[name].lastOrderDate = order.created_at;
            }
        });

        const customerArray = Object.values(customers).sort((a, b) => b.totalRevenue - a.totalRevenue);
        this.customerData = customerArray;

        if (customerArray.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #64748b; padding: 40px; font-size: 0.9rem;">No customers recorded yet.</div>';
            return;
        }

        this.renderCustomerList(customerArray);
    },

    renderCustomerList(customers) {
        const listContainer = document.getElementById('customer-directory-list');
        if (!listContainer) return;

        let html = '';
        customers.forEach(customer => {
            html += `
                <div class="customer-row" style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="openCustomerDrawer('${customer.name.replace(/'/g, "\\'")}')">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; color: white;">${customer.name}</span>
                        <span style="font-size: 0.75rem; color: #94a3b8;">${customer.address}</span>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column;">
                        <span style="color: #22c55e; font-weight: bold;">₱${customer.totalRevenue.toLocaleString()}</span>
                        <span style="font-size: 0.7rem; color: #64748b;">${customer.orders.length} orders</span>
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    },

    filterCustomerDirectory() {
        const query = document.getElementById('customer-search-input')?.value.toLowerCase() || '';
        if (!this.customerData) return;
        
        const filtered = this.customerData.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.address.toLowerCase().includes(query) ||
            c.phone.toLowerCase().includes(query)
        );
        this.renderCustomerList(filtered);
    },

    updateCashflowView(orders) {
        const tbody = document.getElementById('cashflow-body');
        const listBody = document.getElementById('cashflow-list');
        if (!tbody && !listBody) return;

        // 1. Process Automatic Entries from Orders
        const autoEntries = orders.map(o => {
            let amount = parseFloat(o.total_price) || 0;
            return {
                timestamp: o.created_at,
                category: 'Sales',
                description: `Order ${o.order_id} - ${o.customer_name}`,
                type: 'IN',
                amount: amount,
                source: 'AUTO'
            };
        });

        // 2. Combine with Manual Entries
        const allEntries = [...autoEntries, ...this.manualEntries];
        
        // 3. Sort by Time (Descending)
        allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 4. Apply Time Bracket Filtering
        const now = new Date();
        const filteredEntries = allEntries.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            if (this.cashflowFilter === 'daily') {
                return entryDate.toDateString() === now.toDateString();
            } else if (this.cashflowFilter === 'monthly') {
                return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
            } else if (this.cashflowFilter === 'ytd') {
                return entryDate.getFullYear() === now.getFullYear();
            }
            return true;
        });

        // 5. Calculate Totals
        let totalIn = 0;
        let totalOut = 0;
        filteredEntries.forEach(entry => {
            const amount = entry.amount || 0;
            if (entry.type === 'IN') totalIn += amount;
            else totalOut += amount;
        });
        
        // 6. Render Rows (Desktop)
        if (tbody) {
            tbody.innerHTML = filteredEntries.map(entry => {
                const amount = entry.amount || 0;
                const timeStr = new Date(entry.timestamp).toLocaleString([], { 
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                });

                return `
                    <tr>
                        <td>${timeStr}</td>
                        <td>${entry.category}</td>
                        <td>${entry.description}</td>
                        <td><span class="type-badge ${entry.type === 'IN' ? 'type-in' : 'type-out'}">${entry.type}</span></td>
                        <td style="text-align: right; font-family: 'Inter', sans-serif; font-weight: 700;">₱${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td style="text-align: center;">
                            <span class="source-${entry.source.toLowerCase()}">${entry.source}</span>
                        </td>
                        <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                            <button onclick="admin.toggleRealStatus('cashflow', '${entry.timestamp}')" 
                                    style="background: ${entry.is_real !== false ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                           border: 1px solid ${entry.is_real !== false ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                           color: ${entry.is_real !== false ? '#22c55e' : '#64748b'}; 
                                           padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                                ${entry.is_real !== false ? '🛡️ REAL' : '🧪 TEST'}
                            </button>
                            ${entry.source === 'MANUAL' ? `<button onclick="admin.deleteManualEntry('${entry.timestamp}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;">✕</button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');

            if (filteredEntries.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">No entries found for this ${this.cashflowFilter} period.</td></tr>`;
            }
        }

        // 6b. Render Cards (Mobile)
        if (listBody) {
            listBody.innerHTML = filteredEntries.map(entry => {
                const amount = entry.amount || 0;
                const isOut = entry.type === 'OUT';
                const timeStr = new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const descHtml = entry.description ? `
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px; padding-left: 12px; word-break: break-word;">
                        ${entry.description}
                    </div>
                ` : '';

                return `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; justify-content: center;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1;">
                                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${isOut ? '#ef4444' : '#22c55e'}; flex-shrink: 0;"></span>
                                <div style="display: flex; flex-direction: column; overflow: hidden;">
                                    <span style="font-weight: 700; font-size: 0.8rem; color: #f1f5f9; line-height: 1.2;">${entry.category}</span>
                                    <span style="font-size: 0.65rem; color: #64748b; line-height: 1.2;">${timeStr} &bull; ${entry.source}</span>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <span style="font-family: 'Inter', sans-serif; font-weight: 700; font-size: 0.85rem; color: ${isOut ? '#ef4444' : '#22c55e'};">
                                    ${isOut ? '-' : '+'}₱${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </span>
                                ${entry.source === 'MANUAL' ? `
                                    <button onclick="admin.deleteManualEntry('${entry.timestamp}')" 
                                            style="background: rgba(239,68,68,0.15); border: none; color: #ef4444; border-radius: 4px; cursor: pointer; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800;" 
                                            title="Delete">✕</button>
                                ` : ''}
                            </div>
                        </div>
                        ${descHtml}
                    </div>
                `;
            }).join('');

            if (filteredEntries.length === 0) {
                listBody.innerHTML = `<div style="text-align: center; padding: 24px; color: #64748b; font-size: 0.8rem;">No entries found.</div>`;
            }
        }

        // 7. Update Summary Bar
        document.getElementById('cashflow-in').innerText = `₱${totalIn.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('cashflow-out').innerText = `₱${totalOut.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        const net = totalIn - totalOut;
        const netEl = document.getElementById('cashflow-net');
        netEl.innerText = `₱${net.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        netEl.style.color = net >= 0 ? '#22c55e' : '#ef4444';

        // Update Summary Label
        const labelEl = document.getElementById('cashflow-net-label');
        if (labelEl) {
            const isMobile = !!listBody;
            const labels = isMobile 
                ? { daily: 'Net (Today)', monthly: 'Net (Month)', ytd: 'Net (YTD)' }
                : { daily: 'Net Cashflow (Today)', monthly: 'Net Cashflow (This Month)', ytd: 'Net Cashflow (Year to Date)' };
            labelEl.innerText = labels[this.cashflowFilter];
        }
    },

    setCashflowFilter(filter) {
        this.cashflowFilter = filter;
        
        // Update UI buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.id === `filter-${filter}`) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Re-render
        this.fetchRealStats();
    },

    addManualEntry() {
        const category = document.getElementById('manual-category').value;
        const description = document.getElementById('manual-desc').value;
        const type = document.getElementById('manual-type').value;
        const amount = parseFloat(document.getElementById('manual-amount').value);

        if (!description || isNaN(amount)) {
            alert('Please enter a description and amount.');
            return;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            category,
            description,
            type,
            amount,
            source: 'MANUAL'
        };

        this.manualEntries.push(entry);
        this.saveManualEntries();
        
        // Clear inputs
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-amount').value = '';
        
        // Close modal if mobile
        this.closeCashflowModal();
        
        // Refresh view (re-fetch orders or just use current ones if possible)
        this.fetchRealStats(); 
    },

    openCashflowModal() {
        const modal = document.getElementById('cashflow-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.updateManualType();
        }
    },

    closeCashflowModal() {
        const modal = document.getElementById('cashflow-modal');
        if (modal) modal.style.display = 'none';
    },

    updateManualType() {
        const category = document.getElementById('manual-category')?.value;
        const typeInput = document.getElementById('manual-type');
        const badge = document.getElementById('manual-type-badge');
        if (!category || !typeInput || !badge) return;

        // Sales is IN. All other manual categories are OUT (Expense)
        const type = (category === 'Sales') ? 'IN' : 'OUT';
        typeInput.value = type;

        if (type === 'IN') {
            badge.innerText = 'IN (Income)';
            badge.style.background = 'rgba(34,197,94,0.1)';
            badge.style.border = '1px solid rgba(34,197,94,0.3)';
            badge.style.color = '#22c55e';
        } else {
            badge.innerText = 'OUT (Expense)';
            badge.style.background = 'rgba(239,68,68,0.1)';
            badge.style.border = '1px solid rgba(239,68,68,0.3)';
            badge.style.color = '#ef4444';
        }
    },

    deleteManualEntry(timestamp) {
        if (!confirm('Are you sure you want to delete this entry?')) return;
        this.manualEntries = this.manualEntries.filter(e => e.timestamp !== timestamp);
        this.saveManualEntries();
        this.fetchRealStats();
    },

    saveManualEntries() {
        admin.saveState('ice_cashflow', this.manualEntries);
    },

    exportCashflow() {
        // Simple CSV Export
        const rows = [
            ['Date', 'Category', 'Description', 'Type', 'Amount', 'Source']
        ];
        
        // We'd need the combined entries here again or store them globally
        // For simplicity, let's just alert
        alert('Export feature coming soon! (CSV generation logic ready for implementation)');
    },

    updateOrderQueue(orders) {
        const pendingBody = document.getElementById('pending-dispatch-body');
        const ledgerBody = document.getElementById('order-ledger-body');
        const pendingBadge = document.getElementById('pending-count-badge');
        const ledgerBadge = document.getElementById('ledger-count-badge');
        
        if (!pendingBody || !ledgerBody) return;

        const eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '["Loft Living CDO", "ZZ LOFT"]');

        // Use provided orders (from cloud) or fallback to local only if orders is null/undefined
        let allOrders = Array.isArray(orders) ? [...orders] : JSON.parse(localStorage.getItem('ice_orders') || '[]');
        this.lastFetchedOrders = allOrders; // Store for manual lookups

        // SANITIZE: Remove any broken or malformed test data
        allOrders = allOrders.filter(o => o && o.order_id && o.created_at && !o.order_id.includes('undefined'));

        // Sort by time: Newest at the top
        allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const pendingOrders = allOrders.filter(o => o.delivery_status === 'Pending' || o.delivery_status === 'Awaiting Acceptance');
        const ledgerOrders = allOrders.filter(o => o.delivery_status !== 'Pending' && o.delivery_status !== 'Awaiting Acceptance');

        if (pendingBadge) pendingBadge.innerText = `${pendingOrders.length} Pending`;
        if (ledgerBadge) ledgerBadge.innerText = `${ledgerOrders.length} Orders`;

        const parseSchedule = (scheduleStr) => {
            if (!scheduleStr || scheduleStr === 'Immediate') {
                return '<span style="background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.7rem;">⚡ ASAP</span>';
            }
            
            let timePart = '';
            let datePart = '';
            
            const parts = scheduleStr.trim().split(/\s+/);
            if (parts.length >= 2) {
                const dateStr = parts[0];
                const timeStr = parts[1];
                
                const ymd = dateStr.split('-');
                if (ymd.length === 3) {
                    const year = parseInt(ymd[0]);
                    const month = parseInt(ymd[1]) - 1;
                    const day = parseInt(ymd[2]);
                    
                    const hm = timeStr.split(':');
                    const hour = hm[0] ? parseInt(hm[0]) : 0;
                    const minute = hm[1] ? parseInt(hm[1]) : 0;
                    
                    const tempDate = new Date(year, month, day, hour, minute);
                    if (!isNaN(tempDate.getTime())) {
                        timePart = tempDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
                        datePart = tempDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                }
            }
            
            if (!timePart || !datePart) {
                const fallbackDate = new Date(scheduleStr);
                if (!isNaN(fallbackDate.getTime())) {
                    timePart = fallbackDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
                    datePart = fallbackDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                } else {
                    datePart = parts[0] || '';
                    timePart = parts.slice(1).join(' ') || '';
                }
            }
            
            return `<div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="color: #f1f5f9; font-weight: 600; font-size: 0.75rem;">${timePart}</span>
                <span style="color: #f1f5f9; font-weight: 600; font-size: 0.75rem;">${datePart}</span>
            </div>`;
        };

        const ridersList = ['Unassigned', 'John', 'Mark', 'Dave', 'Rico'];

        // Render Pending Table
        pendingBody.innerHTML = pendingOrders.map(o => {
            const createdAt = new Date(o.created_at);
            const isToday = createdAt.toDateString() === new Date().toDateString();
            const timeStr = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateDisplay = isToday ? '' : `<div style="font-size: 0.6rem; opacity: 0.6; margin-top: 2px; font-weight: 600;">${createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}</div>`;
            const displayTime = `<div style="display: flex; flex-direction: column;"><div>${timeStr}</div>${dateDisplay}</div>`;
            const itemsStr = this.formatOrderItems(o);
            const isAwaiting = o.delivery_status === 'Awaiting Acceptance';
 
            const scheduleDisplay = parseSchedule(o.delivery_schedule);

            const cleanCustName = (o.customer_name || '').trim();
            const isEliteOrder = eliteList.some(name => (name || '').trim().toLowerCase() === cleanCustName.toLowerCase()) || o.account_type === 'Elite';
            return `
                <tr style="${isAwaiting ? 'opacity: 0.7; background: rgba(245, 158, 11, 0.05);' : ''}">
                    <td>${displayTime}</td>
                    <td style="font-family: 'Inter', sans-serif; font-weight: 700; color: var(--admin-accent); cursor: pointer;" onclick="admin.toggleReceipt(true, '${o.order_id}')">${o.order_id} 📄</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <b style="font-size: 1rem; cursor: pointer; color: white; text-decoration: underline; text-decoration-color: white; text-underline-offset: 4px;" onclick="openCustomerDrawer('${o.customer_name.replace(/'/g, "\\'")}')">${o.customer_name}</b>
                                ${isEliteOrder ? '<span style="background: #eab308; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">ELITE</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">
                        ${(o.delivery_lat && o.delivery_lng) ? `<a href="https://www.google.com/maps/dir/?api=1&origin=8.5020476,124.660855&destination=${o.delivery_lat},${o.delivery_lng}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px; display: block; margin-bottom: 4px;">${o.delivery_address || 'N/A'}</a>` : `<div style="margin-bottom: 4px;">${o.delivery_address || 'N/A'}</div>`}
                    </td>
                    <td style="text-align: center; vertical-align: middle;">
                        ${(o.delivery_notes && o.delivery_notes.trim() !== '' && o.delivery_notes.trim().toLowerCase() !== 'no special notes.') ? `<button onclick="alert('Note for Order ${o.order_id}:\\n\\n' + decodeURIComponent('${encodeURIComponent(o.delivery_notes)}'))" style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.3); border-radius: 6px; cursor: pointer; color: #0ea5e9; padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="View Note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>` : `<span style="color: #64748b; font-size: 0.8rem;">-</span>`}
                    </td>
                    <td style="font-size: 0.75rem; white-space: nowrap;">
                        ${scheduleDisplay}
                    </td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'Inter', sans-serif; font-weight: 700;">₱${(Math.max(0, (parseFloat(o.total_price) || 0) - (parseFloat(o.delivery_fee) || 0) - (parseFloat(o.priority_fee) || 0))).toLocaleString()}</td>
                    <td style="font-family: 'Inter', sans-serif;">₱${(parseFloat(o.delivery_fee) || 0).toLocaleString()}</td>
                    <td style="font-family: 'Inter', sans-serif; font-weight: 700; color: #94a3b8;">₱${(o.priority_fee || 0).toLocaleString()}</td>
                    <td>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <select class="status-select" onchange="admin.assignRider('${o.id || o.order_id}', this.value)" style="flex: 1; min-width: 80px;">
                                ${ridersList.map(r => `<option value="${r}" ${o.rider === r ? 'selected' : ''}>${r}</option>`).join('')}
                            </select>
                            <button class="btn-dispatch" onclick="admin.dispatchOrder('${o.id || o.order_id}', '${o.rider || 'Unassigned'}', '${o.order_id}')" style="flex-shrink: 0;">
                                ${isAwaiting ? 'Re-Dispatch' : 'Dispatch'}
                            </button>
                        </div>
                    </td>
                    <td style="text-align: right; display: flex; gap: 8px; align-items: center; justify-content: flex-end;">
                        <button onclick="admin.toggleRealStatus('order', '${o.id || o.order_id}')" 
                                style="background: ${o.is_real !== false ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                       border: 1px solid ${o.is_real !== false ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                       color: ${o.is_real !== false ? '#22c55e' : '#64748b'}; 
                                       padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                            ${o.is_real !== false ? '🛡️ REAL' : '🧪 TEST'}
                        </button>
                        <button onclick="admin.sendMessengerNotification('${o.order_id}')" 
                                title="Resend Messenger Receipt"
                                style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.3); color: #0ea5e9; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.2s ease;">
                            💬
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Render Ledger Table (Uneditable)
        ledgerBody.innerHTML = ledgerOrders.map(o => {
            const createdAt = new Date(o.created_at);
            const isToday = createdAt.toDateString() === new Date().toDateString();
            const timeStr = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateDisplay = isToday ? '' : `<div style="font-size: 0.6rem; opacity: 0.6; margin-top: 2px; font-weight: 600;">${createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}</div>`;
            const displayTime = `<div style="display: flex; flex-direction: column;"><div>${timeStr}</div>${dateDisplay}</div>`;
            const itemsStr = this.formatOrderItems(o);
            const addr = o.delivery_address && o.delivery_address !== 'N/A' ? o.delivery_address : 'Pickup / Store';

            const ledgerScheduleDisplay = parseSchedule(o.delivery_schedule);

            const cleanCustName = (o.customer_name || '').trim();
            const isEliteOrder = eliteList.some(name => (name || '').trim().toLowerCase() === cleanCustName.toLowerCase()) || o.account_type === 'Elite';
            return `
                <tr>
                    <td>${displayTime}</td>
                    <td style="font-family: 'Inter', sans-serif; font-weight: 700; color: var(--admin-accent); cursor: pointer;" onclick="admin.toggleReceipt(true, '${o.order_id}')">${o.order_id} 📄</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <b style="font-size: 1rem; cursor: pointer; color: white; text-decoration: underline; text-decoration-color: white; text-underline-offset: 4px;" onclick="openCustomerDrawer('${o.customer_name.replace(/'/g, "\\'")}')">${o.customer_name}</b>
                                ${isEliteOrder ? '<span style="background: #eab308; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">ELITE</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">
                        ${(o.delivery_lat && o.delivery_lng) ? `<a href="https://www.google.com/maps/dir/?api=1&origin=8.5020476,124.660855&destination=${o.delivery_lat},${o.delivery_lng}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px; display: block; margin-bottom: 4px;">${addr}</a>` : `<div style="margin-bottom: 4px;">${addr}</div>`}
                    </td>
                    <td style="text-align: center; vertical-align: middle;">
                        ${(o.delivery_notes && o.delivery_notes.trim() !== '' && o.delivery_notes.trim().toLowerCase() !== 'no special notes.') ? `<button onclick="alert('Note for Order ${o.order_id}:\\n\\n' + decodeURIComponent('${encodeURIComponent(o.delivery_notes)}'))" style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.3); border-radius: 6px; cursor: pointer; color: #0ea5e9; padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="View Note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>` : `<span style="color: #64748b; font-size: 0.8rem;">-</span>`}
                    </td>
                    <td style="font-size: 0.75rem; white-space: nowrap;">
                        ${ledgerScheduleDisplay}
                    </td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'Inter', sans-serif; font-weight: 700;">₱${(Math.max(0, (parseFloat(o.total_price) || 0) - (parseFloat(o.delivery_fee) || 0) - (parseFloat(o.priority_fee) || 0))).toLocaleString()}</td>
                    <td style="font-family: 'Inter', sans-serif; color: #94a3b8;">₱${(parseFloat(o.delivery_fee) || 0).toLocaleString()}</td>
                    <td style="font-family: 'Inter', sans-serif; color: #64748b;">₱${(parseFloat(o.priority_fee) || 0).toLocaleString()}</td>
                    <td style="text-align: center;">
                        <button onclick="admin.toggleRealStatus('order', '${o.id || o.order_id}')" 
                                style="background: ${o.is_real !== false ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                       border: 1px solid ${o.is_real !== false ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                       color: ${o.is_real !== false ? '#22c55e' : '#64748b'}; 
                                       padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                            ${o.is_real !== false ? '🛡️ REAL' : '🧪 TEST'}
                        </button>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="rider-avatar" style="width: 24px; height: 24px; font-size: 0.6rem;">${(o.rider || 'U')[0]}</div>
                            <span style="font-size: 0.8rem; color: #cbd5e1;">${o.rider || 'Unassigned'}</span>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge status-${(o.delivery_status || 'Pending').toLowerCase()}" style="font-size: 0.65rem;">${o.delivery_status || 'Pending'}</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async deleteOrder(id) {
        if (!confirm('Are you sure you want to PERMANENTLY delete this order? This will remove it from the cloud and all customer apps.')) return;
        
        console.log(`🗑️ Deleting Order ${id}...`);
        
        // 1. Remove from local storage
        const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const filtered = orders.filter(o => (o.id || o.order_id) !== id);
        localStorage.setItem('ice_orders', JSON.stringify(filtered));
        
        // 2. Remove from Cloud (Supabase)
        if (SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
            try {
                const encodedId = encodeURIComponent(id);
                const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?or=(id.eq.${encodedId},order_id.eq.${encodedId})`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_CONFIG.ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                    }
                });
                if (!response.ok) console.warn('Cloud delete failed or item not found in cloud.');
            } catch (err) {
                console.error('Cloud delete error:', err);
            }
        }
        
        // 3. Broadcast to Customer App
        if (window.IceQubeSync) {
            window.IceQubeSync.publishPurge(); // Re-use purge event to trigger refresh
        }
        
        // 4. Refresh UI
        this.fetchRealStats();
    },

    async updatePriorityFee(id, fee) {
        if (id.startsWith('mock')) {
            console.log(`Mock Heavy Load Fee updated for ${id}: ₱${fee}`);
            return;
        }
        
        try {
            await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ priority_fee: parseFloat(fee) })
            });
            console.log('✅ Heavy Load Fee Updated');
            this.fetchRealStats(); // Refresh UI
        } catch (err) {
            console.error('Update Failed:', err);
        }
    },


    parseItems(items) {
        if (!items) return { fullDice: {}, halfDice: {} };
        
        // Handle String inputs
        if (typeof items === 'string') {
            try {
                const parsed = JSON.parse(items);
                // If it's a valid structured object, return it
                if (parsed && (parsed.fullDice || parsed.halfDice)) return parsed;
                // If it's just a number string or other JSON, fall through
            } catch (e) {
                // Not JSON, continue
            }

            // Handle comma-separated strings or simple bag counts
            if (items.includes(',')) {
                return { fullDice: {}, halfDice: {}, raw: items };
            }
            if (!isNaN(items)) {
                return { fullDice: { '3kg': parseInt(items) }, halfDice: {} };
            }
            return { fullDice: {}, halfDice: {}, raw: items };
        }

        // Handle Number inputs
        if (typeof items === 'number') {
            return { fullDice: { '3kg': items }, halfDice: {} };
        }

        return items;
    },

    formatOrderItems(o) {
        if (!o.items) {
            console.log(`⚠️ Missing items for order ${o.order_id}`);
            return 'No items';
        }
        
        const items = this.parseItems(o.items);
        
        // Use the matrix snapshot from the order, or fallback to global
        const matrix = items._matrix || this.pricingMatrix;
        if (!matrix || !matrix.products) return '1 Bag';

        const fd = items.fullDice || {};
        const hd = items.halfDice || {};
        const parts = [];
        
        matrix.products.forEach(p => {
            const fQty = parseInt(fd[p.id]) || 0;
            const hQty = parseInt(hd[p.id]) || 0;
            
            // Clean up product name: "3kg Ice Cube (Full/Half)" -> "3kg"
            const shortName = p.name.replace('(Full/Half)', '').replace('Ice Cube', '').trim();
            
            if (fQty > 0) parts.push(`${fQty} bags - ${shortName} (Full Dice)`);
            if (hQty > 0) parts.push(`${hQty} bags - ${shortName} (Half-Dice)`);
        });
        
        // Handle raw fallback if still empty
        if (parts.length === 0 && items.raw) {
            return items.raw;
        }

        return parts.length > 0 ? parts.join('<br>') : '1 Bag';
    },

    updateDates() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
        
        const headerDate = document.getElementById('current-date');
        const ledgerDate = document.getElementById('ledger-date-badge');
        
        if (headerDate) headerDate.innerText = dateStr;
        if (ledgerDate) ledgerDate.innerText = `• ${dateStr}`;
    },

    async dispatchOrder(id, rider, orderId, silent = false) {
        // If rider is Unassigned, it becomes a Broadcast/Open Dispatch
        const isBroadcast = rider === 'Unassigned';

        // Get full order details from local state/storage for synchronization
        // Check memory cache first, then localStorage
        const clean = str => str ? String(str).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';
        const targetClean = clean(orderId) || clean(id);
        
        const fullOrder = (this.allOrders || []).find(o => clean(o.id) === targetClean || clean(o.order_id) === targetClean) || 
                          JSON.parse(localStorage.getItem('ice_orders') || '[]').find(o => clean(o.id) === targetClean || clean(o.order_id) === targetClean) || {};

        console.log(`📦 Preparing Dispatch Payload for ${orderId}:`, fullOrder);

        const dispatchData = {
            orderId: orderId,
            id: id,
            riderId: (rider === 'undefined' || !rider) ? 'Unassigned' : rider,
            dispatchedAt: new Date().toISOString(),
            status: 'Awaiting Acceptance',
            orderDetails: fullOrder
        };

        if (!fullOrder.customer_name) {
            console.warn(`⚠️ Warning: Dispatching ${orderId} without metadata!`);
            alert(`⚠️ Warning: No metadata found for Order ${orderId}. The Rider may see "External Order".`);
        } else {
            console.log(`✅ Dispatching ${orderId} with metadata for: ${fullOrder.customer_name}`);
        }

        // Local Sync (BroadcastChannel)
        if (window.IceQubeSync) {
            window.IceQubeSync.publishDispatch(dispatchData);
        }

        if (id.startsWith('mock')) {
            console.log(`Mock Dispatch for ${orderId} assigned to ${rider}`);
            alert(`Order ${orderId} dispatched to ${rider}!`);
            this.fetchRealStats();
            return;
        }

        console.log(`🚀 Dispatching Order ${orderId} to ${rider}...`);
        
        // 1. Simulate SMS Sending
        console.log(`📱 SMS SENT: "IceQube Order ${orderId} assigned to you. Please check your app to Accept/Decline."`);
        
        // 2. Update status to 'Awaiting Acceptance'
        if (id.startsWith('mock')) {
            alert(`Order ${orderId} sent to ${rider}'s dashboard!`);
            // For mock demo, we'll just update status locally if it were a real state
            return;
        }

        try {
            await this.updateOrderStatus(id, 'Awaiting Acceptance');
            const msg = isBroadcast ? `Order ${orderId} broadcasted to ALL riders!` : `Order ${orderId} dispatched! Notification sent to ${rider}.`;
            if (!silent) alert(msg);
        } catch (err) {
            console.error('Dispatch failed:', err);
        }
    },

    async assignRider(id, riderName) {
        console.log(`📡 Assigning Rider ${riderName} to Order ${id}...`);

        // 1. Update localStorage immediately for UI consistency
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const orderIdx = existingOrders.findIndex(o => o.id === id || o.order_id === id);
        if (orderIdx > -1) {
            existingOrders[orderIdx].rider = riderName;
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }

        // 2. Re-render UI so the Dispatch button gets the new rider value
        this.fetchRealStats();

        if (id.startsWith('mock')) return;

        // Demo Mode Check
        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            return;
        }
        
        try {
            await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ rider: riderName })
            });
            console.log('✅ Rider Assigned to Supabase');
        } catch (err) {
            console.error('Assignment Failed:', err);
        }
    },

    async updateOrderStatus(id, newStatus) {
        console.log(`📡 Updating Order ${id} to ${newStatus}...`);
        
        // Demo Mode: Skip network if Supabase not configured
        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            console.log("🛠️ Local Sync Only: Supabase not configured.");
            this.fetchRealStats();
            return;
        }

        try {
            const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ delivery_status: newStatus })
            });

            if (!response.ok) throw new Error('Status update failed');
            
            console.log('✅ Status Updated Successfully');
            // Re-fetch data to update all views
            this.fetchRealStats();
        } catch (err) {
            console.error('Update Failed:', err);
            alert('Failed to update order status. Please check connection.');
        }
    },

    toggleNotifs(event) {
        if (event) event.stopPropagation();
        const dropdown = document.getElementById('notif-dropdown');
        if (!dropdown) return;
        const isVisible = dropdown.style.display === 'flex';
        dropdown.style.display = isVisible ? 'none' : 'flex';
    },

    handleCategoryChange() {
        const category = document.getElementById('manual-category').value;
        const typeSelect = document.getElementById('manual-type');
        if (!typeSelect) return;

        // Sales is IN, everything else is traditionally OUT
        if (category === 'Sales') {
            typeSelect.value = 'IN';
        } else {
            typeSelect.value = 'OUT';
        }
    },

    updateAlertCenter(orders) {
        const notifList = document.getElementById('notif-list');
        const badge = document.getElementById('notif-badge');
        if (!notifList || !badge) return;

        const alerts = [];
        const activeDots = new Set();

        // 1. Check Ice Inventory (Ops Tab)
        const halfDiceStock = 120; 
        if (halfDiceStock < 200) {
            alerts.push({
                icon: '❄️',
                title: 'Critical Ice Stock',
                text: `Half-Dice is at ${halfDiceStock} bags. Re-run machines.`,
                tab: 'ops'
            });
            activeDots.add('dot-ops');
        }

        // 2. Check Filter Replacement (Consumables Tab)
        const filterLifeDays = 5;
        if (filterLifeDays <= 7) {
            alerts.push({
                icon: '💧',
                title: 'Filter Replacement',
                text: `Water Filter #1 expires in ${filterLifeDays} days.`,
                tab: 'consumables'
            });
            activeDots.add('dot-consumables');
        }

        // 3. Check Supply Levels (Consumables Tab)
        const bagStockPercent = 8; 
        if (bagStockPercent < 15) {
            alerts.push({
                icon: '🛍️',
                title: 'Packaging Low',
                text: `Plastic Bag stock is at ${bagStockPercent}%. Restock now.`,
                tab: 'consumables'
            });
            activeDots.add('dot-consumables');
        }

        // 4. Check Payment Verification Queue (Ops Tab)
        const pendingPayments = orders.filter(o => o.payment_status === 'Pending').length;
        if (pendingPayments > 0) {
            alerts.push({
                icon: '💳',
                title: 'Pending Payments',
                text: `${pendingPayments} transfers waiting for verification.`,
                tab: 'ops'
            });
            activeDots.add('dot-ops');
        }

        // Update Badge
        badge.innerText = alerts.length;
        badge.style.display = alerts.length > 0 ? 'flex' : 'none';

        // Update Tab Dots
        document.querySelectorAll('.tab-notif').forEach(dot => {
            dot.style.display = activeDots.has(dot.id) ? 'block' : 'none';
        });

        // Render List
        if (alerts.length > 0) {
            notifList.innerHTML = alerts.map(a => `
                <div class="notif-item" onclick="admin.switchView('${a.tab}'); admin.toggleNotifs();">
                    <span class="notif-icon">${a.icon}</span>
                    <div class="notif-text">
                        <b>${a.title}</b>
                        ${a.text}
                    </div>
                </div>
            `).join('');
        } else {
            notifList.innerHTML = '<div style="padding: 30px; text-align: center; color: #64748b; font-size: 0.8rem;">No active alerts. All systems nominal.</div>';
        }
    },

    showRestockModal(preselectedId) {
        if (preselectedId) {
            document.getElementById('restock-item').value = preselectedId;
            this.handleRestockItemChange();
        }
        document.getElementById('restock-modal').style.display = 'flex';
    },

    closeRestockModal() {
        document.getElementById('restock-modal').style.display = 'none';
    },

    submitRestock() {
        const itemVal = document.getElementById('restock-item').value;
        const qty = parseFloat(document.getElementById('restock-qty').value);
        const cost = parseFloat(document.getElementById('restock-cost').value);
        const note = document.getElementById('restock-note').value;
        const isAdjustment = document.getElementById('restock-adjustment').checked;

        if (isNaN(qty) || qty < 0) {
            alert('Please enter a valid quantity.');
            return;
        }

        let targetItem;
        let itemName;

        if (itemVal === 'CUSTOM') {
            const newName = document.getElementById('custom-item-name').value;
            const newMax = parseFloat(document.getElementById('custom-item-max').value) || 1000;
            const newUnit = document.getElementById('custom-item-unit').value;
            const newCat = document.getElementById('custom-item-cat').value;

            if (!newName) {
                alert('Please enter a name for the custom item.');
                return;
            }

            targetItem = {
                id: 'custom-' + Date.now(),
                name: newName,
                current: qty,
                max: newMax,
                unit: newUnit
            };
            this.consumables[newCat].push(targetItem);
            itemName = newName;
        } else {
            // Find existing item
            for (let cat in this.consumables) {
                targetItem = this.consumables[cat].find(i => i.id === itemVal);
                if (targetItem) break;
            }
            if (targetItem) {
                if (isAdjustment) {
                    targetItem.current = qty;
                } else {
                    targetItem.current += qty;
                }
                itemName = targetItem.name;
            }
        }

        // 2. Save Consumables
        admin.saveState('iceqube_consumables', this.consumables);

        // --- Trigger Messenger Broadcast ---
        try {
            const msg = `📦 CONSUMABLES UPDATE:\n\n${itemName} was ${isAdjustment ? 'adjusted to' : 'restocked with'} ${qty} ${targetItem && targetItem.unit ? targetItem.unit : 'units'}.`;
            admin.broadcastToAdmins(msg);
        } catch(e) {}

        // 3. Record Cashflow if cost provided
        if (!isNaN(cost) && cost > 0) {
            const entry = {
                timestamp: new Date().toISOString(),
                category: 'Packaging',
                description: `${isAdjustment ? 'Inventory Adjustment' : 'Restock'}: ${itemName}${note ? ' (' + note + ')' : ''}`,
                type: 'OUT',
                amount: cost,
                source: 'MANUAL'
            };
            this.manualEntries.push(entry);
            this.saveManualEntries();
        }

        // 4. Update UI
        this.updateConsumablesUI();
        this.fetchRealStats(); // This updates cashflow view
        
        // 5. Cleanup
        this.closeRestockModal();
        document.getElementById('restock-qty').value = '';
        document.getElementById('restock-cost').value = '';
        document.getElementById('restock-note').value = '';
        document.getElementById('custom-item-name').value = '';
        document.getElementById('custom-item-fields').style.display = 'none';
        document.getElementById('restock-adjustment').checked = false;
        this.handleAdjustmentToggle();
        
        alert(isAdjustment ? 'Inventory adjusted successfully!' : 'Restock logged successfully!');
    },

    deleteConsumable() {
        const itemVal = document.getElementById('restock-item').value;
        if (itemVal === 'CUSTOM') return;

        if (!confirm('Are you sure you want to permanently remove this item from inventory?')) return;

        for (let cat in this.consumables) {
            const index = this.consumables[cat].findIndex(i => i.id === itemVal);
            if (index !== -1) {
                this.consumables[cat].splice(index, 1);
                break;
            }
        }

        admin.saveState('iceqube_consumables', this.consumables);
        this.updateConsumablesUI();
        this.closeRestockModal();
        alert('Item removed successfully.');
    },

    updateFiltrationUI() {
        const list = document.getElementById('filtration-list');
        if (!list) return;

        if (!this.consumables.filtration) this.consumables.filtration = [];

        // Set list to flex for the connected look
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.justifyContent = 'center';
        list.style.alignItems = 'flex-start';
        list.style.gap = '0';
        list.style.padding = '20px';

        list.innerHTML = this.consumables.filtration.map((item, index) => {
            const purchaseDate = new Date(item.purchaseDate);
            const expiryDate = new Date(item.purchaseDate);
            expiryDate.setMonth(expiryDate.getMonth() + Number(item.lifespanMonths));
            
            const today = new Date();
            const diffTime = expiryDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const totalLifeDays = Number(item.lifespanMonths) * 30; 
            const percentRemaining = Math.max(0, Math.min(100, (diffDays / totalLifeDays) * 100));

            // Color logic: Vibrant Blue (#00d2ff) -> Dark/Black (#020617)
            let color = '#0ea5e9'; // Default Blue
            let glow = '#0ea5e980';
            if (diffDays < 7) {
                color = '#020617'; 
                glow = 'rgba(0,0,0,0)';
            } else if (diffDays < 21) {
                color = '#1e293b';
                glow = '#1e293b80';
            }

            const isLast = index === this.consumables.filtration.length - 1;

            return `
                <div style="display: flex; align-items: flex-start; margin-bottom: 30px;">
                    <!-- Filter Housing Stage (Another 5% Larger & Connected) -->
                    <div style="display: flex; flex-direction: column; align-items: center; width: 138px; position: relative;">
                        <!-- Stage Number -->
                        <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #94a3b8; font-size: 0.58rem; padding: 2px 8px; border-radius: 10px; font-weight: 800; border: 1px solid rgba(255,255,255,0.05); z-index: 10; white-space: nowrap;">
                            STAGE ${index + 1}
                        </div>

                        <!-- Cap/Head -->
                        <div style="width: 104px; height: 33px; background: linear-gradient(180deg, #334155 0%, #1e293b 100%); border-radius: 12px 12px 4px 4px; border: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 5; box-shadow: 0 4px 9px rgba(0,0,0,0.3);">
                            <!-- Inlet/Outlet Ports -->
                            <div style="position: absolute; top: 13px; left: -7px; width: 11px; height: 7px; background: #475569; border-radius: 2px;"></div>
                            <div style="position: absolute; top: 13px; right: -7px; width: 11px; height: 7px; background: #475569; border-radius: 2px;"></div>
                        </div>
                        
                        <!-- Tube Body -->
                        <div onclick="admin.showEditFilterModal('${item.id}')" style="width: 81px; height: 169px; background: rgba(15, 23, 42, 0.8); border: 2px solid rgba(255,255,255,0.1); border-radius: 0 0 40.5px 40.5px; overflow: hidden; position: relative; cursor: pointer; transition: all 0.3s ease; box-shadow: inset 0 0 22px rgba(0,0,0,0.8); margin-top: -2px;">
                            <!-- Fluid/Filter Core -->
                            <div style="position: absolute; bottom: 0; width: 100%; height: ${percentRemaining}%; background: ${color}; opacity: 0.85; transition: all 1s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 -5px 22px ${glow};">
                                <!-- Bubbles/Particles effect -->
                                <div style="position: absolute; top: 9px; left: 20%; width: 3.5px; height: 3.5px; background: rgba(255,255,255,0.2); border-radius: 50%;"></div>
                                <div style="position: absolute; top: 27px; right: 25%; width: 2.7px; height: 2.7px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                            </div>
                            
                            <!-- Internal Core Column -->
                            <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 21px; height: 90%; background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0) 100%); border-radius: 0 0 11px 11px;"></div>
                            
                            <!-- Reflection -->
                            <div style="position: absolute; top: 10%; left: 15%; width: 15%; height: 70%; background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%); border-radius: 19px;"></div>
                        </div>

                        <!-- Labels & Actions -->
                        <div style="margin-top: 16px; text-align: center; width: 132px;">
                            <div style="font-size: 0.74rem; font-weight: 800; color: #f8fafc; margin-bottom: 4px; font-family: 'Outfit'; line-height: 1.2;">${item.name}</div>
                            <div style="font-size: 0.62rem; font-weight: 700; color: ${diffDays < 7 ? '#ef4444' : (diffDays < 21 ? '#f59e0b' : '#3b82f6')};">
                                ${diffDays < 0 ? 'EXPIRED' : diffDays + ' Days Left'}
                            </div>
                            
                            <div style="display: flex; justify-content: center; gap: 7px; margin-top: 9px;">
                                <button onclick="admin.resetFilterLife('${item.id}')" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 3px 9px; border-radius: 5px; font-size: 0.5rem; font-weight: 800; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.color='white'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#94a3b8'; this.style.background='rgba(255,255,255,0.05)'">
                                    RESET
                                </button>
                                ${item.link && item.link !== '#' ? `
                                    <a href="${item.link}" target="_blank" style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.2); color: #0ea5e9; padding: 3px 7px; border-radius: 5px; text-decoration: none; display: flex; align-items: center;">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Connecting Pipe (Negative Margins for Tight Connected Look) -->
                    ${!isLast ? `
                        <div style="width: 55px; height: 8px; background: linear-gradient(180deg, #475569 0%, #1e293b 100%); margin-top: 12px; margin-left: -10px; margin-right: -10px; position: relative; z-index: 1; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(0,0,0,0.3);">
                            <!-- Pipe shadow/highlight -->
                            <div style="position: absolute; top: 1.8px; width: 100%; height: 1.8px; background: rgba(255,255,255,0.05);"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        this.checkFiltrationAlerts();
    },

    checkFiltrationAlerts() {
        if (!this.consumables.filtration) return;
        
        const criticalItems = this.consumables.filtration.filter(item => {
            const purchaseDate = new Date(item.purchaseDate);
            const expiryDate = new Date(purchaseDate.setMonth(purchaseDate.getMonth() + Number(item.lifespanMonths)));
            const today = new Date();
            const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            return diffDays < 7;
        });

        if (criticalItems.length > 0) {
            const dot = document.getElementById('dot-consumables');
            if (dot) {
                dot.style.display = 'block';
                dot.style.background = '#ef4444';
            }
            
            // Only show one system notification for all critical filters to avoid spam
            if (!this._filtrationNotified) {
                this.showNotification("Water Filtration Alert", `${criticalItems.length} filters require immediate attention.`);
                this._filtrationNotified = true;
            }
        }
    },

    showAddFilterModal() {
        document.getElementById('filter-edit-id').value = '';
        document.getElementById('filter-name').value = '';
        document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('filter-lifespan').value = '3';
        document.getElementById('filter-cost').value = '';
        document.getElementById('filter-brand').value = '';
        document.getElementById('filter-company').value = '';
        document.getElementById('filter-link').value = '';
        document.getElementById('modal-add-filter').classList.add('active');
    },

    showEditFilterModal(id) {
        const item = this.consumables.filtration.find(f => f.id === id);
        if (!item) return;

        document.getElementById('filter-edit-id').value = item.id;
        document.getElementById('filter-name').value = item.name;
        document.getElementById('filter-date').value = item.purchaseDate;
        document.getElementById('filter-lifespan').value = item.lifespanMonths;
        document.getElementById('filter-cost').value = item.cost;
        document.getElementById('filter-brand').value = item.brand;
        document.getElementById('filter-company').value = item.company;
        document.getElementById('filter-link').value = item.link;
        document.getElementById('modal-add-filter').classList.add('active');
    },

    closeFilterModal() {
        document.getElementById('modal-add-filter').classList.remove('active');
    },

    saveFilter() {
        const id = document.getElementById('filter-edit-id').value;
        const name = document.getElementById('filter-name').value;
        const date = document.getElementById('filter-date').value;
        const lifespan = document.getElementById('filter-lifespan').value;
        const cost = document.getElementById('filter-cost').value;
        const brand = document.getElementById('filter-brand').value;
        const company = document.getElementById('filter-company').value;
        const link = document.getElementById('filter-link').value;

        if (!name || !date || !lifespan) {
            alert('Please fill in Name, Date, and Lifespan.');
            return;
        }

        const newFilter = {
            id: id || 'f-' + Date.now(),
            name,
            purchaseDate: date,
            lifespanMonths: Number(lifespan),
            cost: Number(cost),
            brand,
            company,
            link
        };

        if (id) {
            const idx = this.consumables.filtration.findIndex(f => f.id === id);
            if (idx > -1) this.consumables.filtration[idx] = newFilter;
        } else {
            this.consumables.filtration.push(newFilter);
        }

        admin.saveState('iceqube_consumables', this.consumables);
        this.updateFiltrationUI();
        this.closeFilterModal();
    },

    resetFilterLife(id) {
        const idx = this.consumables.filtration.findIndex(f => f.id === id);
        if (idx > -1) {
            const item = this.consumables.filtration[idx];
            if (confirm(`Confirm replacement of ${item.name}? This will reset the lifespan countdown to today.`)) {
                item.purchaseDate = new Date().toISOString().split('T')[0];
                admin.saveState('iceqube_consumables', this.consumables);
                this.updateFiltrationUI();
            }
        }
    },

    updateConsumablesUI() {
        const packagingList = document.getElementById('packaging-list');
        const cleaningList = document.getElementById('cleaning-list');
        const dropdown = document.getElementById('restock-item');
        
        if (!packagingList || !cleaningList) return;

        // 1. Render Lists
        const renderItem = (item, isPackaging = false) => {
            const percent = Math.min((item.current / item.max) * 100, 100);
            const color = percent < 15 ? '#ef4444' : (percent < 40 ? '#f59e0b' : '#22c55e');
            const warnHtml = percent < 15 ? `<p style="font-size: 0.65rem; color: #ef4444; margin-top: 5px;">⚠️ Low</p>` : '';
            
            if (isPackaging) {
                // Style: "Half-Circle Folded Stack" - Contoured Organic Ties (Capped at 5 Levels)
                const bundlesCount = Math.ceil(item.current / 500);
                const maxBundlesPossible = Math.ceil(item.max / 500);
                let bundlesHtml = '';
                
                // Capped at 5 levels per user request
                const visualBundles = Math.min(bundlesCount, 5);
                const spacing = 18; 

                // Refined Gradients for White Plastic Texture
                const sideGradients = `
                    <defs>
                        <linearGradient id="sideL-${item.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#cbd5e1" />
                            <stop offset="100%" stop-color="#94a3b8" />
                        </linearGradient>
                        <linearGradient id="sideR-${item.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#94a3b8" />
                            <stop offset="100%" stop-color="#64748b" />
                        </linearGradient>
                    </defs>
                `;

                for (let i = 0; i < visualBundles; i++) {
                    const by = 80 - (i * spacing);
                    
                    bundlesHtml += `
                        <g transform="translate(0, ${by})" style="transition: all 0.5s ease ${i * 0.02}s;">
                            <!-- The Square Mass with Bold Half-Circle Folds -->
                            
                            <!-- Side Left (Bold Half-Circle Round) -->
                            <path d="M0 20 Q-12 28 0 36 L50 51 L50 35 Z" fill="url(#sideL-${item.id})" />
                            
                            <!-- Side Right (Bold Half-Circle Round) -->
                            <path d="M100 20 Q112 28 100 36 L50 51 L50 35 Z" fill="url(#sideR-${item.id})" />
                            
                            <!-- Top Surface (Sharp Square Corners) -->
                            <path d="M0 20 L50 35 L100 20 L50 5 Z" fill="#ffffff" />
                            <path d="M0 20 L50 35 L100 20 L50 5 Z" fill="rgba(255,255,255,0.4)" />
                            
                            <!-- Contoured Perpendicular Cross-Tie -->
                            <g>
                                <!-- Band 1 -->
                                <path d="M23 25 L27 27 L77 12 L73 10 Z" fill="${color}" opacity="0.6" />
                                <path d="M23 25 Q13 32 23 40 L27 42 Q17 34 27 27 Z" fill="${color}" opacity="0.8" />
                                <!-- Band 2 -->
                                <path d="M73 25 L77 27 L27 12 L23 10 Z" fill="${color}" opacity="0.6" />
                                <path d="M77 27 Q87 34 77 42 L73 40 Q83 32 73 25 Z" fill="${color}" opacity="0.8" />
                            </g>

                            <!-- Center Intersection Knot -->
                            <circle cx="50" cy="18.5" r="2.5" fill="white" opacity="0.4" pointer-events="none" />
                        </g>
                    `;
                }

                return `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 35px; flex-shrink: 0; width: 200px; margin-bottom: 70px;">
                        <div onclick="admin.showRestockModal('${item.id}')" style="width: 160px; height: 180px; position: relative; cursor: pointer; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);" onmouseover="this.style.transform='translateY(-15px) scale(1.05)'" onmouseout="this.style.transform='translateY(0) scale(1)'">
                            <svg width="100%" height="100%" viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet">
                                ${sideGradients}
                                <!-- Capped Folded Stack -->
                                ${bundlesHtml}
                            </svg>
                            <!-- Ground Ambience -->
                            <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 85%; height: 15px; background: ${color}20; filter: blur(20px); border-radius: 50%; z-index: -1;"></div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.3rem; font-weight: 800; color: #f8fafc; white-space: nowrap; margin-bottom: 8px; font-family: 'Outfit'; letter-spacing: -0.5px;">${item.name}</div>
                            <div style="font-size: 1.1rem; color: #94a3b8; font-weight: 600; display: flex; align-items: baseline; justify-content: center; gap: 6px;">
                                <span style="color: ${color}; font-weight: 900; font-size: 1.6rem;">${item.current.toLocaleString()}</span>
                                <span style="opacity: 0.5; font-size: 0.9rem;">/ ${item.max.toLocaleString()}</span>
                            </div>
                            <div style="font-size: 0.85rem; color: #64748b; margin-top: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; opacity: 0.8;">
                                ${bundlesCount} BUNDLE${bundlesCount !== 1 ? 'S' : ''}
                            </div>
                            ${warnHtml}
                        </div>
                    </div>
                `;
            }

            return `
                <div id="item-${item.id}" class="consumable-item-row" onclick="admin.showRestockModal('${item.id}')" style="cursor: pointer; padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s ease;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 8px;">
                        <span style="font-weight: 600;">${item.name}</span>
                        <span style="font-weight: bold; color: var(--admin-accent);">${item.unit ? item.current + ' ' + item.unit : item.current.toLocaleString() + ' / ' + item.max.toLocaleString()}</span>
                    </div>
                    <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: ${color};"></div>
                    </div>
                    ${warnHtml}
                </div>
            `;
        };

        packagingList.innerHTML = this.consumables.packaging.map(item => renderItem(item, true)).join('');
        cleaningList.innerHTML = this.consumables.cleaning.map(item => renderItem(item, false)).join('');

        // 4. Update Dashboard Card (if on home view)
        const p1 = this.consumables.packaging[0];
        const c1 = this.consumables.cleaning[0];
        
        if (p1 && document.getElementById('dash-inv-p1-val')) {
            const p1Percent = Math.min((p1.current / p1.max) * 100, 100);
            document.getElementById('dash-inv-p1-name').innerText = p1.name;
            document.getElementById('dash-inv-p1-val').innerText = `${p1.current.toLocaleString()} ${p1.unit}`;
            document.getElementById('dash-inv-p1-bar').style.width = `${p1Percent}%`;
            document.getElementById('dash-inv-p1-bar').style.background = p1Percent < 20 ? '#ef4444' : 'var(--admin-accent)';
        }

        if (c1 && document.getElementById('dash-inv-c1-val')) {
            const c1Percent = Math.min((c1.current / c1.max) * 100, 100);
            document.getElementById('dash-inv-c1-name').innerText = c1.name;
            document.getElementById('dash-inv-c1-val').innerText = `${c1.current.toLocaleString()} ${c1.unit}`;
            document.getElementById('dash-inv-c1-bar').style.width = `${c1Percent}%`;
            document.getElementById('dash-inv-c1-bar').style.background = c1Percent < 20 ? '#ef4444' : '#22c55e';
            document.getElementById('dash-inv-warn').style.display = c1Percent < 20 ? 'block' : 'none';
        }

        // 2. Update Dropdown Options (optional, but good for custom items)
        if (dropdown) {
            let optionsHtml = '';
            optionsHtml += '<optgroup label="Packaging">';
            this.consumables.packaging.forEach(item => {
                optionsHtml += `<option value="${item.id}">${item.name}</option>`;
            });
            optionsHtml += '</optgroup>';
            optionsHtml += '<optgroup label="Cleaning">';
            this.consumables.cleaning.forEach(item => {
                optionsHtml += `<option value="${item.id}">${item.name}</option>`;
            });
            optionsHtml += '</optgroup>';
            optionsHtml += '<option value="CUSTOM">--- Add New Custom Item ---</option>';
            dropdown.innerHTML = optionsHtml;
        }
    },

    handleRestockItemChange() {
        const itemVal = document.getElementById('restock-item').value;
        const customFields = document.getElementById('custom-item-fields');
        const deleteBtn = document.getElementById('delete-consumable-btn');

        if (customFields) {
            customFields.style.display = itemVal === 'CUSTOM' ? 'block' : 'none';
        }
        
        if (deleteBtn) {
            deleteBtn.style.display = itemVal === 'CUSTOM' ? 'none' : 'block';
        }
        
        // If adjustment is ON, update the qty field with current stock
        if (document.getElementById('restock-adjustment').checked) {
            this.handleAdjustmentToggle();
        }
    },


    handleAdjustmentToggle() {
        const isAdj = document.getElementById('restock-adjustment').checked;
        const qtyLabel = document.getElementById('qty-label');
        const qtyInput = document.getElementById('restock-qty');
        const itemVal = document.getElementById('restock-item').value;
        
        if (isAdj) {
            qtyLabel.innerText = 'New Current Stock (Verified)';
            qtyLabel.style.color = '#0ea5e9';
            
            // Pre-fill with current stock
            if (itemVal !== 'CUSTOM') {
                let targetItem;
                for (let cat in this.consumables) {
                    targetItem = this.consumables[cat].find(i => i.id === itemVal);
                    if (targetItem) break;
                }
                if (targetItem) qtyInput.value = targetItem.current;
            }
        } else {
            qtyLabel.innerText = 'Quantity Added';
            qtyLabel.style.color = '#94a3b8';
            qtyInput.value = '';
        }
    },

    showMaintenanceModal() {
        document.getElementById('maintenance-modal').style.display = 'flex';
    },

    closeMaintenanceModal() {
        document.getElementById('maintenance-modal').style.display = 'none';
    },

    submitMaintenance() {
        const asset = document.getElementById('maint-asset').value;
        const task = document.getElementById('maint-task').value;
        const cost = parseFloat(document.getElementById('maint-cost').value);
        const nextDate = document.getElementById('maint-next').value;
        const note = document.getElementById('maint-note').value;

        if (!asset || !task) {
            alert('Please select an asset and task.');
            return;
        }

        const log = {
            timestamp: new Date().toISOString(),
            asset,
            task,
            cost: cost || 0,
            nextDate: nextDate || 'TBD',
            note
        };

        // 1. Save Log
        this.maintenanceLogs.push(log);
        admin.saveState('iceqube_maintenance_logs', this.maintenanceLogs);

        // 2. Record Cashflow if cost > 0
        if (cost > 0) {
            const entry = {
                timestamp: new Date().toISOString(),
                category: 'Maintenance',
                description: `${task}: ${asset}${note ? ' (' + note + ')' : ''}`,
                type: 'OUT',
                amount: cost,
                source: 'MANUAL'
            };
            this.manualEntries.push(entry);
            this.saveManualEntries();
        }

        // 3. Update UI
        this.updateMaintenanceUI();
        this.fetchRealStats(); // Update cashflow view

        // 4. Cleanup
        this.closeMaintenanceModal();
        document.getElementById('maint-cost').value = '';
        document.getElementById('maint-next').value = '';
        document.getElementById('maint-note').value = '';

        alert('Maintenance log saved successfully!');
    },

    updateMaintenanceUI() {
        const tbody = document.getElementById('maintenance-log-body');
        if (!tbody) return;

        if (this.maintenanceLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 30px;">No maintenance logs recorded yet.</td></tr>';
            return;
        }

        // Sort by date (descending)
        const sortedLogs = [...this.maintenanceLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        tbody.innerHTML = sortedLogs.map(log => {
            const dateStr = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><b>${log.asset}</b></td>
                    <td><span class="status-badge" style="background: rgba(255,255,255,0.05); color: #f8fafc; border: 1px solid rgba(255,255,255,0.1);">${log.task}</span></td>
                    <td style="font-family: 'Inter', sans-serif;">₱${log.cost.toLocaleString()}</td>
                    <td style="color: #94a3b8; font-size: 0.85rem;">${log.nextDate !== 'TBD' ? new Date(log.nextDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TBD'}</td>
                </tr>
            `;
        }).join('');
    },

    updateAssetsUI() {
        const list = document.getElementById('equipment-list');
        const maintSelect = document.getElementById('maint-asset');
        if (!list) return;

        list.innerHTML = this.assets.map(asset => `
            <div class="rider-card" style="flex-direction: column; align-items: flex-start; position: relative;">
                <button onclick="admin.deleteAsset('${asset.id}')" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; cursor: pointer; opacity: 0.4; transition: opacity 0.2s; font-size: 0.8rem;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">✕</button>
                <div style="display: flex; justify-content: space-between; width: 100%; padding-right: 15px;">
                    <h4 style="margin: 0;">${asset.name}</h4>
                    <div class="rider-status-dot status-${asset.status}"></div>
                </div>
                <small style="color: ${asset.status === 'busy' ? '#f59e0b' : (asset.status === 'offline' ? '#ef4444' : '#64748b')}; margin-top: 5px;">${asset.metric}</small>
            </div>
        `).join('');

        // Update maintenance modal dropdown
        if (maintSelect) {
            const currentVal = maintSelect.value;
            maintSelect.innerHTML = this.assets.map(a => `<option value="${a.name}">${a.name}</option>`).join('') + 
                `<option value="Water Filtration System">Water Filtration System</option>
                 <option value="Delivery Vehicle (L300)">Delivery Vehicle (L300)</option>
                 <option value="Delivery Motorcycle #1">Delivery Motorcycle #1</option>`;
            maintSelect.value = currentVal || (this.assets[0] ? this.assets[0].name : '');
        }
    },

    deleteAsset(id) {
        if (!confirm('Are you sure you want to remove this asset? This will also affect P&L depreciation.')) return;
        
        this.assets = this.assets.filter(a => a.id !== id);
        admin.saveState('iceqube_assets', this.assets);
        
        this.updateAssetsUI();
        if (document.getElementById('finance-view').style.display !== 'none') {
            this.loadPnL(document.querySelector('.time-btn.active')?.id.replace('btn-', '') || 'mtd');
        }
        
        alert('Asset removed successfully.');
    },

    showAddAssetModal() {
        document.getElementById('add-asset-modal').style.display = 'flex';
    },

    closeAddAssetModal() {
        document.getElementById('add-asset-modal').style.display = 'none';
    },

    submitAddAsset() {
        const name = document.getElementById('asset-name').value;
        const type = document.getElementById('asset-type').value;
        const status = document.getElementById('asset-status').value;
        const metric = document.getElementById('asset-metric').value;
        const price = parseFloat(document.getElementById('asset-price').value) || 0;
        const dateAcquired = document.getElementById('asset-date').value || new Date().toISOString().split('T')[0];
        const usefulLifeMonths = parseInt(document.getElementById('asset-life').value) || 60;

        if (!name) {
            alert('Please enter an asset name.');
            return;
        }

        const newAsset = {
            id: 'asset-' + Date.now(),
            name,
            type,
            status,
            metric: metric || 'Status Nominal',
            price,
            dateAcquired,
            usefulLifeMonths
        };

        this.assets.push(newAsset);
        admin.saveState('iceqube_assets', this.assets);
        
        this.updateAssetsUI();
        this.closeAddAssetModal();
        
        // Clear inputs
        document.getElementById('asset-name').value = '';
        document.getElementById('asset-metric').value = '';
        document.getElementById('asset-price').value = '';
        document.getElementById('asset-date').value = '';
                document.getElementById('asset-life').value = '';
        
        alert('Asset added successfully!');
    },

    updateUtilitiesUI() {
        const ce = document.getElementById('bill-cepalco');
        const cw = document.getElementById('bill-cowd');
        const cp = document.getElementById('bill-pldt');
        if (!ce) return;

        ce.value = this.utilities.electricity;
        cw.value = this.utilities.water;
        cp.value = this.utilities.internet;

        // Set status buttons and paid dates
        Object.keys(this.utilityStatus).forEach(key => {
            const btn = document.getElementById(`status-${key}`);
            const dateEl = document.getElementById(`paid-date-${key}`);
            if (btn) {
                const isPaid = this.utilityStatus[key];
                btn.className = `status-btn ${isPaid ? 'paid' : 'unpaid'}`;
                btn.innerText = isPaid ? 'PAID' : 'UNPAID';

                // Update Paid Date label
                if (dateEl) {
                    const paidDate = this.utilityPaidDates[key];
                    if (isPaid && paidDate) {
                        dateEl.innerText = `Paid on ${paidDate}`;
                        dateEl.style.display = 'block';
                    } else {
                        dateEl.style.display = 'none';
                    }
                }
            }
        });

        this.calculateTotalUtilities();
    },

    calculateTotalUtilities() {
        const cepalco = parseFloat(document.getElementById('bill-cepalco')?.value) || 0;
        const cowd = parseFloat(document.getElementById('bill-cowd')?.value) || 0;
        const pldt = parseFloat(document.getElementById('bill-pldt')?.value) || 0;
        
        this.utilities.electricity = cepalco;
        this.utilities.water = cowd;
        this.utilities.internet = pldt;
        admin.saveState('iceqube_utilities', this.utilities);

        const total = cepalco + cowd + pldt;
        const el = document.getElementById('total-utilities');
        if (el) el.innerText = `₱${total.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
        
        // Refresh Finance if open
        if (document.getElementById('finance-view').style.display !== 'none') {
            this.loadPnL(document.querySelector('.time-btn.active')?.id.replace('btn-', '') || 'mtd');
        }
    },

    togglePaymentStatus(utilityId) {
        const btn = document.getElementById(`status-${utilityId}`);
        const amountInput = document.getElementById(`bill-${utilityId}`);
        const amount = amountInput ? parseFloat(amountInput.value) : (utilityId === 'rent' ? parseFloat(this.rental) : 0);
        
        const monthYear = document.getElementById('current-billing-month')?.innerText || 
                          new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const names = {
            cepalco: 'Electricity (CEPALCO)',
            cowd: 'Water (COWD)',
            pldt: 'Internet (PLDT)',
            rent: 'Warehouse Rent'
        };
        const name = names[utilityId] || utilityId.toUpperCase();
        const desc = `Monthly ${name} Payment (${monthYear})`;

        if (btn && btn.classList.contains('unpaid')) {
            // Switch to PAID
            this.utilityStatus[utilityId] = true;
            btn.className = 'status-btn paid';
            btn.innerText = 'PAID';
            
            console.log(`[SYSTEM] ₱${amount} paid for ${utilityId}. Pushing to Cashflow.`);
            
            // Remove existing entry for this specific month/utility if it exists (prevent duplicates)
            this.manualEntries = this.manualEntries.filter(e => e.description !== desc);
            
            // Add to Cashflow
            this.manualEntries.push({
                timestamp: new Date().toISOString(),
                category: utilityId === 'rent' ? 'Other' : 'Utilities (Power/Water)',
                description: desc,
                type: 'OUT',
                amount: amount,
                source: 'AUTO',
                is_real: true
            });
            
            this.saveManualEntries();

            // Record Payment Date
            this.utilityPaidDates[utilityId] = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            admin.saveState('iceqube_utility_paid_dates', this.utilityPaidDates);
            
            this.updateUtilitiesUI();
            this.updateRentalUI();
        } else if (btn) {
            // Revert to UNPAID
            this.utilityStatus[utilityId] = false;
            btn.className = 'status-btn unpaid';
            btn.innerText = 'UNPAID';
            
            console.log(`[SYSTEM] Reverting ${utilityId} to Unpaid. Removing from Cashflow.`);
            this.manualEntries = this.manualEntries.filter(e => e.description !== desc);
            this.saveManualEntries();

            // Clear Payment Date
            delete this.utilityPaidDates[utilityId];
            admin.saveState('iceqube_utility_paid_dates', this.utilityPaidDates);

            this.updateUtilitiesUI();
            this.updateRentalUI();
        }
        
        admin.saveState('iceqube_utility_status', this.utilityStatus);
        this.fetchRealStats(); // Triggers UI refresh
    },

    checkMonthlyReset() {
        const today = new Date();
        const currentMonth = today.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        // Update the UI Header
        const el = document.getElementById('current-billing-month');
        if (el) el.innerText = currentMonth;

        // Check if it's the 1st of the month
        if (today.getDate() === 1) {
            const lastReset = localStorage.getItem('iceqube_last_reset');
            if (lastReset !== currentMonth) {
                // Reset inputs to 0.00 for the new billing cycle
                this.utilities = { electricity: 0, water: 0, internet: 0 };
                this.utilityStatus = { cepalco: false, cowd: false, pldt: false, rent: false };
                this.utilityPaidDates = {};
                
                admin.saveState('iceqube_utilities', this.utilities);
                admin.saveState('iceqube_utility_status', this.utilityStatus);
                admin.saveState('iceqube_utility_paid_dates', this.utilityPaidDates);
                localStorage.setItem('iceqube_last_reset', currentMonth);
                
                this.updateUtilitiesUI();
                console.log("[SYSTEM] Day 1 Reset Executed. Awaiting new bills.");
            }
        }
    },

    updateRentalUI() {
        const rentInput = document.getElementById('bill-rent');
        if (rentInput) {
            rentInput.value = this.rental || 0;
        }
        // Status handled in updateUtilitiesUI loop but can be redundant here
        const btn = document.getElementById('status-rent');
        const dateEl = document.getElementById('paid-date-rent');
        if (btn) {
            const isPaid = this.utilityStatus.rent;
            btn.className = `status-btn ${isPaid ? 'paid' : 'unpaid'}`;
            btn.innerText = isPaid ? 'PAID' : 'UNPAID';

            // Update Paid Date label
            if (dateEl) {
                const paidDate = this.utilityPaidDates.rent;
                if (isPaid && paidDate) {
                    dateEl.innerText = `Paid on ${paidDate}`;
                    dateEl.style.display = 'block';
                } else {
                    dateEl.style.display = 'none';
                }
            }
        }
    },

    showToast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '⚠️';
        
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.remove();
                if (container.children.length === 0) container.remove();
            }, 400);
        }, 4000);
    },

    updatePricingUI() {
        const pricingContainer = document.getElementById('pricing-matrix-container');
        const thresholdContainer = document.getElementById('threshold-matrix-container');
        if (!pricingContainer || !thresholdContainer) return;

        // Render Pricing Cards
        pricingContainer.innerHTML = this.pricingMatrix.products.map(p => `
            <div data-product-id="${p.id}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.9rem; color: #0ea5e9;">${p.name}</h4>
                    <button onclick="event.stopPropagation(); admin.deleteProduct('${p.id}')" class="delete-btn" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; display: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 0.65rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px;">Standard Price (₱)</label>
                        <input type="number" id="m-${p.id}-std" class="matrix-input" value="${p.standard}" readonly>
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.65rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px;">Bulk Rate (₱)</label>
                        <input type="number" id="m-${p.id}-bulk" class="matrix-input" value="${p.bulk}" readonly>
                    </div>
                </div>
            </div>
        `).join('');

        // Render Threshold Cards
        thresholdContainer.innerHTML = this.pricingMatrix.products.map(p => `
            <div>
                <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: #eab308;">${p.name}</h4>
                <label style="display: block; font-size: 0.65rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px;">Min. Bags for Bulk Rate</label>
                <input type="number" id="m-${p.id}-threshold" class="matrix-input" value="${p.threshold}" readonly>
                <small style="display: block; margin-top: 8px; color: #64748b; font-size: 0.7rem;">Currently ${p.threshold} bags triggers ₱${p.bulk} rate.</small>
            </div>
        `).join('');

        // Sync Delivery Inputs
        const delBase = document.getElementById('m-del-base');
        const delKmShort = document.getElementById('m-del-km-short');
        const delKmLong = document.getElementById('m-del-km-long');
        const delLate = document.getElementById('m-del-late');
        const delPeak = document.getElementById('m-del-peak');
        const delFree = document.getElementById('m-del-free');
        const delHeavyT1Weight = document.getElementById('m-del-heavy-t1-weight');
        const delHeavyT1Fee = document.getElementById('m-del-heavy-t1-fee');
        const delHeavyT2Weight = document.getElementById('m-del-heavy-t2-weight');
        const delHeavyT2Fee = document.getElementById('m-del-heavy-t2-fee');
        
        if (delBase) delBase.value = this.pricingMatrix.delivery.baseFare !== undefined ? this.pricingMatrix.delivery.baseFare : 30;
        if (delKmShort) delKmShort.value = this.pricingMatrix.delivery.perKmShort !== undefined ? this.pricingMatrix.delivery.perKmShort : (this.pricingMatrix.delivery.perKmRate !== undefined ? this.pricingMatrix.delivery.perKmRate : 15);
        if (delKmLong) delKmLong.value = this.pricingMatrix.delivery.perKmLong !== undefined ? this.pricingMatrix.delivery.perKmLong : 20;
        if (delLate) delLate.value = this.pricingMatrix.delivery.lateNightFee !== undefined ? this.pricingMatrix.delivery.lateNightFee : 0;
        if (delPeak) delPeak.value = this.pricingMatrix.delivery.peakHoursFee !== undefined ? this.pricingMatrix.delivery.peakHoursFee : 0;
        if (delFree) delFree.value = this.pricingMatrix.delivery.freeThreshold !== undefined ? this.pricingMatrix.delivery.freeThreshold : 0;
        if (delHeavyT1Weight) delHeavyT1Weight.value = this.pricingMatrix.delivery.heavyLoadT1Weight !== undefined ? this.pricingMatrix.delivery.heavyLoadT1Weight : 19;
        if (delHeavyT1Fee) delHeavyT1Fee.value = this.pricingMatrix.delivery.heavyLoadT1Fee !== undefined ? this.pricingMatrix.delivery.heavyLoadT1Fee : 10;
        if (delHeavyT2Weight) delHeavyT2Weight.value = this.pricingMatrix.delivery.heavyLoadT2Weight !== undefined ? this.pricingMatrix.delivery.heavyLoadT2Weight : 31;
        if (delHeavyT2Fee) delHeavyT2Fee.value = this.pricingMatrix.delivery.heavyLoadT2Fee !== undefined ? this.pricingMatrix.delivery.heavyLoadT2Fee : 15;
    },

    toggleMatrixLock(cardId, btn) {
        const card = document.getElementById(cardId);
        if (!card) return;
        
        const inputs = card.querySelectorAll('.matrix-input');
        const deleteBtns = card.querySelectorAll('.delete-btn');
        const isLocked = inputs[0] ? inputs[0].hasAttribute('readonly') : true;
        
        if (isLocked) {
            // UNLOCK
            this.isEditingMatrix = true; // PAUSE background sync
            inputs.forEach(input => input.removeAttribute('readonly'));
            deleteBtns.forEach(b => b.style.display = 'block');
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L22 2"/></svg> SYNCHRONIZE';
            if (inputs[0]) inputs[0].focus();
        } else {
            // LOCK & SAVE
            this.isEditingMatrix = false; // RESUME background sync
            this.savePricingMatrix(btn);
            inputs.forEach(input => input.setAttribute('readonly', true));
            deleteBtns.forEach(b => b.style.display = 'none');
            
            const type = cardId.split('-').pop(); // pricing, thresholds, logistics
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> EDIT ${type.toUpperCase()}`;
        }
    },

    async savePricingMatrix(triggerBtn = null) {
        const products = this.pricingMatrix.products.map(p => {
            const std = document.getElementById(`m-${p.id}-std`);
            const bulk = document.getElementById(`m-${p.id}-bulk`);
            const threshold = document.getElementById(`m-${p.id}-threshold`);
            return {
                ...p,
                standard: std ? parseFloat(std.value) || 0 : p.standard,
                bulk: bulk ? parseFloat(bulk.value) || 0 : p.bulk,
                threshold: threshold ? parseInt(threshold.value) || 0 : p.threshold
            };
        });

        const delHeavyT1WeightEl = document.getElementById('m-del-heavy-t1-weight');
        const delHeavyT1FeeEl = document.getElementById('m-del-heavy-t1-fee');
        const delHeavyT2WeightEl = document.getElementById('m-del-heavy-t2-weight');
        const delHeavyT2FeeEl = document.getElementById('m-del-heavy-t2-fee');

        const newMatrix = {
            products: products,
            delivery: {
                baseFare: parseFloat(document.getElementById('m-del-base')?.value) || 30,
                perKmShort: parseFloat(document.getElementById('m-del-km-short')?.value) || 15,
                perKmLong: parseFloat(document.getElementById('m-del-km-long')?.value) || 20,
                lateNightFee: parseFloat(document.getElementById('m-del-late')?.value) || 0,
                peakHoursFee: parseFloat(document.getElementById('m-del-peak')?.value) || 0,
                freeThreshold: parseFloat(document.getElementById('m-del-free')?.value) || 0,
                heavyLoadT1Weight: delHeavyT1WeightEl ? parseFloat(delHeavyT1WeightEl.value) : (this.pricingMatrix.delivery.heavyLoadT1Weight !== undefined ? this.pricingMatrix.delivery.heavyLoadT1Weight : 19),
                heavyLoadT1Fee: delHeavyT1FeeEl ? parseFloat(delHeavyT1FeeEl.value) : (this.pricingMatrix.delivery.heavyLoadT1Fee !== undefined ? this.pricingMatrix.delivery.heavyLoadT1Fee : 10),
                heavyLoadT2Weight: delHeavyT2WeightEl ? parseFloat(delHeavyT2WeightEl.value) : (this.pricingMatrix.delivery.heavyLoadT2Weight !== undefined ? this.pricingMatrix.delivery.heavyLoadT2Weight : 31),
                heavyLoadT2Fee: delHeavyT2FeeEl ? parseFloat(delHeavyT2FeeEl.value) : (this.pricingMatrix.delivery.heavyLoadT2Fee !== undefined ? this.pricingMatrix.delivery.heavyLoadT2Fee : 15)
            }
        };

        this.pricingMatrix = newMatrix;
        localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));

        if (window.IceQubeSync) {
            await window.IceQubeSync.publishPricingUpdate(this.pricingMatrix);
        }

        if (typeof this.showToast === 'function') {
            this.showToast('Pricing Matrix Synchronized!', 'success');
        }

        // Visual feedback
        const btn = triggerBtn || document.querySelector('#matrix-view .btn-primary');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '✅ SYNCED';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 2000);
        }
    },

    showAddPackagingModal() {
        const modal = document.getElementById('modal-add-packaging');
        if (modal) modal.classList.add('active');
    },

    closeAddPackagingModal() {
        const modal = document.getElementById('modal-add-packaging');
        if (modal) modal.classList.remove('active');
    },

    addProduct() {
        const id = document.getElementById('new-p-id').value.trim();
        const name = document.getElementById('new-p-name').value.trim();
        const std = parseFloat(document.getElementById('new-p-std').value) || 0;
        const bulk = parseFloat(document.getElementById('new-p-bulk').value) || 0;
        const threshold = parseInt(document.getElementById('new-p-threshold').value) || 0;

        if (!id || !name) {
            this.showToast('ID and Name are required.', 'error');
            return;
        }

        if (this.pricingMatrix.products.find(p => p.id === id)) {
            this.showToast('Product ID already exists.', 'error');
            return;
        }

        this.pricingMatrix.products.push({ id, name, standard: std, bulk, threshold });
        localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
        
        if (window.IceQubeSync) {
            window.IceQubeSync.publishPricingUpdate(this.pricingMatrix);
        }

        this.updatePricingUI();
        this.closeAddPackagingModal();
        this.showToast('New packaging added!', 'success');
        
        // Reset inputs
        document.getElementById('new-p-id').value = '';
        document.getElementById('new-p-name').value = '';
    },

    deleteProduct(id) {
        console.log(`[Admin] Attempting to delete product with ID: ${id}`);
        
        this.showConfirmModal(
            "Delete Packaging",
            "Are you sure you want to remove this ice packaging type? This will also remove it from the Customer App selection.",
            () => {
                const initialCount = this.pricingMatrix.products.length;
                this.pricingMatrix.products = this.pricingMatrix.products.filter(p => p.id !== id);
                const finalCount = this.pricingMatrix.products.length;

                if (initialCount === finalCount) {
                    console.warn(`[Admin] Delete failed: Product with ID "${id}" not found in matrix.`);
                    this.showToast('Product not found. Try refreshing.', 'error');
                    return;
                }

                localStorage.setItem('iceqube_global_pricing', JSON.stringify(this.pricingMatrix));
                
                if (window.IceQubeSync) {
                    window.IceQubeSync.publishPricingUpdate(this.pricingMatrix);
                }

                this.updatePricingUI();
                this.showToast('Packaging removed.', 'success');
                console.log(`[Admin] Successfully deleted product: ${id}`);
            }
        );
    },

    updateRentDisplay() {
        const val = parseFloat(document.getElementById('bill-rent').value) || 0;
        this.rental = val;
        admin.saveState('iceqube_rental', this.rental);

        // Refresh Finance if open
        if (document.getElementById('finance-view').style.display !== 'none') {
            this.loadPnL(document.querySelector('.time-btn.active')?.id.replace('btn-', '') || 'mtd');
        }
    },

    showUtilityModal() {
        // Redundant with inline inputs but keeping for legacy or future complex edits
        this.updateUtilitiesUI();
    },

    showRentalModal() {
        // Redundant with inline inputs
        this.updateRentalUI();
    },
    closeRentalModal() {
        document.getElementById('rental-modal').style.display = 'none';
    },

    submitRental() {
        const val = parseFloat(document.getElementById('input-rental-val').value) || 0;
        this.rental = val;
        admin.saveState('iceqube_rental', this.rental);

        this.updateRentalUI();
        this.closeRentalModal();

        // Refresh Finance if open
        if (document.getElementById('finance-view').style.display !== 'none') {
            this.loadPnL(document.querySelector('.time-btn.active')?.id.replace('btn-', '') || 'mtd');
        }

        alert('Warehouse rent updated successfully!');
    }
};

// Explicitly attach to window
window.admin = admin;

// Add CSS shake animation dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        10, 90% { transform: translate3d(-1px, 0, 0); }
        20, 80% { transform: translate3d(2px, 0, 0); }
        30, 50, 70% { transform: translate3d(-4px, 0, 0); }
        40, 60% { transform: translate3d(4px, 0, 0); }
    }
`;
document.head.appendChild(style);


document.addEventListener('DOMContentLoaded', async () => {
    try {
        await admin.init();
        admin.initWeather();
    } catch (e) {
        console.error('Fatal Initialization Error:', e);
    }
});

admin.initWeather = async function() {
    try {
        // Cagayan de Oro coordinates
        const lat = 8.4822;
        const lon = 124.6472;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&timezone=Asia%2FManila`);
        if (!res.ok) throw new Error('Failed to fetch weather');
        const data = await res.json();
        const current = data.current_weather;
        
        const getWeatherIcon = (code) => {
            if (code >= 1 && code <= 3) return '⛅';
            if (code >= 45 && code <= 48) return '🌫️';
            if (code >= 51 && code <= 67) return '🌧️';
            if (code >= 71 && code <= 77) return '❄️';
            if (code >= 80 && code <= 82) return '🌦️';
            if (code >= 95) return '⛈️';
            return '☀️'; // default clear
        };
        
        if (current) {
            const temp = Math.round(current.temperature);
            const icon = getWeatherIcon(current.weathercode);
            
            const tempEl = document.getElementById('live-weather-temp');
            const iconEl = document.getElementById('live-weather-icon');
            const demandBox = document.getElementById('live-demand-box');
            const demandText = document.getElementById('live-demand-text');
            
            if (tempEl) tempEl.innerText = `${temp}°C`;
            if (iconEl) iconEl.innerText = icon;
            
            // Demand Logic based on temperature (Ice demand is higher when hot)
            if (temp >= 32) {
                if (demandBox) {
                    demandBox.style.background = 'rgba(239, 68, 68, 0.1)';
                    demandBox.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                }
                if (demandText) {
                    demandText.style.color = '#ef4444';
                    demandText.innerHTML = '<span class="demand-pulse"></span>HIGH DEMAND';
                }
            } else if (temp >= 28) {
                if (demandBox) {
                    demandBox.style.background = 'rgba(245, 158, 11, 0.1)';
                    demandBox.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                }
                if (demandText) {
                    demandText.style.color = '#f59e0b';
                    demandText.innerHTML = '<span class="demand-pulse" style="background: #f59e0b;"></span>MODERATE DEMAND';
                }
            } else {
                if (demandBox) {
                    demandBox.style.background = 'rgba(59, 130, 246, 0.1)';
                    demandBox.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                }
                if (demandText) {
                    demandText.style.color = '#3b82f6';
                    demandText.innerHTML = '<span class="demand-pulse" style="background: #3b82f6;"></span>LOW DEMAND';
                }
            }
        }
        
        // Render Hourly Forecast (next 6 hours)
        const hourlyContainer = document.getElementById('hourly-forecast-container');
        if (hourlyContainer && data.hourly) {
            const now = new Date();
            let currentIndex = data.hourly.time.findIndex(t => new Date(t) > now);
            if (currentIndex === -1 || currentIndex === 0) currentIndex = 1; 
            
            let html = '';
            for (let i = currentIndex; i < currentIndex + 6; i++) {
                if (i >= data.hourly.time.length) break;
                
                const timeStr = data.hourly.time[i];
                const tempH = Math.round(data.hourly.temperature_2m[i]);
                const codeH = data.hourly.weathercode[i];
                const iconH = getWeatherIcon(codeH);
                
                const dateObj = new Date(timeStr);
                let hour = dateObj.getHours();
                const ampm = hour >= 12 ? 'PM' : 'AM';
                hour = hour % 12;
                hour = hour ? hour : 12; 
                
                html += `
                    <div class="hourly-item">
                        <span class="h-time">${hour} ${ampm}</span>
                        <span class="h-icon">${iconH}</span>
                        <span class="h-temp">${tempH}°</span>
                    </div>
                `;
            }
            hourlyContainer.innerHTML = html;
        }
        
        // Auto refresh every 30 minutes
        setTimeout(admin.initWeather, 30 * 60 * 1000);
    } catch (err) {
        console.error('Weather fetch error:', err);
        const demandText = document.getElementById('live-demand-text');
        if (demandText) demandText.innerHTML = 'OFFLINE';
    }
};

// Drawer Controls
let previousActiveTab = null;

function openCustomerDrawer(customerId) {
    try {
        const currentTab = localStorage.getItem('iceqube_admin_tab') || 'ops';
        if (currentTab !== 'customers') {
            previousActiveTab = currentTab;
            admin.switchView('customers');
        } else {
            previousActiveTab = null;
        }

        let customer = admin.customerData?.find(c => c.name === customerId) || admin.customerData?.find(c => c.name.trim().toLowerCase() === customerId.trim().toLowerCase());
        
        if (!customer) {
            console.warn('Customer not found in admin.customerData:', customerId);
            customer = {
                name: customerId,
                address: 'No Address Provided',
                phone: 'No Phone provided',
                contactPerson: customerId,
                totalRevenue: 0,
                orders: [],
                firstOrderDate: new Date(),
                lastOrderDate: new Date(),
                isElite: false
            };
        }

        const profiles = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');
        const cleanName = (customer.name || customerId || '').trim();
        const profile = profiles[cleanName] || profiles[customer.name] || profiles[customerId] || {};

        // Find if any order has a messenger ID to auto-link
        let foundMessengerId = '';
        if (customer.orders && customer.orders.length > 0) {
            for (let i = customer.orders.length - 1; i >= 0; i--) {
                const o = customer.orders[i];
                if (o.messenger_id || o.messengerId) {
                    foundMessengerId = o.messenger_id || o.messengerId;
                    break;
                }
            }
        }

        if (foundMessengerId && !profile.messengerId) {
            profile.messengerId = foundMessengerId;
            profiles[cleanName] = {
                ...profile,
                establishment: cleanName,
                messengerId: foundMessengerId
            };
            localStorage.setItem('iceqube_customer_profiles', JSON.stringify(profiles));
            console.log(`[SYSTEM] Auto-linked Messenger ID ${foundMessengerId} for customer ${cleanName} from order history.`);
        }

        const nameEl = document.getElementById('drawer-customer-name');
        if (nameEl) nameEl.innerText = cleanName || customer.name || customerId;

        const addressVal = profile.address || customer.address || '';
        const contactVal = profile.contactPerson || customer.contactPerson || customer.name || customerId;
        const phoneVal = profile.contactNumber || customer.phone || '';
        const messengerVal = profile.messengerId || foundMessengerId || '';

        const addrEl = document.getElementById('drawer-customer-address');
        if (addrEl) addrEl.innerText = addressVal ? `Premium Partner • ${addressVal}` : 'Premium Partner';

        const contactEl = document.getElementById('drawer-contact-person');
        if (contactEl) contactEl.innerText = contactVal;

        const phoneEl = document.getElementById('drawer-phone');
        if (phoneEl) phoneEl.innerText = phoneVal || 'N/A';

        const addrDisplayEl = document.getElementById('drawer-address-display');
        if (addrDisplayEl) addrDisplayEl.innerText = addressVal || 'No Address';

        const messengerDisplayEl = document.getElementById('drawer-messenger-display');
        if (messengerDisplayEl) messengerDisplayEl.innerText = messengerVal || 'Not Linked';

        // Pre-populate inputs
        const contactInput = document.getElementById('drawer-contact-person-input');
        if (contactInput) contactInput.value = contactVal;

        const phoneInput = document.getElementById('drawer-phone-input');
        if (phoneInput) phoneInput.value = phoneVal;

        const addrInput = document.getElementById('drawer-address-input');
        if (addrInput) addrInput.value = addressVal;

        const messengerInput = document.getElementById('drawer-messenger-input');
        if (messengerInput) messengerInput.value = messengerVal;

        // Reset profile edit mode back to default display
        toggleProfileEdit(false);
        
        // Load Discounts & Tier
        const discounts = JSON.parse(localStorage.getItem('iceqube_customer_discounts') || '{}');
        const custPricing = discounts[cleanName] || discounts[customer.name] || discounts[customerId] || { percent: 0, fixed: 0, creditLimit: 0, tier: 'Standard' };
        
        // Set Tier Selection
        const tierSelect = document.getElementById('elite-tier-select');
        if (tierSelect) {
            const currentTier = custPricing.tier || (customer.isElite ? 'Elite Gold' : 'Standard');
            tierSelect.value = currentTier;
            const tierDisplay = document.getElementById('display-customer-tier');
            if (tierDisplay) tierDisplay.innerText = currentTier;
            
            updateTierVisuals(currentTier);
        }

        // Set Discounts & Credit Limit
        const discPercEl = document.getElementById('drawer-discount-percent');
        if (discPercEl) discPercEl.value = custPricing.percent || 0;
        const dispDiscPercEl = document.getElementById('display-discount-percent');
        if (dispDiscPercEl) dispDiscPercEl.innerText = custPricing.percent || 0;
        
        const discFixEl = document.getElementById('drawer-discount-fixed');
        if (discFixEl) discFixEl.value = (custPricing.fixed || 0).toFixed(2);
        const dispDiscFixEl = document.getElementById('display-discount-fixed');
        if (dispDiscFixEl) dispDiscFixEl.innerText = (custPricing.fixed || 0).toFixed(2);

        const credLimEl = document.getElementById('drawer-credit-limit');
        if (credLimEl) credLimEl.value = custPricing.creditLimit || 0;
        const dispCredLimEl = document.getElementById('display-credit-limit');
        if (dispCredLimEl) dispCredLimEl.innerText = (custPricing.creditLimit || 0).toLocaleString();

        // Default to locked mode
        togglePricingEdit(false);

        const clvEl = document.getElementById('drawer-clv');
        if (clvEl) clvEl.innerText = `₱${(customer.totalRevenue || 0).toLocaleString()}`;
        
        const msDiff = new Date(customer.lastOrderDate || new Date()) - new Date(customer.firstOrderDate || new Date());
        const daysDiff = msDiff / (1000 * 60 * 60 * 24);
        
        const freqEl = document.getElementById('drawer-frequency');
        const churnEl = document.getElementById('drawer-churn-alert');
        if (customer.orders && customer.orders.length > 1 && daysDiff > 0) {
            const freq = daysDiff / (customer.orders.length - 1);
            if (freqEl) freqEl.innerText = `Every ${freq.toFixed(1)} days`;
            
            const daysSinceLastOrder = (new Date() - new Date(customer.lastOrderDate || new Date())) / (1000 * 60 * 60 * 24);
            if (daysSinceLastOrder > 14 && customer.orders.length > 2) {
                if (churnEl) churnEl.style.display = 'flex';
            } else {
                if (churnEl) churnEl.style.display = 'none';
            }
        } else {
            if (freqEl) freqEl.innerText = '1st Order Only';
            if (churnEl) churnEl.style.display = 'none';
        }

        const historyList = document.getElementById('drawer-history-list');
        if (historyList && customer.orders) {
            let historyHtml = '';
            customer.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10).forEach(order => {
                let pm = order.payment_method || 'COD';
                let pmText = pm;
                let pmLower = pm.toLowerCase();
                if (pmLower.includes('cash on delivery') || pmLower === 'cash' || pm.toUpperCase() === 'COD') {
                    pmText = 'COD';
                } else if (pmLower.includes('purchase order') || pm.toUpperCase() === 'PO') {
                    pmText = 'PO';
                } else if (pmLower.includes('gcash')) {
                    pmText = 'GCash';
                } else if (pmLower.includes('online') || pmLower.includes('bank')) {
                    pmText = 'Online Banking';
                }
                
                let showScreenshot = (pmText === 'GCash' || pmText === 'Online Banking') ? 'inline-block' : 'none';

                historyHtml += `
                    <div class="history-row">
                        <span>${order.order_id}</span>
                        <span>₱${order.total_price}</span>
                        <span style="font-size: 0.75rem; font-weight: 700; color: #94a3b8;">${pmText}</span>
                        <span><span class="badge-resolved">${order.delivery_status || 'Completed'}</span></span>
                        <span style="text-align: right; width: 50px;"><button class="btn-icon" onclick="admin.toggleReceipt(true, '${order.order_id}')" style="display: ${showScreenshot}; margin-left: auto;">📄</button></span>
                    </div>
                `;
            });
            historyList.innerHTML = historyHtml;
        }

        const customerView = document.getElementById('customer-view');
        if (customerView) customerView.classList.add('drawer-open');

        const overlay = document.getElementById('customer-drawer-overlay');
        if (overlay) overlay.style.display = 'block';

        setTimeout(() => {
            const drawerEl = document.getElementById('customer-drawer');
            if (drawerEl) drawerEl.classList.add('open');
        }, 10);
    } catch (err) {
        console.error('Error in openCustomerDrawer:', err);
    }
}

function closeCustomerDrawer() {
    document.getElementById('customer-drawer').classList.remove('open');
    
    const customerView = document.getElementById('customer-view');
    if (customerView) customerView.classList.remove('drawer-open');

    const overlay = document.getElementById('customer-drawer-overlay');
    // Wait for slide animation to finish before hiding overlay
    setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        // Reset pricing UI on close
        togglePricingEdit(false);
        
        // Restore previous tab if we auto-switched to customer view
        if (previousActiveTab) {
            admin.switchView(previousActiveTab);
            previousActiveTab = null;
        }
    }, 300);
}

// Pricing Lock/Edit Toggle
function togglePricingEdit(isEditing) {
    const displayMode = document.getElementById('pricing-display-mode');
    const editMode = document.getElementById('pricing-edit-mode');
    const editBtn = document.getElementById('pricing-edit-btn');
    const actions = document.getElementById('pricing-actions');
    const savedStatus = document.getElementById('pricing-saved-status');

    if (isEditing) {
        displayMode.style.display = 'none';
        editMode.style.display = 'grid';
        editBtn.style.display = 'none';
        actions.style.display = 'flex';
        savedStatus.style.display = 'none';
    } else {
        displayMode.style.display = 'grid';
        editMode.style.display = 'none';
        editBtn.style.display = 'flex';
        actions.style.display = 'none';
        
        // Update display values from inputs
        const currentTier = document.getElementById('elite-tier-select').value;
        document.getElementById('display-customer-tier').innerText = currentTier;
        updateTierVisuals(currentTier);
        
        document.getElementById('display-discount-percent').innerText = document.getElementById('drawer-discount-percent').value;
        document.getElementById('display-discount-fixed').innerText = parseFloat(document.getElementById('drawer-discount-fixed').value).toFixed(2);
        document.getElementById('display-credit-limit').innerText = parseInt(document.getElementById('drawer-credit-limit').value).toLocaleString();
    }
}

// Tiered Elite Logic
function handleTierChange() {
    const tier = document.getElementById('elite-tier-select').value;
    const customerName = document.getElementById('drawer-customer-name').innerText.trim();
    
    updateTierVisuals(tier);
    
    const creditInput = document.getElementById('drawer-credit-limit');
    const creditDisplay = document.getElementById('display-credit-limit');

    console.log(`[SYSTEM] Tier changing to ${tier} for ${customerName}`);

    // Update Elite status in memory if available
    if (admin.customerData) {
        const customer = admin.customerData.find(c => c.name === customerName) || admin.customerData.find(c => c.name.trim().toLowerCase() === customerName.toLowerCase());
        if (customer) {
            customer.isElite = (tier !== 'Standard');
            customer.tier = tier;
        }
    }

    // Default Credit Limits (Option A)
    let defaultLimit = 0;
    if (tier === 'Elite Gold') defaultLimit = 2500;
    else if (tier === 'Elite Platinum') defaultLimit = 5000;
    else if (tier === 'Elite Diamond') defaultLimit = 10000;

    // Apply default limit (Visual update only until saved)
    creditInput.value = defaultLimit;
    creditDisplay.innerText = defaultLimit.toLocaleString();

    // Sync elite list for legacy/external lookups
    let eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '[]');
    if (tier !== 'Standard') {
        if (!eliteList.includes(customerName)) eliteList.push(customerName);
    } else {
        eliteList = eliteList.filter(name => name !== customerName);
    }
    localStorage.setItem('iceqube_elite_customers', JSON.stringify(eliteList));
}

function updateTierVisuals(tier) {
    const tierCard = document.getElementById('tier-card');
    const tierLabel = document.getElementById('tier-label');
    const tierValue = document.getElementById('display-customer-tier');
    
    if (!tierCard) return;

    // Reset classes
    tierCard.className = 'locked-price-card';
    tierLabel.className = 'label';
    tierValue.className = 'locked-value';

    // Apply tier specific classes
    const tierSlug = tier.split(' ')[1]?.toLowerCase() || 'standard';
    tierCard.classList.add(`tier-card-${tierSlug}`);
    tierLabel.classList.add(`tier-text-${tierSlug}`);
    tierValue.classList.add(`tier-text-${tierSlug}`);
}

function saveCustomerDiscounts() {
    const customerName = document.getElementById('drawer-customer-name').innerText.trim();
    const tier = document.getElementById('elite-tier-select').value;
    const percent = parseFloat(document.getElementById('drawer-discount-percent').value) || 0;
    const fixed = parseFloat(document.getElementById('drawer-discount-fixed').value) || 0;
    const creditLimit = parseInt(document.getElementById('drawer-credit-limit').value) || 0;

    const discounts = JSON.parse(localStorage.getItem('iceqube_customer_discounts') || '{}');
    discounts[customerName] = { 
        tier,
        percent, 
        fixed,
        creditLimit 
    };
    
    localStorage.setItem('iceqube_customer_discounts', JSON.stringify(discounts));
    localStorage.setItem('iceqube_system_purged', Date.now()); // Force storage event for listeners
    
    // Sync to other tabs
    if (window.IceQubeSync) {
        window.IceQubeSync.publishPurge(); 
    }
    
    console.log(`[SYSTEM] Pricing updated for ${customerName}: Tier=${tier}, Limit=₱${creditLimit}`);
    alert(`Settings saved for ${customerName}.`);
    
    // Update display mode and lock it
    document.getElementById('display-discount-percent').innerText = percent;
    document.getElementById('display-discount-fixed').innerText = fixed.toFixed(2);
    document.getElementById('display-credit-limit').innerText = creditLimit.toLocaleString();
    
    togglePricingEdit(false);
    
    // Show saved status briefly
    const savedStatus = document.getElementById('pricing-saved-status');
    savedStatus.style.display = 'flex';
    
    // Auto-hide saved status after 3 seconds
    setTimeout(() => {
        savedStatus.style.display = 'none';
    }, 3000);
}

function toggleProfileEdit(isEditing) {
    const displayMode = document.getElementById('profile-display-mode');
    const editMode = document.getElementById('profile-edit-mode');
    const editBtn = document.getElementById('profile-edit-btn');

    if (!displayMode || !editMode || !editBtn) return;

    if (isEditing) {
        displayMode.style.display = 'none';
        editMode.style.display = 'flex';
        editBtn.style.display = 'none';
    } else {
        displayMode.style.display = 'grid';
        editMode.style.display = 'none';
        editBtn.style.display = 'flex';
        
        // Update display values from inputs
        const contactVal = document.getElementById('drawer-contact-person-input').value;
        const phoneVal = document.getElementById('drawer-phone-input').value;
        const addressVal = document.getElementById('drawer-address-input').value;
        const messengerVal = document.getElementById('drawer-messenger-input').value;

        const cEl = document.getElementById('drawer-contact-person');
        if (cEl) cEl.innerText = contactVal || 'N/A';
        const pEl = document.getElementById('drawer-phone');
        if (pEl) pEl.innerText = phoneVal || 'N/A';
        const aEl = document.getElementById('drawer-address-display');
        if (aEl) aEl.innerText = addressVal || 'No Address';
        const mEl = document.getElementById('drawer-messenger-display');
        if (mEl) mEl.innerText = messengerVal || 'Not Linked';
        
        const addrEl = document.getElementById('drawer-customer-address');
        if (addrEl) addrEl.innerText = addressVal ? `Premium Partner • ${addressVal}` : 'Premium Partner';
    }
}

function saveCustomerProfile() {
    const customerName = document.getElementById('drawer-customer-name').innerText.trim();
    const contactPerson = document.getElementById('drawer-contact-person-input').value.trim();
    const contactNumber = document.getElementById('drawer-phone-input').value.trim();
    const address = document.getElementById('drawer-address-input').value.trim();
    const messengerId = document.getElementById('drawer-messenger-input').value.trim();

    const profiles = JSON.parse(localStorage.getItem('iceqube_customer_profiles') || '{}');
    const currentProfile = profiles[customerName] || {};
    
    const updatedProfile = {
        ...currentProfile,
        establishment: customerName,
        contactPerson,
        contactNumber,
        address,
        messengerId
    };

    profiles[customerName] = updatedProfile;
    localStorage.setItem('iceqube_customer_profiles', JSON.stringify(profiles));
    
    // Broadcast updating profile to other tabs
    if (window.IceQubeSync && typeof window.IceQubeSync.publishProfileUpdate === 'function') {
        window.IceQubeSync.publishProfileUpdate(updatedProfile);
    } else {
        const channel = new BroadcastChannel('iceqube_sync_channel');
        channel.postMessage({
            type: 'PROFILE_UPDATED',
            payload: updatedProfile
        });
        channel.close();
    }

    console.log(`[SYSTEM] Profile updated for ${customerName}`);
    alert(`Profile details saved for ${customerName}.`);

    toggleProfileEdit(false);

    if (typeof admin !== 'undefined' && typeof admin.loadCustomers === 'function') {
        admin.loadCustomers();
    }
}

// --- TEAM & PAYROLL REDESIGN LOGIC ---

admin.teamMembersData = JSON.parse(localStorage.getItem('iceqube_team_members')) || [
    { name: 'Juan Bautista', nickname: 'Juan', role: 'Rider', designation: 'Rider', phone: '0917 123 4567', messenger: 'jb_rider_123', address: 'Carmen, CDO', tin: '123-456-789-000', sss: '33-1234567-8', philhealth: '12-345678901-2', pagibig: '1211-3333-4444', rate: '₱500/day', currentWeekTotal: '₱3,000', currentMonthTotal: '₱12,000', status: 'Active', avatar: 'JB', deliveries: 48, roleCategory: 'Rider' },
    { name: 'Ricky Mercado', nickname: 'Ricky', role: 'Rider', designation: 'Rider', phone: '0918 999 8888', messenger: 'ricky_m88', address: 'Macasandig, CDO', tin: '987-654-321-000', sss: '33-7654321-8', philhealth: '12-098765432-1', pagibig: '1211-4444-5555', rate: '₱500/day', currentWeekTotal: '₱2,500', currentMonthTotal: '₱10,000', status: 'Inactive', avatar: 'RM', deliveries: 32, roleCategory: 'Rider' },
    { name: 'Dindo Lopez', nickname: 'Dindo', role: 'Plant Op', designation: 'Hub Staff', phone: '0915 444 3322', messenger: 'dindo_plant_op', address: 'Bulua, CDO', tin: '111-222-333-000', sss: '33-1122334-8', philhealth: '12-112233445-1', pagibig: '1211-1111-2222', rate: '₱600/day', currentWeekTotal: '₱3,600', currentMonthTotal: '₱14,400', status: 'Active', avatar: 'DL', deliveries: 0, roleCategory: 'Hub Staff' },
    { name: 'Maria Santos', nickname: 'Maria', role: 'Admin', designation: 'Admin Officer', phone: '0919 111 2222', messenger: 'maria_admin', address: 'Gusa, CDO', tin: '444-555-666-000', sss: '33-4455667-8', philhealth: '12-445566778-1', pagibig: '1211-6666-7777', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'MS', deliveries: 0, roleCategory: 'Admin Officer' },
    { name: 'Lawrence Fernandez', nickname: 'Lawrence', role: 'Admin', designation: 'Admin Officer', phone: 'N/A', messenger: 'lawrence_admin', address: 'Lapasan, CDO', tin: 'N/A', sss: 'N/A', philhealth: 'N/A', pagibig: 'N/A', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'LA', deliveries: 0, roleCategory: 'Admin Officer' }
];

admin.saveTeamMembers = function() {
    admin.saveState('iceqube_team_members', admin.teamMembersData);
};

admin.renderTeamCards = function() {
    const adminList = document.getElementById('admin-officers-list');
    const hubList = document.getElementById('hub-staff-list');
    const ridersList = document.getElementById('riders-list');
    
    if (!adminList || !hubList || !ridersList) return;

    // AUTO-HEAL: If previous bug corrupted Array into an Object (e.g. { "0": {...}, "1": {...} }), fix it.
    if (!Array.isArray(admin.teamMembersData)) {
        if (typeof admin.teamMembersData === 'object' && admin.teamMembersData !== null) {
            console.log("🩹 [Auto-Heal] Converting corrupted teamMembersData object back to Array.");
            admin.teamMembersData = Object.values(admin.teamMembersData);
            admin.saveTeamMembers(); // Save fixed array to local and cloud
        } else {
            admin.teamMembersData = [];
        }
    }

    // AUTO-RESTORE: If the members list got completely wiped, restore defaults
    if (!admin.teamMembersData || admin.teamMembersData.length === 0) {
        console.log("🩹 [Auto-Restore] Restoring default team members because array is empty.");
        admin.teamMembersData = [
            { name: 'Juan Bautista', nickname: 'Juan', role: 'Rider', designation: 'Rider', phone: '0917 123 4567', messenger: 'jb_rider_123', address: 'Carmen, CDO', tin: '123-456-789-000', sss: '33-1234567-8', philhealth: '12-345678901-2', pagibig: '1211-3333-4444', rate: '₱500/day', currentWeekTotal: '₱3,000', currentMonthTotal: '₱12,000', status: 'Active', avatar: 'JB', deliveries: 48, roleCategory: 'Rider' },
            { name: 'Ricky Mercado', nickname: 'Ricky', role: 'Rider', designation: 'Rider', phone: '0918 999 8888', messenger: 'ricky_m88', address: 'Macasandig, CDO', tin: '987-654-321-000', sss: '33-7654321-8', philhealth: '12-098765432-1', pagibig: '1211-4444-5555', rate: '₱500/day', currentWeekTotal: '₱2,500', currentMonthTotal: '₱10,000', status: 'Inactive', avatar: 'RM', deliveries: 32, roleCategory: 'Rider' },
            { name: 'Dindo Lopez', nickname: 'Dindo', role: 'Plant Op', designation: 'Hub Staff', phone: '0915 444 3322', messenger: 'dindo_plant_op', address: 'Bulua, CDO', tin: '111-222-333-000', sss: '33-1122334-8', philhealth: '12-112233445-1', pagibig: '1211-1111-2222', rate: '₱600/day', currentWeekTotal: '₱3,600', currentMonthTotal: '₱14,400', status: 'Active', avatar: 'DL', deliveries: 0, roleCategory: 'Hub Staff' },
            { name: 'Maria Santos', nickname: 'Maria', role: 'Admin', designation: 'Admin Officer', phone: '0919 111 2222', messenger: 'maria_admin', address: 'Gusa, CDO', tin: '444-555-666-000', sss: '33-4455667-8', philhealth: '12-445566778-1', pagibig: '1211-6666-7777', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'MS', deliveries: 0, roleCategory: 'Admin Officer' },
            { name: 'Lawrence Fernandez', nickname: 'Lawrence', role: 'Admin', designation: 'Admin Officer', phone: 'N/A', messenger: 'lawrence_admin', address: 'Lapasan, CDO', tin: 'N/A', sss: 'N/A', philhealth: 'N/A', pagibig: 'N/A', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'LA', deliveries: 0, roleCategory: 'Admin Officer' }
        ];
        admin.saveTeamMembers();
    }

    let adminHtml = '';
    let hubHtml = '';
    let ridersHtml = '';

    admin.teamMembersData.forEach(member => {
        if (!member || typeof member !== 'object') return; // Skip strings or nulls
        if (!member.name) member.name = 'Unknown Member'; // Bulletproof
        if (member.status === 'Archived') return;

        const isActive = member.status === 'Active';
        const statusColor = isActive ? '#22c55e' : '#ef4444';
        const toggleBtnLabel = isActive ? 'Deactivate' : 'Activate';
        const safeName = member.name.replace(/'/g, "\\'");
        const displayNickname = member.nickname || member.name.split(' ')[0] || 'Unknown';

        const cardHtml = `
            <div class="rider-card" onclick="openTeamDrawer('${safeName}')" style="cursor: pointer; opacity: ${isActive ? '1' : '0.6'};">
                <div class="rider-avatar" style="background: ${isActive ? '#3b82f6' : '#64748b'};">${member.avatar || '?'}</div>
                <div class="rider-info">
                    <h4 style="margin: 0; font-size: 1rem;">${displayNickname}</h4>
                    <p style="color: #64748b; font-size: 0.8rem; margin: 4px 0;">💼 ${member.designation || member.role || 'Staff'}</p>
                </div>
                <label class="status-toggle" onclick="event.stopPropagation();">
                    <input type="checkbox" ${isActive ? 'checked' : ''} onchange="admin.toggleMemberStatus('${safeName}', this)">
                    <span class="status-slider"></span>
                </label>
            </div>
        `;

        if (member.roleCategory === 'Admin Officer') adminHtml += cardHtml;
        else if (member.roleCategory === 'Hub Staff') hubHtml += cardHtml;
        else if (member.roleCategory === 'Rider') ridersHtml += cardHtml;
        else adminHtml += cardHtml; // Fallback
    });

    adminList.innerHTML = adminHtml || '<div style="text-align: center; color: #64748b; font-size: 0.8rem; padding: 20px; grid-column: 1 / -1;">No active admin officers.</div>';
    hubList.innerHTML = hubHtml || '<div style="text-align: center; color: #64748b; font-size: 0.8rem; padding: 20px; grid-column: 1 / -1;">No active hub staff.</div>';
    ridersList.innerHTML = ridersHtml || '<div style="text-align: center; color: #64748b; font-size: 0.8rem; padding: 20px; grid-column: 1 / -1;">No active riders.</div>';
    
    // Update Vault List too
    const vaultList = document.getElementById('payroll-vault-list');
    if (vaultList) {
        vaultList.innerHTML = admin.teamMembersData.map(m => {
            if (m.status === 'Archived') return '';
            return `
            <div class="order-row">
                <div style="flex: 1;">${m.name}</div>
                <div style="flex: 1; text-align: center;">${m.roleCategory}</div>
                <div style="flex: 1; text-align: right; color: #22c55e;">${m.currentWeekTotal}</div>
            </div>`;
        }).join('');
    }
};

admin.showAddTeamMemberOverlay = function(roleCategory) {
    const name = prompt(`Enter name for new ${roleCategory}:`);
    if (name) {
        admin.teamMembersData.push({
            name: name,
            role: roleCategory,
            designation: roleCategory,
            phone: 'N/A',
            messenger: 'N/A',
            address: 'N/A',
            tin: 'N/A',
            sss: 'N/A',
            philhealth: 'N/A',
            pagibig: 'N/A',
            rate: 'TBD',
            currentWeekTotal: '₱0',
            currentMonthTotal: '₱0',
            status: 'Active',
            avatar: name.substring(0, 2).toUpperCase(),
            deliveries: 0,
            roleCategory: roleCategory
        });
        admin.saveTeamMembers();
        admin.renderTeamCards();
        if (typeof admin.showToast === 'function') admin.showToast('Member added successfully!', 'success');
    }
};

admin.toggleMemberStatus = function(name, checkboxEl) {
    const member = admin.teamMembersData.find(m => m.name === name);
    if (member) {
        const action = member.status === 'Active' ? 'deactivate' : 'activate';
        if (confirm(`Are you sure you want to ${action} ${member.nickname || member.name.split(' ')[0]}?`)) {
            member.status = member.status === 'Active' ? 'Inactive' : 'Active';
            admin.saveTeamMembers();
            admin.renderTeamCards();
            if (typeof admin.showToast === 'function') {
                admin.showToast(`${member.nickname || member.name.split(' ')[0]} has been ${member.status.toLowerCase()}d.`, 'success');
            }
        } else {
            if (checkboxEl) {
                checkboxEl.checked = !checkboxEl.checked;
            }
        }
    }
};

admin.archiveTeamMember = function() {
    const name = document.getElementById('drawer-team-name').innerText;
    if (confirm(`Are you sure you want to archive ${name}?`)) {
        const member = admin.teamMembersData.find(m => m.name === name);
        if (member) {
            member.status = 'Archived';
            admin.saveTeamMembers();
            admin.renderTeamCards();
            closeTeamDrawer();
            if (typeof admin.showToast === 'function') admin.showToast(`${name} has been archived.`, 'info');
        }
    }
};

admin.showTeamMemberQR = function() {
    const name = document.getElementById('drawer-team-name').innerText;
    admin.showRiderQR(name, 'QR Codes for ' + name);
};

admin.updateAttendanceSummary = function(filterType) {
    const presentBar = document.getElementById('attendance-present-bar');
    const absentBar = document.getElementById('attendance-absent-bar');
    const presentStat = document.getElementById('attendance-present-stat');
    const absentStat = document.getElementById('attendance-absent-stat');
    
    if (filterType === 'daily') {
        presentBar.style.width = '100%'; absentBar.style.width = '0%';
        presentStat.innerText = '3/3 (100%)'; absentStat.innerText = '0';
    } else if (filterType === 'weekly') {
        presentBar.style.width = '90%'; absentBar.style.width = '10%';
        presentStat.innerText = '18/20 (90%)'; absentStat.innerText = '2';
    } else if (filterType === 'monthly') {
        presentBar.style.width = '85%'; absentBar.style.width = '15%';
        presentStat.innerText = '72/85 (85%)'; absentStat.innerText = '13';
    }
};

function openTeamDrawer(name) {
    const member = admin.teamMembersData.find(m => m.name === name);
    if (!member) return;

    admin.currentDrawerMemberName = member.name;
    admin.isEditingTeamMember = false; // Reset edit state
    
    // Reset edit button visually just in case
    const editBtn = document.getElementById('edit-team-btn');
    if (editBtn) {
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit`;
        editBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        editBtn.style.color = '#e2e8f0';
        editBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        
        ['drawer-team-name', 'drawer-team-nickname', 'drawer-team-designation', 'drawer-team-phone', 'drawer-team-messenger', 'drawer-team-address', 'drawer-team-tin', 'drawer-team-sss', 'drawer-team-philhealth', 'drawer-team-pagibig', 'drawer-team-rate'].forEach(id => {
            const el = document.getElementById(id);
            if(el) { el.contentEditable = "false"; el.style.borderBottom = "none"; el.style.padding = "0"; }
        });
    }

    document.getElementById('drawer-team-name').innerText = member.name;
    document.getElementById('drawer-team-nickname').innerText = member.nickname || member.name.split(' ')[0];
    document.getElementById('drawer-team-designation').innerText = member.designation;
    document.getElementById('drawer-team-photo').innerText = member.avatar;
    
    const statusColor = member.status === 'Active' ? '#22c55e' : (member.status === 'Inactive' ? '#ef4444' : '#64748b');
    document.getElementById('drawer-team-status').innerHTML = `<span style="color: ${statusColor};">● ${member.status}</span>`;

    document.getElementById('drawer-team-phone').innerText = member.phone;
    document.getElementById('drawer-team-messenger').innerText = member.messenger;
    document.getElementById('drawer-team-address').innerText = member.address;
    
    document.getElementById('drawer-team-tin').innerText = member.tin;
    document.getElementById('drawer-team-sss').innerText = member.sss;
    document.getElementById('drawer-team-philhealth').innerText = member.philhealth;
    document.getElementById('drawer-team-pagibig').innerText = member.pagibig;
    
    document.getElementById('drawer-team-rate').innerText = member.rate;
    document.getElementById('drawer-team-week-pay').innerText = member.currentWeekTotal;
    document.getElementById('drawer-team-month-pay').innerText = member.currentMonthTotal;

    // Mock attendance history specific to drawer
    const attendanceHtml = `
        <div class="history-row"><span>Today</span><span>08:00 AM</span><span>05:00 PM</span><span style="color:#22c55e">Present</span></div>
        <div class="history-row"><span>Yesterday</span><span>08:15 AM</span><span>05:30 PM</span><span style="color:#eab308">Late</span></div>
        <div class="history-row"><span>2 days ago</span><span>08:00 AM</span><span>05:00 PM</span><span style="color:#22c55e">Present</span></div>
    `;
    document.getElementById('drawer-team-attendance').innerHTML = attendanceHtml;

    document.getElementById('team-drawer-overlay').style.display = 'block';
    setTimeout(() => {
        document.getElementById('team-drawer').style.right = '0';
        
        // Initialize Map
        if (!admin.teamMap) {
            admin.teamMap = L.map('drawer-team-map', { zoomControl: false }).setView([8.4822, 124.6469], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(admin.teamMap);
            admin.teamMapMarker = L.marker([8.4822, 124.6469]).addTo(admin.teamMap);
        }
        
        setTimeout(() => {
            if(admin.teamMap) admin.teamMap.invalidateSize();
        }, 350); // wait for drawer animation to finish
    }, 10);
}

function closeTeamDrawer() {
    document.getElementById('team-drawer').style.right = '-450px';
    setTimeout(() => {
        document.getElementById('team-drawer-overlay').style.display = 'none';
    }, 300);
}

// Ensure cards are rendered on initial load if we switch to team tab
document.addEventListener('DOMContentLoaded', () => {
    // Initial Render of Team Cards
    setTimeout(() => admin.renderTeamCards(), 1000); // Give admin init some time
});

// Intercept admin.switchView to render team cards specifically when viewing team tab
const originalSwitchView = admin.switchView;
if (originalSwitchView) {
    admin.switchView = function(viewId) {
        originalSwitchView.call(admin, viewId);
        if (viewId === 'team') {
            admin.renderTeamCards();
        }
    };
}

admin.isEditingTeamMember = false;
admin.currentDrawerMemberName = '';

admin.toggleEditTeamMember = function() {
    admin.isEditingTeamMember = !admin.isEditingTeamMember;
    const editableFields = ['drawer-team-nickname', 'drawer-team-designation', 'drawer-team-phone', 'drawer-team-messenger', 'drawer-team-address', 'drawer-team-tin', 'drawer-team-sss', 'drawer-team-philhealth', 'drawer-team-pagibig', 'drawer-team-rate'];
    
    const editBtn = document.getElementById('edit-team-btn');
    const nameEl = document.getElementById('drawer-team-name');
    
    if (admin.isEditingTeamMember) {
        // Switch to input mode
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save`;
        editBtn.style.background = 'rgba(34, 197, 94, 0.1)';
        editBtn.style.color = '#22c55e';
        editBtn.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        
        nameEl.contentEditable = "true";
        nameEl.style.borderBottom = "1px solid #3b82f6";
        nameEl.style.outline = "none";
        
        editableFields.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.contentEditable = "true";
                el.style.borderBottom = "1px solid #3b82f6";
                el.style.outline = "none";
                el.style.padding = "2px 4px";
            }
        });
    } else {
        // Save mode
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit`;
        editBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        editBtn.style.color = '#e2e8f0';
        editBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        
        nameEl.contentEditable = "false";
        nameEl.style.borderBottom = "none";
        
        editableFields.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.contentEditable = "false";
                el.style.borderBottom = "none";
                el.style.padding = "0";
            }
        });
        
        // Save changes
        const currentName = nameEl.innerText.trim();
        const member = admin.teamMembersData.find(m => m.name === admin.currentDrawerMemberName);
        if (member) {
            member.name = currentName;
            member.nickname = document.getElementById('drawer-team-nickname').innerText.trim();
            member.designation = document.getElementById('drawer-team-designation').innerText.trim();
            member.phone = document.getElementById('drawer-team-phone').innerText.trim();
            member.messenger = document.getElementById('drawer-team-messenger').innerText.trim();
            member.address = document.getElementById('drawer-team-address').innerText.trim();
            member.tin = document.getElementById('drawer-team-tin').innerText.trim();
            member.sss = document.getElementById('drawer-team-sss').innerText.trim();
            member.philhealth = document.getElementById('drawer-team-philhealth').innerText.trim();
            member.pagibig = document.getElementById('drawer-team-pagibig').innerText.trim();
            member.rate = document.getElementById('drawer-team-rate').innerText.trim();
            
            // If name changed, we need to update the drawer's state reference
            admin.currentDrawerMemberName = currentName;
            admin.saveTeamMembers();
            admin.renderTeamCards();
        }
    }
}

admin.renderPaymentVerification = function(orders) {
    const listEl = document.getElementById('receipt-list');
    if (!listEl) return;
    
    const pendingOrders = orders.filter(o => {
        const method = (o.payment_method || '').toLowerCase();
        const isOnline = method.includes('gcash') || method.includes('online') || method.includes('bank') || method.includes('po') || method.includes('purchase order') || method.includes('wallet') || method.includes('topup');
        const isPending = o.verification_status !== 'verified' && o.verification_status !== 'flagged';
        return isOnline && isPending;
    });
    
    if (pendingOrders.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: #64748b; padding: 10px; font-size: 0.7rem;">Queue is empty</div>';
        return;
    }
    
    listEl.innerHTML = pendingOrders.map(o => {
        let imgSrc = o.payment_screenshot;
        if (!imgSrc && o.order_id === '#IQ-85251') {
            imgSrc = './assets/mock_gcash_receipt.png';
        } else if (!imgSrc) {
            imgSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBhdGggZD0iTTIxIDE1bC01LTVMNCAxNCIvPjwvc3ZnPg==';
        }
        
        return `
        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div style="display: flex; gap: 10px; align-items: center;">
                <img src="${imgSrc}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);" onclick="admin.openPhotoModal('${imgSrc}', '${o.order_id}')" alt="Screenshot">
                <div>
                    <div style="font-size: 0.8rem; font-weight: 700; color: white;">${o.order_id}</div>
                    <div style="font-size: 0.7rem; color: #94a3b8;">${o.customer_name || 'Customer'} - ₱${o.total_price}</div>
                    <div style="font-size: 0.6rem; color: #3b82f6; text-transform: uppercase;">${o.payment_method || 'ONLINE'}</div>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <button onclick="admin.verifyPayment('${o.order_id}')" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 0.65rem; cursor: pointer; font-weight: 600;">VERIFY</button>
                <button onclick="admin.flagPayment('${o.order_id}')" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 0.65rem; cursor: pointer; font-weight: 600;">FLAG</button>
            </div>
        </div>
        `;
    }).join('');
};

admin.verifyPayment = function(orderId) {
    if (!confirm('Mark payment as verified?')) return;
    
    const order = admin.allOrders.find(o => o.order_id === orderId);
    if (order) {
        order.verification_status = 'verified';
        
        // Update in localStorage
        const localOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const idx = localOrders.findIndex(o => o.order_id === orderId);
        if (idx !== -1) {
            localOrders[idx].verification_status = 'verified';
            localStorage.setItem('ice_orders', JSON.stringify(localOrders));
        }
        
        // Force sync if cloud sync exists
        if (window.IceQubeSync) {
            window.IceQubeSync.syncLocalToCloud(localOrders);
        }
        
        // Re-render
        admin.updateDashboardUI(admin.allOrders);
    }
};

admin.flagPayment = function(orderId) {
    if (!confirm('Flag payment and move to archive for investigation?')) return;
    
    const order = admin.allOrders.find(o => o.order_id === orderId);
    if (order) {
        order.verification_status = 'flagged';
        
        // Update in localStorage
        const localOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const idx = localOrders.findIndex(o => o.order_id === orderId);
        if (idx !== -1) {
            localOrders[idx].verification_status = 'flagged';
            localStorage.setItem('ice_orders', JSON.stringify(localOrders));
        }
        
        // Add to flagged archive
        const archive = JSON.parse(localStorage.getItem('ice_flagged_payments') || '[]');
        const archiveIdx = archive.findIndex(o => o.order_id === orderId);
        if (archiveIdx === -1) {
            archive.push({ ...order, flagged_at: new Date().toISOString() });
            localStorage.setItem('ice_flagged_payments', JSON.stringify(archive));
        }
        
        // Force sync if cloud sync exists
        if (window.IceQubeSync) {
            window.IceQubeSync.syncLocalToCloud(localOrders);
        }
        
        // Re-render
        admin.updateDashboardUI(admin.allOrders);
    }
};

admin.openFlaggedArchive = function() {
    const archive = JSON.parse(localStorage.getItem('ice_flagged_payments') || '[]');
    const listEl = document.getElementById('flagged-archive-list');
    
    if (archive.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: #64748b; padding: 10px;">Archive is empty</div>';
    } else {
        listEl.innerHTML = archive.map(o => `
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <img src="${o.payment_screenshot}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);" onclick="admin.openPhotoModal('${o.payment_screenshot}', '${o.order_id}')" alt="Screenshot">
                    <div>
                        <div style="font-size: 0.8rem; font-weight: 700; color: white;">${o.order_id} <span style="font-size: 0.6rem; background: #ef4444; color: white; padding: 2px 4px; border-radius: 4px; margin-left: 4px;">FLAGGED</span></div>
                        <div style="font-size: 0.7rem; color: #94a3b8;">${o.customer_name || 'Customer'} - ₱${o.total_price}</div>
                        <div style="font-size: 0.6rem; color: #3b82f6; text-transform: uppercase;">${o.payment}</div>
                        <div style="font-size: 0.6rem; color: #64748b;">Flagged on: ${new Date(o.flagged_at).toLocaleString()}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('modal-flagged-archive').classList.add('active');
};
