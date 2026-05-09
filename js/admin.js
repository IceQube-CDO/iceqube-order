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
    cashflowFilter: 'daily', 
    vacationMode: JSON.parse(localStorage.getItem('iceqube_vacation_mode') || 'false'),
    autoDispatchType: 'broadcast',
    _autoRefreshIntervalId: null,

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
                    const realOrders = orders.filter(o => o.is_real === true);
                    localStorage.setItem('ice_orders', JSON.stringify(realOrders));
                    console.log(`- Filtered Orders: ${realOrders.length} kept locally`);

                    const deliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
                    const realDeliveries = deliveries.filter(d => d.is_real === true);
                    localStorage.setItem('ice_deliveries', JSON.stringify(realDeliveries));

                    const cashflow = JSON.parse(localStorage.getItem('ice_cashflow') || '[]');
                    const realCashflow = cashflow.filter(c => c.is_real === true);
                    localStorage.setItem('ice_cashflow', JSON.stringify(realCashflow));

                    localStorage.removeItem('ice_messages');
                    localStorage.setItem('ice_system_purged', 'true');

                    // 2. Cloud Purge (If active)
                    if (SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
                        console.log('☁️ Attempting Cloud Purge (Orders where is_real is not true)...');
                        // Delete non-real orders from Supabase
                        const cloudResponse = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?or=(is_real.is.null,is_real.eq.false)`, {
                            method: 'DELETE',
                            headers: {
                                'apikey': SUPABASE_CONFIG.ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                            }
                        });
                        
                        if (!cloudResponse.ok) {
                            console.warn('⚠️ Cloud Purge partially failed (check if is_real column exists):', cloudResponse.status);
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

    showConfirmModal(title, message, onConfirm) {
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
        
        let currentStatus = false;
        if (localIdx > -1) {
            currentStatus = !!localData[localIdx].is_real;
        } else {
            const memoryItem = this.allOrders.find(o => (o.id || o.order_id) === id);
            if (memoryItem) currentStatus = !!memoryItem.is_real;
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

    init() {
        try {
            console.log('--- COMMAND CENTER INITIALIZED ---');
        
        // Data Migration/Validation for Consumables
        if (!this.consumables.packaging || !this.consumables.cleaning) {
            console.log('Migrating old consumables structure...');
            this.consumables = {
                packaging: [
                    { id: 'bags3kg', name: '3kg Bag', current: 4200, max: 10000, unit: 'pcs' },
                    { id: 'bags1kg', name: '1kg Bag', current: 1150, max: 5000, unit: 'pcs' },
                    { id: 'ecobag', name: 'Delivery Ecobag', current: 45, max: 100, unit: 'pcs' }
                ],
                cleaning: [
                    { id: 'sanitizer', name: 'Food Grade Sanitizer', current: 4.5, max: 10, unit: 'Liters' },
                    { id: 'descaler', name: 'Machine Descaler', current: 2, max: 5, unit: 'Bottles' }
                ]
            };
            localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));
        }


        // Purge button listener moved to onclick in HTML for robustness

        this.updateAlertCenter([]);
        this.startDataSync();
        this.updateConsumablesUI();
        this.updateMaintenanceUI();
        this.updateAssetsUI();
        this.updateUtilitiesUI();
        this.updateRentalUI();
        this.checkMonthlyReset();
        this.updateDates();

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
                }
            });

            window.IceQubeSync.onDeliveryEvent((event) => {
                if (event.type === 'DELIVERY_COMPLETED') {
                    console.log("🏁 [Admin] Delivery completed via Sync:", event.payload.orderId);
                    this.fetchRealStats(); // Refresh everything
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

    handleIncomingOrder(order) {
        if (!order || !order.order_id) return;
        
        const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const existingIdx = orders.findIndex(o => o.order_id === order.order_id);
        
        // If order is new OR it exists but hasn't had supplies deducted yet
        if (existingIdx === -1 || !orders[existingIdx].supplies_deducted) {
            console.log("📦 [Admin] Processing supplies for order:", order.order_id);
            
            if (existingIdx === -1) {
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

            this.showNotification(`New Order from ${order.customer_name}`, `${order.order_id}`);
            
            // AUTOMATIC DISPATCH TRIGGER
            if (this.vacationMode) {
                console.log("✈️ [Vacation Mode] Triggering Auto-Dispatch for:", order.order_id);
                setTimeout(() => {
                    this.autoDispatch(order);
                }, 2000);
            }

            this.fetchRealStats();
        } else {
            console.log("⏭️ [Admin] Order already processed for supplies:", order.order_id);
        }
    },

    deductPackagingSupplies(order) {
        if (!order || !order.items) return;

        const items = this.parseItems(order.items);
        const fd = items.fullDice || {};
        const hd = items.halfDice || {};

        const total3kg = (parseFloat(fd['3kg']) || 0) + (parseFloat(hd['3kg']) || 0);
        const total1kg = (parseFloat(fd['1kg']) || 0) + (parseFloat(hd['1kg']) || 0);

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

    updateVacationUI() {
        const btn = document.getElementById('vacation-btn');
        if (!btn) return;

        if (this.vacationMode) {
            btn.innerHTML = '<span class="vacation-dot active"></span> VACATION MODE ON';
            btn.classList.add('active');
        } else {
            btn.innerHTML = '<span class="vacation-dot"></span> VACATION MODE OFF';
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

    async startDataSync() {
        // Initial fetch
        await this.fetchRealStats();
        
        // Auto-refresh every 10 seconds for "real-time" feel without page reload
        if (this._syncIntervalId) clearInterval(this._syncIntervalId);
        this._syncIntervalId = setInterval(() => this.fetchRealStats(), 10000);
        
        // Add entrance animation
        this.animateCards();
    },

    async fetchRealStats() {
        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            console.log('Using mock data: Supabase not configured.');
            console.log("🛠️ DEVELOPMENT MODE: Using Mock Data (Live Sync Disabled)");
            this.renderMockStats();
            return;
        }

        // TODO: Real Supabase fetch logic here
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
            const orders = await response.json();
            console.log(`✅ Received ${orders.length} orders from Supabase.`);
            this.updateDashboardUI(orders);
        } catch (err) {
            console.warn('Live fetch failed, falling back to mock:', err);
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
        this.updateAlertCenter(orders);

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

        feed.innerHTML = orders.slice(0, 5).map(o => `
            <div class="feed-item">
                <div class="feed-time">${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div class="feed-content">
                    <p><strong>Order ${o.order_id}</strong> - ${o.customer_name}</p>
                    <small>${o.payment_method} • ₱${o.total_price}</small>
                </div>
            </div>
        `).join('');
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
        console.log(`🎨 Dashboard rendered with ${combinedOrders.length} orders (Purged Mode: ${isPurged}).`);
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
        const views = {
            ops: document.getElementById('ops-view'),
            customers: document.getElementById('customer-view'),
            team: document.getElementById('team-view'),
            assets: document.getElementById('assets-view'),
            consumables: document.getElementById('consumables-view'),
            finance: document.getElementById('finance-view'),
            cashflow: document.getElementById('cashflow-view'),
            orders: document.getElementById('orders-view')
        };
        
        // Update active tab styling in all tab containers
        document.querySelectorAll('.cc-tab').forEach(tab => {
            const onclick = tab.getAttribute('onclick');
            if (onclick && onclick.includes(`'${viewId}'`)) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        Object.keys(views).forEach(key => {
            if (views[key]) {
                if (key === viewId) {
                    views[key].style.display = views[key].classList.contains('cc-flex') ? 'flex' : 'grid';
                } else {
                    views[key].style.display = 'none';
                }
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
        if (viewId === 'consumables') this.updateConsumablesUI();
        if (viewId === 'finance') this.loadPnL('mtd');
        
        this.animateCards();
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
                                style="background: ${entry.is_real ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                       border: 1px solid ${entry.is_real ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                       color: ${entry.is_real ? '#22c55e' : '#64748b'}; 
                                       padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                            ${entry.is_real ? '🛡️ REAL' : '🧪 TEST'}
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

        // Use provided orders, or fallback to synced orders in localStorage
        let allOrders = (orders && orders.length > 0) ? [...orders] : JSON.parse(localStorage.getItem('ice_orders') || '[]');

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
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent);">${o.order_id}</td>
                    <td><b>${o.customer_name}</b></td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">${o.delivery_address || 'N/A'}</td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700;">₱${(parseFloat(o.total_price) || 0).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono';">₱${(o.delivery_fee || 0).toLocaleString()}</td>
                    <td>
                        <input type="number" class="status-select" style="width: 60px;" value="${o.priority_fee || 0}" 
                               onchange="admin.updatePriorityFee('${o.id || o.order_id}', this.value)">
                    </td>
                    <td>
                        <select class="status-select" onchange="admin.assignRider('${o.id || o.order_id}', this.value)">
                            ${ridersList.map(r => `<option value="${r}" ${o.rider === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </td>
                    <td style="text-align: right; display: flex; gap: 8px; align-items: center; justify-content: flex-end;">
                        <button onclick="admin.toggleRealStatus('order', '${o.id || o.order_id}')" 
                                style="background: ${o.is_real ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                       border: 1px solid ${o.is_real ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                       color: ${o.is_real ? '#22c55e' : '#64748b'}; 
                                       padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                            ${o.is_real ? '🛡️ REAL' : '🧪 TEST'}
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
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent);">${o.order_id}</td>
                    <td><b>${o.customer_name}</b></td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">${addr}</td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-size: 0.75rem; font-weight: 700; color: #f1f5f9;">${o.payment_method || 'Cash'}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700;">₱${(parseFloat(o.total_price) || 0).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono'; color: #94a3b8;">₱${(parseFloat(o.delivery_fee) || 0).toLocaleString()}</td>
                    <td>
                        <input type="number" class="status-select" style="width: 60px;" value="${o.priority_fee || 0}" 
                               onchange="admin.updatePriorityFee('${o.id || o.order_id}', this.value)">
                    </td>
                    <td style="text-align: center;">
                        <button onclick="admin.toggleRealStatus('order', '${o.id || o.order_id}')" 
                                style="background: ${o.is_real ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)'}; 
                                       border: 1px solid ${o.is_real ? '#22c55e' : 'rgba(255,255,255,0.1)'}; 
                                       color: ${o.is_real ? '#22c55e' : '#64748b'}; 
                                       padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 800;">
                            ${o.is_real ? '🛡️ REAL' : '🧪 TEST'}
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

    async updatePriorityFee(id, fee) {
        if (id.startsWith('mock')) {
            console.log(`Mock Priority Fee updated for ${id}: ₱${fee}`);
            return;
        }
        
        try {
            await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ priority_fee: parseFloat(fee) })
            });
            console.log('✅ Priority Fee Updated');
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
            return '1 Bag';
        }
        console.log(`🔍 Formatting items for ${o.order_id}:`, o.items);
        const items = this.parseItems(o.items);
        
        // If we have a raw string from fallback
        if (items.raw) {
            if (items.raw.includes(',')) {
                return items.raw.split(',').map(s => s.trim()).join('<br>');
            }
            return items.raw.includes('Bag') ? items.raw : `${items.raw} Bags`;
        }

        const fd = items.fullDice || {};
        const hd = items.halfDice || {};
        const parts = [];
        
        if (fd['3kg']) parts.push(`${fd['3kg']} bags - 3kg (Full Dice)`);
        if (fd['1kg']) parts.push(`${fd['1kg']} bags - 1kg (Full Dice)`);
        if (hd['3kg']) parts.push(`${hd['3kg']} bags - 3kg (Half Dice)`);
        if (hd['1kg']) parts.push(`${hd['1kg']} bags - 1kg (Half Dice)`);
        
        return parts.length > 0 ? parts.join('<br>') : (typeof o.items === 'object' ? '1 Bag' : o.items);
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
            await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${id}`, {
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
            const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${id}`, {
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
                // Bin-style rendering for packaging (Label below)
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; flex-shrink: 0;">
                        <div class="dynamic-bin" onclick="admin.showRestockModal('${item.id}')" title="Click to Restock">
                            <div class="bin-fill" style="height: ${percent}%; background: ${color};"></div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.1rem; font-weight: 800; color: #f8fafc; white-space: nowrap; margin-bottom: 4px;">${item.name}</div>
                            <div style="font-size: 0.9rem; color: #94a3b8; line-height: 1.3;">
                                <span style="color: #f8fafc; font-weight: 900; font-size: 1.2rem;">${item.current.toLocaleString()}</span><br>
                                <span style="font-size: 0.75rem; opacity: 0.8;">pcs left of ${item.max.toLocaleString()}</span>
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

document.addEventListener('DOMContentLoaded', () => {
    try {
        admin.init();
    } catch (e) {
        console.error('Fatal Initialization Error:', e);
    }
});

// Drawer Controls
function openCustomerDrawer(customerId) {
    // In a real app, you would fetch the customer data from Supabase using customerId here
    // and populate the HTML fields dynamically before opening the drawer.
    
    // Update content based on customer (mock logic)
    document.getElementById('drawer-customer-name').innerText = customerId;
    if (customerId === 'Loft Living CDO') {
        document.getElementById('drawer-customer-address').innerText = 'Premium Partner • Macabalan, CDO';
        document.getElementById('drawer-contact-person').innerText = 'Ian';
        document.getElementById('drawer-phone').innerText = '+63 917 123 4567';
        document.getElementById('elite-toggle').checked = true;
        document.getElementById('drawer-clv').innerText = '₱385,200';
        document.getElementById('drawer-frequency').innerText = 'Every 1.8 days';
        document.getElementById('drawer-churn-alert').style.display = 'none';
    } else if (customerId === 'Fat Monk Coffee') {
        document.getElementById('drawer-customer-address').innerText = 'Standard Account • Uptown CDO';
        document.getElementById('drawer-contact-person').innerText = 'Sarah';
        document.getElementById('drawer-phone').innerText = '+63 918 555 1234';
        document.getElementById('elite-toggle').checked = false;
        document.getElementById('drawer-clv').innerText = '₱142,500';
        document.getElementById('drawer-frequency').innerText = 'Every 3.1 days';
        document.getElementById('drawer-churn-alert').style.display = 'none';
    } else if (customerId === 'The Backyard Grill') {
        document.getElementById('drawer-customer-address').innerText = 'Standard Account • Kauswagan, CDO';
        document.getElementById('drawer-contact-person').innerText = 'Chef Mike';
        document.getElementById('drawer-phone').innerText = '+63 915 777 8888';
        document.getElementById('elite-toggle').checked = false;
        document.getElementById('drawer-clv').innerText = '₱42,800';
        document.getElementById('drawer-frequency').innerText = 'Every 5.2 days (Slowing)';
        document.getElementById('drawer-churn-alert').style.display = 'flex';
    }

    document.getElementById('customer-drawer-overlay').style.display = 'block';
    // Small timeout ensures the display block renders before the CSS transition fires
    setTimeout(() => {
        document.getElementById('customer-drawer').classList.add('open');
    }, 10);
}

function closeCustomerDrawer() {
    document.getElementById('customer-drawer').classList.remove('open');
    // Wait for slide animation to finish before hiding overlay
    setTimeout(() => {
        document.getElementById('customer-drawer-overlay').style.display = 'none';
    }, 300);
}

// Elite Toggle Logic
function toggleEliteStatus() {
    const isElite = document.getElementById('elite-toggle').checked;
    const customerName = document.getElementById('drawer-customer-name').innerText;
    
    if (isElite) {
        console.log(`[SYSTEM] Upgrading ${customerName} to ELITE TIER.`);
        // Here you would trigger an API call to Supabase to update the customer's tier
    } else {
        console.log(`[SYSTEM] Downgrading ${customerName} to STANDARD TIER.`);
    }
}
