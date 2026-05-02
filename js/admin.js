// Ensure SUPABASE_CONFIG exists (may not be loaded on admin.html)
if (typeof SUPABASE_CONFIG === 'undefined') {
    var SUPABASE_CONFIG = { URL: '', ANON_KEY: '' };
}

const admin = {
    _syncIntervalId: null,
    pin: '',
    correctPin: '2026', 
    manualEntries: JSON.parse(localStorage.getItem('iceqube_manual_cashflow') || '[]'),
    consumables: JSON.parse(localStorage.getItem('iceqube_consumables') || JSON.stringify({
        bags3kg: { current: 4200, max: 10000, unit: '' },
        bags1kg: { current: 1150, max: 5000, unit: '' },
        sealing: { current: 8, max: 20, unit: '' },
        sanitizer: { current: 4.5, max: 10, unit: 'Liters' },
        descaler: { current: 2, max: 5, unit: 'Bottles' }
    })),
    maintenanceLogs: JSON.parse(localStorage.getItem('iceqube_maintenance_logs') || '[]'),

    init() {
        console.log('--- COMMAND CENTER INITIALIZED (Bypass Mode) ---');
        this.updateAlertCenter([]);
        this.startDataSync();
        this.updateConsumablesUI();
        this.updateMaintenanceUI();
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

    vibrateError() {
        const gate = document.querySelector('.gate-content');
        gate.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
        setTimeout(() => {
            gate.style.animation = '';
        }, 500);
    },

    unlock() {
        const gate = document.getElementById('admin-gate');
        const dashboard = document.getElementById('command-center');
        
        gate.classList.add('unlocked');
        dashboard.style.display = 'flex';
        
        console.log('--- ACCESS GRANTED: COMMAND CENTER ONLINE ---');
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
        
        // Auto-refresh every 30 seconds (prevent stacking intervals)
        if (this._syncIntervalId) clearInterval(this._syncIntervalId);
        this._syncIntervalId = setInterval(() => this.fetchRealStats(), 30000);
        
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
            if (!response.ok) throw new Error('Fetch failed');
            const orders = await response.json();
            this.updateDashboardUI(orders);
        } catch (err) {
            console.warn('Live fetch failed, falling back to mock:', err);
            this.renderMockStats();
        }
    },

    updateDashboardUI(orders) {
        if (!orders) return;
        console.log("🔄 Updating Dashboard UI...");
        
        // 1. Priority: Update Order Queue
        this.updateOrderQueue(orders);

        // 2. Stats Calculation
        const pending = orders.filter(o => o.delivery_status === 'Pending' || o.delivery_status === 'Awaiting Acceptance').length;
        const dispatched = orders.filter(o => o.delivery_status === 'Dispatched').length;
        const delivered = orders.filter(o => o.delivery_status === 'Delivered').length;
        
        const revenue = orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
        const revenueEl = document.querySelector('.metric-value');
        if (revenueEl) revenueEl.innerText = `₱${revenue.toLocaleString()}`;
        
        // 3. Bags Calculation
        let bags = 0;
        orders.forEach(o => {
            if (o.items) {
                const fd = o.items.fullDice || {};
                const hd = o.items.halfDice || {};
                bags += (fd['3kg'] || 0) + (fd['1kg'] || 0) + (hd['3kg'] || 0) + (hd['1kg'] || 0);
            }
        });
        const metricValues = document.querySelectorAll('.cc-card .metric-value');
        if (metricValues.length >= 2) metricValues[1].innerText = bags;

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
        const mockOrders = [
            {
                id: 'mock-1',
                order_id: 'IQ-9750',
                created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                customer_name: 'Loft Living CDO',
                total_price: 2550,
                payment_method: 'GCash',
                delivery_status: 'Dispatched',
                rider: 'John',
                items: { fullDice: { '3kg': 10 } }
            },
            {
                id: 'mock-2',
                order_id: 'IQ-9751',
                created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
                customer_name: 'Fat Monk Coffee',
                total_price: 850,
                payment_method: 'Cash',
                delivery_status: 'Pending',
                rider: 'Unassigned',
                items: { halfDice: { '3kg': 5 } }
            },
            {
                id: 'mock-3',
                order_id: 'IQ-9752',
                created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
                customer_name: 'Zion Business Center',
                total_price: 1250,
                payment_method: 'GCash',
                delivery_status: 'Delivered',
                rider: 'Mark',
                items: { fullDice: { '1kg': 20 } }
            }
        ];

        // Populate the whole UI with this mock data
        this.updateDashboardUI(mockOrders);
        this.updateAlertCenter(mockOrders);
        console.log("🎨 Dashboard rendered with development mock data.");
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
                views[key].style.display = (key === viewId) ? 'grid' : 'none';
            }
        });
        
        if (viewId === 'assets') this.updateMaintenanceUI();
        if (viewId === 'consumables') this.updateConsumablesUI();
        
        this.animateCards();
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
        const autoEntries = orders.map(o => ({
            timestamp: o.created_at,
            category: 'Sales',
            description: `Order ${o.order_id} - ${o.customer_name}`,
            type: 'IN',
            amount: parseFloat(o.total_price) || 0,
            source: 'AUTO'
        }));

        // Add Mock Expenses (as seen in Finance View) for realism
        autoEntries.push({
            timestamp: new Date().toISOString(),
            category: 'Expense',
            description: 'Rider Payouts (Daily)',
            type: 'OUT',
            amount: 4200,
            source: 'AUTO'
        });
        autoEntries.push({
            timestamp: new Date().toISOString(),
            category: 'Expense',
            description: 'Utility Cost (Est.)',
            type: 'OUT',
            amount: 850,
            source: 'AUTO'
        });

        // 2. Combine with Manual Entries
        const allEntries = [...autoEntries, ...this.manualEntries];
        
        // 3. Sort by Time (Descending)
        allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 4. Calculate Totals
        let totalIn = 0;
        let totalOut = 0;
        
        // 5. Render Rows
        tbody.innerHTML = allEntries.map(entry => {
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
                    <td style="text-align: right;">
                        ${entry.source === 'MANUAL' ? `<button onclick="admin.deleteManualEntry('${entry.timestamp}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;">✕</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        // 6. Update Summary Bar
        document.getElementById('cashflow-in').innerText = `₱${totalIn.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('cashflow-out').innerText = `₱${totalOut.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        const net = totalIn - totalOut;
        const netEl = document.getElementById('cashflow-net');
        netEl.innerText = `₱${net.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        netEl.style.color = net >= 0 ? '#22c55e' : '#ef4444';
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
        localStorage.setItem('iceqube_manual_cashflow', JSON.stringify(this.manualEntries));
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

        // Force mock data if no live orders are present today
        let allOrders = (orders && orders.length > 0) ? orders : [
            {
                id: 'mock-1',
                order_id: 'IQ-9750',
                created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                customer_name: 'Loft Living CDO',
                delivery_address: 'Macabalan, Cagayan de Oro City',
                total_price: 2550,
                delivery_fee: 50,
                priority_fee: 20,
                payment_method: 'GCash',
                delivery_status: 'Dispatched',
                rider: 'John',
                items: { fullDice: { '3kg': 10 } }
            },
            {
                id: 'mock-2',
                order_id: 'IQ-9751',
                created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
                customer_name: 'Fat Monk Coffee',
                delivery_address: 'Uptown CDO, Xavier Estates',
                total_price: 850,
                delivery_fee: 80,
                priority_fee: 0,
                payment_method: 'Cash',
                delivery_status: 'Pending',
                rider: 'Unassigned',
                items: { halfDice: { '3kg': 5 } }
            },
            {
                id: 'mock-3',
                order_id: 'IQ-9752',
                created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
                customer_name: 'Zion Business Center',
                delivery_address: 'Divisoria, RN Pelaez Blvd',
                total_price: 1250,
                delivery_fee: 40,
                priority_fee: 0,
                payment_method: 'GCash',
                delivery_status: 'Delivered',
                rider: 'Mark',
                items: { fullDice: { '1kg': 20 } }
            }
        ];

        const pendingOrders = allOrders.filter(o => o.delivery_status === 'Pending' || o.delivery_status === 'Awaiting Acceptance');
        const ledgerOrders = allOrders.filter(o => o.delivery_status !== 'Pending' && o.delivery_status !== 'Awaiting Acceptance');

        pendingBadge.innerText = `${pendingOrders.length} Pending`;
        ledgerBadge.innerText = `${ledgerOrders.length} Orders`;
        
        const ridersList = ['Unassigned', 'John', 'Mark', 'Dave', 'Rico'];

        // Render Pending Table
        pendingBody.innerHTML = pendingOrders.map(o => {
            const timeStr = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const itemsStr = this.formatOrderItems(o);
            const isAwaiting = o.delivery_status === 'Awaiting Acceptance';

            return `
                <tr style="${isAwaiting ? 'opacity: 0.7; background: rgba(245, 158, 11, 0.05);' : ''}">
                    <td>${timeStr}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent);">#${o.order_id}</td>
                    <td><b>${o.customer_name}</b></td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">${o.delivery_address || 'N/A'}</td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-family: 'JetBrains Mono';">₱${(o.delivery_fee || 0).toLocaleString()}</td>
                    <td>
                        <input type="number" class="status-select" style="width: 60px;" value="${o.priority_fee || 0}" 
                               onchange="admin.updatePriorityFee('${o.id}', this.value)" ${isAwaiting ? 'disabled' : ''}>
                    </td>
                    <td>
                        <select class="status-select" onchange="admin.assignRider('${o.id}', this.value)" ${isAwaiting ? 'disabled' : ''}>
                            ${ridersList.map(r => `<option value="${r}" ${o.rider === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </td>
                    <td style="text-align: right;">
                        ${isAwaiting ? 
                            `<span class="status-badge status-awaiting">Awaiting Rider...</span>` : 
                            `<button class="btn-dispatch" onclick="admin.dispatchOrder('${o.id}', '${o.rider}', '${o.order_id}')">Dispatch</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

        // Render Ledger Table (Uneditable)
        ledgerBody.innerHTML = ledgerOrders.map(o => {
            const timeStr = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const itemsStr = this.formatOrderItems(o);

            return `
                <tr>
                    <td>${timeStr}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--admin-accent);">#${o.order_id}</td>
                    <td><b>${o.customer_name}</b></td>
                    <td style="font-size: 0.75rem; color: #94a3b8; max-width: 150px;">${o.delivery_address || 'N/A'}</td>
                    <td style="font-size: 0.75rem; color: #cbd5e1;">${itemsStr}</td>
                    <td style="font-family: 'JetBrains Mono'; font-weight: 700;">₱${parseFloat(o.total_price).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono';">₱${(o.delivery_fee || 0).toLocaleString()}</td>
                    <td style="font-family: 'JetBrains Mono'; color: #f59e0b;">₱${(o.priority_fee || 0).toLocaleString()}</td>
                    <td><span style="color: #94a3b8; font-size: 0.85rem;">👤 ${o.rider || 'Unassigned'}</span></td>
                    <td><span class="status-badge" style="opacity: 0.8;">${o.delivery_status}</span></td>
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
        } catch (err) {
            console.error('Update Failed:', err);
        }
    },

    formatOrderItems(o) {
        if (!o.items) return '';
        const fd = o.items.fullDice || {};
        const hd = o.items.halfDice || {};
        const parts = [];
        if (fd['3kg']) parts.push(`${fd['3kg']}×3kg (F)`);
        if (fd['1kg']) parts.push(`${fd['1kg']}×1kg (F)`);
        if (hd['3kg']) parts.push(`${hd['3kg']}×3kg (H)`);
        if (hd['1kg']) parts.push(`${hd['1kg']}×1kg (H)`);
        return parts.join(', ');
    },

    async dispatchOrder(id, rider, orderId) {
        if (rider === 'Unassigned') {
            alert('Please assign a rider before dispatching.');
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
            alert(`Order ${orderId} dispatched! Notification sent to ${rider}.`);
        } catch (err) {
            console.error('Dispatch failed:', err);
        }
    },

    async assignRider(id, riderName) {
        if (id.startsWith('mock')) {
            console.log(`Mock Rider Assigned: ${riderName}`);
            return;
        }
        
        console.log(`📡 Assigning Rider ${riderName} to Order ${id}...`);
        try {
            await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ assigned_rider: riderName })
            });
            console.log('✅ Rider Assigned');
        } catch (err) {
            console.error('Assignment Failed:', err);
        }
    },

    async updateOrderStatus(id, newStatus) {
        console.log(`📡 Updating Order ${id} to ${newStatus}...`);
        
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

    showRestockModal() {
        document.getElementById('restock-modal').style.display = 'flex';
    },

    closeRestockModal() {
        document.getElementById('restock-modal').style.display = 'none';
    },

    submitRestock() {
        const itemId = document.getElementById('restock-item').value;
        const qty = parseFloat(document.getElementById('restock-qty').value);
        const cost = parseFloat(document.getElementById('restock-cost').value);
        const note = document.getElementById('restock-note').value;

        if (isNaN(qty) || qty <= 0) {
            alert('Please enter a valid quantity.');
            return;
        }

        // 1. Update Consumables State
        if (this.consumables[itemId]) {
            this.consumables[itemId].current += qty;
            // Cap at max? Maybe not, maybe max is just for the progress bar
            // this.consumables[itemId].current = Math.min(this.consumables[itemId].current, this.consumables[itemId].max);
        }

        // 2. Save Consumables
        localStorage.setItem('iceqube_consumables', JSON.stringify(this.consumables));

        // 3. Record Cashflow if cost provided
        if (!isNaN(cost) && cost > 0) {
            const entry = {
                timestamp: new Date().toISOString(),
                category: 'Packaging',
                description: `Restock: ${document.getElementById('restock-item').options[document.getElementById('restock-item').selectedIndex].text}${note ? ' (' + note + ')' : ''}`,
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
        
        alert('Restock logged successfully!');
    },

    updateConsumablesUI() {
        Object.keys(this.consumables).forEach(key => {
            const data = this.consumables[key];
            const stockEl = document.getElementById(`stock-${key}`);
            const barEl = document.getElementById(`bar-${key}`);
            const warnEl = document.getElementById(`warn-${key}`);

            if (stockEl) {
                if (data.unit) {
                    stockEl.innerText = `${data.current} ${data.unit}`;
                } else {
                    stockEl.innerText = `${data.current.toLocaleString()} / ${data.max.toLocaleString()}`;
                }
            }

            if (barEl) {
                const percent = Math.min((data.current / data.max) * 100, 100);
                barEl.style.width = `${percent}%`;
                
                // Color logic
                if (percent < 15) barEl.style.background = '#ef4444';
                else if (percent < 40) barEl.style.background = '#f59e0b';
                else barEl.style.background = '#22c55e';
            }

            if (warnEl) {
                const percent = (data.current / data.max) * 100;
                warnEl.style.display = percent < 15 ? 'block' : 'none';
            }
        });
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
    }
};

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

document.addEventListener('DOMContentLoaded', () => admin.init());
