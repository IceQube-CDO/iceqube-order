// SUPABASE_CONFIG is provided by js/app_header.js
if (typeof SUPABASE_CONFIG === 'undefined') {
    var SUPABASE_CONFIG = { URL: '', ANON_KEY: '' };
}
if (typeof MESSENGER_CONFIG === 'undefined') {
    var MESSENGER_CONFIG = { PAGE_ACCESS_TOKEN: '', RECIPIENT_ID: '' };
}

var admin = {
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
            perKmRate: 10,
            freeThreshold: 0 // 0 means no free delivery by default
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
                    localStorage.setItem('ice_cashflow', JSON.stringify(realCashflow));

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
            localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
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
                    perKmRate: 10,
                    freeThreshold: 0
                }
            };
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

            // --- NEW: AUTOMATIC MESSENGER NOTIFICATION ---
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
            localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
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
                localStorage.setItem('iceqube_vacation_mode', this.vacationMode);
                
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

    async sendMessengerNotification(orderInput) {
        let order = orderInput;
        
        // If passed an ID, look it up in the cache
        if (typeof orderInput === 'string') {
            order = (this.lastFetchedOrders || []).find(o => o.order_id === orderInput);
        }

        if (!order || !order.customer_name || !order.order_id) return;
        
        // --- 1. DE-DUPLICATION CHECK ---
        if (!this.notifiedOrders) this.notifiedOrders = new Set();
        if (this.notifiedOrders.has(order.order_id)) {
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
                if (text === 'Idle' || text.includes('Success')) {
                    setTimeout(() => {
                        if (statusText.innerText.includes('Idle') || statusText.innerText.includes('Success')) {
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
        const profile = directory[order.customer_name];
        
        const targetId = (profile && profile.messengerId) || (order.messenger_id || order.messengerId) || null;
        const ADMIN_PSID = "26521276764196410";
        
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
        const heavyLoad = Number(order.heavy_load_fee || 0);
        const discount = Number(order.discount || 0);
        
        // Calculate Subtotal (Items only)
        const subtotal = totalGross - deliveryFee - heavyLoad;
        // Customer Total (Items + Delivery - Discount)
        const customerTotal = subtotal + deliveryFee - discount;
        
        let msg = `❄️ ICEQUBE ORDER CONFIRMED!\n\n` +
                    `Deliver to: ${order.customer_name}\n` +
                    `Item: ${itemsText}\n` +
                    `Subtotal: ₱${subtotal.toLocaleString()}\n`;
        
        // Only show discount if it exists
        if (discount > 0) {
            msg += `Discount: ₱${discount.toLocaleString()}\n`;
        }
 
        msg += `Delivery fee: ₱${deliveryFee.toLocaleString()}\n` +
               `Total: ₱${customerTotal.toLocaleString()}\n` +
               `Payment: ${order.payment_method || 'Cash'}\n\n` +
               `Thank you for your order!`;
 
        try {
            // THE DEFINITIVE BYPASS: Hidden Form with Correct Endpoint
            const bridgeContainer = document.getElementById('hidden-bridge');
            if (bridgeContainer) {
                // --- 1. DISPATCH TO CUSTOMER ---
                // Send only if customer has a valid, non-Admin PSID
                if (targetId && targetId !== ADMIN_PSID) {
                    const custFormId = `msg-form-cust-${Date.now()}`;
                    const custFrameId = `msg-frame-cust-${Date.now()}`;
                    
                    const custDiv = document.createElement('div');
                    custDiv.innerHTML = `
                        <iframe name="${custFrameId}" id="${custFrameId}"></iframe>
                        <form id="${custFormId}" action="${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook?apikey=${SUPABASE_CONFIG.ANON_KEY}" method="POST" target="${custFrameId}">
                            <input type="hidden" name="recipientId" value="${targetId}">
                            <input type="hidden" name="message" value="${msg.replace(/"/g, '&quot;')}">
                        </form>
                    `;
                    bridgeContainer.appendChild(custDiv);
                    document.getElementById(custFormId).submit();
                    console.log('📡 [Messenger] Customer Receipt Sent to:', targetId);
                } else {
                    console.log('ℹ️ [Messenger] No registered customer PSID found. Skipping direct customer receipt.');
                }
 
                // --- 2. ALWAYS DISPATCH COPY of receipt to Admin/Business account ---
                const adminReceiptFormId = `msg-form-admin-receipt-${Date.now()}`;
                const adminReceiptFrameId = `msg-frame-admin-receipt-${Date.now()}`;
                
                const adminReceiptDiv = document.createElement('div');
                adminReceiptDiv.innerHTML = `
                    <iframe name="${adminReceiptFrameId}" id="${adminReceiptFrameId}"></iframe>
                    <form id="${adminReceiptFormId}" action="${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook?apikey=${SUPABASE_CONFIG.ANON_KEY}" method="POST" target="${adminReceiptFrameId}">
                        <input type="hidden" name="recipientId" value="${ADMIN_PSID}">
                        <input type="hidden" name="message" value="${msg.replace(/"/g, '&quot;')}">
                    </form>
                `;
                bridgeContainer.appendChild(adminReceiptDiv);
                setTimeout(() => {
                    const frm = document.getElementById(adminReceiptFormId);
                    if (frm) frm.submit();
                    console.log('📡 [Messenger] Copy of Receipt Sent to Admin.');
                }, 400);
 
                // --- 3. DISPATCH ADMIN ALERT (🚨 NEW ORDER ALERT!) TO ADMIN ---
                // ONLY send alert if the customer is NOT the admin themselves
                if (targetId !== ADMIN_PSID) {
                    const adminMsg = `🚨 NEW ORDER ALERT!\n\n` +
                                     `Deliver to: ${order.customer_name}\n` +
                                     `Item: ${itemsText}\n` +
                                     `Total: ₱${customerTotal.toLocaleString()}\n` +
                                     `Payment: ${order.payment_method || 'Cash'}\n\n` +
                                     `Check the Control Room!`;
                    
                    const adminFormId = `msg-form-admin-${Date.now()}`;
                    const adminFrameId = `msg-frame-admin-${Date.now()}`;
                    
                    const adminDiv = document.createElement('div');
                    adminDiv.innerHTML = `
                        <iframe name="${adminFrameId}" id="${adminFrameId}"></iframe>
                        <form id="${adminFormId}" action="${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook?apikey=${SUPABASE_CONFIG.ANON_KEY}" method="POST" target="${adminFrameId}">
                            <input type="hidden" name="recipientId" value="${ADMIN_PSID}">
                            <input type="hidden" name="message" value="${adminMsg.replace(/"/g, '&quot;')}">
                        </form>
                    `;
                    
                    bridgeContainer.appendChild(adminDiv);
                    setTimeout(() => {
                        const frm = document.getElementById(adminFormId);
                        if (frm) frm.submit();
                        console.log('📡 [Messenger] Admin Buzzer Alert Sent.');
                    }, 800);
                }
 
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
        console.log("🧪 Diagnostic: Sending to 26521276764196410");
        this.sendMessengerNotification({
            order_id: "TEST-SYNC",
            customer_name: "Admin",
            messenger_id: "26521276764196410"
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
            orders = (orders || []).filter(o => o.order_id !== 'CONFIG_PRICING_MATRIX');
            console.log(`✅ Received ${orders.length} business orders from Supabase.`);
            
            if (badge) {
                badge.style.background = 'rgba(34, 197, 94, 0.1)';
                badge.style.color = '#22c55e';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                badge.innerHTML = '<span id="cloud-dot" style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></span> CLOUD LIVE';
            }

            // Merge cloud data with local data
            const localOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
            const cloudOrders = (orders || []).filter(o => o.order_id && o.order_id !== 'CONFIG_PRICING_MATRIX');
            
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

                    // 1. Always trigger notification for very recent orders (even on initial load)
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
        const pending = orders.filter(o => o.delivery_status === 'Pending' || o.delivery_status === 'Awaiting Acceptance').length;
        const dispatched = orders.filter(o => o.delivery_status === 'Dispatched').length;
        const delivered = orders.filter(o => o.delivery_status === 'Delivered').length;
        
        const revenue = orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
        const revenueEl = document.getElementById('ops-revenue') || document.querySelector('.metric-value');
        if (revenueEl) revenueEl.innerText = `₱${revenue.toLocaleString()}`;
        
        // 3. Bags Calculation
        let bags = 0;
        orders.forEach(o => {
            if (o.items) {
                const items = this.parseItems(o.items);
                const fd = items.fullDice || {};
                const hd = items.halfDice || {};
                bags += (parseFloat(fd['3kg']) || 0) + (parseFloat(fd['1kg']) || 0) + 
                        (parseFloat(hd['3kg']) || 0) + (parseFloat(hd['1kg']) || 0);
            }
        });
        const bagsEl = document.getElementById('ops-bags');
        if (bagsEl) {
            bagsEl.innerText = bags;
        } else {
            const metricValues = document.querySelectorAll('.cc-card .metric-value');
            if (metricValues.length >= 2) metricValues[1].innerText = bags;
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
        const feed = document.querySelector('.feed-list');
        if (!feed) return;
        
        if (orders.length === 0) {
            feed.innerHTML = '<div class="feed-item"><div class="feed-content"><p>No orders recorded today.</p></div></div>';
            return;
        }

        const eliteList = JSON.parse(localStorage.getItem('iceqube_elite_customers') || '[]');

        feed.innerHTML = orders.slice(0, 5).map(o => {
            const isElite = eliteList.includes(o.customer_name) || o.account_type === 'Elite';
            return `
                <div class="feed-item" style="${isElite ? 'border-left: 3px solid #eab308;' : ''}">
                    <div class="feed-time">${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div class="feed-content">
                        <p>
                            <strong>Order ${o.order_id}</strong> - ${o.customer_name}
                            ${isElite ? '<span style="background: #eab308; color: #000; padding: 1px 4px; border-radius: 3px; font-size: 0.55rem; font-weight: 900; margin-left: 4px;">ELITE</span>' : ''}
                        </p>
                        <small>
                            ${o.payment_method} • ₱${o.total_price}
                        </small>
                    </div>
                </div>
            `;
        }).join('');
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
        
        const ADMIN_PSID = "26521276764196410";
        const msg = `🚨 NEW CUSTOMER SUPPORT ISSUE!\n\n` +
                    `Customer: ${complaint.customerName}\n` +
                    `Issue: ${complaint.issueType}\n` +
                    `Details: ${complaint.description || 'No description provided.'}\n\n` +
                    `Check the Control Room complaints ledger!`;
                    
        try {
            const bridgeContainer = document.getElementById('hidden-bridge');
            if (bridgeContainer) {
                const formId = `msg-form-complaint-${Date.now()}`;
                const frameId = `msg-frame-complaint-${Date.now()}`;
                
                const div = document.createElement('div');
                div.innerHTML = `
                    <iframe name="${frameId}" id="${frameId}"></iframe>
                    <form id="${formId}" action="${SUPABASE_CONFIG.URL}/functions/v1/messenger-webhook?apikey=${SUPABASE_CONFIG.ANON_KEY}" method="POST" target="${frameId}">
                        <input type="hidden" name="recipientId" value="${ADMIN_PSID}">
                        <input type="hidden" name="message" value="${msg.replace(/"/g, '&quot;')}">
                    </form>
                `;
                bridgeContainer.appendChild(div);
                document.getElementById(formId).submit();
                console.log('📡 [Messenger] Customer Support Notification Sent to Admin.');
            }
        } catch (error) {
            console.error('❌ [Messenger] Support notification failed:', error);
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
            const isElite = Array.isArray(eliteList) && (eliteList.includes(order.customer_name) || order.account_type === 'Elite');
            
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
            const totalVal = parseMoney(order.total_price);
            let discount = parseMoney(order.discount_total);
            let subtotalVal = parseMoney(order.subtotal);

            // --- SMART DERIVATION FALLBACK ---
            if (discount === 0 && (this.customerData || localStorage.getItem('iceqube_customer_discounts'))) {
                const discounts = JSON.parse(localStorage.getItem('iceqube_customer_discounts') || '{}');
                const custName = order.customer_name || '';
                const expectedSubtotal = itemEntries.reduce((sum, item) => sum + (item.qty * item.price), 0);
                const actualPaidSubtotal = totalVal - delivery;

                if (expectedSubtotal > actualPaidSubtotal && actualPaidSubtotal > 0) {
                    discount = expectedSubtotal - actualPaidSubtotal;
                    subtotalVal = expectedSubtotal;
                }
            }

            if (subtotalVal === 0) {
                subtotalVal = totalVal - delivery + discount;
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
                const unitPrice = item.price;
                let lineTotal = qty * unitPrice;
                if (itemEntries.length === 1) lineTotal = subtotalVal;

                itemsHtml += `
                    <div class="receipt-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 8px; margin-bottom: 12px; align-items: center; font-family: 'Outfit', sans-serif;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; line-height: 1.2;">
                            ${item.name.split(' (')[0]}<br>
                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 500;">(${item.name.split(' (')[1]}</span>
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
            if (totalEl) totalEl.innerText = `₱${totalVal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            
            // Payment Tag Logic
            const methodEl = document.getElementById('receipt-payment-method');
            const iconEl = document.querySelector('.payment-tag .tag-icon');
            let method = order.payment_method || 'Cash on Delivery';
            let icon = '💵';
            
            if (method.toLowerCase().includes('purchase order') || method.toLowerCase().includes('po')) {
                method = 'Purchase Order';
                icon = '💳';
            } else if (method.toLowerCase().includes('gcash')) {
                icon = '📱';
            }
            
            if (methodEl) methodEl.innerText = method;
            if (iconEl) iconEl.innerText = icon;
            
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
            // COD Adjustment: Business only receives (Item Total - Priority Fee) 
            // because Delivery + Priority goes directly to the rider.
            if (o.payment_method === 'Cash on Delivery') {
                amount = Math.max(0, amount - (parseFloat(o.priority_fee) || 0));
            }
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
            const name = order.customer_name;
            if (!customers[name]) {
                const profile = profiles[name] || {};
                customers[name] = {
                    name: name,
                    address: profile.address || order.delivery_address || 'No Address Provided',
                    phone: profile.contactNumber || order.contact_number || order.customer_phone || 'No Phone provided',
                    contactPerson: profile.contactPerson || order.receiver_name || name,
                    totalRevenue: 0,
                    orders: [],
                    firstOrderDate: order.created_at,
                    lastOrderDate: order.created_at,
                    isElite: eliteList.includes(name)
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
        if (!tbody) return;

        // 1. Process Automatic Entries from Orders
        const autoEntries = orders.map(o => {
            let amount = parseFloat(o.total_price) || 0;
            // COD Adjustment: Business only receives (Item Total - Priority Fee) 
            // because Delivery + Priority goes directly to the rider.
            if (o.payment_method === 'Cash on Delivery') {
                amount = Math.max(0, amount - (parseFloat(o.priority_fee) || 0));
            }
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
        
        // 6. Render Rows
        tbody.innerHTML = filteredEntries.map(entry => {
            const amount = entry.amount || 0;
            if (entry.type === 'IN') totalIn += amount;
            else totalOut += amount;

            const timeStr = new Date(entry.timestamp).toLocaleString([], { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });

            return `
                <tr>
                    <td>${timeStr}</td>
                    <td>${entry.category}</td>
                    <td>${entry.description}</td>
                    <td><span class="type-badge ${entry.type === 'IN' ? 'type-in' : 'type-out'}">${entry.type}</span></td>
                    <td style="text-align: right; font-family: 'JetBrains Mono'; font-weight: 700;">₱${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
            const labels = { daily: 'Today', monthly: 'This Month', ytd: 'Year to Date' };
            labelEl.innerText = `Net Cashflow (${labels[this.cashflowFilter]})`;
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
        
        // Refresh view (re-fetch orders or just use current ones if possible)
        this.fetchRealStats(); 
    },

    deleteManualEntry(timestamp) {
        if (!confirm('Are you sure you want to delete this entry?')) return;
        this.manualEntries = this.manualEntries.filter(e => e.timestamp !== timestamp);
        this.saveManualEntries();
        this.fetchRealStats();
    },

    saveManualEntries() {
        localStorage.setItem('ice_cashflow', JSON.stringify(this.manualEntries));
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

            return `
                <tr style="${isAwaiting ? 'opacity: 0.7; background: rgba(245, 158, 11, 0.05);' : ''}">
                    <td>${displayTime}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent); cursor: pointer;" onclick="admin.toggleReceipt(true, '${o.order_id}')">${o.order_id} 📄</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <b style="font-size: 1rem; cursor: pointer; color: #0ea5e9; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px;" onclick="openCustomerDrawer('${o.customer_name.replace(/'/g, "\\'")}')">${o.customer_name}</b>
                                ${eliteList.includes(o.customer_name) || o.account_type === 'Elite' ? '<span style="background: #eab308; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">ELITE</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">
                        ${(o.delivery_lat && o.delivery_lng) ? `<a href="https://www.google.com/maps/dir/?api=1&origin=8.5020476,124.660855&destination=${o.delivery_lat},${o.delivery_lng}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px; display: block; margin-bottom: 4px;">${o.delivery_address || 'N/A'}</a>` : `<div style="margin-bottom: 4px;">${o.delivery_address || 'N/A'}</div>`}
                    </td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700;">₱${(Math.max(0, (parseFloat(o.total_price) || 0) - (parseFloat(o.delivery_fee) || 0) - (parseFloat(o.priority_fee) || 0))).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono';">₱${(parseFloat(o.delivery_fee) || 0).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: #94a3b8;">₱${(o.priority_fee || 0).toLocaleString()}</td>
                    <td>
                        <select class="status-select" onchange="admin.assignRider('${o.id || o.order_id}', this.value)">
                            ${ridersList.map(r => `<option value="${r}" ${o.rider === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
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
                        <button class="btn-dispatch" onclick="admin.dispatchOrder('${o.id || o.order_id}', '${o.rider || 'Unassigned'}', '${o.order_id}')">
                            ${isAwaiting ? 'Re-Dispatch' : 'Dispatch'}
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

            return `
                <tr>
                    <td>${displayTime}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent); cursor: pointer;" onclick="admin.toggleReceipt(true, '${o.order_id}')">${o.order_id} 📄</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <b style="font-size: 1rem; cursor: pointer; color: #0ea5e9; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px;" onclick="openCustomerDrawer('${o.customer_name.replace(/'/g, "\\'")}')">${o.customer_name}</b>
                                ${eliteList.includes(o.customer_name) || o.account_type === 'Elite' ? '<span style="background: #eab308; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">ELITE</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">
                        ${(o.delivery_lat && o.delivery_lng) ? `<a href="https://www.google.com/maps/dir/?api=1&origin=8.5020476,124.660855&destination=${o.delivery_lat},${o.delivery_lng}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #0ea5e9; text-underline-offset: 4px; display: block; margin-bottom: 4px;">${addr}</a>` : `<div style="margin-bottom: 4px;">${addr}</div>`}
                    </td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700;">₱${(Math.max(0, (parseFloat(o.total_price) || 0) - (parseFloat(o.delivery_fee) || 0) - (parseFloat(o.priority_fee) || 0))).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono'; color: #94a3b8;">₱${(parseFloat(o.delivery_fee) || 0).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono'; color: #64748b;">₱${(parseFloat(o.priority_fee) || 0).toLocaleString()}</td>
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
        localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));

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

        localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
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

        localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
        this.updateFiltrationUI();
        this.closeFilterModal();
    },

    resetFilterLife(id) {
        const idx = this.consumables.filtration.findIndex(f => f.id === id);
        if (idx > -1) {
            const item = this.consumables.filtration[idx];
            if (confirm(`Confirm replacement of ${item.name}? This will reset the lifespan countdown to today.`)) {
                item.purchaseDate = new Date().toISOString().split('T')[0];
                localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
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
        localStorage.setItem('iceqube_maintenance_logs', JSON.stringify(this.maintenanceLogs));

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
                    <td style="font-family: 'JetBrains Mono';">₱${log.cost.toLocaleString()}</td>
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
        localStorage.setItem('iceqube_assets', JSON.stringify(this.assets));
        
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
        localStorage.setItem('iceqube_assets', JSON.stringify(this.assets));
        
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
        localStorage.setItem('iceqube_utilities', JSON.stringify(this.utilities));

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
            localStorage.setItem('iceqube_utility_paid_dates', JSON.stringify(this.utilityPaidDates));
            
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
            localStorage.setItem('iceqube_utility_paid_dates', JSON.stringify(this.utilityPaidDates));

            this.updateUtilitiesUI();
            this.updateRentalUI();
        }
        
        localStorage.setItem('iceqube_utility_status', JSON.stringify(this.utilityStatus));
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
                
                localStorage.setItem('iceqube_utilities', JSON.stringify(this.utilities));
                localStorage.setItem('iceqube_utility_status', JSON.stringify(this.utilityStatus));
                localStorage.setItem('iceqube_utility_paid_dates', JSON.stringify(this.utilityPaidDates));
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
        const delKm = document.getElementById('m-del-km');
        const delFree = document.getElementById('m-del-free');
        if (delBase) delBase.value = this.pricingMatrix.delivery.baseFare || 30;
        if (delKm) delKm.value = this.pricingMatrix.delivery.perKmRate || 15;
        if (delFree) delFree.value = this.pricingMatrix.delivery.freeThreshold || 0;
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

        const newMatrix = {
            products: products,
            delivery: {
                baseFare: parseFloat(document.getElementById('m-del-base').value) || 0,
                perKmRate: parseFloat(document.getElementById('m-del-km').value) || 0,
                freeThreshold: parseFloat(document.getElementById('m-del-free').value) || 0
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
        localStorage.setItem('iceqube_rental', JSON.stringify(this.rental));

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
        localStorage.setItem('iceqube_rental', JSON.stringify(this.rental));

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
    } catch (e) {
        console.error('Fatal Initialization Error:', e);
    }
});

// Drawer Controls
function openCustomerDrawer(customerId) {
    try {
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
        const profile = profiles[customer.name] || {};

        const nameEl = document.getElementById('drawer-customer-name');
        if (nameEl) nameEl.innerText = customer.name || customerId;

        const addrEl = document.getElementById('drawer-customer-address');
        if (addrEl) addrEl.innerText = profile.address || customer.address || 'No Address';

        const contactEl = document.getElementById('drawer-contact-person');
        if (contactEl) contactEl.innerText = profile.contactPerson || customer.contactPerson || customer.name || customerId;

        const phoneEl = document.getElementById('drawer-phone');
        if (phoneEl) phoneEl.innerText = profile.contactNumber || customer.phone || 'N/A';
        
        // Load Discounts & Tier
        const discounts = JSON.parse(localStorage.getItem('iceqube_customer_discounts') || '{}');
        const custPricing = discounts[customer.name] || { percent: 0, fixed: 0, creditLimit: 0, tier: 'Standard' };
        
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
                historyHtml += `
                    <div class="history-row">
                        <span>${order.order_id}</span>
                        <span>₱${order.total_price}</span>
                        <span><span class="badge-resolved">${order.delivery_status || 'Completed'}</span></span>
                        <button class="btn-icon" onclick="admin.toggleReceipt(true, '${order.order_id}')">📄</button>
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
    const customerName = document.getElementById('drawer-customer-name').innerText;
    
    updateTierVisuals(tier);
    
    const creditInput = document.getElementById('drawer-credit-limit');
    const creditDisplay = document.getElementById('display-credit-limit');

    console.log(`[SYSTEM] Tier changing to ${tier} for ${customerName}`);

    // Update Elite status in memory if available
    if (admin.customerData) {
        const customer = admin.customerData.find(c => c.name === customerName);
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
