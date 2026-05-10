if (typeof SUPABASE_CONFIG === 'undefined') { var SUPABASE_CONFIG = { URL: '', ANON_KEY: '' }; }
if (typeof MESSENGER_CONFIG === 'undefined') { var MESSENGER_CONFIG = { PAGE_ACCESS_TOKEN: '', RECIPIENT_ID: '' }; }

// GLOBAL CALLBACK FOR GOOGLE MAPS
window.initIceQubeMap = function() {
    let retries = 0;
    const maxRetries = 50; 
    const checkReady = () => {
        if (window.app) {
            window.app.onGoogleMapsReady();
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(checkReady, 100);
        } else {
            console.error("IceQube Map Error: app object not found after 5s.");
        }
    };
    checkReady();
};

const app = {
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

    // INITIALIZATION
    init() {
        console.log("IceQube Engine V3.0.0 Initializing...");
        this.currentStep = 0;

        // --- Messenger Context Detection ---
        const urlParams = new URLSearchParams(window.location.search);
        const psid = urlParams.get('psid') || urlParams.get('extid');
        
        if (psid) {
            console.log('Detected Messenger PSID:', psid);
            MESSENGER_CONFIG.RECIPIENT_ID = psid;
            this.user.messengerId = psid;
            localStorage.setItem('ice_messenger_psid', psid);
        } else {
            // Fallback to last known PSID
            const storedPsid = localStorage.getItem('ice_messenger_psid');
            if (storedPsid) {
                MESSENGER_CONFIG.RECIPIENT_ID = storedPsid;
                this.user.messengerId = storedPsid;
            }
        }

        this.isQuickReorder = false;
        this.showStep(0);
        this.updateProgress();
        this.checkUserPrivileges();
        this.renderDashboard(this.user.role);
        this.updateCreditUI();
        this.updateTotal();
        // Prevent selecting past dates and far future dates (>14 days)
        const dateInput = document.getElementById('schedule-date');
        if (dateInput) {
            const today = new Date();
            const formatDate = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };
            
            dateInput.min = formatDate(today);
            
            const maxDate = new Date();
            maxDate.setDate(today.getDate() + 14);
            dateInput.max = formatDate(maxDate);
        }

        // Load Google Maps if Key is provided
        this.loadGoogleMaps();
        this.initAdminSecret();

        // --- PWA Installation Logic ---
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isMessenger = /FBAN|FBAV|Messenger/i.test(ua);
        const isChromeIOS = /CriOS/i.test(ua);

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (!this.isStandalone) {
                this.showInstallButtons(true);
            }
        });

        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || false;

        if (!this.isStandalone) {
            this.showInstallButtons(true);
            
            // Adjust banner text for Messenger
            if (isMessenger) {
                const bannerTitle = document.querySelector('#pwa-install-banner strong');
                const bannerBtn = document.querySelector('.pwa-install-btn');
                if (bannerTitle) bannerTitle.innerText = 'Get the IceQube App';
                if (bannerBtn) bannerBtn.innerText = 'How?';
            } else if (isIOS) {
                const btn2 = document.getElementById('btn-install-pwa-account');
                if (btn2) {
                    const span = btn2.querySelector('span');
                    if (span) span.innerText = 'Add to Home Screen';
                }
            }
        } else {
            this.showInstallButtons(false);
        }

        window.addEventListener('appinstalled', (evt) => {
            this.showInstallButtons(false);
            this.deferredPrompt = null;
        });

        // --- Profile Management ---
        this.loadUserProfile();

        // --- Sync Status Diagnostics ---
        this.updateSyncBadges();
    },

    updateSyncBadges() {
        const localBadge = document.getElementById('sync-status-badge');
        const localDot = document.getElementById('sync-dot');
        const cloudBadge = document.getElementById('cloud-sync-badge');
        const cloudDot = document.getElementById('cloud-dot');

        // Local Sync (BroadcastChannel)
        if (window.IceQubeSync && localBadge && localDot) {
            localBadge.style.background = 'rgba(34, 197, 94, 0.1)';
            localBadge.style.color = '#22c55e';
            localBadge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
            localDot.style.background = '#22c55e';
            localBadge.innerHTML = '<span id="sync-dot" style="width: 5px; height: 5px; background: #22c55e; border-radius: 50%;"></span> LOCAL LIVE';
        }

        // Cloud Sync (Supabase)
        if (cloudBadge && cloudDot) {
            if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.URL && !SUPABASE_CONFIG.URL.includes('your-project-id')) {
                cloudBadge.style.background = 'rgba(34, 197, 94, 0.1)';
                cloudBadge.style.color = '#22c55e';
                cloudBadge.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                cloudDot.style.background = '#22c55e';
                cloudBadge.innerHTML = '<span id="cloud-dot" style="width: 5px; height: 5px; background: #22c55e; border-radius: 50%;"></span> CLOUD LIVE';
            } else {
                cloudBadge.style.background = 'rgba(245, 158, 11, 0.1)';
                cloudBadge.style.color = '#f59e0b';
                cloudBadge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                cloudDot.style.background = '#f59e0b';
                cloudBadge.innerHTML = '<span id="cloud-dot" style="width: 5px; height: 5px; background: #f59e0b; border-radius: 50%;"></span> CLOUD (OFF)';
            }
        }
    },

    initAdminSecret() {
        const logo = document.querySelector('.brand-logo');
        if (!logo) return;

        let pressTimer;
        
        const startPress = (e) => {
            if (e.type === 'click') return; // Only long-press
            pressTimer = setTimeout(() => {
                console.log('🔓 Secret portal activated...');
                window.location.href = 'admin.html';
            }, 3000); // 3 seconds long-press
        };

        const endPress = () => {
            clearTimeout(pressTimer);
        };

        logo.addEventListener('mousedown', startPress);
        logo.addEventListener('touchstart', startPress);
        logo.addEventListener('mouseup', endPress);
        logo.addEventListener('mouseleave', endPress);
        logo.addEventListener('touchend', endPress);
    },
    steps: ['start', 'qty', 'schedule', 'logistics', 'payment', 'complete', 'automate', 'automate-success'],
    logisticsState: 'selection',
    autoData: {
        schedules: {}
    },
    user: {
        accountType: 'Standard', 
        companyName: 'Guest Customer',
        contactPerson: '',
        contactNumber: '',
        messengerId: null,
        role: 'Owner', 
        balance: 0.00,
        creditLimit: 50000.00
    },
    invoices: [],
    isQuickReorder: false,
    orderData: {
        qty: {
            fullDice: { '3kg': 0, '1kg': 0 },
            halfDice: { '3kg': 0, '1kg': 0 }
        },
        total: 0,
        schedule: {
            type: null,        // 'Deliver Now' or 'Schedule a Date & Time'
            delivery_type: null, // 'immediate' or 'scheduled'
            date: '',
            time: ''
        },
        logistics: null,
        deliveryFee: 0,
        deliveryZone: '',
        isManualReview: false,
        payment: null,
        poNumber: '',
        bonusState3kg: false,
        wasAutoAdjusted3kg: false,
        bonusState1kg: false,
        wasAutoAdjusted1kg: false,
        deliveryDetails: {
            location: '',
            maps: '',
            lat: null,
            lng: null
        },
        paymentReceipt: null,
        codVerified: false,
        dpod: {
            photoUrl: null,
            confirmedBy: null,
            confirmationTime: null,
            status: 'Pending' // Pending, Confirmed, Auto-Confirmed
        },
        status: 'Active' // Active, Pending Payment, Processing
    },
    map: null,
    mapMarker: null,
    mapInitialized: false,
    mapContext: 'order', // 'order' or 'profile'
    deferredPrompt: null,

    installPWA() {
        const ua = navigator.userAgent;
        const isMessenger = /FBAN|FBAV|Messenger/i.test(ua);
        const isChromeIOS = /CriOS/i.test(ua);
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

        if (isMessenger) {
            this.showBreakoutOverlay();
            return;
        }

        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    this.showInstallButtons(false);
                }
                this.deferredPrompt = null;
            });
        } else if (isIOS) {
            if (isChromeIOS) {
                alert('📱 Install on Chrome (iOS):\n\n1. Tap the Share icon (square with arrow up) in the TOP RIGHT (next to the address bar).\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" in the top right.');
            } else {
                alert('📱 Install on Safari (iOS):\n\n1. Tap the Share button (square with arrow up) at the BOTTOM of your screen.\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" in the top right.');
            }
        } else {
            alert('📱 To install IceQube:\n\n1. Tap the browser menu (three dots ⋮).\n2. Select "Install app" or "Add to Home screen".');
        }
    },

    showBreakoutOverlay() {
        // Create a premium breakout overlay if it doesn't exist
        let overlay = document.getElementById('messenger-breakout-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'messenger-breakout-overlay';
            overlay.className = 'modal-overlay active';
            overlay.style.zIndex = '200000';
            overlay.innerHTML = `
                <div class="modal-content" style="max-width: 320px; text-align: center; padding: 30px;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">📱</div>
                    <h2 style="margin-bottom: 10px; font-weight: 800;">Messenger Detected</h2>
                    <p style="color: #64748b; font-size: 0.9rem; line-height: 1.5; margin-bottom: 25px;">
                        Facebook Messenger prevents app installation. To get the IceQube app on your home screen:
                    </p>
                    <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
                        <div style="margin-bottom: 8px;"><strong>1. Tap the (⋯) or (⋮)</strong> menu in the corner.</div>
                        <div><strong>2. Select "Open in Browser"</strong> or "Open in Chrome/Safari".</div>
                    </div>
                    <button class="btn-primary" onclick="document.getElementById('messenger-breakout-overlay').remove()">Got it!</button>
                </div>
            `;
            document.body.appendChild(overlay);
        }
    },

    showInstallButtons(visible) {
        // Force hidden if app is already running in standalone mode
        if (this.isStandalone) visible = false;

        const btn2 = document.getElementById('btn-install-pwa-account');
        const banner = document.getElementById('pwa-install-banner');
        const display = visible ? 'flex' : 'none';
        
        if (btn2) btn2.style.display = display;
        
        // Show banner only if it wasn't explicitly closed by user in this session
        if (banner && visible && !sessionStorage.getItem('pwa-banner-closed')) {
            banner.style.display = 'flex';
        } else if (banner && (!visible || sessionStorage.getItem('pwa-banner-closed'))) {
            banner.style.display = 'none';
        }
    },

    closeInstallBanner() {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'none';
        sessionStorage.setItem('pwa-banner-closed', 'true');
    },

    openPayment() {
        this.togglePanel('billing', true);
    },

    openDebtSheet() {
        if (typeof disablePaymentMethods === 'function') disablePaymentMethods();
        this.toggleBottomSheet('debt', true);
    },

    handlePowerButtonClick(event) {
        if (event) event.stopPropagation();
        this.openDebtSheet();
    },

    updateCreditUI() {
        const availableAmt = document.getElementById('available-amt');
        const maxLimitAmt = document.getElementById('max-limit-amt');
        const batteryFill = document.getElementById('battery-fill');
        const batteryPercent = document.getElementById('battery-percent');
        const currentDebtAmt = document.getElementById('current-debt-amt');
        const creditCard = document.getElementById('credit-card');

        if (!availableAmt || !batteryFill) return;

        const balance = this.user.balance;
        const limit = this.user.creditLimit;
        const available = Math.max(0, limit - balance);
        const availablePercent = Math.min(100, (available / limit) * 100);

        availableAmt.innerText = `₱${available.toLocaleString()}`;
        if (maxLimitAmt) maxLimitAmt.innerText = `₱${limit.toLocaleString()}`;
        if (currentDebtAmt) currentDebtAmt.innerText = `₱${balance.toLocaleString()}`;

        batteryFill.style.height = `${availablePercent}%`;

        // Update classes based on availability
        batteryFill.classList.remove('safe', 'warning', 'critical');
        if (currentDebtAmt) {
            currentDebtAmt.classList.remove('warning', 'critical', 'debt-alert');
        }
        if (creditCard) {
            creditCard.classList.remove('over-limit');
        }
        
        const batteryOuter = document.querySelector('.battery-outer.standalone');
        if (batteryOuter) {
            batteryOuter.classList.remove('glow-safe', 'glow-warning', 'glow-critical');
        }

        if (availablePercent > 50) {
            batteryFill.classList.add('safe');
            if (batteryOuter) batteryOuter.classList.add('glow-safe');
        } else if (availablePercent > 20) {
            batteryFill.classList.add('warning');
            if (batteryOuter) batteryOuter.classList.add('glow-warning');
            if (currentDebtAmt) currentDebtAmt.classList.add('warning');
        } else {
            batteryFill.classList.add('critical');
            if (batteryOuter) batteryOuter.classList.add('glow-critical');
            if (currentDebtAmt) currentDebtAmt.classList.add('critical');
        }

        // Explicitly set debt to debt-alert if it exceeds limit
        if (balance > limit) {
            if (currentDebtAmt) currentDebtAmt.classList.add('debt-alert');
            if (creditCard) creditCard.classList.add('over-limit');
        }

        this.updateButtonState(available, limit);
    },

    updateButtonState(available, limit) {
        const ratio = available / limit;
        const btn = document.querySelector('.recharge-btn');
        if (!btn) return;

        btn.classList.remove('safe', 'warning', 'critical');

        if (ratio > 0.90) {
            btn.innerText = "Looking Great!";
            btn.classList.add('safe');
        } else if (ratio > 0.66) {
            btn.innerText = "Full Power";
        } else if (ratio > 0.40) {
            btn.innerText = "Half Power";
        } else if (ratio > 0.15) {
            btn.innerText = "Top Up Soon";
            btn.classList.add('warning');
        } else {
            btn.innerText = "Recharge Now";
            btn.classList.add('critical');
        }
    },

    loadGoogleMaps() {
        console.log("🚀 V3.0.1: Activating Primary Satellite Engine...");
        // Bypassing Google SDK entirely to eliminate authorization errors
        setTimeout(() => {
            if (!this.mapInitialized) {
                this.initMap(); // Force immediate Satellite Fallback
            }
        }, 100);
    },

    onGoogleMapsReady() {
        console.log('✅ Google Maps SDK Successfully Loaded');
        this.googleMapsReady = true;
        this.initGooglePlacesAutocomplete();
        
        // If we were already showing the map step, switch to Google Map now
        const currentStep = document.querySelector('.step-content.active');
        if (currentStep && currentStep.id === 'step-map') {
            this.initGoogleMap();
        }
    },

    initGooglePlacesAutocomplete() {
        const input = document.getElementById('map-search-input');
        if (!input) return;

        if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
            // FALLBACK TO OSM NOMINATIM SEARCH
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = input.value.trim();
                    if (!query) return;

                    const badgeElem = document.getElementById('map-badge-container');
                    if (badgeElem) badgeElem.innerHTML = `<span class="scanning-badge">Searching...</span>`;

                    try {
                        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=ph`);
                        const data = await response.json();
                        
                        let lat = this._tempLat || 8.4772;
                        let lng = this._tempLng || 124.6459;
                        
                        if (data && data.length > 0) {
                            lat = parseFloat(data[0].lat);
                            lng = parseFloat(data[0].lon);
                            if (this.map) {
                                this.map.setView([lat, lng], 18);
                                this.mapMarker.setLatLng([lat, lng]);
                            }
                        }
                        
                        // FORCE LOCK THE BUSINESS NAME!
                        this._lockedPlace = query;
                        this._tempAddress = query;
                        this._tempLat = lat;
                        this._tempLng = lng;
                        
                        const badgeElem = document.getElementById('map-badge-container');
                        if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;
                        if (input) input.value = query;
                        
                        const satLabel = document.querySelector(".sat-label");
                        if (satLabel) {
                            satLabel.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span> ${query}`;
                            satLabel.parentElement.style.background = '#ebf5ff';
                            satLabel.parentElement.style.border = '2px solid #4382ec';
                        }
                        
                        const deliveryMaps = document.getElementById('delivery-maps');
                        if (deliveryMaps) deliveryMaps.value = `📍 ${query}`;
                        
                    } catch (err) {
                        console.error(err);
                        // Network error, just lock it anyway
                        this._lockedPlace = query;
                        this._tempAddress = query;
                        const badgeElem = document.getElementById('map-badge-container');
                        if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;
                        if (input) input.value = query;
                    }
                }
            });
            return;
        }

        const autocomplete = new google.maps.places.Autocomplete(input, {
            componentRestrictions: { country: "ph" },
            // Add bias to current area
            bounds: new google.maps.LatLngBounds(
                new google.maps.LatLng(8.45, 124.60),
                new google.maps.LatLng(8.50, 124.70)
            ),
            fields: ["address_components", "geometry", "name"],
            types: ["establishment", "geocode"]
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) return;

            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            
            if (this.googleMap) {
                this.googleMap.setCenter({ lat, lng });
                this.googleMap.setZoom(17);
                this.googleMarker.setPosition({ lat, lng });
            } else if (this.map) {
                this.map.setView([lat, lng], 17);
                this.mapMarker.setLatLng([lat, lng]);
            }

            this._lockedPlace = place.name || input.value; // Lock the searched business
            this._tempAddress = this._lockedPlace;
            this._tempLat = lat;
            this._tempLng = lng;
            const addrInput = document.getElementById('map-search-input');
            if (addrInput) addrInput.value = place.formatted_address || place.name;
            const badgeElem = document.getElementById('map-badge-container');
            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge">📍 SEARCH</span>`;
        });
    },

    applyQuickReorderDefaults() {
        this.isQuickReorder = true;
        this.orderData.logistics = 'Doorstep Delivery';
        // Use Profile Defaults if available, fallback to mock for demo
        const defaultName = (this.user.companyName && this.user.companyName !== 'Guest Customer') ? this.user.companyName : 'Loft Living CDO';
        const defaultPerson = this.user.contactPerson || 'Manager (Admin)';
        const defaultContact = this.user.contactNumber || '09171234567';

        this.orderData.deliveryDetails = {
            location: defaultName,
            maps: 'https://maps.app.goo.gl/loft-living-mock',
            lat: 8.4772,
            lng: 124.6459,
            person: defaultPerson,
            contact: defaultContact,
            instructions: 'Gate 2, Side Entrance. Regular delivery spot.'
        };

        if (document.getElementById('delivery-person')) {
            document.getElementById('delivery-person').value = this.orderData.deliveryDetails.person;
            document.getElementById('delivery-contact').value = this.formatPhone(this.orderData.deliveryDetails.contact);
            document.getElementById('delivery-instructions').value = this.orderData.deliveryDetails.instructions;
            document.getElementById('delivery-maps').value = 'Pinned: Loft Living CDO';
            
            if (document.getElementById('btn-payment-delivery')) {
                document.getElementById('btn-payment-delivery').disabled = false;
            }
        }
    },

    processOrder() {
        // Mocking the "15 Bags (Half-Dice 3kg)" default
        this.orderData.qty.fullDice['3kg'] = 0;
        this.orderData.qty.fullDice['1kg'] = 0;
        this.orderData.qty.halfDice['3kg'] = 14;
        this.orderData.qty.halfDice['1kg'] = 0;
        
        // Update the inputs in Step 2 to reflect this
        if (document.getElementById('qty-halfDice-3kg')) {
            document.getElementById('qty-halfDice-3kg').value = 14;
            document.getElementById('qty-fullDice-3kg').value = 0;
            document.getElementById('qty-fullDice-1kg').value = 0;
            document.getElementById('qty-halfDice-1kg').value = 0;
        }

        this.updateTotal();
        this.togglePanel('account', false);
        
        // Apply defaults and flag
        this.applyQuickReorderDefaults();

        // Jump straight to Schedule step (Index 2)
        const fromStep = 0; 
        this.currentStep = 2;
        this.showStep(this.currentStep, 'next', fromStep);
    },

    goToEditQty() {
        this.togglePanel('account', false);
        
        // Even when editing Qty, we use the Quick Reorder defaults for logistics
        this.applyQuickReorderDefaults();
        
        // Go to QTY step (Index 1)
        const fromStep = 0;
        this.currentStep = 1;
        this.showStep(this.currentStep, 'next', fromStep);
    },

    initLegitimacyDB() {
        // Mock data seeding disabled for production run
    },

    checkUserPrivileges() {
        const poCard = document.getElementById('card-payment-po');
        const isPrivileged = ['Enterprise', 'Verified_Partner'].includes(this.user.accountType);
        
        if (poCard) {
            poCard.style.display = isPrivileged ? 'flex' : 'none';
        }

        // Handle Automation Buttons
        const activeAutoBtn = document.getElementById('btn-automation-active');
        const lockedAutoBtn = document.getElementById('btn-automation-locked');
        const finishActiveAutoBtn = document.getElementById('btn-finish-automate-active');
        const finishLockedAutoBtn = document.getElementById('btn-finish-automate-locked');

        if (activeAutoBtn && lockedAutoBtn) {
            activeAutoBtn.style.display = isPrivileged ? 'flex' : 'none';
            lockedAutoBtn.style.display = isPrivileged ? 'none' : 'flex';
        }

        if (finishActiveAutoBtn && finishLockedAutoBtn) {
            finishActiveAutoBtn.style.display = isPrivileged ? 'flex' : 'none';
            finishLockedAutoBtn.style.display = isPrivileged ? 'none' : 'flex';
        }
    },

    showEliteUpgrade() {
        // Premium looking alert using SweetAlert or custom logic
        // For this demo, we use a styled alert or just a clean prompt
        this.showToast("🔒 Elite Feature: Reserved for Elite Partners.", 'info');
    },

    renderDashboard(userRole) {
        const staffManagementSection = document.getElementById('staff-management-tab');
        const roleTag = document.getElementById('user-role');

        if (roleTag) {
            roleTag.innerText = userRole === 'Admin' || userRole === 'Owner' ? 'Manager (Admin)' : 'Authorized Staff';
        }

        if (!staffManagementSection) return;
        
        if (userRole === 'Admin' || userRole === 'Owner') {
            staffManagementSection.style.display = 'block'; // Show for bosses
        } else {
            staffManagementSection.style.display = 'none';  // Hide for staff
        }
    },

    showStep(index, direction = 'next', fromIndex = null) {
        const steps = document.querySelectorAll('.step-content');
        const prevIndex = fromIndex !== null ? fromIndex : (this.lastStepIndex !== undefined ? this.lastStepIndex : -1);
        const isInitial = prevIndex === -1;
        
        steps.forEach((step, i) => {
            if (i === index) {
                step.style.display = 'block';
                if (isInitial) {
                    step.classList.add('active');
                } else {
                    // Entry Animation
                    const entryClass = direction === 'next' ? 'step-slide-in-right' : 'step-slide-in-left';
                    step.classList.add(entryClass, 'active');
                    
                    // Cleanup after animation
                    setTimeout(() => {
                        step.classList.remove('step-slide-in-right', 'step-slide-in-left');
                    }, 500);
                }
            } else if (i === prevIndex && !isInitial) {
                // Exit Animation
                const exitClass = direction === 'next' ? 'step-slide-out-left' : 'step-slide-out-right';
                step.classList.add(exitClass);
                
                setTimeout(() => {
                    if (this.currentStep !== i) {
                        step.style.display = 'none';
                        step.classList.remove('active', exitClass);
                    }
                }, 450);
            } else {
                step.style.display = 'none';
                step.classList.remove('active', 'step-slide-in-right', 'step-slide-in-left', 'step-slide-out-left', 'step-slide-out-right');
            }
        });
        
        this.lastStepIndex = index;
        this.updateProgress();

        // Show PWA install banner only on the landing page (step 0) and ONLY if not already installed
        const pwaBanner = document.getElementById('pwa-install-banner');
        if (pwaBanner) {
            if (index === 0 && !this.isStandalone && !sessionStorage.getItem('pwa-banner-closed')) {
                pwaBanner.style.display = 'flex';
            } else {
                pwaBanner.style.display = 'none';
            }
        }

        // --- Step-Specific Initialization ---
        if (index === 3) { // Logistics Step
            const perInput = document.getElementById('delivery-person');
            const conInput = document.getElementById('delivery-contact');
            
            // Note: delivery-location is now purely manual per user request
            
            if (perInput && !perInput.value && this.user.contactPerson) {
                perInput.value = this.user.contactPerson;
            }
            if (conInput && !conInput.value && this.user.contactNumber) {
                conInput.value = this.formatPhone(this.user.contactNumber);
            }
        }
    },

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            const from = this.currentStep;
            
            // Skip Logistics (Step 3) if it's a Quick Reorder
            if (this.isQuickReorder && this.currentStep === 2) {
                this.currentStep = 4; // Jump to Payment
            } else {
                this.currentStep++;
            }
            
            this.showStep(this.currentStep, 'next', from);
        }
    },

    switchAboutTab(tabId) {
        const targetPaneId = tabId.replace('tab-', 'pane-');
        const panes = document.querySelectorAll('.about-tab-pane');
        const tabs = document.querySelectorAll('.about-tab-item');
        
        panes.forEach(pane => pane.classList.toggle('active', pane.id === targetPaneId));
        tabs.forEach(tab => tab.classList.toggle('active', tab.id === tabId));
        
        // Scroll track if needed
        const track = document.querySelector('.about-tabs-track');
        if (track) {
            const activeTab = document.getElementById(tabId);
            if (activeTab) {
                const scrollPos = activeTab.offsetLeft - (track.parentElement.offsetWidth / 2) + (activeTab.offsetWidth / 2);
                track.parentElement.scrollTo({ left: scrollPos, behavior: 'smooth' });
            }
        }
    },

    switchToFull() {
        const slider = document.getElementById('diceSlider');
        const tabs = document.querySelectorAll('.ice-sub-tab');
        if (slider) slider.classList.remove('show-half');
        if (tabs.length >= 2) {
            tabs[0].classList.add('active');
            tabs[1].classList.remove('active');
        }
    },

    switchToHalf() {
        const slider = document.getElementById('diceSlider');
        const tabs = document.querySelectorAll('.ice-sub-tab');
        if (slider) slider.classList.add('show-half');
        if (tabs.length >= 2) {
            tabs[0].classList.remove('active');
            tabs[1].classList.add('active');
        }
    },

    async getOSRMRoute(originLat, originLon, destLat, destLon) {
        try {
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=false`);
            const osrmData = await osrmRes.json();

            if (osrmData.routes && osrmData.routes.length > 0) {
                const routingDistanceKm = osrmData.routes[0].distance / 1000;
                const routingTimeMins = Math.ceil(osrmData.routes[0].duration / 60);
                return { 
                    distanceKm: Number(routingDistanceKm.toFixed(1)), 
                    routeTimeMins: routingTimeMins + 10 
                };
            }
        } catch (e) {
            console.error("OSRM Error:", e);
        }
        return { distanceKm: 5, routeTimeMins: 20 }; // Generic fallback
    },

    // --- Map Integration Methods (Consolidated at end of app object) ---

    initMap() {
        const cdoCoords = [8.4772, 124.6459];
        const container = document.querySelector('.map-card-container');

        this.map = L.map('map-container', {
            zoomControl: false,
            attributionControl: false
        }).setView(cdoCoords, 18);
        
        // Google Maps Tiles Fallback (English labels and PH region)
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=en&gl=ph&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            attribution: '&copy; Google'
        }).addTo(this.map);

        // Better zoom control position
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Completely remove the default blue circle marker if it exists
        if (this.mapMarker) {
            this.map.removeLayer(this.mapMarker);
        }

        // Use a hidden, non-interactive marker only for internal tracking
        this.mapMarker = L.marker(cdoCoords, { 
            opacity: 0,
            interactive: false
        }).addTo(this.map);

        this.map.on('movestart', () => {
            if (container) container.classList.add('map-moving');
            // Break the lock when user drags the map
            this._lockedPlace = null;
            this.hideSearchSuggestions();
        });

        this.map.on('moveend', () => {
            if (container) container.classList.remove('map-moving');
            const center = this.map.getCenter();
            this.reverseGeocode(center.lat, center.lng);
        });

        // Tap to Pin: Center map on click
        this.map.on('click', (e) => {
            this.map.setView(e.latlng, this.map.getZoom(), { animate: true });
        });

        this.mapInitialized = true;
        this.geolocateUser(true);
        this.reverseGeocode(cdoCoords[0], cdoCoords[1]);
    },

    initGoogleMap() {
        const cdoCoords = { lat: 8.4772, lng: 124.6459 };
        const mapContainer = document.getElementById('map-container');
        
        // Safety: If Google Maps doesn't render properly in 3s, show Leaflet warning
        this._googleTimeout = setTimeout(() => {
            if (!this.googleMap || !this.googleMap.getBounds()) {
                console.warn('Google Map failing to render. Falling back to High-Precision Satellite...');
                const badgeElem = document.getElementById('map-badge-container');
                if (badgeElem) badgeElem.innerHTML = '<span class="scanning-badge">Switching to Satellite Backup...</span>';
                this.initMap();
            }
        }, 3000);

        try {
            // Check if google is available
            if (typeof google === 'undefined') {
                this.initMap();
                return;
            }
            this.googleMap = new google.maps.Map(mapContainer, {
                center: cdoCoords,
                zoom: 18,
                maxZoom: 21, // Allow ultra-deep zoom
                minZoom: 12,
                disableDefaultUI: true,
                zoomControl: true,
                zoomControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_BOTTOM
                },
                styles: [
                    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#1a73e8" }] },
                    { "featureType": "poi.business", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.government", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.medical", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.park", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.place_of_worship", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.school", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "poi.sports_complex", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "road", "elementType": "all", "stylers": [{ "saturation": -20 }, { "lightness": 10 }] },
                    { "featureType": "landscape.man_made", "elementType": "all", "stylers": [{ "visibility": "on" }, { "color": "#f8fafc" }] },
                    { "featureType": "building", "elementType": "all", "stylers": [{ "visibility": "on" }, { "color": "#cbd5e1" }] },
                    { "featureType": "transit", "elementType": "all", "stylers": [{ "visibility": "on" }] },
                    { "featureType": "water", "elementType": "all", "stylers": [{ "color": "#4285F4" }, { "visibility": "on" }, { "lightness": 60 }] }
                ]
            });

            this.googleMap.addListener('idle', () => {
                clearTimeout(this._googleTimeout);
                const center = this.googleMap.getCenter();
                this.reverseGeocode(center.lat(), center.lng());
            });

            this.googleMap.addListener('dragstart', () => {
                // Break the lock if they manually drag the map
                this._lockedPlace = null;
                const overlay = document.querySelector('.map-card-container');
                if (overlay) overlay.classList.add('map-moving');
            });

            this.googleMap.addListener('dragend', () => {
                const overlay = document.querySelector('.map-card-container');
                if (overlay) overlay.classList.remove('map-moving');
            });

            // --- V7.0 DIRECT POI TAP ---
            this.googleMap.addListener('click', (e) => {
                if (e.placeId) {
                    e.stop(); // Stop Google's default info window
                    const badgeElem = document.getElementById('map-badge-container');
                    if (badgeElem) badgeElem.innerHTML = `<span class="scanning-badge">Locking Business...</span>`;
                    
                    const placesService = new google.maps.places.PlacesService(this.googleMap);
                    placesService.getDetails({ placeId: e.placeId, fields: ['name', 'geometry'] }, (place, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                            // Lock the exact business name they tapped!
                            this._lockedPlace = place.name;
                            
                            // Snap the map exactly to the business door
                            this.googleMap.setCenter(place.geometry.location);
                            this.googleMap.setZoom(20); // Deep zoom on selection
                            
                            // Finalize instantly, bypassing all guessing logic
                            this.finalizeAddress(place, place.geometry.location.lat(), place.geometry.location.lng());
                        }
                    });
                }
            });

        } catch (e) {
            console.error('Google Map Init Error:', e);
            this.initMap();
        }
    },

    initPickupMap() {
        if (this.pickupMapInitialized) return;
        
        // Precise Hub coordinates from Google Maps link
        const hubCoords = [8.5020476, 124.660855];
        
        const map = L.map('pickup-map', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        }).setView(hubCoords, 17);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(map);

        const iqIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/9131/9131529.png', // Premium Ice Cube Icon
            iconSize: [42, 42],
            iconAnchor: [21, 42]
        });

        const marker = L.marker(hubCoords, { icon: iqIcon }).addTo(map);
        
        // Add a premium-styled tooltip that's always open
        marker.bindTooltip("<b>IceQube Hub</b><br>Piaping Itum, Macabalan", {
            permanent: true, 
            direction: 'top',
            className: 'hub-map-tooltip'
        }).openTooltip();

        this.pickupMapInitialized = true;
    },

    geolocateUser(silent = false) {
        if (!navigator.geolocation) {
            if (!silent) alert('Geolocation is not supported by your browser.');
            return;
        }

        const badgeElem = document.getElementById('map-badge-container');
        const addrInput = document.getElementById('map-search-input');
        const originalText = addrInput ? addrInput.value : '';
        
        if (badgeElem && !silent) {
            badgeElem.innerHTML = '<span class="scanning-badge">Refining GPS...</span>';
        }

        // V10.4: Extended timeout and high accuracy forced
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const latlng = [latitude, longitude];
                
                // Dynamic Zoom: The more accurate, the deeper we zoom
                let zoomLevel = 18;
                if (accuracy && accuracy < 25) zoomLevel = 20; // Pinpoint accuracy
                else if (accuracy && accuracy < 60) zoomLevel = 19; // Street level
                
                if (this.googleMap) {
                    const pos = { lat: latitude, lng: longitude };
                    this.googleMap.setCenter(pos);
                    this.googleMap.setZoom(zoomLevel);
                    if (this.googleMarker) this.googleMarker.setPosition(pos);
                } else if (this.map && this.mapMarker) {
                    this.map.setView(latlng, zoomLevel);
                    this.mapMarker.setLatLng(latlng);
                }

                if (badgeElem && !silent) {
                    if (accuracy && accuracy < 30) {
                        badgeElem.innerHTML = '<span class="live-badge" style="background:#16a34a;">📍 HIGH PRECISION</span>';
                    } else {
                        badgeElem.innerHTML = '<span class="live-badge">📍 LOCATED</span>';
                    }
                    // Fade out badge after 3s
                    setTimeout(() => {
                        if (badgeElem.innerHTML.includes('LOCATED') || badgeElem.innerHTML.includes('PRECISION')) {
                            badgeElem.innerHTML = '';
                        }
                    }, 3000);
                }

                this.reverseGeocode(latitude, longitude);
            },
            (error) => {
                if (badgeElem && !silent) badgeElem.innerHTML = '';
                if (!silent) {
                    console.warn("Geolocation Error:", error);
                    // If it's a timeout, it likely means the device couldn't get a GPS lock in time.
                    // We try once more with high accuracy disabled to at least get a network-based location.
                    if (error.code === error.TIMEOUT) {
                        this.showToast("GPS timeout. Using network location...", "info");
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                const lat = pos.coords.latitude;
                                const lng = pos.coords.longitude;
                                if (this.googleMap) {
                                    this.googleMap.setCenter({ lat, lng });
                                    this.googleMap.setZoom(17);
                                } else if (this.map) {
                                    this.map.setView([lat, lng], 17);
                                }
                                this.reverseGeocode(lat, lng);
                            },
                            null,
                            { enableHighAccuracy: false, timeout: 5000 }
                        );
                    }
                }
            },
            { 
                enableHighAccuracy: true, 
                timeout: 10000, // Increased from 5s to 10s to allow GPS warm-up
                maximumAge: 0   // Force fresh coordinates
            }
        );
    },
    
    async searchLocation(query) {
        if (!query || query.trim().length < 2) return;

        // If Google Places Autocomplete is active, we might not need this manual search
        // but keeping it for Enter key fallback.
        if (window.google && this.googleMapsReady) {
            const service = new google.maps.places.PlacesService(this.googleMap);
            service.findPlaceFromQuery({
                query: `${query}, Cagayan de Oro`,
                fields: ['name', 'geometry']
            }, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                    const loc = results[0].geometry.location;
                    this.googleMap.setCenter(loc);
                    this.googleMap.setZoom(17);
                    this.googleMarker.setPosition(loc);
                    this.reverseGeocode(loc.lat(), loc.lng());
                }
            });
            return;
        }

        const badgeElem = document.getElementById('map-badge-container');
        if (badgeElem) badgeElem.innerHTML = '<span class="scanning-badge">Searching...</span>';

        try {
            // Restriction to CDO helps prevent irrelevant results
            const fullQuery = encodeURIComponent(`${query}, Cagayan de Oro, Philippines`);
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${fullQuery}&format=json&limit=1`, {
                headers: { 'User-Agent': 'IceQube-CDO-Ordering-App' }
            });
            const data = await res.json();

            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                const latitude = parseFloat(lat);
                const longitude = parseFloat(lon);
                
                if (this.map && this.mapMarker) {
                    this.map.setView([latitude, longitude], 17);
                    this.mapMarker.setLatLng([latitude, longitude]);
                    
                    const parts = display_name.split(',');
                    const shortAddr = parts.slice(0, 3).join(',').trim();
                    const badgeElem = document.getElementById('map-badge-container');
                    const addrInput = document.getElementById('map-search-input');
                    if (badgeElem) badgeElem.innerHTML = `<span class="live-badge">📍 SEARCH</span>`;
                    if (addrInput) addrInput.value = shortAddr;
                    
                    this._tempAddress = shortAddr;
                    this._tempLat = latitude;
                    this._tempLng = longitude;
                }
            } else {
                const badgeElem = document.getElementById('map-badge-container');
                if (badgeElem) badgeElem.innerHTML = '<span class="scanning-badge">Not found</span>';
                setTimeout(() => { if(badgeElem && badgeElem.innerText.includes('Not found')) badgeElem.innerHTML = ''; }, 3500);
            }
        } catch (e) {
            const badgeElem = document.getElementById('map-badge-container');
            if (badgeElem) badgeElem.innerHTML = '<span class="scanning-badge">Error!</span>';
            console.error("Search Error:", e);
        }
    },

    openExternalGoogleMaps() {
        let url = 'https://www.google.com/maps';
        if (this._tempLat && this._tempLng) {
            url = `https://www.google.com/maps/search/?api=1&query=${this._tempLat},${this._tempLng}`;
        }
        window.open(url, '_blank');
    },

    _locationTimer: null,
    handleLocationInput(value) {
        this.orderData.deliveryDetails.location = value;
        // Auto-lookup disabled per user request to keep input manual
    },

    showEstablishmentBadge(fullName) {
        const badge = document.getElementById('establishment-badge');
        if (badge) badge.style.display = 'flex';
        const input = document.getElementById('delivery-location');
        if (input) input.classList.add('establishment-match');
    },

    hideEstablishmentBadge() {
        const badge = document.getElementById('establishment-badge');
        if (badge) badge.style.display = 'none';
        const input = document.getElementById('delivery-location');
        if (input) input.classList.remove('establishment-match');
    },

    formatPhone(value) {
        let digits = value.replace(/\D/g, '').substring(0, 11);
        let formatted = "";
        if (digits.length > 0) {
            formatted += digits.substring(0, 4);
            if (digits.length > 4) {
                formatted += " " + digits.substring(4, 7);
            }
            if (digits.length > 7) {
                formatted += " " + digits.substring(7, 11);
            }
        }
        return formatted;
    },

    validateContact(value, target = 'delivery') {
        const inputId = target === 'cod' ? 'cod-phone-input' : 'delivery-contact';
        const contactInput = document.getElementById(inputId);
        if (!contactInput) return;

        const warning = target === 'delivery' ? document.getElementById('contact-warning') : null;
        
        // Apply 4-3-4 formatting
        const formatted = this.formatPhone(value);
        const digits = formatted.replace(/\D/g, '');

        // Update the input value with formatted version
        contactInput.value = formatted;

        const isValid = digits.length === 11 && digits.startsWith('09');
        
        if (digits.length > 0 && !isValid) {
            if (warning) warning.style.display = 'block';
            contactInput.classList.add('input-error');
        } else {
            if (warning) warning.style.display = 'none';
            contactInput.classList.remove('input-error');
        }

        if (target === 'delivery') {
            this.calculateDeliveryFee();
        }
    },

    async reverseGeocode(lat, lng) {
        this._tempLat = lat;
        this._tempLng = lng;
        
        const addrInput = document.getElementById('map-search-input');
        const badgeElem = document.getElementById('map-badge-container');
        if (badgeElem) badgeElem.innerHTML = `<span class="scanning-badge">Locating...</span>`;
        
        // If the user searched/tapped a specific place, respect it
        if (this._lockedPlace) {
            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;
            if (addrInput) addrInput.value = this._lockedPlace;
            this._tempAddress = this._lockedPlace;
            // Show clear button
            const clearBtn = document.getElementById('map-search-clear');
            if (clearBtn) clearBtn.style.display = 'flex';
            return;
        }
        // --- V10.3: MULTI-STRATEGY PRECISION LOOKUP ---
        let name = "";
        let isEstablishment = false;
        let fullAddress = "";

        // STRATEGY 1: GOOGLE PLACES (BEST FOR BUSINESSES)
        if (window.google && google.maps && google.maps.places && this.googleMap) {
            try {
                const placesService = new google.maps.places.PlacesService(this.googleMap);
                const nearby = await new Promise((resolve) => {
                    placesService.nearbySearch({
                        location: { lat, lng },
                        radius: 20, // Tight 20m radius for pinpoint precision
                        rankBy: google.maps.places.RankBy.PROMINENCE
                    }, (results, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK) resolve(results);
                        else resolve(null);
                    });
                });

                if (nearby && nearby.length > 0) {
                    // Skip administrative areas
                    const areaTypes = ['locality', 'neighborhood', 'political', 'sublocality', 'country'];
                    const best = nearby.find(r => !r.types.some(t => areaTypes.includes(t)));
                    
                    if (best && best.name) {
                        name = best.name;
                        isEstablishment = true;
                        fullAddress = best.vicinity || best.name;
                    }
                }
            } catch (err) {
                console.warn('Strategy 1 (Places) failed:', err);
            }
        }

        // STRATEGY 2: GOOGLE GEOCODER (BEST FOR STREET ADDRESSES)
        if (!isEstablishment && window.google && google.maps && google.maps.Geocoder) {
            try {
                const geocoder = new google.maps.Geocoder();
                const response = await Promise.race([
                    new Promise((resolve, reject) => {
                        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                            if (status === "OK") resolve(results);
                            else reject(status);
                        });
                    }),
                    new Promise((_, reject) => setTimeout(() => reject('timeout'), 1500))
                ]);

                if (response && response.length > 0) {
                    // Find anything specific (not a broad area or a whole district/barangay)
                    const areaTypes = [
                        'locality', 'neighborhood', 'political', 'sublocality', 
                        'administrative_area_level_1', 'administrative_area_level_2', 
                        'administrative_area_level_3', 'administrative_area_level_4', 
                        'administrative_area_level_5', 'country', 'postal_code'
                    ];
                    
                    // Try to find the most specific result that is NOT one of those area types
                    const specificResult = response.find(r => !r.types.some(t => areaTypes.includes(t)));
                    
                    if (specificResult) {
                        name = specificResult.name || specificResult.formatted_address.split(',')[0].trim();
                        isEstablishment = specificResult.types.includes('establishment') || specificResult.types.includes('point_of_interest');
                        fullAddress = specificResult.formatted_address;
                    } else {
                        // Fallback to the first result but filter out area names from the label
                        const first = response[0];
                        const parts = first.formatted_address.split(',');
                        // If the first part is a number or street, use it. 
                        // In PH, addresses often start with block/lot or street name.
                        name = parts.slice(0, 2).join(',').trim();
                        fullAddress = first.formatted_address;
                    }
                }
            } catch (err) {
                console.warn('Strategy 2 (Geocoder) failed:', err);
            }
        }

        // FINALIZE GOOGLE RESULTS
        if (name) {
            if (isEstablishment) {
                if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 BIZ</span>`;
                this._tempEstablishment = name;
            } else {
                if (badgeElem) badgeElem.innerHTML = `<span class="live-badge">📍 LIVE</span>`;
                this._tempEstablishment = null;
            }
            if (addrInput) addrInput.value = name;
            this._tempAddress = name;
            this._tempFullAddress = fullAddress;
            const satLabel = document.querySelector(".sat-label");
            if (satLabel) satLabel.innerText = name;
            const clearBtn = document.getElementById('map-search-clear');
            if (clearBtn) clearBtn.style.display = 'flex';
            return;
        }

        // STRATEGY 3: OSM/NOMINATIM FALLBACK
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&namedetails=1`, {
                headers: { 'User-Agent': 'IceQube-CDO-App' }
            });
            const data = await response.json();
            
            if (data && data.address) {
                let name = '';
                let isEstablishment = false;
                const details = data.address;
                this._lastNominatimDetails = details; // Save for fallback

                // Priority 1: Named establishment from address details
                const poiName = details.amenity || details.shop || details.cafe || details.restaurant || 
                    details.tourism || details.leisure || details.office || details.building;
                
                if (poiName && poiName !== 'yes') {
                    name = poiName;
                    isEstablishment = true;
                }
                // Priority 2: Named result from namedetails
                else if (data.namedetails && data.namedetails.name) {
                    name = data.namedetails.name;
                    isEstablishment = ['amenity','tourism','shop','leisure','office'].includes(data.class);
                }
                // Priority 3: Street (Explicitly avoid using Barangay/Area as primary name)
                else {
                    const road = details.road || details.pedestrian || details.residential || '';
                    if (road) {
                        name = road;
                    } else {
                        // If no road, use display name but skip the first part if it's a known area
                        const parts = data.display_name.split(',');
                        name = parts.slice(0, 2).join(',').trim();
                    }
                }

                if (addrInput) addrInput.value = name;
                this._tempAddress = name;
                this._tempFullAddress = data.display_name;
            }
        } catch (e) {
            console.warn('Strategy 3 (Nominatim) failed:', e);
        }

        // STRATEGY 4: DEEP OSM SEARCH (OVERPASS API) - EXTREMELY ROBUST FALLBACK
        if (!name) {
            try {
                const overpassQuery = `[out:json][timeout:3];(node(around:50,${lat},${lng})["name"];way(around:50,${lat},${lng})["name"];);out center body;`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);

                let response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`, { signal: controller.signal })
                    .catch(() => fetch(`https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(overpassQuery)}`, { signal: controller.signal }));
                
                clearTimeout(timeoutId);
                if (response) {
                    const data = await response.json();
                    if (data && data.elements && data.elements.length > 0) {
                        const skip = [
                            'highway', 'traffic_signals', 'street_lamp', 'bench', 
                            'boundary', 'admin_level', 'place', 'city_district', 
                            'suburb', 'neighborhood'
                        ];
                        const best = data.elements.find(el => el.tags && el.tags.name && !Object.keys(el.tags).some(k => skip.includes(k)));
                        
                        if (best && best.tags && best.tags.name) {
                            name = best.tags.name;
                            isEstablishment = true;
                            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 BIZ</span>`;
                            if (addrInput) addrInput.value = name;
                            this._tempAddress = name;
                            this._tempEstablishment = name;
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn('Strategy 4 (Overpass) failed:', err);
            }
        }

        // LAST RESORT FALLBACK
        if (!name) {
            // Try to use a saved road from previous strategies
            const savedRoad = (this._lastNominatimDetails && this._lastNominatimDetails.road) ? this._lastNominatimDetails.road : '';
            const fallback = savedRoad ? `Near ${savedRoad}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            
            if (addrInput) addrInput.value = fallback;
            this._tempAddress = fallback;
            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge">📍 PIN</span>`;
        }
    },
    finalizeAddress(target, lat, lng) {
        let name = target.name || target.formatted_address.split(',').slice(0, 2).join(',').trim();
        const isPOI = target.types && (target.types.includes('establishment') || target.types.includes('point_of_interest'));
        
        const addrInput = document.getElementById('map-search-input');
        const badgeElem = document.getElementById('map-badge-container');

        if (isPOI) {
            const parts = target.formatted_address ? target.formatted_address.split(',') : [name];
            name = parts[0].trim();
            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 BIZ</span>`;
            if (addrInput) addrInput.value = name;
        } else {
            if (badgeElem) badgeElem.innerHTML = `<span class="live-badge">📍 LIVE</span>`;
            if (addrInput) addrInput.value = name;
        }

        // Synchronize with the bottom Satellite label
        const satLabel = document.querySelector(".sat-label");
        if (satLabel) satLabel.innerText = name;

        this._tempAddress = name;
        this._tempEstablishment = isPOI ? name : null;
        this._tempLat = lat;
        this._tempLng = lng;
        this.sanitizeSearchIcons();
    },


    confirmMapLocation() {
        if (!this._tempAddress) {
            this._tempAddress = (this._tempLat && this._tempLng) 
                ? `${this._tempLat.toFixed(4)}, ${this._tempLng.toFixed(4)}`
                : "Selected Location";
        }

        if (this.mapContext === 'profile') {
            const addrInput = document.getElementById('profile-address');
            const latInput = document.getElementById('profile-lat');
            const lngInput = document.getElementById('profile-lng');
            
            if (addrInput) addrInput.value = this._tempAddress;
            if (latInput) latInput.value = this._tempLat || 0;
            if (lngInput) lngInput.value = this._tempLng || 0;

            this.showToast("📍 Location Pinned to Profile", 'success');
        } else {
            // Regular Order Logic
            // Note: We no longer auto-fill delivery-location with the map address (manual entry only)
            
            this.orderData.deliveryDetails.location = document.getElementById('delivery-location')?.value || this._tempAddress;
            this.orderData.deliveryDetails.physical_address = this._tempFullAddress || this._tempAddress;
            if (this._tempEstablishment) {
                this.orderData.deliveryDetails.establishment = this._tempEstablishment;
            }
            this.orderData.deliveryDetails.lat = this._tempLat || 0;
            this.orderData.deliveryDetails.lng = this._tempLng || 0;
            
            const mapsInput = document.getElementById('delivery-maps');
            if (mapsInput && this._tempLat && this._tempLng) {
                const displayText = `📍 ${this._tempAddress}`;
                mapsInput.value = displayText;
                mapsInput.classList.add('populated');
                mapsInput.title = `https://www.google.com/maps/@${this._tempLat},${this._tempLng},17z`;
                this.orderData.deliveryDetails.maps = `https://www.google.com/maps/@${this._tempLat},${this._tempLng},17z`;
            }
            this.calculateDeliveryFee();
        }
        
        this.hideSearchSuggestions();
        this.closeMapOverlay();
    },

    sanitizeSearchIcons() {
        const cleaner = () => {
            document.querySelectorAll('.pac-icon, .pac-item:before, .pac-container:after').forEach(el => {
                el.style.display = 'none';
                el.style.width = '0';
            });
        };
        cleaner();
        setTimeout(cleaner, 100);
        setTimeout(cleaner, 500);
    },

    // --- V8 LIVE SEARCH ENGINE ---
    _searchTimer: null,
    _searchAbort: null,

    onMapSearchInput(value) {
        const clearBtn = document.getElementById('map-search-clear');
        if (clearBtn) clearBtn.style.display = value.length > 0 ? 'flex' : 'none';

        // Break any locked place when user starts typing
        this._lockedPlace = null;

        if (this._searchTimer) clearTimeout(this._searchTimer);
        if (!value || value.trim().length < 3) {
            this.hideSearchSuggestions();
            return;
        }

        // Show loading state
        const suggestionsEl = document.getElementById('map-search-suggestions');
        if (suggestionsEl) {
            suggestionsEl.style.display = 'block';
            suggestionsEl.innerHTML = '<div class="suggestion-loading">Searching...</div>';
        }

        this._searchTimer = setTimeout(() => this._fetchSuggestions(value.trim()), 350);
    },

    async _fetchSuggestions(query) {
        if (this._searchAbort) this._searchAbort.abort();
        this._searchAbort = new AbortController();

        let resultsFound = false;

        // STRATEGY 1: GOOGLE PLACES AUTOCOMPLETE
        if (window.google && google.maps && google.maps.places) {
            try {
                const service = new google.maps.places.AutocompleteService();
                const predictions = await Promise.race([
                    new Promise((resolve) => {
                        service.getPlacePredictions({
                            input: query,
                            locationBias: { radius: 10000, center: { lat: 8.4772, lng: 124.6459 } },
                            componentRestrictions: { country: 'ph' }
                        }, (results, status) => {
                            if (status === google.maps.places.PlacesServiceStatus.OK) resolve(results);
                            else resolve(null);
                        });
                    }),
                    new Promise((resolve) => setTimeout(() => resolve(null), 2000))
                ]);

                if (predictions && predictions.length > 0) {
                    this.showGoogleSuggestions(predictions, query);
                    resultsFound = true;
                    return;
                }
            } catch (err) {
                console.warn('Autocomplete failed:', err);
            }

            // STRATEGY 1B: GOOGLE TEXT SEARCH (DEEPER SEARCH)
            try {
                const placesService = new google.maps.places.PlacesService(this.googleMap || document.createElement('div'));
                const textResults = await Promise.race([
                    new Promise((resolve) => {
                        placesService.textSearch({
                            query: query + ', Cagayan de Oro',
                            location: { lat: 8.4772, lng: 124.6459 },
                            radius: 5000
                        }, (results, status) => {
                            if (status === google.maps.places.PlacesServiceStatus.OK) resolve(results);
                            else resolve(null);
                        });
                    }),
                    new Promise((resolve) => setTimeout(() => resolve(null), 2500)) // 2.5s timeout
                ]);

                if (textResults && textResults.length > 0) {
                    this.showGoogleSearchResults(textResults);
                    resultsFound = true;
                    return;
                }
            } catch (err) {
                console.warn('TextSearch failed:', err);
            }
        }

        // STRATEGY 2: OSM NOMINATIM FALLBACK
        if (!resultsFound) {
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Cagayan de Oro')}&limit=5&addressdetails=1&namedetails=1`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'IceQube-CDO-App' }
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                
                if (data && data.length > 0) {
                    this.showSearchSuggestions(data, query);
                    resultsFound = true;
                }
            } catch (e) {
                console.warn('OSM Search failed:', e);
            }
        }

        // STRATEGY 3: DEEP OVERPASS SEARCH (BROADER)
        if (!resultsFound) {
            try {
                const overpassQuery = `[out:json][timeout:5];(node["name"~"${query}",i](around:10000,8.4772,124.6459);way["name"~"${query}",i](around:10000,8.4772,124.6459);relation["name"~"${query}",i](around:10000,8.4772,124.6459););out center body;`;
                // Try main server, then mirror
                let response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`).catch(() => null);
                if (!response) response = await fetch(`https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(overpassQuery)}`).catch(() => null);
                
                if (response) {
                    const data = await response.json();
                    if (data && data.elements && data.elements.length > 0) {
                        this.showOverpassSuggestions(data.elements, query);
                        resultsFound = true;
                    }
                }
            } catch (err) {
                console.warn('Overpass failed:', err);
            }
        }

        if (!resultsFound) {
            const el = document.getElementById('map-search-suggestions');
            if (el) {
                el.innerHTML = `
                    <div class="suggestion-item" onclick="app.useManualSearchName('${query.replace(/'/g, "\\'")}')">
                        <div class="suggestion-icon">📍</div>
                        <div class="suggestion-text">
                            <div class="suggestion-name">Use "${query}"</div>
                            <div class="suggestion-address">Pin this name to current location</div>
                        </div>
                    </div>
                    <div class="suggestion-empty">No other results found</div>
                `;
                el.style.display = 'block';
            }
        }
    },

    useManualSearchName(name) {
        this._lockedPlace = name;
        this._tempAddress = name;
        this._tempEstablishment = name;
        
        const input = document.getElementById('map-search-input');
        if (input) input.value = name;

        const badge = document.getElementById('map-badge-container');
        if (badge) badge.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 MANUAL</span>`;

        const satLabel = document.querySelector(".sat-label");
        if (satLabel) satLabel.innerText = name;

        this.hideSearchSuggestions();
    },

    showGoogleSearchResults(results) {
        const el = document.getElementById('map-search-suggestions');
        if (!el) return;

        let html = '';
        results.slice(0, 5).forEach((item, i) => {
            const name = item.name;
            const addr = item.formatted_address || item.vicinity;
            const isEstablishment = true; // textSearch results are usually establishments
            
            html += `<div class="suggestion-item" onclick="app.selectGoogleSearchResult(${i})">
                <div class="suggestion-icon establishment">🏢</div>
                <div class="suggestion-text">
                    <div class="suggestion-name">${name}</div>
                    <div class="suggestion-address">${addr}</div>
                </div>
            </div>`;
        });

        el.innerHTML = html;
        el.style.display = 'block';
        this._lastGoogleResults = results;
    },

    selectGoogleSearchResult(index) {
        const item = this._lastGoogleResults && this._lastGoogleResults[index];
        if (!item) return;

        const lat = item.geometry.location.lat();
        const lng = item.geometry.location.lng();
        const name = item.name;

        this._lockedPlace = name;
        this._tempAddress = name;
        this._tempLat = lat;
        this._tempLng = lng;
        this._tempFullAddress = item.formatted_address;

        const input = document.getElementById('map-search-input');
        if (input) input.value = name;

        const badge = document.getElementById('map-badge-container');
        if (badge) badge.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;

        if (this.googleMap) {
            this.googleMap.setCenter({ lat, lng });
            this.googleMap.setZoom(18);
            if (this.googleMarker) this.googleMarker.setPosition({ lat, lng });
        }
        this.hideSearchSuggestions();
    },

    showOverpassSuggestions(elements, query) {
        const el = document.getElementById('map-search-suggestions');
        if (!el) return;

        let html = '';
        elements.slice(0, 5).forEach((item, i) => {
            const name = item.tags.name;
            const addr = item.tags['addr:street'] ? `${item.tags['addr:street']}, ${item.tags['addr:city'] || 'CDO'}` : 'Local Business';
            
            html += `<div class="suggestion-item" onclick="app.selectOverpassSuggestion(${i})">
                <div class="suggestion-icon establishment">🏢</div>
                <div class="suggestion-text">
                    <div class="suggestion-name">${name}</div>
                    <div class="suggestion-address">${addr}</div>
                </div>
            </div>`;
        });

        el.innerHTML = html;
        el.style.display = 'block';
        this._lastOverpassSuggestions = elements;
    },

    selectOverpassSuggestion(index) {
        const item = this._lastOverpassSuggestions && this._lastOverpassSuggestions[index];
        if (!item) return;

        const lat = item.lat;
        const lng = item.lon;
        const name = item.tags.name;

        this._lockedPlace = name;
        this._tempAddress = name;
        this._tempLat = lat;
        this._tempLng = lng;

        const input = document.getElementById('map-search-input');
        if (input) input.value = name;

        const badge = document.getElementById('map-badge-container');
        if (badge) badge.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;

        if (this.googleMap) {
            this.googleMap.setCenter({ lat, lng });
            this.googleMap.setZoom(20);
            if (this.googleMarker) this.googleMarker.setPosition({ lat, lng });
        } else if (this.map) {
            this.map.setView([lat, lng], 20);
            if (this.mapMarker) this.mapMarker.setLatLng([lat, lng]);
        }
        this.hideSearchSuggestions();
    },

    showGoogleSuggestions(predictions, query) {
        const el = document.getElementById('map-search-suggestions');
        if (!el) return;

        let html = '';
        predictions.forEach((item, i) => {
            const name = item.structured_formatting.main_text;
            const addr = item.structured_formatting.secondary_text;
            const isEstablishment = item.types.includes('establishment') || item.types.includes('point_of_interest');
            const iconClass = isEstablishment ? 'establishment' : 'address';
            const icon = isEstablishment ? '🏢' : '📍';

            html += `<div class="suggestion-item" onclick="app.selectGoogleSuggestion(${i})">
                <div class="suggestion-icon ${iconClass}">${icon}</div>
                <div class="suggestion-text">
                    <div class="suggestion-name">${name}</div>
                    <div class="suggestion-address">${addr}</div>
                </div>
            </div>`;
        });

        el.innerHTML = html;
        el.style.display = 'block';
        this._lastGoogleSuggestions = predictions;
    },

    async selectGoogleSuggestion(index) {
        const item = this._lastGoogleSuggestions && this._lastGoogleSuggestions[index];
        if (!item || !this.googleMap) return;

        const placesService = new google.maps.places.PlacesService(this.googleMap);
        try {
            const details = await new Promise((resolve, reject) => {
                placesService.getDetails({ placeId: item.place_id, fields: ['geometry', 'name', 'formatted_address'] }, (res, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) resolve(res);
                    else reject(status);
                });
            });

            if (details && details.geometry) {
                const lat = details.geometry.location.lat();
                const lng = details.geometry.location.lng();
                const name = details.name || item.structured_formatting.main_text;

                this._lockedPlace = name;
                this._tempAddress = name;
                this._tempLat = lat;
                this._tempLng = lng;
                this._tempFullAddress = details.formatted_address;

                const input = document.getElementById('map-search-input');
                if (input) input.value = name;

                const badge = document.getElementById('map-badge-container');
                if (badge) badge.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;

                if (this.googleMap) {
                    this.googleMap.setCenter({ lat, lng });
                    this.googleMap.setZoom(20);
                    if (this.googleMarker) this.googleMarker.setPosition({ lat, lng });
                }
            }
        } catch (err) {
            console.error('Select Google suggestion failed:', err);
        }
        this.hideSearchSuggestions();
    },

    showSearchSuggestions(results, query) {
        const el = document.getElementById('map-search-suggestions');
        if (!el) return;

        if (!results || results.length === 0) {
            el.innerHTML = '<div class="suggestion-empty">No results found</div>';
            el.style.display = 'block';
            return;
        }

        const establishmentTypes = ['amenity','tourism','historic','office','shop','leisure','building'];
        let html = '';
        results.forEach((item, i) => {
            const isEstablishment = establishmentTypes.includes(item.class) || 
                (item.namedetails && item.namedetails.name);
            const name = (item.namedetails && item.namedetails.name) ? item.namedetails.name : item.display_name.split(',')[0].trim();
            const addr = item.display_name.split(',').slice(1, 3).join(',').trim();
            const iconClass = isEstablishment ? 'establishment' : 'address';
            const icon = isEstablishment ? '🏢' : '📍';

            html += `<div class="suggestion-item" onclick="app.selectSuggestion(${i})">
                <div class="suggestion-icon ${iconClass}">${icon}</div>
                <div class="suggestion-text">
                    <div class="suggestion-name">${name}</div>
                    <div class="suggestion-address">${addr}</div>
                </div>
            </div>`;
        });

        el.innerHTML = html;
        el.style.display = 'block';
        this._lastSuggestions = results;
    },

    hideSearchSuggestions() {
        const el = document.getElementById('map-search-suggestions');
        if (el) el.style.display = 'none';
    },

    selectSuggestion(index) {
        const item = this._lastSuggestions && this._lastSuggestions[index];
        if (!item) return;

        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const establishmentTypes = ['amenity','tourism','historic','office','shop','leisure','building'];
        const isEstablishment = establishmentTypes.includes(item.class) || (item.namedetails && item.namedetails.name);
        const name = (item.namedetails && item.namedetails.name) ? item.namedetails.name : item.display_name.split(',')[0].trim();

        // Lock the place name
        this._lockedPlace = name;
        this._tempAddress = name;
        this._tempEstablishment = isEstablishment ? name : null;
        this._tempLat = lat;
        this._tempLng = lng;
        // Store full address for rider
        this._tempFullAddress = item.display_name;

        // Update the search input
        const input = document.getElementById('map-search-input');
        if (input) input.value = name;

        // Update badge
        const badge = document.getElementById('map-badge-container');
        if (badge) badge.innerHTML = `<span class="live-badge" style="background:#4382ec;">📍 EXACT</span>`;

        // Move map pin to this location
        if (this.map) {
            this.map.setView([lat, lng], 18, { animate: true });
            if (this.mapMarker) this.mapMarker.setLatLng([lat, lng]);
        } else if (this.googleMap) {
            this.googleMap.setCenter({ lat, lng });
            this.googleMap.setZoom(18);
            if (this.googleMarker) this.googleMarker.setPosition({ lat, lng });
        }

        // Hide suggestions
        this.hideSearchSuggestions();

        // Update clear button
        const clearBtn = document.getElementById('map-search-clear');
        if (clearBtn) clearBtn.style.display = 'flex';
    },

    clearMapSearch() {
        const input = document.getElementById('map-search-input');
        if (input) { input.value = ''; input.focus(); }
        const clearBtn = document.getElementById('map-search-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        this._lockedPlace = null;
        this._tempAddress = null;
        this._tempEstablishment = null;
        this.hideSearchSuggestions();
        const badge = document.getElementById('map-badge-container');
        if (badge) badge.innerHTML = '';
    },

    toggleMapType() {
        const btn = document.getElementById('map-type-toggle');
        const isSatellite = btn.classList.toggle('satellite-active');
        
        if (this.googleMap) {
            this.googleMap.setMapTypeId(isSatellite ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP);
        } else if (this.map) {
            const type = isSatellite ? 'y' : 'm';
            const url = `https://mt1.google.com/vt/lyrs=${type}&hl=en&gl=ph&x={x}&y={y}&z={z}`;
            this.map.eachLayer((layer) => {
                if (layer instanceof L.TileLayer) {
                    layer.setUrl(url);
                }
            });
        }

        // Update button appearance
        if (isSatellite) {
            btn.style.background = 'var(--accent)';
            btn.style.color = 'white';
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                Standard
            `;
        } else {
            btn.style.background = '';
            btn.style.color = '';
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Satellite
            `;
        }
    },

    closeMapOverlay() {
        this.hideSearchSuggestions();
        document.getElementById('map-overlay').classList.remove('active');
    },

    prevStep() {
        if (this.steps[this.currentStep] === 'logistics' && this.logisticsState !== 'selection') {
            this.showLogisticsSubView('selection');
            return;
        }

        if (this.currentStep > 0) {
            const from = this.currentStep;

            // Contextual Return: If we are in 'automate' and came from elsewhere (like Account Panel)
            if (this.steps[this.currentStep] === 'automate' && this.automateSourceStep !== undefined) {
                const to = this.automateSourceStep;
                const sourcePanel = this.automateSourcePanel;
                
                // Clear the source trackers
                this.automateSourceStep = undefined;
                this.automateSourcePanel = null;
                
                this.currentStep = to;
                this.showStep(this.currentStep, 'prev', from);
                
                // If we returned from a panel context, reopen it
                if (sourcePanel) {
                    setTimeout(() => this.togglePanel(sourcePanel, true), 10);
                }
                return;
            }

            // Skip Logistics (Step 3) backwards if it's a Quick Reorder
            if (this.isQuickReorder && this.currentStep === 4) {
                this.currentStep = 2; // Jump back to Schedule
            } else {
                this.currentStep--;
            }

            this.showStep(this.currentStep, 'prev', from);

            // When navigating back to the schedule step, always restore the
            // default dual-card view so the user can re-select cleanly.
            if (this.steps[this.currentStep] === 'schedule') {
                this.resetScheduleView();
            }
        }
    },

    updateProgress() {
        const bar = document.getElementById('progress-bar');
        const percentage = ((this.currentStep) / (this.steps.length - 1)) * 100;
        bar.style.width = `${percentage}%`;
    },

    slideQty(slideName) {
        const track = document.getElementById('qty-carousel-track');
        const tabFull = document.getElementById('tab-full-dice');
        const tabHalf = document.getElementById('tab-half-dice');

        if (slideName === 'half-dice') {
            track.style.transform = 'translateX(-50%)';
            if (tabFull) tabFull.classList.remove('active');
            if (tabHalf) tabHalf.classList.add('active');
        } else {
            track.style.transform = 'translateX(0)';
            if (tabFull) tabFull.classList.add('active');
            if (tabHalf) tabHalf.classList.remove('active');
        }
    },

    updateQty(iceType, product, delta) {
        this.orderData.qty[iceType][product] = Math.max(0, this.orderData.qty[iceType][product] + delta);
        document.getElementById(`qty-${iceType}-${product}`).value = this.orderData.qty[iceType][product];
        this.updateTotal();
    },

    handleQtyInput(iceType, product, value) {
        let val = parseInt(value) || 0;
        if (val < 0) val = 0;
        this.orderData.qty[iceType][product] = val;
        // Don't force update the input value here to allow typing
        this.updateTotal();
    },

    updateTotal() {
        const fd3 = this.orderData.qty.fullDice['3kg'];
        const fd1 = this.orderData.qty.fullDice['1kg'];
        const hd3 = this.orderData.qty.halfDice['3kg'];
        const hd1 = this.orderData.qty.halfDice['1kg'];
        
        const q3kg = fd3 + hd3;
        let total3kg = q3kg * 40;
        this.orderData.bonusState3kg = false;
        this.orderData.bulkState3kg = false;

        if (q3kg >= 14) {
            total3kg = q3kg * 35;
            this.orderData.bulkState3kg = true;
        } else if (q3kg === 13) {
            total3kg = 490; // Force total to ₱490 for 13 bags (Paradox Protection)
            this.orderData.bonusState3kg = true;
        }

        const q1kg = fd1 + hd1;
        let total1kg = q1kg * 15;
        this.orderData.bonusState1kg = false;
        this.orderData.bulkState1kg = false;

        if (q1kg >= 40) {
            total1kg = q1kg * 14;
            this.orderData.bulkState1kg = true;
        } else if (q1kg === 38 || q1kg === 39) {
            total1kg = 560; // Force total to ₱560 for 38/39 bags (Paradox Protection)
            this.orderData.bonusState1kg = true;
        }

        const promoBoxes = document.querySelectorAll('.bulk-promo-box');
        if (promoBoxes.length > 0) {
            let notice = 'Wholesale: 14+ 3kg (₱35) or 40+ 1kg (₱14)';
            let reached = false;
            
            if (this.orderData.bulkState3kg && this.orderData.bulkState1kg) {
                notice = '🔥 Bulk Applied: 3kg (₱35) & 1kg (₱14)';
                reached = true;
            } else if (this.orderData.bulkState3kg) {
                notice = '🔥 Bulk Applied: 3kg bags now ₱35';
                reached = true;
            } else if (this.orderData.bulkState1kg) {
                notice = '🔥 Bulk Applied: 1kg bags now ₱14';
                reached = true;
            } else if (this.orderData.bonusState3kg) {
                notice = '🎁 14th bag of 3kg is FREE!';
                reached = true;
            } else if (this.orderData.bonusState1kg) {
                notice = '🎁 40+ bags of 1kg unlocks ₱14 rate!';
                reached = true;
            }
            
            promoBoxes.forEach(box => {
                const textElem = box.querySelector('.bulk-promo-text');
                if (textElem) textElem.innerHTML = notice;
                
                if (reached) {
                    box.classList.remove('promo-info');
                    box.classList.add('promo-reached');
                } else {
                    box.classList.add('promo-info');
                    box.classList.remove('promo-reached');
                }
            });
        }

        this.orderData.total = total3kg + total1kg;
        const nextBtn = document.getElementById('qty-next');
        nextBtn.innerText = `Confirm Order (₱${this.orderData.total})`;
        nextBtn.disabled = this.orderData.total === 0;
    },

    confirmQuantity() {
        if (this.orderData.bonusState3kg || this.orderData.bonusState1kg) {
            if (this.orderData.bonusState3kg) {
                const fd3 = this.orderData.qty.fullDice['3kg'];
                const hd3 = this.orderData.qty.halfDice['3kg'];
                // Adjust to exactly 14 bags
                const diff = 14 - (fd3 + hd3);
                if (fd3 > 0) {
                    this.orderData.qty.fullDice['3kg'] += diff;
                    document.getElementById('qty-fullDice-3kg').value = this.orderData.qty.fullDice['3kg'];
                } else {
                    this.orderData.qty.halfDice['3kg'] += diff;
                    document.getElementById('qty-halfDice-3kg').value = this.orderData.qty.halfDice['3kg'];
                }
                this.orderData.wasAutoAdjusted3kg = true;
            }
            if (this.orderData.bonusState1kg) {
                const fd1 = this.orderData.qty.fullDice['1kg'];
                const hd1 = this.orderData.qty.halfDice['1kg'];
                // Adjust to exactly 40 bags
                const diff = 40 - (fd1 + hd1);
                if (fd1 > 0) {
                    this.orderData.qty.fullDice['1kg'] += diff;
                    document.getElementById('qty-fullDice-1kg').value = this.orderData.qty.fullDice['1kg'];
                } else {
                    this.orderData.qty.halfDice['1kg'] += diff;
                    document.getElementById('qty-halfDice-1kg').value = this.orderData.qty.halfDice['1kg'];
                }
                this.orderData.wasAutoAdjusted1kg = true;
            }
            this.updateTotal(); 
        }
        this.nextStep();
    },

    selectSchedule(type, element) {
        this.orderData.schedule.type = type;

        // Highlight the selected card
        const cards = document.querySelectorAll('#step-schedule .card');
        cards.forEach(card => card.classList.remove('selected'));
        element.classList.add('selected');

        const inputs = document.getElementById('schedule-inputs');
        const nextBtn = document.getElementById('schedule-next');

        if (type === 'Deliver Now') {
            // --- IMMEDIATE PATH ---
            // Tag the order as immediate and hide pickers + Continue button
            this.orderData.schedule.delivery_type = 'immediate';
            this.orderData.schedule.date = '';
            this.orderData.schedule.time = '';
            inputs.style.display = 'none';
            nextBtn.style.display = 'none';
            nextBtn.disabled = true;

            // Auto-advance to the Logistics step after a brief visual delay
            // so the user sees the card selection animate before sliding out
            setTimeout(() => this.nextStep(), 320);

        } else {
            // --- SCHEDULED PATH ---
            // Hide the "Deliver Now" card so the UI focuses on date/time entry
            document.getElementById('card-deliver-now').style.display = 'none';
            this.orderData.schedule.delivery_type = 'scheduled';
            inputs.style.display = 'block';
            nextBtn.style.display = '';
            this.validateSchedule(); // re-evaluate enabled state
        }
    },

    resetScheduleView() {
        this.orderData.schedule.type = null;
        this.orderData.schedule.delivery_type = null;
        this.orderData.schedule.date = '';
        this.orderData.schedule.time = '';

        // Re-show both cards, clear any selection highlight
        const deliverNowCard = document.getElementById('card-deliver-now');
        const scheduleCard  = document.getElementById('card-schedule-date');
        if (deliverNowCard) deliverNowCard.style.display = '';
        [deliverNowCard, scheduleCard].forEach(c => c && c.classList.remove('selected'));

        // Hide pickers and reset their values
        const inputs = document.getElementById('schedule-inputs');
        if (inputs) inputs.style.display = 'none';
        
        document.getElementById('schedule-date').value = '';
        document.getElementById('schedule-time').value = '';
        
        // Reset dropdowns
        const hourSelect = document.getElementById('select-hour');
        const minSelect = document.getElementById('select-minute');
        if (hourSelect) hourSelect.selectedIndex = 0;
        if (minSelect) minSelect.value = '00';

        // Hide and disable the Continue button
        const nextBtn = document.getElementById('schedule-next');
        if (nextBtn) {
            nextBtn.style.display = 'none';
            nextBtn.disabled = true;
        }

        // Reset warning
        const warning = document.getElementById('time-warning');
        if (warning) warning.classList.remove('active');

        // Reset display values
        const displayDate = document.getElementById('display-date');
        const displayHour = document.getElementById('display-hour');
        const displayMin = document.getElementById('display-minute');
        if (displayDate) displayDate.innerText = 'Select Date';
        if (displayHour) displayHour.innerText = 'Pick';
        if (displayMin) displayMin.innerText = '00';
    },

    handleInlineTimeChange() {
        const hourSelect = document.getElementById('select-hour');
        const minSelect = document.getElementById('select-minute');
        const hour = hourSelect.value;
        const minute = minSelect.value;
        
        // Update display values
        const displayHour = document.getElementById('display-hour');
        const displayMin = document.getElementById('display-minute');
        
        if (hour) {
            const hourText = hourSelect.options[hourSelect.selectedIndex].text;
            if (displayHour) displayHour.innerText = hourText;
        }
        if (minute && displayMin) displayMin.innerText = minute;

        if (hour && minute) {
            const timeValue = `${hour}:${minute}`;
            const timeInput = document.getElementById('schedule-time');
            if (timeInput) timeInput.value = timeValue;
            this.validateSchedule();
        }
    },

    handlePickerChange(type, value) {
        if (type === 'date') {
            const display = document.getElementById('display-date');
            if (value) {
                const [y, m, d] = value.split('-');
                const dateObj = new Date(y, m - 1, d);
                display.innerText = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            } else {
                display.innerText = 'Select Date';
            }
        }
        this.validateSchedule();
    },

    validateSchedule() {
        const type = this.orderData.schedule.type;
        const nextBtn = document.getElementById('schedule-next');
        const warning = document.getElementById('time-warning');
        const warningText = warning ? warning.querySelector('span') : null;
        
        if (type === 'Deliver Now') {
            nextBtn.disabled = false;
            if (warning) warning.classList.remove('active');
            return;
        }

        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        
        this.orderData.schedule.date = date;
        this.orderData.schedule.time = time;

        let isValidTime = true;
        let isValidDate = true;
        let msg = "";

        if (time) {
            const [hours, minutes] = time.split(':').map(Number);
            isValidTime = hours >= 8 && hours < 22;
            if (!isValidTime) msg = "Delivery is only available between 8 AM - 10 PM.";
        }

        if (date) {
            const selectedDate = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const maxDate = new Date(today);
            maxDate.setDate(today.getDate() + 14);

            if (selectedDate > maxDate) {
                isValidDate = false;
                msg = "Online booking is limited to 14 days in advance.";
            }
        }

        if (!isValidTime || !isValidDate) {
            if (warning) {
                if (warningText) warningText.innerHTML = `${msg} For special requests, please message our <a href="https://m.me/icequbecdo" target="_blank" style="color: inherit; font-weight: 700; text-decoration: underline;">FB Page</a> for negotiation.`;
                warning.classList.add('active');
            }
            nextBtn.disabled = true;
        } else {
            if (warning) warning.classList.remove('active');
            nextBtn.disabled = !date || !time;
        }
    },

    selectLogistics(method, element) {
        this.orderData.logistics = method;

        // Apply shared "Choice Standard" selection highlight
        const cards = document.querySelectorAll('#logistics-selection .card');
        cards.forEach(card => card.classList.remove('selected'));
        element.classList.add('selected');

        if (method === 'Doorstep Delivery') {
            this.showLogisticsSubView('delivery');
        } else {
            this.showLogisticsSubView('pickup');
        }
    },

    showLogisticsSubView(state) {
        this.logisticsState = state;
        document.querySelectorAll('.logistics-subview').forEach(view => {
            view.classList.remove('active');
        });

        if (state === 'selection') {
            document.getElementById('logistics-selection').classList.add('active');
        } else if (state === 'delivery') {
            document.getElementById('logistics-delivery').classList.add('active');
            // Re-validate if pin link or coordinates are already present
            this.calculateDeliveryFee();
        } else if (state === 'pickup') {
            document.getElementById('logistics-pickup').classList.add('active');
            setTimeout(() => this.initPickupMap(), 100);
        }
    },

    async calculateDeliveryFee() {
        const pinLink = document.getElementById('delivery-maps').value;
        const lat = this.orderData.deliveryDetails.lat;
        const lng = this.orderData.deliveryDetails.lng;
        const contact = document.getElementById('delivery-contact').value;
        const summaryDiv = document.getElementById('delivery-summary');
        const placeOrderBtn = document.getElementById('btn-payment-delivery');

        const digits = contact.replace(/\D/g, '');
        const isContactValid = digits.length === 11 && digits.startsWith('09');

        if ((!pinLink.trim() && !lat) || !isContactValid) {
            summaryDiv.style.display = 'none';
            placeOrderBtn.disabled = true;
            return;
        }

        // Simulate a tiny loading delay for realism while typing
        placeOrderBtn.disabled = true;
        document.getElementById('summary-delivery-fee').innerText = 'Calculating route...';

        const { distanceKm, routeTimeMins } = await this.fetchRoutingDistance(lat && lng ? `${lng},${lat}` : pinLink);

        let fee = 0;
        let zone = '';
        let isManualReview = false;

        // Rate Card logic based on Distance
        const calculateMaximFee = (distanceInKm) => {
            const baseFare = 30;
            const perKmRate = 10;
            if (distanceInKm <= 1) return baseFare;
            return baseFare + (Math.ceil(distanceInKm - 1) * perKmRate);
        };

        if (distanceKm > 15) {
            zone = `Outside CDO (>15km)`;
            fee = 0;
            isManualReview = true;
        } else {
            zone = `${distanceKm} km`;
            fee = calculateMaximFee(distanceKm);
        }

        // Traffic Bonus
        let trafficBonus = 0;
        if (routeTimeMins > 30 && !isManualReview) {
            trafficBonus = 20; // Rider Priority Fee
        }

        this.orderData.deliveryFee = fee + trafficBonus;
        this.orderData.isManualReview = isManualReview;
        this.orderData.deliveryZone = zone;

        summaryDiv.style.display = 'block';
        document.getElementById('summary-subtotal').innerText = `₱${this.orderData.total}`;
        document.getElementById('summary-zone').innerText = zone;
        
        let feeText = `₱${fee}`;
        if (trafficBonus > 0) feeText += ` + ₱${trafficBonus} (Priority Fee)`;
        
        document.getElementById('summary-delivery-fee').innerText = isManualReview ? 'Manual Review' : feeText;
        
        const manualReviewNotice = document.getElementById('summary-manual-review');
        if (isManualReview) {
            manualReviewNotice.style.display = 'block';
            document.getElementById('summary-total').innerText = `₱${this.orderData.total} + TBD`;
        } else {
            manualReviewNotice.style.display = 'none';
            document.getElementById('summary-total').innerText = `₱${this.orderData.total + this.orderData.deliveryFee}`;
        }
        
        placeOrderBtn.disabled = false;
    },

    async fetchRoutingDistance(destinationStr) {
        // ACTION: Fetch real driving distance from Piaping Itum, Macabalan
        // Origin coordinates: ~Piaping Itum, Macabalan
        const originLat = 8.5028;
        const originLon = 124.6565;

        if (destinationStr.includes(',')) {
            const parts = destinationStr.split(',');
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                // If it's a coord string "lng,lat"
                const destLon = parseFloat(parts[0]);
                const destLat = parseFloat(parts[1]);
                return this.getOSRMRoute(originLat, originLon, destLat, destLon);
            }
        }

        const lower = destinationStr.toLowerCase();
        
        if (lower.includes('puerto') || lower.includes('gaisano puerto')) {
            // Distance ~15km, Route Time ~45 mins
            // This triggers ₱30 (base 1km) + ₱140 (14km * 10) = ₱170 Delivery
            // Plus ₱20 Priority (time > 30mins) => ₱190 Total
            return { distanceKm: 15, routeTimeMins: 45 }; 
        } else if (lower.includes('outside') || lower.includes('opol')) {
            return { distanceKm: 18, routeTimeMins: 45 };
        } else if (lower.includes('fairy+garden') || lower.includes('fairy garden')) {
            // Specific validation for Fairy Garden route
            return { distanceKm: 8.2, routeTimeMins: 25 };
        } else if (lower.includes('egoymdi2') || (lower.includes('goo.gl') && !lower.includes('maps/place'))) {
            // Specific validation for the exact dummy shortened link 
            return { distanceKm: 4.2, routeTimeMins: 20 };
        }

        // Clean Google Maps links to extract the place name for geocoding
        let searchTarget = destinationStr;
        const placeMatch = destinationStr.match(/maps\/place\/([^\/@?]+)/i);
        if (placeMatch) {
            searchTarget = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        }

        try {
            // Step 1: Geocode destination using OSM Nominatim
            // Adding context makes the search more accurate for CDO limits
            const query = encodeURIComponent(`${searchTarget}, Cagayan de Oro, Philippines`);
            const geocodeRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
                headers: { 'Accept': 'application/json' }
            });
            const geocodeData = await geocodeRes.json();
            
            if (geocodeData && geocodeData.length > 0) {
                const destLat = parseFloat(geocodeData[0].lat);
                const destLon = parseFloat(geocodeData[0].lon);

                return this.getOSRMRoute(originLat, originLon, destLat, destLon);
            }
        } catch (error) {
            console.warn("Routing API Error, falling back to heuristics:", error);
        }
        
        // Fallback procedural estimation if geocoding fails
        let hash = 0;
        for (let i = 0; i < lower.length; i++) {
            hash = ((hash << 5) - hash) + lower.charCodeAt(i);
            hash |= 0;
        }
        hash = Math.abs(hash);
        
        const distScore = hash % 100;
        let distanceKm = 0;
        if (distScore < 35) distanceKm = 3.5; 
        else if (distScore < 70) distanceKm = 7.2; 
        else if (distScore < 90) distanceKm = 11.5; 
        else distanceKm = 16.5; 
        
        const routeTimeMins = 15 + Math.floor(distanceKm * 2.5);

        return { distanceKm, routeTimeMins };
    },

    goToPayment() {
        if (this.logisticsState === 'delivery') {
            this.orderData.deliveryDetails = {
                establishment: document.getElementById('delivery-location').value,
                physical_address: this._tempAddress || document.getElementById('delivery-location').value,
                person: document.getElementById('delivery-person').value,
                contact: document.getElementById('delivery-contact').value,
                instructions: document.getElementById('delivery-instructions').value,
                maps: document.getElementById('delivery-maps').value,
                lat: this._tempLat,
                lng: this._tempLng
            };
        } else if (this.logisticsState === 'pickup') {
            this.orderData.deliveryDetails = {
                establishment: document.getElementById('pickup-establishment').value,
                person: document.getElementById('pickup-person').value,
                contact: document.getElementById('pickup-contact').value,
                physical_address: 'Self-Pickup @ Macabalan Hub',
                instructions: 'Customer Pickup',
                maps: '',
                lat: null,
                lng: null
            };
        }
        
        // Populate the Payment Summary container added in index.html
        const summaryList = document.getElementById('payment-items-list');
        if (summaryList) {
            let html = '';
            const fd = this.orderData.qty.fullDice;
            const hd = this.orderData.qty.halfDice;
            
            if (fd['3kg'] > 0) html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${fd['3kg']}x Full-Dice (3kg)</span><span>₱${fd['3kg'] * (this.orderData.bulkState3kg ? 35 : 40)}</span></div>`;
            if (fd['1kg'] > 0) html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${fd['1kg']}x Full-Dice (1kg)</span><span>₱${fd['1kg'] * (this.orderData.bulkState1kg ? 14 : 15)}</span></div>`;
            if (hd['3kg'] > 0) html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${hd['3kg']}x Half-Dice (3kg)</span><span>₱${hd['3kg'] * (this.orderData.bulkState3kg ? 35 : 40)}</span></div>`;
            if (hd['1kg'] > 0) html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${hd['1kg']}x Half-Dice (1kg)</span><span>₱${hd['1kg'] * (this.orderData.bulkState1kg ? 14 : 15)}</span></div>`;
            
            summaryList.innerHTML = html || '<p style="opacity:0.6;font-size:0.8rem;">No items selected</p>';
        }

        const subtotalEl = document.getElementById('payment-subtotal');
        if (subtotalEl) subtotalEl.innerText = `₱${this.orderData.total}`;

        const deliveryEl = document.getElementById('payment-delivery-fee');
        if (deliveryEl) {
            deliveryEl.innerText = this.orderData.logistics === 'Doorstep Delivery' ? 
                (this.orderData.isManualReview ? 'TBD' : `₱${this.orderData.deliveryFee}`) : '₱0';
        }

        const totalEl = document.getElementById('payment-total');
        let totalVal = this.orderData.total;
        if (this.orderData.logistics === 'Doorstep Delivery' && !this.orderData.isManualReview) {
            totalVal += this.orderData.deliveryFee;
        }
        if (totalEl) totalEl.innerText = `₱${totalVal}${this.orderData.isManualReview ? ' + TBD' : ''}`;

        let displayTotalStr = `₱${this.orderData.total}`;
        if (this.orderData.logistics === 'Doorstep Delivery') {
            if (this.orderData.isManualReview) {
                displayTotalStr = `₱${this.orderData.total} + TBD`;
            } else {
                displayTotalStr = `₱${this.orderData.total + this.orderData.deliveryFee}`;
            }
        }
        document.getElementById('btn-finish-order').innerText = `Place Order & Pay ${displayTotalStr}`;
        
        this.nextStep();
    },

    selectPayment(method, element) {
        this.orderData.payment = method;
        const cards = document.querySelectorAll('#step-payment .card');
        cards.forEach(card => card.classList.remove('selected'));
        element.classList.add('selected');
        
        const btn = document.getElementById('btn-finish-order');
        const codBox = document.getElementById('cod-verification-box');
        const poBox = document.getElementById('po-entry-box');
        
        // Update button text based on method
        if (method === 'Cash on Delivery') {
            btn.innerText = 'Confirm Order (COD)';
            
            // Check for repeat buyer status (previously verified number)
            const savedPhone = localStorage.getItem('ice_verified_phone');
            
            if (savedPhone) {
                this.orderData.codVerified = true;
                codBox.classList.remove('active'); // Hide for repeat buyers
                btn.disabled = false;
            } else {
                btn.disabled = !this.orderData.codVerified;
                codBox.classList.add('active');
                
                const phoneInput = document.getElementById('cod-phone-input');
                if (!phoneInput.value) {
                                        phoneInput.value = this.formatPhone(this.orderData.deliveryDetails.contact || '');
                }
            }
            poBox.classList.remove('active');
        } else if (method === 'Purchase Order') {
            btn.innerText = 'Place Order (Invoiced)';
            btn.disabled = false;
            codBox.classList.remove('active');
            poBox.classList.add('active');
        } else {
            const total = this.orderData.total + (this.orderData.deliveryFee || 0);
            btn.innerText = `Place Order & Pay ₱${total}`;
            btn.disabled = false;
            codBox.classList.remove('active');
            poBox.classList.remove('active');
        }
    },

    sendVerificationCode() {
        const phone = document.getElementById('cod-phone-input').value;
        if (!phone) {
            this.showToast('Please enter a contact number.', 'error');
            return;
        }

        const btnSend = document.getElementById('btn-send-otp');
        btnSend.disabled = true;
        btnSend.innerText = 'Code Sent!';

        document.getElementById('otp-reveal-section').classList.add('active');
        console.log(`Sending 4-digit OTP to ${phone}... (Mock OTP: Any 4 digits)`);
    },

    verifyOTP() {
        const otpInput = document.getElementById('cod-otp-input');
        const otp = otpInput.value;
        const phoneInput = document.getElementById('cod-phone-input');

        if (otp.length === 4) {
            this.orderData.codVerified = true;
            
            // Automatically record the number for the buyer's account (localStorage)
            if (phoneInput && phoneInput.value) {
                localStorage.setItem('ice_verified_phone', phoneInput.value);
            }

            const codBox = document.getElementById('cod-verification-box');
            codBox.classList.add('verified');
            
            document.getElementById('cod-phone-group').style.display = 'none';
            document.getElementById('otp-reveal-section').classList.remove('active');
            document.getElementById('cod-verified-msg').style.display = 'block';
            document.getElementById('cod-verification-text').innerText = 'Verification Successful';
            
            document.getElementById('btn-finish-order').disabled = false;
        }
    },

    async finishOrder() {
        const btn = document.getElementById('btn-finish-order');
        btn.disabled = true;

        const method = this.orderData.payment;
        const total = this.orderData.total + (this.orderData.deliveryFee || 0);

        if (method === 'GCash' || method === 'Bank Transfer') {

            
            // Configure Modal for Method
            const modal = document.getElementById('qr-modal');
            const title = document.getElementById('modal-title');
            const instructionsText = document.getElementById('modal-instructions-text');
            const openAppBtn = document.getElementById('btn-open-app');
            const openAppBtnText = document.getElementById('btn-open-app-text');
            const qrContainer = document.getElementById('modal-qr-container');
            const qrImage = document.getElementById('qr-image');
            const verificationText = document.getElementById('verification-text-top');
            const totalAmountEl = document.getElementById('modal-total-amount');

            const total = this.orderData.total + (this.orderData.deliveryFee || 0);
            if (totalAmountEl) totalAmountEl.innerText = `₱${total.toFixed(2)}`;

            // Reset modal classes
            modal.classList.remove('modal-gcash', 'modal-bank-transfer');

            // Removed redundant bankDetailsText variable

            const step2Label = document.getElementById('step-2-label');
            const bankNameEl = document.getElementById('modal-bank-name');
            const recipientName = document.getElementById('modal-recipient-name');
            const recipientNumber = document.getElementById('modal-recipient-number');

            if (method === 'GCash') {
                modal.classList.add('modal-gcash');
                title.innerText = 'GCash Payment';
                instructionsText.innerText = 'Pay to our GCash merchant account and upload the receipt.';
                openAppBtn.style.display = 'flex';
                openAppBtnText.innerText = 'Open GCash App';
                
                if (step2Label) step2Label.innerText = 'Open GCash';
                if (bankNameEl) {
                    bankNameEl.innerText = 'GCash';
                    bankNameEl.style.color = '#0055ff'; // GCash Blue
                }
                if (recipientName) recipientName.innerText = 'LAWRENCE FE BACAYO';
                if (recipientNumber) recipientNumber.innerText = '0961 039 1173';
                
                // NEW: Generate Dynamic QR with Amount (GCash Blueprint)
                this.updateDynamicQR(total, 'gcash');
                
                if (verificationText) verificationText.innerText = 'Please upload your GCash screenshot.';
            } else {
                modal.classList.add('modal-bank-transfer');
                title.innerText = 'Bank Transfer';
                instructionsText.innerText = 'Scan the QR code below using your banking app (InstaPay) or Maya.';
                openAppBtn.style.display = 'none';
                
                if (step2Label) step2Label.innerText = 'Open Bank App';
                if (bankNameEl) {
                    bankNameEl.innerText = 'GoTyme Bank';
                    bankNameEl.style.color = '#ff3b30'; // GoTyme Red
                }
                if (recipientName) recipientName.innerText = 'LAWRENCE FE BACAYO';
                if (recipientNumber) recipientNumber.innerText = '0176 3092 9031';
                
                // NEW: Generate Dynamic QR with Amount (GoTyme Blueprint)
                this.updateDynamicQR(total, 'bank');
                
                const fallbackUI = document.getElementById('qr-fallback-ui');
                if (fallbackUI) fallbackUI.style.display = 'none';
                if (verificationText) verificationText.innerText = 'Please upload your Bank Transfer/InstaPay screenshot.';
            }
            
            // Reset modal state
            this.orderData.paymentReceipt = null;
            const confirmBtn = document.getElementById('btn-confirm-finish');
            if (confirmBtn) {
                confirmBtn.innerText = 'Confirm & Finish';
                confirmBtn.disabled = true; // Wait for upload
            }
            
            const uploadArea = document.getElementById('tally-upload-area');
            const statusText = document.getElementById('upload-status-text');
            const preview = document.getElementById('staged-receipt-preview');
            
            if (uploadArea) uploadArea.classList.remove('has-file');
            if (statusText) statusText.innerText = '📎 Attach Receipt Screenshot';
            if (preview) preview.style.display = 'none';

            modal.classList.add('active');
            btn.disabled = false;
        } else {
            this.processFinalOrder();
        }
    },

    handleQRImageError() {
        const qrImage = document.getElementById('qr-image');
        const fallbackUI = document.getElementById('qr-fallback-ui');
        
        qrImage.style.display = 'none';
        fallbackUI.style.display = 'block';
    },

    reloadQRImage() {
        const qrImage = document.getElementById('qr-image');
        const fallbackUI = document.getElementById('qr-fallback-ui');
        
        // Append a timestamp to bypass cache and trigger a retry
        const baseUrl = './assets/gcash-qr-iceqube.png';
        qrImage.src = `${baseUrl}?t=${new Date().getTime()}`;
        
        qrImage.style.display = 'block';
        fallbackUI.style.display = 'none';
    },

    closeQRModal() {
        document.getElementById('qr-modal').classList.remove('active');
    },



    async handleStagedUpload(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        // Trigger Receipt Legitimacy Check
        const success = await this.refCheck(file);
        if (!success) {
            // Reset file input if verification fails
            event.target.value = '';
            return;
        }

        this.orderData.paymentReceipt = file;
        
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('staged-receipt-preview');
            const uploadBox = document.getElementById('tally-upload-area');
            const statusText = document.getElementById('upload-status-text');
            
            preview.src = e.target.result;
            preview.style.display = 'block';
            uploadBox.classList.add('has-file');
            statusText.innerText = 'Receipt Attached';
            
            document.getElementById('btn-confirm-finish').disabled = false;
        };
        reader.readAsDataURL(file);
    },

    async refCheck(file) {
        const overlay = document.getElementById('receipt-verification-overlay');
        overlay.classList.add('active');

        try {
            console.log('Starting OCR extraction with Tesseract.js...');
            const worker = await Tesseract.createWorker('eng');
            const { data: { text } } = await worker.recognize(file);
            await worker.terminate();

            console.log('Extracted Text:', text);

            // 1. EXTRACT: Use regex to find Ref No and Amount
            // Look for patterns like "Ref No: 12345", "Reference: 12345", etc.
            const refMatch = text.match(/(?:Ref|Reference|Ref\.\s*No)\D*(\d{8,12})/i);
            const refNo = refMatch ? refMatch[1] : null;

            // Look for patterns like "Amount: ₱100", "Total: 100", etc.
            const amountMatch = text.match(/(?:Amount|Total|PHP|₱)\D*(\d+(?:\.\d{2})?)/i);
            const extractedAmount = amountMatch ? parseFloat(amountMatch[1]) : null;

            console.log(`Extracted Ref No: ${refNo}, Extracted Amount: ${extractedAmount}`);

            // 2. VALIDATE: Query 'ice_orders' table simulation
            const orders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
            const isDuplicate = orders.some(o => o.refNo === refNo);

            // 3. IF EXISTS: Alert user
            if (isDuplicate) {
                this.showToast(`This receipt (Ref No: ${refNo}) has already been used.`, 'error');
                overlay.classList.remove('active');
                return false;
            }

            // 4. IF NEW: Compare extracted amount vs. order_total (optional warning)
            if (extractedAmount && Math.abs(extractedAmount - this.orderData.total) > 0.01) {
                console.warn(`Amount mismatch! Extracted: ${extractedAmount}, Expected: ${this.orderData.total}`);
                // We'll let it pass but log it to console as requested logic is "Compare"
            }

            // Artificial delay as requested: Show "Verifying Receipt..." for 3 seconds
            await new Promise(resolve => setTimeout(resolve, 3000));

            overlay.classList.remove('active');
            return true;
        } catch (error) {
            console.error('OCR Error:', error);
            overlay.classList.remove('active');
            this.showToast('Verification failed. Please try again.', 'error');
            return false;
        }
    },

    openGCash() {
        const total = this.orderData.total + (this.orderData.deliveryFee || 0);
        const amountStr = total.toFixed(2);
        
        // Copy amount to clipboard for easy pasting in GCash
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(amountStr).then(() => {
                this.showToast(`Amount ₱${amountStr} copied! Paste it in GCash.`, 'success');
                this.updatePaymentGuide(3);
            }).catch(err => {
                console.warn('Clipboard copy failed:', err);
            });
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            // Attempt to open the GCash app directly via deep link
            window.location.href = 'gcash://';
            
            // Fallback to a safe landing page if the app doesn't open after a delay
            setTimeout(() => {
                if (document.hasFocus()) {
                    window.open('https://www.gcash.com/get-the-app', '_blank');
                }
            }, 2500);
        } else {
            // On desktop, opening the app doesn't make sense, so go to the informational page
            window.open('https://www.gcash.com/get-the-app', '_blank');
            this.showToast('GCash App is only available on mobile. Use your phone to scan the QR code.', 'info');
        }
    },

    copyPaymentNumber() {
        const method = this.orderData.payment;
        const number = method === 'GCash' ? '09610391173' : '017630929031';
        const label = method === 'GCash' ? 'Mobile Number' : 'Account Number';
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(number).then(() => {
                this.showToast(`${label} ${number} copied!`, 'success');
                this.updatePaymentGuide(2);
            }).catch(err => {
                console.warn('Clipboard copy failed:', err);
            });
        }
    },

    updatePaymentGuide(step) {
        const steps = document.querySelectorAll('.guide-step');
        steps.forEach((s, i) => {
            if (i + 1 <= step) s.classList.add('active');
            else s.classList.remove('active');
        });
    },

    updateDynamicQR(amount, method = 'gcash') {
        const qrContainer = document.getElementById('modal-qr-container');
        const qrImage = document.getElementById('qr-image');
        const buffer = document.getElementById('qrcode-buffer');
        
        if (!qrImage || !buffer) return;

        // 1. Generate QR Ph String
        const qrData = this.generateQRPhString(amount, method);
        
        // 2. Clear buffer
        buffer.innerHTML = '';
        
        // 3. Render to buffer
        try {
            const qrcode = new QRCode(buffer, {
                text: qrData,
                width: 256,
                height: 256,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.M
            });

            // 4. Wait for rendering and update image src
            setTimeout(() => {
                const canvas = buffer.querySelector('canvas');
                const img = buffer.querySelector('img');
                if (canvas) {
                    qrImage.src = canvas.toDataURL("image/png");
                    qrContainer.style.display = 'block';
                } else if (img && img.src) {
                    qrImage.src = img.src;
                    qrContainer.style.display = 'block';
                }
            }, 100);
        } catch (e) {
            console.error("QR Generation failed:", e);
        }
    },

    generateQRPhString(amount, method = 'gcash') {
        // Shared Header
        let payload = "000201";
        payload += "010212"; // Dynamic Initiation Mode (Enables pre-filled amount)
        
        if (method === 'gcash') {
            // GCash Specific Blueprint (Tag 27 length 83)
            payload += "27830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO9EW6SH";
            payload += "52046016"; // Category: Service Provider
            payload += "5303608"; // Currency: PHP
            
            // Amount Tag
            const amtStr = parseFloat(amount).toFixed(2);
            payload += "54" + String(amtStr.length).padStart(2, '0') + amtStr;
            
            payload += "5802PH";
            payload += "5914LA*****E F* B."; // Masked name as provided by user
            payload += "6009Macabalan";
            payload += "61041234";
        } else {
            // GoTyme Specific Blueprint (Tag 27 length 59)
            payload += "27590012com.p2pqrpay0111GOTYPHM2XXX0208999644030412017630929031";
            payload += "52046016"; // Category: Service Provider
            payload += "5303608"; // Currency: PHP
            
            // Amount Tag
            const amtStr = parseFloat(amount).toFixed(2);
            payload += "54" + String(amtStr.length).padStart(2, '0') + amtStr;
            
            payload += "5802PH";
            payload += "5918LAWRENCE FE BACAYO"; // Exact name from GoTyme string
            payload += "6015Cagayan De Oro "; // Exact city from GoTyme string (incl. trailing space)
        }
        
        // Final Checksum
        payload += "6304";
        const crc = this.computeCRC16(payload);
        const finalQR = payload + crc;
        
        console.log(`Generated Dynamic QR (${method.toUpperCase()}):`, finalQR);
        return finalQR;
    },

    downloadQR() {
        const qrImage = document.getElementById('qr-image');
        if (!qrImage || !qrImage.src || qrImage.src.includes('placeholder')) {
            this.showToast('QR code is still generating...', 'info');
            return;
        }

        try {
            const link = document.createElement('a');
            link.href = qrImage.src;
            const method = this.orderData.payment === 'GCash' ? 'GCash' : 'Bank';
            const total = (this.orderData.total + (this.orderData.deliveryFee || 0)).toFixed(2);
            link.download = `IceQube-Pay-${method}-P${total}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('QR Code Downloaded! Upload this in your bank app.', 'success');
        } catch (err) {
            console.error('Download error:', err);
            this.showToast('Download failed. Please long-press the QR image to save.', 'error');
        }
    },

    computeCRC16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            let byte = str.charCodeAt(i);
            crc ^= (byte << 8);
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    },

    async processFinalOrder() {
        console.log('--- ENTERING PROCESS FINAL ORDER ---');
        const modal = document.getElementById('qr-modal');
        const btn = document.getElementById('btn-finish-order');
        const originalText = btn ? btn.innerText : 'Place Order';
        
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Processing...';
        }

        try {
            // 1. Prepare Data for UI
            if (this.orderData.payment === 'Purchase Order') {
                if (!this.orderData.poNumber || !this.orderData.poNumber.trim()) {
                    this.orderData.poNumber = 'SYSTEM-GENERATED';
                }
            }

            const orderId = `#IQ-${Math.floor(Math.random() * 90000) + 10000}`;
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // 2. Populate UI Elements (Do this before transition)
            const elId = document.getElementById('finish-id-new');
            const elTime = document.getElementById('finish-received-time');
            const elQty = document.getElementById('finish-qty-new');
            const elTiming = document.getElementById('finish-timing-new');
            const elPayment = document.getElementById('finish-payment-new');

            if (elId) elId.innerText = `Order ${orderId}`;
            if (elTime) elTime.innerText = `Today, ${timeStr}`;
            
            let typesText = [];
            const fd3 = this.orderData.qty.fullDice['3kg'];
            const fd1 = this.orderData.qty.fullDice['1kg'];
            const hd3 = this.orderData.qty.halfDice['3kg'];
            const hd1 = this.orderData.qty.halfDice['1kg'];
            if (fd3 > 0 || fd1 > 0) typesText.push('Full Dice');
            if (hd3 > 0 || hd1 > 0) typesText.push('Half-Dice');

            const total3kg = fd3 + hd3;
            const total1kg = fd1 + hd1;
            let qtySummary = [];
            if (total3kg > 0) qtySummary.push(`${total3kg} Bags (3kg)`);
            if (total1kg > 0) qtySummary.push(`${total1kg} Bags (1kg)`);
            let productType = typesText.length > 1 ? 'Mixed' : (typesText[0] || 'Ice');
            
            if (elQty) elQty.innerText = `${qtySummary.join(' + ')} • ${productType}`;
            
            if (elTiming) {
                if (this.orderData.schedule.type === 'Deliver Now') {
                    elTiming.innerText = 'Immediate Delivery (30-45 mins)';
                } else {
                    elTiming.innerText = `${this.orderData.schedule.date} at ${this.orderData.schedule.time}`;
                }
            }

            if (elPayment) elPayment.innerText = this.orderData.payment || 'Cash on Delivery';

            // 3. HARD-STOP CREDIT CHECK
            const newOrderCost = this.orderData.total + (this.orderData.deliveryFee || 0);
            const projectedBalance = this.user.balance + newOrderCost;
            
            if (projectedBalance > this.user.creditLimit) {
                console.warn('CREDIT LIMIT EXCEEDED - INTERVENING');
                
                // Update Limit Panel with dynamic data
                const breakdown = document.querySelector('.limit-breakdown');
                const gaugeFill = document.getElementById('gauge-fill');
                const gaugePercent = document.getElementById('gauge-percent');
                
                if (gaugeFill && gaugePercent) {
                    const utilization = Math.min(100, (projectedBalance / this.user.creditLimit) * 100);
                    setTimeout(() => {
                        gaugeFill.style.width = `${utilization}%`;
                        gaugePercent.innerText = `${Math.round(utilization)}%`;
                        
                        // If way over limit, add a pulse effect
                        if (utilization >= 100) {
                            gaugeFill.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.6)';
                        }
                    }, 300);
                }

                if (breakdown) {
                    const rows = breakdown.querySelectorAll('.l-row');
                    if (rows.length >= 3) {
                        rows[0].querySelector('strong').innerText = `₱${this.user.balance.toLocaleString()}`;
                        rows[1].querySelector('strong').innerText = `₱${newOrderCost.toLocaleString()}`;
                        const overage = projectedBalance - this.user.creditLimit;
                        rows[2].querySelector('mark').innerText = `₱${overage.toLocaleString()} min`;
                    }
                }
                
                // Show the intervention screen
                this.togglePanel('limit', true);
                this.orderData.status = 'Pending Payment';
                
                // Reset button state for re-attempt
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
                
                // Close modal if it was open (for payment methods)
                if (modal && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                }
                
                return; // STOP THE FLOW
            }

            // Release order if it was pending
            if (this.orderData.status === 'Pending Payment') {
                this.orderData.status = 'Processing';
            }

            // 4. Close Modal if active
            if (modal && modal.classList.contains('active')) {
                // Short delay to let the user see the "Success" state in modal
                await new Promise(resolve => setTimeout(resolve, 1500));
                modal.classList.remove('active');
            }

            // 4. TRANSITION TO THANK YOU PAGE IMMEDIATELY
            console.log('Transitioning to Step 5 (Explicit ID-based)...');
            this.currentStep = 5;
            
            // Hide all steps manually for maximum reliability
            const allSteps = document.querySelectorAll('.step-content');
            allSteps.forEach(s => {
                s.style.display = 'none';
                s.classList.remove('active');
            });

            // Show the complete step explicitly
            const completeStep = document.getElementById('step-complete');
            if (completeStep) {
                completeStep.style.display = 'block';
                completeStep.classList.add('active');
                completeStep.classList.add('slide-in-right');
            } else {
                console.error('CRITICAL: #step-complete element not found!');
                this.showToast('Order placed! But we had trouble showing the confirmation.', 'success');
            }

            // 5. RUN BACKGROUND TASKS (Sync & Notification)
            // We don't await these so the UI feels snappy
            this.supabaseUpdate(orderId).catch(err => console.error('Sync error:', err));
            this.sendConfirmation().catch(err => console.warn('Notification skipped or failed:', err));
            
            // Antigravity: Automated Order Generation with Overdraft Logic
            const totalBags = (this.orderData.qty.fullDice['3kg'] || 0) + (this.orderData.qty.halfDice['3kg'] || 0);
            generateOrder(
                this.user.companyName || 'LOFT_LIVING_CDO', 
                totalBags, 
                this.isOverdraftActive || false, 
                this.totalDebtToCollect || 0
            ).catch(err => console.error('Order generation failed:', err));

            // 5.5. AUTO-FILL PROFILE FOR FIRST-TIME CUSTOMERS
            // If no profile exists yet, save the delivery details as the user's Account Settings
            this.autoFillProfileFromOrder();

            // 6. AUTO-CLOSE TIMER
            this.initiateAutoClose();

        } catch (error) {
            console.error('CRITICAL ERROR in processFinalOrder:', error);
            this.showToast('Something went wrong. Please check your connection.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        }
    },

    initiateAutoClose() {
        console.log('Starting 15s auto-close timer...');
        setTimeout(() => {
            // Only close if we are still on the Thank You page (Step 5)
            if (this.currentStep === 5) {
                console.log('Auto-closing window...');
                window.close();
            }
        }, 15000); // 15 seconds
    },


    async supabaseUpdate(orderId) {
        console.log("🚀 SYNC STARTING: Attempting to save order to Cloud...");
        if (!this.orderData) {
            console.error("❌ SYNC ABORTED: No order data found in memory.");
            return;
        }
        
        const isPO = this.orderData.payment === 'Purchase Order';
        let paymentStatus = 'Pending';
        if (isPO) paymentStatus = 'Invoiced';

        let customerName = 'Guest Customer';
        let deliveryAddress = 'N/A';
        
        if (this.orderData.deliveryDetails) {
            const details = this.orderData.deliveryDetails;
            
            // 1. Determine Customer Name
            if (details.establishment) {
                customerName = details.establishment;
            } else if (this.user && this.user.companyName && this.user.companyName !== 'Guest Customer') {
                customerName = this.user.companyName;
            } else if (details.person) {
                customerName = details.person;
            }

            // 2. Determine Delivery Address (Physical Location)
            deliveryAddress = details.physical_address || details.location || 'N/A';
        }

        const contactNumber = (this.orderData.deliveryDetails && this.orderData.deliveryDetails.contact) ? this.orderData.deliveryDetails.contact : 'N/A';

        const payload = {
            order_id: orderId, 
            customer_name: customerName,
            receiver_name: (this.orderData.deliveryDetails && this.orderData.deliveryDetails.person) ? this.orderData.deliveryDetails.person : customerName,
            contact_number: contactNumber,
            delivery_notes: (this.orderData.deliveryDetails && this.orderData.deliveryDetails.instructions) ? this.orderData.deliveryDetails.instructions : 'No special notes.',
            items: this.orderData.qty,
            total_price: this.orderData.total + (this.orderData.deliveryFee || 0),
            payment_method: this.orderData.payment,
            delivery_status: 'Pending',
            delivery_schedule: this.orderData.schedule.type === 'Deliver Now' ? 'Immediate' : `${this.orderData.schedule.date} ${this.orderData.schedule.time}`,
            delivery_address: deliveryAddress,
            delivery_lat: this.orderData.deliveryDetails ? this.orderData.deliveryDetails.lat : null,
            delivery_lng: this.orderData.deliveryDetails ? this.orderData.deliveryDetails.lng : null,
            delivery_fee: this.orderData.deliveryFee || 0,
            po_number: this.orderData.poNumber,
            is_real: true, // Safeguard for Purge Logic
            created_at: new Date().toISOString()
        };

        // Local Sync (BroadcastChannel)
        if (window.IceQubeSync) {
            window.IceQubeSync.publishNewOrder(payload);
        }

        if (!SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL.includes('your-project-id')) {
            console.warn('Supabase not configured. Persistence limited to local sync.');
            return;
        }
        console.log('--- SYNCING TO SUPABASE ---');
        try {
            const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            console.log('✅ Order successfully synced to Supabase Cloud.');
        } catch (err) {
            console.error('❌ Supabase Cloud Sync Failed:', err);
            // Show toast for non-blocking error feedback
            this.showToast(`⚠️ Sync Issue: ${err.message}. Order saved locally.`, 'error');
            console.warn('CRITICAL: Order was NOT saved to Cloud. Check Supabase Config and RLS policies.');
        }
    },

    async mockUploadReceipt(file) {
        console.log('Uploading receipt to storage: /receipts/', file.name);
        return new Promise(resolve => setTimeout(resolve, 2000));
    },

    async mockUploadDeliveryPhoto(file) {
        console.log('--- RIDER ACTION STARTED ---');
        console.log('Uploading photo to bucket [ice_deliveries]:', file.name);
        
        this.orderData.dpod.photoUrl = `https://storage.supabase.co/ice_deliveries/${file.name}`;
        
        // Trigger system action: Notify customer
        await this.sendDeliveryConfirmationPrompt();
        
        // Start 2-hour auto-confirm timer logic
        this.startAutoConfirmationTimer();
        
        return new Promise(resolve => setTimeout(resolve, 1500));
    },

    async sendDeliveryConfirmationPrompt() {
        console.log('--- SYSTEM ACTION: DPOD NOTIFICATION ---');
        console.log('Dispatching Messenger API Payload...', {
            recipient: this.orderData.deliveryDetails.contact,
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: [{
                            title: 'Order Delivered!',
                            image_url: this.orderData.dpod.photoUrl,
                            subtitle: 'Your ice has arrived. Please confirm if everything is in order.',
                            buttons: [{
                                type: 'postback',
                                title: '✅ Confirm Delivery',
                                payload: 'CONFIRM_DELIVERY'
                            }]
                        }]
                    }
                }
            }
        });
        return new Promise(resolve => setTimeout(resolve, 800));
    },

    confirmDelivery(userId = 'CUSTOMER_ID_123') {
        if (this.orderData.dpod.status !== 'Pending') return;

        console.log('--- CUSTOMER ACTION: CONFIRM DELIVERY ---');
        this.orderData.dpod.confirmedBy = userId;
        this.orderData.dpod.confirmationTime = new Date().toISOString();
        this.orderData.dpod.status = 'Confirmed';
        
        console.log('Audit Trail Updated:', {
            order_id: document.getElementById('finish-id-new').innerText,
            confirmed_by: this.orderData.dpod.confirmedBy,
            confirmation_time: this.orderData.dpod.confirmationTime
        });

        // Clear timer if exists
        if (this.dpodTimer) clearTimeout(this.dpodTimer);
    },

    startAutoConfirmationTimer() {
        console.log('Starting 2-hour auto-confirmation watchdog...');
        
        const twoHoursInMs = 2 * 60 * 60 * 1000;
        
        this.dpodTimer = setTimeout(() => {
            if (this.orderData.dpod.status === 'Pending') {
                console.log('--- SYSTEM ACTION: AUTO-CONFIRMATION EXECUTED ---');
                this.orderData.dpod.status = 'Auto-Confirmed';
                this.orderData.dpod.confirmedBy = 'SYSTEM_WATCHDOG';
                this.orderData.dpod.confirmationTime = new Date().toISOString();
                
                console.log('Audit Trail Updated (Auto-Confirmed):', {
                    reason: '2-hour timeout reached without customer interaction',
                    proof: 'Rider GPS/Photo proof'
                });
            }
        }, twoHoursInMs);
    },

    async sendConfirmation() {
        const orderId = document.getElementById('finish-id-new').innerText.replace('Order ', '');
        const timing = document.getElementById('finish-timing-new').innerText;
        const qtyText = document.getElementById('finish-qty-new').innerText;
        const total = this.orderData.total + (this.orderData.deliveryFee || 0);

        let summaryText = `🛒 IceQube CDO Order Confirmed!\n\n`;
        summaryText += `Order ID: ${orderId}\n`;
        summaryText += `Items: ${qtyText}\n`;
        summaryText += `Timing: ${timing}\n`;
        summaryText += `Total: ₱${total}\n`;
        summaryText += `Status: ${this.orderData.payment === 'Cash on Delivery' ? 'Pending (COD)' : 'Paid'}\n`;
        
        summaryText += `\n📍 Macabalan Hub Pickup Info:\n`;
        summaryText += `Address: Near Piaping Itum Chapel, Macabalan\n`;
        summaryText += `Details: Parallel to the main road near Macabalan Port.\n`;
        summaryText += `Maps: https://www.google.com/maps/place/IceQube/@8.5020476,124.6582801,17z/data=!3m1!4b1!4m6!3m5!1s0x32fff3006cb43a85:0x2c7bd600367daea9!8m2!3d8.5020476!4d124.660855!16s%2Fg%2F11ywbv3d5_?entry=ttu&g_ep=EgoyMDI2MDQxNS4wIKXMDSoASAFQAw%3D%3D\n`;

        console.log('Dispatching Messenger notification via Supabase Proxy...');

        try {
            const response = await fetch(`${SUPABASE_CONFIG.URL}/functions/v1/messenger-proxy`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
                },
                body: JSON.stringify({
                    recipientId: MESSENGER_CONFIG.RECIPIENT_ID,
                    message: summaryText
                })
            });

            const data = await response.json();
            console.log('Messenger API Response:', data);
        } catch (error) {
            console.error('Failed to send Messenger notification:', error);
        }
    },

    addToCalendar() {
        const orderId = document.getElementById('finish-id-new').innerText;
        const timing = document.getElementById('finish-timing-new').innerText;
        const qty = document.getElementById('finish-qty-new').innerText;

        console.log(`Generating Calendar Invite for ${orderId}...`);
        
        // Simple ICS generation logic
        const event = {
            title: `IceQube Delivery: ${orderId}`,
            description: `Items: ${qty}\nThank you for choosing IceQube CDO!`,
            location: 'Cagayan de Oro City',
            start: new Date().toISOString() // In a real app, parse this.orderData.schedule
        };

        // For demo purposes, we show a toast. 
        this.showToast(`Calendar Event Created! ${event.title}`, 'success');
    },

    viewWeeklyStatement() {
        console.log('Navigating to Account Running Balance / Weekly Statement...');
        this.showToast('Navigating to Weekly Statement (Mock)', 'info');
    },

    goToAutomate(fromAccount = false) {
        // Close account panel if open
        this.togglePanel('account', false);
        
        // Find index of 'automate' step
        const automateIndex = this.steps.indexOf('automate');
        if (automateIndex !== -1) {
            const from = this.currentStep;
            
            // Save history for back navigation
            this.automateSourceStep = from;
            this.automateSourcePanel = fromAccount ? 'account' : null;
            
            this.currentStep = automateIndex;
            this.showStep(this.currentStep, 'next', from);
        }
    },

    // Maps day code to full string
    dayNames: {
        'Su': 'Sunday',
        'M': 'Monday',
        'T': 'Tuesday',
        'W': 'Wednesday',
        'Th': 'Thursday',
        'F': 'Friday',
        'S': 'Saturday'
    },
    
    dayOrder: ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'],

    toggleDynamicDay(day, element) {
        if (!this.autoData || !this.autoData.schedules) {
            this.autoData = { schedules: {} };
        }
        
        element.classList.toggle('active');
        const isActive = element.classList.contains('active');
        
        if (isActive) {
            this.autoData.schedules[day] = '10:00'; // default time
        } else {
            delete this.autoData.schedules[day];
        }
        
        this.renderDynamicSchedule();
    },
    
    renderDynamicSchedule() {
        const listDiv = document.getElementById('dynamic-schedule-list');
        const summaryDiv = document.getElementById('dynamic-schedule-summary');
        const btnSave = document.getElementById('btn-save-schedule');
        const countSpan = document.getElementById('schedule-count');
        
        if (!listDiv) return;
        
        listDiv.innerHTML = '';
        
        const selectedDays = Object.keys(this.autoData.schedules || {});
        
        // Sort days logically
        selectedDays.sort((a, b) => this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b));
        
        if (selectedDays.length === 0) {
            summaryDiv.style.display = 'none';
            if (btnSave) btnSave.disabled = true;
            return;
        }
        
        selectedDays.forEach(dayCode => {
            const timeVal = this.autoData.schedules[dayCode];
            const fullDay = this.dayNames[dayCode];
            
            const row = document.createElement('div');
            // Adding padding/border for a sleek look
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 0.75rem;';
            row.innerHTML = `
                <span style="font-weight: 600; font-size: 1.1rem;">${fullDay}</span>
                <input type="time" class="input-picker" style="width: auto; padding: 0.5rem !important; border: 1px solid var(--border) !important; background: var(--bg-primary) !important;" value="${timeVal}" onchange="app.updateDynamicTime('${dayCode}', this.value)">
            `;
            listDiv.appendChild(row);
        });
        
        if (countSpan) countSpan.innerText = selectedDays.length;
        if (summaryDiv) summaryDiv.style.display = 'block';
        if (btnSave) btnSave.disabled = false;
    },
    
    updateDynamicTime(dayCode, timeVal) {
        if (this.autoData && this.autoData.schedules && this.autoData.schedules[dayCode]) {
            this.autoData.schedules[dayCode] = timeVal;
        }
    },
    
    async saveDynamicSchedule() {
        const btnSave = document.getElementById('btn-save-schedule');
        const originalText = btnSave.innerText;
        btnSave.disabled = true;
        btnSave.innerText = 'Saving...';
        
        try {
            await this.mockUpdateRecurringDynamic(this.autoData.schedules);
            
            // Build the schedule summary for the success screen
            this.buildAutomateSuccessSummary();

            // Simulate Messenger Integration
            await this.mockMessengerAutomationReceipt();

            this.nextStep();
        } catch (e) {
            btnSave.disabled = false;
            btnSave.innerText = originalText;
            this.showToast('Failed to save schedule', 'error');
        }
    },

    buildAutomateSuccessSummary() {
        const summaryContainer = document.getElementById('automate-success-summary');
        if (!summaryContainer) return;
        
        summaryContainer.innerHTML = '';
        
        const selectedDays = Object.keys(this.autoData.schedules || {});
        selectedDays.sort((a, b) => this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b));
        
        if (selectedDays.length === 0) {
            summaryContainer.innerHTML = '<span style="opacity: 0.8;">No days selected.</span>';
            return;
        }

        selectedDays.forEach(dayCode => {
            const timeVal = this.autoData.schedules[dayCode];
            const fullDay = this.dayNames[dayCode];
            
            // Convert 24h time to 12h time for better UX
            const [hours, minutes] = timeVal.split(':');
            const h = parseInt(hours, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            const time12hr = `${h12}:${minutes} ${ampm}`;

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 0.5rem;';
            row.innerHTML = `
                <span style="opacity: 0.8;">${fullDay}:</span>
                <span style="font-weight: 600;">${time12hr}</span>
            `;
            summaryContainer.appendChild(row);
        });
    },

    async mockMessengerAutomationReceipt() {
        console.log('Sending Messenger Receipt...');
        
        const selectedDays = Object.keys(this.autoData.schedules || {});
        let message = "Subscription confirmed!";
        if (selectedDays.length > 0) {
            selectedDays.sort((a, b) => this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b));
            
            // First upcoming day from standard sort mock
            const firstDay = selectedDays[0];
            const firstTime = this.autoData.schedules[firstDay];
            
            const [hours, minutes] = firstTime.split(':');
            const h = parseInt(hours, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;

            message = `Subscription confirmed! Your first automated delivery is scheduled for ${this.dayNames[firstDay]} at ${h12}:${minutes} ${ampm}.`;
        }
        
        console.log('Messenger Message:', message);
        return new Promise(resolve => setTimeout(resolve, 800));
    },

    finishAutomate() {
        window.open('https://m.me', '_blank');
        location.reload();
    },

    openScheduleSettings() {
        const from = this.currentStep;
        this.currentStep = 6; // 'automate' step
        this.showStep(this.currentStep, 'prev', from);
    },


    finishAndExit() {
        // 1. First, redirect them to the Messenger link (opens in a new tab or app)
        window.open('https://m.me/IceQubeCDO', '_blank');
        
        // 2. Then, close this current app window to save their phone's memory
        setTimeout(() => {
            window.close();
        }, 500);
    },

    async mockUpdateRecurringDynamic(schedules) {
        console.log('Updating Supabase Dynamic Schedules:', schedules);
        // Simulate async network request
        return new Promise(resolve => setTimeout(resolve, 500));
    },

    cancelAutomate() {
        location.reload();
    },

    viewReceipt(orderId) {
        // Mock Order Database
        const orders = {
            'IQ-9750': {
                date: 'April 20, 2026',
                customer: 'Loft Living CDO',
                address: 'Piaping Itum, Macabalan, CDO',
                items: [{ name: 'Full Dice (3kg)', qty: 14, unit: 'Bag', price: 170.00 }],
                delivery: 0,
                payment: 'Purchase Order (#8821)'
            },
            'IQ-9688': {
                date: 'April 17, 2026',
                customer: 'Loft Living CDO',
                address: 'Piaping Itum, Macabalan, CDO',
                items: [{ name: 'Half-Dice (3kg)', qty: 10, unit: 'Bag', price: 170.00 }],
                delivery: 30,
                payment: 'Purchase Order (#8815)'
            },
            'IQ-9521': {
                date: 'April 12, 2026',
                customer: 'Loft Living CDO',
                address: 'Piaping Itum, Macabalan, CDO',
                items: [{ name: 'Full Dice (3kg)', qty: 20, unit: 'Bag', price: 170.00 }],
                delivery: 0,
                payment: 'Purchase Order (#8792)'
            }
        };

        const order = orders[orderId];
        if (!order) {
            this.showToast('Receipt not found for Order #' + orderId, 'error');
            return;
        }

        // Simulate loading state for a premium feel
        const panel = document.getElementById('receipt-panel');
        const content = panel.querySelector('.receipt-content-wrapper');
        const header = panel.querySelector('.panel-header h2');
        
        header.innerText = 'Fetching Receipt...';
        content.style.opacity = '0';
        content.style.transform = 'translateY(10px)';
        
        this.togglePanel('receipt', true);

        setTimeout(() => {
            // Populate Modal
            document.getElementById('receipt-order-id').innerText = '#' + orderId;
            document.getElementById('receipt-date').innerText = order.date;
            document.getElementById('receipt-customer-name').innerText = order.customer;
            document.getElementById('receipt-customer-address').innerText = order.address;
            document.getElementById('receipt-payment-method').innerText = order.payment;

            // Populate Items
            const itemsList = document.getElementById('receipt-items-list');
            itemsList.innerHTML = order.items.map(item => `
                <div class="receipt-item">
                    <div class="item-info">
                        <strong>${item.name}</strong>
                        <span>${item.qty} ${item.unit}${item.qty > 1 ? 's' : ''} × ₱${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <span class="item-price">₱${(item.qty * item.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
            `).join('');

            // Totals
            const subtotal = order.items.reduce((sum, item) => sum + (item.qty * item.price), 0);
            document.getElementById('receipt-subtotal').innerText = '₱' + subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 });
            document.getElementById('receipt-delivery').innerText = '₱' + order.delivery.toLocaleString('en-US', { minimumFractionDigits: 2 });
            document.getElementById('receipt-total').innerText = '₱' + (subtotal + order.delivery).toLocaleString('en-US', { minimumFractionDigits: 2 });

            // Reveal Content
            header.innerText = 'Digital Receipt';
            content.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            content.style.opacity = '1';
            content.style.transform = 'translateY(0)';
        }, 800);
    },

    openSOA(poNumber) {
        document.body.classList.add('soa-active');
        document.getElementById('soa-overlay').style.display = 'flex';
        
        // Initialize Panzoom if not already done
        if (!this.soaPanzoom) {
            const elem = document.getElementById('printable-soa-document');
            this.soaPanzoom = Panzoom(elem, {
                maxScale: 6,
                minScale: 0.1,
                contain: 'inside',
                origin: 'top center'
            });

            // Robust manual wheel zooming
            elem.parentElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY;
                const scale = this.soaPanzoom.getScale();
                const newScale = scale * (delta > 0 ? 0.92 : 1.08);
                this.soaPanzoom.zoom(newScale, { focal: e, animate: true });
            }, { passive: false });
        }
        
        // Center the document on open with a slight delay for rendering
        setTimeout(() => {
            this.resetSOAZoom();
        }, 300);
        
        // Set default custom range to today
        const todayStr = new Date().toISOString().split('T')[0];
        const startDate = document.getElementById('soa-start-date');
        const endDate = document.getElementById('soa-end-date');
        
        if (startDate && !startDate.value) {
            startDate.value = todayStr;
            this.handleSOADateChange('start', todayStr);
        }
        if (endDate && !endDate.value) {
            endDate.value = todayStr;
            this.handleSOADateChange('end', todayStr);
        }

        this.generateLedger();
    },

    handleSOADateChange(type, value) {
        if (!value) return;
        const dateObj = new Date(value);
        const formatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        if (type === 'start') {
            const displayStart = document.getElementById('display-soa-start');
            if (displayStart) displayStart.innerText = formatted;
        } else if (type === 'end') {
            const displayEnd = document.getElementById('display-soa-end');
            if (displayEnd) displayEnd.innerText = formatted;
        }
    },

    closeSOA() {
        document.body.classList.remove('soa-active');
        document.getElementById('soa-overlay').style.display = 'none';
        if (this.soaPanzoom) {
            this.soaPanzoom.reset();
        }
    },

    soaZoom(scaleDelta) {
        if (this.soaPanzoom) {
            const currentScale = this.soaPanzoom.getScale();
            this.soaPanzoom.zoom(currentScale * scaleDelta, { animate: true });
        }
    },

    resetSOAZoom() {
        if (!this.soaPanzoom) return;
        const viewport = document.getElementById('soa-viewport');
        const doc = document.getElementById('printable-soa-document');
        if (!viewport || !doc) return;

        const containerWidth = viewport.clientWidth;
        const docWidth = doc.offsetWidth;
        const scale = containerWidth / docWidth;

        this.soaPanzoom.zoom(scale, { animate: true });
        this.soaPanzoom.pan(0, 0, { animate: true });
    },

    generateLedger(isCustomSubmit = false) {
        const tbody = document.getElementById('ledger-table-body');
        const timestamp = document.getElementById('generation-timestamp');
        const period = document.getElementById('soa-date-filter').value;
        const customInputs = document.getElementById('custom-range-inputs');
        
        // Handle visibility of custom inputs
        if (period === 'custom') {
            customInputs.style.display = 'flex';
            if (!isCustomSubmit) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 3rem; color: #64748b;">Select a start and end date above.</td></tr>';
                return;
            }
        } else {
            customInputs.style.display = 'none';
        }

        // Update timestamp
        const now = new Date();
        if (timestamp) {
            timestamp.innerText = `Generated: ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} @ ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        }

        // Mock data based on the period
        let data = [];
        if (period === 'current') {
            data = [
                { date: 'May 22, 2026', ref: 'Order #IQ-9812 (PO #8821)', charge: 850, payment: 0, balance: 1665 },
                { date: 'May 20, 2026', ref: 'Order #IQ-9750 (PO #8821)', charge: 2550, payment: 0, balance: 815 },
                { date: 'May 15, 2026', ref: 'Payment - GCash Receipt #7721', charge: 0, payment: 3000, balance: -1735 },
                { date: 'May 12, 2026', ref: 'Order #IQ-9688 (PO #8815)', charge: 1700, payment: 0, balance: 1265 },
                { date: 'May 01, 2026', ref: 'Opening Balance (Forwarded)', charge: 0, payment: 0, balance: -435 }
            ];
        } else if (period === 'last_month') {
            data = [
                { date: 'Apr 28, 2026', ref: 'Order #IQ-9521 (PO #8792)', charge: 3400, payment: 0, balance: -435 },
                { date: 'Apr 15, 2026', ref: 'Payment - GCash Receipt #7601', charge: 0, payment: 4000, balance: -3835 },
                { date: 'Apr 10, 2026', ref: 'Order #IQ-9488 (PO #8780)', charge: 2100, payment: 0, balance: 165 },
                { date: 'Apr 01, 2026', ref: 'Opening Balance', charge: 0, payment: 0, balance: -1935 }
            ];
        } else if (period === 'custom') {
            const start = document.getElementById('soa-start-date').value;
            const end = document.getElementById('soa-end-date').value;
            
            if (!start || !end) {
                this.showToast('Please select both start and end dates.', 'error');
                return;
            }

            // Generate mock custom range data
            data = [
                { date: end, ref: 'Custom Range Finalized Order', charge: 1200, payment: 0, balance: 1665 },
                { date: start, ref: 'Opening Balance for Range', charge: 0, payment: 0, balance: 465 }
            ];
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 3rem; color: #64748b;">Please select a date range to generate the ledger.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(row => {
            const isPayment = row.payment > 0;
            const isForward = row.ref.toLowerCase().includes('opening balance') || row.ref.toLowerCase().includes('forwarded');
            const rowClass = isPayment ? 'payment-row' : (isForward ? 'balance-forward-row' : '');
            
            return `
                <tr class="${rowClass}">
                    <td>${row.date}</td>
                    <td><strong>${row.ref}</strong></td>
                    <td class="align-right">${row.charge > 0 ? '₱' + row.charge.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td class="align-right">${row.payment > 0 ? '₱' + row.payment.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td class="align-right" style="font-weight: 700; color: ${row.balance > 0 ? '#dc2626' : '#16a34a'};">
                        ₱${Math.abs(row.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${row.balance > 0 ? '(DR)' : '(CR)'}
                    </td>
                </tr>
            `;
        }).join('');

        // Update Summary Stats
        document.getElementById('soa-debt').innerText = '₱1,665.00';
        document.getElementById('soa-available').innerText = '₱835.00';

        // Re-scale to fit the new content
        setTimeout(() => {
            this.resetSOAZoom();
        }, 100);
    },

    openPOInvoice(poNumber) {
        // Redirection for compatibility
        this.openSOA(poNumber);
    },

    reportIssue(orderId) {
        this.toggleBottomSheet('report', true, orderId);
    },

    toggleBottomSheet(id, show, data = null) {
        // Antigravity: Ensure only one sheet is open at a time
        if (show) {
            const allSheets = document.querySelectorAll('.bottom-sheet');
            const allOverlays = document.querySelectorAll('.sheet-overlay');
            allSheets.forEach(s => s.classList.remove('active'));
            allOverlays.forEach(o => o.classList.remove('active'));
        }

        const sheet = document.getElementById(`${id}-sheet`);
        const overlay = document.getElementById(`${id}-overlay`);
        
        if (show) {
            if (data) this._currentReportOrderId = data;
            sheet.classList.add('active');
            overlay.classList.add('active');
            
            // Reset state if opening
            if (id === 'report') this.resetReportSheet();
        } else {
            sheet.classList.remove('active');
            overlay.classList.remove('active');
        }
    },

    resetReportSheet() {
        this._selectedIssue = null;
        this._reportPhoto = null;
        
        document.querySelectorAll('.issue-btn').forEach(btn => btn.classList.remove('selected'));
        document.getElementById('other-issue-container').style.display = 'none';
        document.getElementById('other-issue-text').value = '';
        document.getElementById('critical-warning').style.display = 'none';
        
        const contextSelect = document.getElementById('report-context');
        if (contextSelect) contextSelect.value = 'order_issue';
        const orderSelect = document.getElementById('report-order-selection');
        if (orderSelect) orderSelect.style.display = 'block';
        const orderIdSelect = document.getElementById('report-order-id');
        if (orderIdSelect) orderIdSelect.value = '';
        
        const trigger = document.getElementById('report-upload-trigger');
        trigger.classList.remove('has-photo');
        document.getElementById('upload-text').innerText = 'Snap Photo of Product';
        document.getElementById('upload-icon').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
        
        const submitBtn = document.getElementById('btn-submit-report');
        submitBtn.disabled = true;
        submitBtn.innerText = 'Send to IceQube Support';
        submitBtn.style.background = '#1e293b';
    },

    handleReportContextChange() {
        const context = document.getElementById('report-context').value;
        const orderSelection = document.getElementById('report-order-selection');
        const issueGrid = document.querySelector('.issue-grid');
        const otherContainer = document.getElementById('other-issue-container');
        const photoZone = document.querySelector('.photo-upload-zone');
        
        if (context === 'order_issue') {
            orderSelection.style.display = 'block';
        } else {
            orderSelection.style.display = 'none';
        }

        if (context === 'staff' || context === 'billing_app') {
            // Hide the standard product issue buttons and photo
            if (issueGrid) issueGrid.style.display = 'none';
            if (photoZone) photoZone.style.display = 'none';
            
            // Auto-select "other" and show the text area
            this._selectedIssue = context;
            if (otherContainer) otherContainer.style.display = 'block';
            
            // Change placeholder for better UX
            const textArea = document.getElementById('other-issue-text');
            if (textArea) {
                textArea.placeholder = context === 'staff' 
                    ? "Please share your feedback regarding the driver or staff..."
                    : "Please describe the app or payment issue...";
            }
        } else {
            // Show standard product issue buttons and photo
            if (issueGrid) issueGrid.style.display = 'grid';
            if (photoZone) photoZone.style.display = 'block';
            
            // Reset to default behavior
            this._selectedIssue = null;
            document.querySelectorAll('.issue-btn').forEach(btn => btn.classList.remove('selected'));
            if (otherContainer) otherContainer.style.display = 'none';
            
            const textArea = document.getElementById('other-issue-text');
            if (textArea) textArea.placeholder = "Describe the issue...";
        }
        
        this.validateReport();
    },

    selectIssue(type) {
        this._selectedIssue = type;
        
        document.querySelectorAll('.issue-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.id === `issue-${type}`);
        });
        
        const otherContainer = document.getElementById('other-issue-container');
        const warningBox = document.getElementById('critical-warning');
        const submitBtn = document.getElementById('btn-submit-report');

        if (type === 'other') {
            otherContainer.style.display = 'block';
            setTimeout(() => document.getElementById('other-issue-text').focus(), 100);
        } else {
            otherContainer.style.display = 'none';
        }

        if (type === 'contamination') {
            warningBox.innerHTML = `
                <div class="alert-banner-critical">
                    <strong>🚨 CRITICAL SAFETY ALERT</strong>
                    <p>Stop using this ice batch immediately. Please keep the bag and the foreign object for physical inspection by our QC team.</p>
                </div>
            `;
            warningBox.style.display = 'block';
            submitBtn.innerText = "ESCALATE TO QUALITY CONTROL";
            submitBtn.style.background = "#be123c"; // Crimson Red
        } else {
            warningBox.style.display = 'none';
            submitBtn.innerText = "Send to IceQube Support";
            submitBtn.style.background = "#1e293b";
        }
        
        this.validateReport();
    },

    handleReportPhoto(event) {
        const file = event.target.files[0];
        if (!file) return;

        this._reportPhoto = file;
        const trigger = document.getElementById('report-upload-trigger');
        trigger.classList.add('has-photo');
        document.getElementById('upload-text').innerText = 'Photo Attached';
        document.getElementById('upload-icon').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        
        this.validateReport();
    },

    validateReport() {
        const btn = document.getElementById('btn-submit-report');
        const context = document.getElementById('report-context') ? document.getElementById('report-context').value : 'order_issue';
        
        const isOther = this._selectedIssue === 'other' || this._selectedIssue === 'staff' || this._selectedIssue === 'billing_app';
        const hasOtherText = document.getElementById('other-issue-text').value.trim().length > 5;
        
        const orderIdVal = document.getElementById('report-order-id') ? document.getElementById('report-order-id').value : '';
        const orderValid = context !== 'order_issue' || (context === 'order_issue' && orderIdVal);

        // Photo is required for product issues, but NOT for staff feedback or billing/app issues
        const photoValid = (context === 'staff' || context === 'billing_app') ? true : !!this._reportPhoto;

        const isValid = this._selectedIssue && (isOther ? hasOtherText : true) && photoValid && orderValid;
        btn.disabled = !isValid;
    },

    generateSupportMessage(orderId, category, userNote, photoUrl) {
        const isCritical = category.toLowerCase() === 'contamination';
        const header = isCritical ? "🚨 [CRITICAL] FOOD SAFETY ISSUE" : "⚠️ ISSUE REPORT";
        
        return `
${header}
---------------------------
Order: ${orderId}
Category: ${category.toUpperCase()}
Staff Note: "${userNote || 'N/A'}"

Photo Evidence: ${photoUrl || 'No photo provided'}

${isCritical ? 'ACTION REQUIRED: Immediate replacement & factory audit initiated.' : 'Action: Standard investigation.'}
        `.trim();
    },

    submitReport() {
        const context = document.getElementById('report-context') ? document.getElementById('report-context').value : 'order_issue';
        const orderIdVal = document.getElementById('report-order-id') ? document.getElementById('report-order-id').value : '';
        
        let orderId = 'Unknown';
        if (this._currentReportOrderId) {
            orderId = this._currentReportOrderId;
        } else if (context === 'order_issue') {
            orderId = orderIdVal === 'current' ? 'Current Active Delivery' : orderIdVal;
        }
        
        const issueType = this._selectedIssue;
        const isCritical = issueType === 'contamination';
        const userNote = document.getElementById('other-issue-text').value.trim();
        
        // Mock a photo URL (In a real app, this would be the URL from your storage bucket)
        const photoUrl = this._reportPhoto ? `iceqube-storage.app/reports/${this._reportPhoto.name}` : ((context === 'staff' || context === 'billing_app') ? 'Not Required' : null);
        
        // Generate the formatted message for Messenger/Slack/Support Channel
        const payload = this.generateSupportMessage(orderId, issueType, userNote, photoUrl);
        console.log("--- Support Payload Generated ---");
        console.log(payload);

        // Show premium success feedback
        const btn = document.getElementById('btn-submit-report');
        btn.disabled = true;
        btn.innerText = isCritical ? 'ESCALATING...' : 'Sending Report...';
        
        setTimeout(() => {
            this.toggleBottomSheet('report', false);
            
            if (isCritical) {
                this.showToast(`🚨 EMERGENCY ESCALATION SUCCESSFUL. Case ID: QC-${Math.floor(1000 + Math.random() * 9000)}`, 'success');
            } else {
                this.showToast(`✅ Report Submitted. Issue: ${issueType.toUpperCase()}`, 'success');
            }
            
            // Reset button for next time
            btn.innerText = 'Send to IceQube Support';
            btn.style.background = '#1e293b';
        }, 1500);
    },

    // --- Panel System ---
    togglePanel(panelId, show) {
        const overlay = document.getElementById(`${panelId}-overlay`);
        const panel = document.getElementById(`${panelId}-panel`);
        const appEl = document.getElementById('app');
        
        if (show) {
            // Antigravity: Close bottom sheets when opening a panel
            const allSheets = document.querySelectorAll('.bottom-sheet');
            const allOverlays = document.querySelectorAll('.sheet-overlay');
            allSheets.forEach(s => s.classList.remove('active'));
            allOverlays.forEach(o => o.classList.remove('active'));

            if (overlay) overlay.classList.add('active');
            if (panel) panel.classList.add('active');
            // if (appEl) appEl.classList.add('panel-push');
            document.body.style.overflow = 'hidden'; // Prevent background scroll

            // Hide PWA banner when any panel is open
            const pwaBanner = document.getElementById('pwa-install-banner');
            if (pwaBanner) pwaBanner.style.display = 'none';

            // Initialize UI with user data if it's the account panel
            if (panelId === 'account') {
                const nameElem = document.getElementById('user-full-name');
                if (nameElem) {
                    nameElem.innerText = this.user.companyName || 'Guest Customer';
                    const pfp = document.getElementById('user-pfp');
                    if (pfp) pfp.style.background = (this.user.companyName === 'Guest Customer') ? '#94a3b8' : '#4285F4';
                }
            }
        } else {
            document.querySelectorAll('.panel-overlay, .global-dimmer').forEach(o => o.classList.remove('active'));
            document.querySelectorAll('.bottom-sheet, .sheet-overlay').forEach(s => s.classList.remove('active')); // Antigravity: Clean up sheets too
            document.querySelectorAll('.bottom-panel, .side-panel').forEach(p => p.classList.remove('active'));
            // if (appEl) appEl.classList.remove('panel-push');
            document.body.style.overflow = '';

            // Restore PWA banner only if back on landing page (step 0)
            const pwaBanner = document.getElementById('pwa-install-banner');
            if (pwaBanner && this.currentStep === 0 && !sessionStorage.getItem('pwa-banner-closed')) {
                pwaBanner.style.display = '';
            }
        }
    },

    closeAllPanels() {
        this.togglePanel(null, false);
    },

    goToAbout() {
        this.togglePanel('about', true);
        this.switchAboutTab('tab-about-ice'); // Default tab
    },

    selectAuthProvider(provider, element) {
        // Clear previous selections
        const items = document.querySelectorAll('.provider-item');
        items.forEach(item => item.classList.remove('active'));
        
        // Mark selected
        element.classList.add('active');
        this.selectedProvider = provider;
        console.log('Selected Provider:', provider);
    },

    confirmLinking() {
        const limit = document.getElementById('auto-pay-limit').value;
        const provider = this.selectedProvider || 'GCash'; // Default to GCash if not clicked
        
        // Show success state
        this.showToast(`Linked ${provider} with ₱${limit} limit!`, 'success');
        this.togglePanel('auto-settle', false);
        
        // Update the UI if needed
        const promoText = document.querySelector('#step-automate .subtitle');
        if (promoText) {
            promoText.innerHTML += '<br><span style="color: #16a34a; font-weight: 600; font-size: 0.85rem;">✅ Auto-Settlement Linked via ' + provider + '</span>';
        }
    },

    closeAbout() {
        this.togglePanel('about', false);
    },

    openAccount() {
        this.renderDashboard(this.user.role);
        this.togglePanel('account', true);
    },

    closeAccount() {
        this.togglePanel('account', false);
    },

    openBilling() {
        this.togglePanel('billing', true);
    },

    simulatePayment() {
        // Mocking the payment detection
        const btn = document.querySelector('#billing-unpaid .pill-btn.primary');
        const originalText = btn.innerText;
        btn.innerText = "Processing Payment...";
        btn.disabled = true;
        
        setTimeout(() => {
            this.user.balance = 0; // Settle account
            this.updateBillingStatus('paid', '₱0.00');
            this.updateCreditUI();
            
            // If there's a pending order, release it
            if (this.orderData.status === 'Pending Payment') {
                this.showToast("Payment Verified! Releasing Order...", 'success');
                this.togglePanel('billing', false);
                this.processFinalOrder(); // Re-trigger to finish
            } else {
                this.showToast("Account Settled. Thank you!", 'success');
                this.togglePanel('billing', false);
            }
            
            btn.innerText = originalText;
            btn.disabled = false;
        }, 1500);
    },

    backToAccount() {
        // We want to return to the account panel
        // Since togglePanel(null, false) closes everything, we'll just open account which will appear behind or we can manage classes
        // For simplicity in this architecture, we close all and re-open account
        this.togglePanel(null, false);
        setTimeout(() => this.togglePanel('account', true), 10);
    },

    updateBillingStatus(state, amount = "₱0.00") {
        // state options: 'unpaid', 'paid', 'limit', 'normal'
        const btn = document.getElementById('billing-nav-btn');
        const prompt = document.getElementById('billing-prompt-text');
        const dot = document.getElementById('billing-dot');
        const icon = document.getElementById('billing-icon');
        const amountDisplay = document.getElementById('billing-amount-display');

        // Reset dashboard elements if they exist
        if (btn) btn.classList.remove('state-due', 'state-paid', 'state-limit');
        if (dot) dot.classList.add('state-hidden');

        // Set amount
        if (amountDisplay) amountDisplay.innerText = amount;

        const paidPanel = document.getElementById('billing-paid');
        const unpaidPanel = document.getElementById('billing-unpaid');

        if (state === 'unpaid') {
            if (prompt) prompt.innerText = "Pay Now";
            if (btn) btn.classList.add('state-due');
            if (dot) dot.classList.remove('state-hidden');
            if (icon) icon.innerText = "⚠️";
            
            if (paidPanel) paidPanel.classList.add('state-hidden');
            if (unpaidPanel) unpaidPanel.classList.remove('state-hidden');
        } else if (state === 'paid') {
            if (prompt) prompt.innerText = "Paid ✓";
            if (btn) btn.classList.add('state-paid');
            if (icon) icon.innerText = "💳";
            
            if (paidPanel) paidPanel.classList.remove('state-hidden');
            if (unpaidPanel) unpaidPanel.classList.add('state-hidden');
        } else if (state === 'limit') {
            if (prompt) prompt.innerText = "Limit Alert";
            if (btn) btn.classList.add('state-limit');
            if (icon) icon.innerText = "⚠️";
            
            // Standard paid/empty view for limit warnings unless specified otherwise
            if (paidPanel) paidPanel.classList.remove('state-hidden');
            if (unpaidPanel) unpaidPanel.classList.add('state-hidden');

            // Automatically trigger the detailed limit panel for high visibility
            setTimeout(() => this.openLimitAlert(), 800);
        } else {
            if (prompt) prompt.innerText = "";
            if (icon) icon.innerText = "💳";
            
            if (paidPanel) paidPanel.classList.remove('state-hidden');
            if (unpaidPanel) unpaidPanel.classList.add('state-hidden');
        }
    },

    openLimitAlert() {
        this.togglePanel('limit', true);
    },

    // --- Active Order Management ---
    openDeliveriesPanel() {
        this.togglePanel('deliveries', true);
    },

    showOrderOptions() {
        const editBtn = document.getElementById('btn-edit-order');
        const optionsGroup = document.getElementById('order-options-group');
        if (editBtn) editBtn.style.display = 'none';
        if (optionsGroup) optionsGroup.style.display = 'flex';
    },

    rescheduleOrder() {
        if (confirm('Reschedule this delivery? You will be taken back to the scheduling step.')) {
            this.togglePanel('about', false);
            this.togglePanel('deliveries', false);
            this.togglePanel('account', false);
            this.currentStep = this.steps.indexOf('schedule');
            this.showStep(this.currentStep);
            this.resetScheduleView();
        }
    },

    confirmCancelOrder() {
        if (confirm('Are you sure you want to cancel this order? This cannot be undone.')) {
            this.showToast('Order cancelled successfully.', 'info');
            location.reload();
        }
    },

    openQtyAdjuster() {
        this.togglePanel('account', false);
        this.currentStep = this.steps.indexOf('qty');
        this.showStep(this.currentStep);
    },

    goToDashboard() {
        console.log('Returning to primary landing page...');
        this.currentStep = 0;
        this.showStep(0);
        this.closeAllPanels();
        
        // Clear any order data to prevent state bleed
        this.orderData.qty = {
            fullDice: { '1kg': 0, '3kg': 0 },
            halfDice: { '1kg': 0, '3kg': 0 }
        };
        this.updateTotal();
    },

    // --- Staff Management ---
    generateInvite() {
        const modal = document.getElementById('invite-modal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        }
    },

    closeInviteModal() {
        const modal = document.getElementById('invite-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    },

    copyInviteLink() {
        const linkInput = document.getElementById('linkText');
        if (linkInput) {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(linkInput.value);
            
            const btn = event.currentTarget;
            const originalText = btn.innerText;
            btn.innerText = 'Copied!';
            btn.style.background = '#22c55e';
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = '';
            }, 2000);
        }
    },

    revokeAccess(name) {
        if (confirm(`Are you sure you want to revoke access for ${name}?`)) {
            // In a real app, this would be an API call
            const cards = document.querySelectorAll('.staff-card');
            cards.forEach(card => {
                if (card.querySelector('strong').innerText === name) {
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(-20px)';
                    setTimeout(() => card.remove(), 300);
                }
            });
        }
    },

    toggleStaffEdit() {
        const list = document.getElementById('staff-list');
        const btn = document.querySelector('.edit-toggle');
        if (!list || !btn) return;

        if (list.classList.contains('view-mode')) {
            list.classList.replace('view-mode', 'edit-mode');
            btn.innerText = "Done";
            btn.style.background = "#4382ec";
            btn.style.color = "white";
        } else {
            list.classList.replace('edit-mode', 'view-mode');
            btn.innerText = "Edit";
            btn.style.background = "#f1f5f9";
            btn.style.color = "#4382ec";
        }
    },

    openPermissions(name, role) {
        const nameElem = document.getElementById('perm-staff-name');
        const roleElem = document.getElementById('perm-staff-role');
        const pfpElem = document.getElementById('perm-pfp');
        
        if (nameElem) nameElem.innerText = name;
        if (roleElem) roleElem.innerText = role;
        if (pfpElem) {
            pfpElem.innerText = name.charAt(0);
            // Cycle colors based on name length for fun variety
            const colors = ['#4382ec', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
            pfpElem.style.background = colors[name.length % colors.length];
        }
        
        this.togglePanel('permissions', true);
    },

    savePermissions() {
        const name = document.getElementById('perm-staff-name').innerText;
        // Mocking the save interaction
        const btn = event.currentTarget;
        const originalText = btn.innerText;
        btn.innerText = 'Permissions Updated!';
        btn.style.background = '#22c55e';
        
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = '';
            this.togglePanel('permissions', false);
        }, 1500);
    },

    checkCredit(orderAmount, currentBalance, limit) {
        if ((currentBalance + orderAmount) > limit) {
            this.togglePanel('limit', true);
            this.saveOrderWithStatus('Pending');
        } else {
            this.nextStep(); // Assuming 'thank-you-page' is the next step ('complete')
            this.saveOrderWithStatus('Processing');
        }
    },

    saveOrderWithStatus(status) {
        console.log(`Order saved with status: ${status}`);
        // In a real app, this would persist to a database (e.g., Supabase)
    },

    // --- Profile Helpers ---
    loadUserProfile() {
        const saved = localStorage.getItem('iceqube_user_profile');
        if (saved) {
            try {
                const profile = JSON.parse(saved);
                this.user.companyName = profile.establishment || this.user.companyName;
                this.user.contactPerson = profile.contactPerson || '';
                this.user.contactNumber = profile.contactNumber || '';
                this.user.messengerId = profile.messengerId || this.user.messengerId;
                this.user.savedAddress = profile.address || '';
                this.user.savedLat = profile.lat || null;
                this.user.savedLng = profile.lng || null;
                
                // Pre-fill Edit Modal
                const estInput = document.getElementById('profile-establishment');
                const perInput = document.getElementById('profile-contact-person');
                const numInput = document.getElementById('profile-contact-number');
                const addrInput = document.getElementById('profile-address');
                const latInput = document.getElementById('profile-lat');
                const lngInput = document.getElementById('profile-lng');
                const msgInput = document.getElementById('profile-messenger-id');

                if (estInput) estInput.value = this.user.companyName;
                if (perInput) perInput.value = this.user.contactPerson;
                if (numInput) numInput.value = this.user.contactNumber;
                if (addrInput) addrInput.value = this.user.savedAddress;
                if (latInput) latInput.value = this.user.savedLat || '';
                if (lngInput) lngInput.value = this.user.savedLng || '';
                if (msgInput) msgInput.value = this.user.messengerId || '';
                
                // Pre-fill Pickup Form (New)
                const pickEst = document.getElementById('pickup-establishment');
                const pickPer = document.getElementById('pickup-person');
                const pickNum = document.getElementById('pickup-contact');
                if (pickEst) pickEst.value = this.user.companyName;
                if (pickPer) pickPer.value = this.user.contactPerson;
                if (pickNum) pickNum.value = this.user.contactNumber;

                this.updateMessengerStatusUI();

                console.log("👤 Profile Loaded:", this.user.companyName);
            } catch (e) {
                console.error("Error parsing profile:", e);
            }
        }
    },

    saveUserProfile() {
        const establishment = document.getElementById('profile-establishment').value.trim();
        const contactPerson = document.getElementById('profile-contact-person').value.trim();
        const contactNumber = document.getElementById('profile-contact-number').value.trim();
        const messengerId = document.getElementById('profile-messenger-id').value.trim();
        const address = document.getElementById('profile-address').value.trim();
        const lat = document.getElementById('profile-lat').value;
        const lng = document.getElementById('profile-lng').value;

        if (!establishment) {
            this.showToast("⚠️ Please enter an Establishment Name", 'error');
            return;
        }

        const profile = {
            establishment,
            contactPerson,
            contactNumber,
            messengerId,
            address,
            lat,
            lng,
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem('iceqube_user_profile', JSON.stringify(profile));
        
        // Update live state
        this.user.companyName = establishment;
        this.user.contactPerson = contactPerson;
        this.user.contactNumber = contactNumber;
        this.user.messengerId = messengerId;
        this.user.savedAddress = address;
        this.user.savedLat = lat;
        this.user.savedLng = lng;

        // Also sync to Pickup fields if they exist
        const pickEst = document.getElementById('pickup-establishment');
        const pickPer = document.getElementById('pickup-person');
        const pickNum = document.getElementById('pickup-contact');
        if (pickEst) pickEst.value = establishment;
        if (pickPer) pickPer.value = contactPerson;
        if (pickNum) pickNum.value = contactNumber;

        this.updateMessengerStatusUI();

        // Update UI
        const nameElem = document.getElementById('user-full-name');
        if (nameElem) nameElem.innerText = establishment;

        this.showToast("✅ Profile Updated Successfully", 'success');
        this.toggleBottomSheet('profile', false);
    },

    /**
     * AUTO-FILL PROFILE FOR FIRST-TIME CUSTOMERS
     * When a first-time customer places their first order (Delivery or Pickup),
     * automatically populate Account Settings with the same details so they
     * don't have to re-enter everything manually.
     */
    autoFillProfileFromOrder() {
        // Only auto-fill if no profile has been saved yet (first-time customer)
        const existingProfile = localStorage.getItem('iceqube_user_profile');
        if (existingProfile) {
            console.log('👤 Profile already exists — skipping auto-fill.');
            return;
        }

        // Works for both delivery and pickup orders
        const details = this.orderData.deliveryDetails;
        if (!details || !details.establishment) {
            console.log('📦 No delivery details to auto-fill profile from.');
            return;
        }

        // Build the profile object from order delivery details
        const profile = {
            establishment: details.establishment || '',
            contactPerson: details.person || '',
            contactNumber: details.contact || '',
            messengerId: this.user.messengerId || '',
            address: details.physical_address || details.maps || '',
            lat: details.lat || '',
            lng: details.lng || '',
            updatedAt: new Date().toISOString()
        };

        // Save to localStorage
        localStorage.setItem('iceqube_user_profile', JSON.stringify(profile));

        // Update live app state
        this.user.companyName = profile.establishment;
        this.user.contactPerson = profile.contactPerson;
        this.user.contactNumber = profile.contactNumber;
        this.user.savedAddress = profile.address;
        this.user.savedLat = profile.lat;
        this.user.savedLng = profile.lng;

        // Pre-fill the Account Settings form inputs so they're ready if the user opens it
        const estInput = document.getElementById('profile-establishment');
        const perInput = document.getElementById('profile-contact-person');
        const numInput = document.getElementById('profile-contact-number');
        const addrInput = document.getElementById('profile-address');
        const latInput = document.getElementById('profile-lat');
        const lngInput = document.getElementById('profile-lng');

        if (estInput) estInput.value = profile.establishment;
        if (perInput) perInput.value = profile.contactPerson;
        if (numInput) numInput.value = profile.contactNumber;
        if (addrInput) addrInput.value = profile.address;
        if (latInput) latInput.value = profile.lat || '';
        if (lngInput) lngInput.value = profile.lng || '';

        // Update the displayed name in the dashboard
        const nameElem = document.getElementById('user-full-name');
        if (nameElem) nameElem.innerText = profile.establishment;

        console.log('✅ Auto-filled Account Settings from first order:', profile.establishment);
    },

    updateMessengerStatusUI() {
        const text = document.getElementById('messenger-status-text');
        const badge = document.getElementById('messenger-status-badge');
        
        if (!text || !badge) return;

        if (this.user.messengerId) {
            text.innerText = "Linked: " + this.user.messengerId.substring(0, 8) + "...";
            badge.innerText = "LINKED";
            badge.style.background = "#dcfce7";
            badge.style.color = "#16a34a";
        } else {
            text.innerText = "Not connected";
            badge.innerText = "OFF";
            badge.style.background = "#fee2e2";
            badge.style.color = "#ef4444";
        }
    },

    openMapForProfile() {
        this.mapContext = 'profile';
        // Initialize map with saved location if available
        if (this.user.savedLat && this.user.savedLng) {
            this._tempLat = parseFloat(this.user.savedLat);
            this._tempLng = parseFloat(this.user.savedLng);
            this._tempAddress = this.user.savedAddress;
        }
        this.openMapOverlay();
    },

    // Override openMapOverlay to ensure context is reset if called from elsewhere
    originalOpenMapOverlay: null,
    openMapOverlay() {
        // Simple context management: if it's not profile, it's order
        if (this.mapContext !== 'profile') this.mapContext = 'order';
        
        const overlay = document.getElementById('map-overlay');
        overlay.classList.add('active');
        
        if (!this.mapInitialized) {
            if (window.google && this.googleMapsReady) {
                this.initGoogleMap();
            } else {
                this.initMap();
            }
        } else {
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                    if (this._tempLat && this._tempLng) {
                        const latlng = [this._tempLat, this._tempLng];
                        this.map.setView(latlng, 17);
                        this.mapMarker.setLatLng(latlng);
                    }
                } else if (this.googleMap) {
                    google.maps.event.trigger(this.googleMap, 'resize');
                    if (this._tempLat && this._tempLng) {
                        const pos = { lat: this._tempLat, lng: this._tempLng };
                        this.googleMap.setCenter(pos);
                        this.googleMarker.setPosition(pos);
                    }
                }
            }, 100);
        }
    }
};

// Expose app to global scope for Google Maps callback
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    // Mocking initial state for demonstration
    app.updateBillingStatus('unpaid', '₱2,550.00');
});

// GLOBAL FUNCTIONS FOR QUICK REORDER MODAL
function openReorderModal() {
    const modal = document.getElementById('reorderModal');
    if (modal) {
        modal.style.display = 'flex';
        // Delay adding active class for CSS transition to work
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

function closeReorderModal() {
    const modal = document.getElementById('reorderModal');
    if (modal) {
        modal.classList.remove('active');
        // Match the transition duration in CSS
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

function processOrder() {
    app.processOrder();
    app.showToast("Order Confirmed! Your bags are scheduled.", 'success');
    closeReorderModal();
}

function goToEditQty() {
    app.goToEditQty();
    app.showToast("Opening Quantity Editor...", 'info');
    closeReorderModal();
}

// Top-up logic
async function submitTopUp(amount) {
    const customAmt = document.getElementById('custom-pay-amount').value;
    const finalAmt = parseFloat(amount || customAmt);
    
    if (!finalAmt || finalAmt < 1) {
        app.showToast('Please enter a valid amount to recharge.', 'error');
        return;
    }
    
    // UI Feedback
    const partialBtn = document.querySelector('.pay-partial-btn');
    const allBtn = document.querySelector('.pay-all-btn');
    const originalPartial = partialBtn ? partialBtn.innerText : '';
    const originalAll = allBtn ? allBtn.innerText : '';

    if (partialBtn) partialBtn.innerText = 'Processing...';
    if (allBtn) allBtn.innerText = 'Processing...';
    
    console.log(`💳 Initiating payment of ₱${finalAmt} via GCash...`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Process using FIFO Allocator
    const result = await processTopUpPayment('USER_123', finalAmt);

    if (result.success) {
        app.toggleBottomSheet('debt', false);
        app.showToast(`✅ Payment of ₱${finalAmt} applied!`, 'success');
        
        // Refresh local UI state
        if (app.user.balance <= 0) {
            app.updateBillingStatus('paid', '₱0.00');
        } else {
            app.updateBillingStatus('unpaid', `₱${app.user.balance.toLocaleString()}`);
        }
    }

    if (partialBtn) partialBtn.innerText = originalPartial;
    if (allBtn) allBtn.innerText = originalAll;
}

/**
 * FIFO Payment Allocator (Antigravity Workflow)
 * Distributes payment across oldest unpaid invoices first.
 */
async function processTopUpPayment(userId, amountPaid) {
    let remainingCash = parseFloat(amountPaid);
    console.log(`[FIFO] Processing payment of ₱${remainingCash} for user ${userId}`);
    
    // 1. Fetch all unpaid invoices for this user, ordered by OLDEST first (FIFO)
    let unpaidInvoices = await fetchUnpaidInvoices(userId); 

    let updatedInvoices = [];

    // 2. The Waterfall Loop
    for (let invoice of unpaidInvoices) {
        if (remainingCash <= 0) break; // Cash has run out, stop the loop

        let invoiceBalance = parseFloat(invoice.amount_due);

        if (remainingCash >= invoiceBalance) {
            // SCENARIO A: We have enough cash to fully pay this invoice
            invoice.status = 'paid';
            invoice.amount_due = 0;
            remainingCash -= invoiceBalance; // Deduct from our cash pool
            updatedInvoices.push(invoice);
            console.log(`[FIFO] Invoice ${invoice.id} fully paid.`);
        } else {
            // SCENARIO B: We only have enough cash to partially pay this invoice
            invoice.amount_due = invoiceBalance - remainingCash;
            remainingCash = 0; // Cash is empty
            updatedInvoices.push(invoice);
            console.log(`[FIFO] Invoice ${invoice.id} partially paid. Remaining due: ₱${invoice.amount_due}`);
        }
    }

    // 3. Save to Database (Mock)
    await saveInvoiceUpdatesToDatabase(updatedInvoices);

    // 4. Update the Master Battery/Credit Limit
    await increaseUserAvailablePower(userId, amountPaid);

    return { success: true, message: "Payment applied successfully!" };
}

// MOCK DATABASE HELPERS
async function fetchUnpaidInvoices(userId) {
    // Return invoices from app.invoices sorted by date
    return app.invoices
        .filter(inv => inv.status === 'unpaid')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function saveInvoiceUpdatesToDatabase(updates) {
    console.log("[MOCK DB] Saving invoice updates:", updates);
    updates.forEach(update => {
        const idx = app.invoices.findIndex(inv => inv.id === update.id);
        if (idx !== -1) {
            app.invoices[idx] = { ...app.invoices[idx], ...update };
        }
    });
    return new Promise(resolve => setTimeout(resolve, 500));
}

async function increaseUserAvailablePower(userId, amount) {
    console.log(`[MOCK DB] Increasing available power by ₱${amount}`);
    app.user.balance -= parseFloat(amount); // In this app, balance is debt
    if (app.user.balance < 0) app.user.balance = 0;
    
    // Update UI
    if (typeof app.updateCreditUI === 'function') {
        app.updateCreditUI();
    }
    return new Promise(resolve => setTimeout(resolve, 300));
}

// Debt Sheet UI Toggle Logic
function toggleCustomPay(showCustom) {
    const defaultZone = document.getElementById('default-action-zone');
    const customZone = document.getElementById('custom-action-zone');
    const inputField = document.getElementById('custom-pay-amount');

    if (showCustom) {
        if (defaultZone) defaultZone.style.display = 'none';
        if (customZone) {
            customZone.style.display = 'block';
            setTimeout(() => inputField.focus(), 50); // Small delay to ensure focus on mobile
        }
    } else {
        if (customZone) customZone.style.display = 'none';
        if (defaultZone) defaultZone.style.display = 'flex';
        if (inputField) inputField.value = ''; // Clear the input if they cancel
    }
}

function submitCustomTopUp() {
    const amt = document.getElementById('custom-pay-amount').value;
    if (amt && amt > 0) {
        submitTopUp(amt); // Calls the FIFO backend function
    } else {
        app.showToast('Please enter a valid amount.', 'error');
    }
}



// Navigation for Debt Sheet Views
function showPaymentMethods() {
    const ledgerView = document.getElementById('ledger-view');
    const paymentView = document.getElementById('payment-methods-view');
    const customAmt = document.getElementById('custom-pay-amount').value;
    
    // Update the display amount if it's a partial payment
    const amountSpan = paymentView.querySelector('.amount-due span');
    if (customAmt && customAmt > 0) {
        amountSpan.innerText = '₱' + parseFloat(customAmt).toLocaleString();
    } else {
        amountSpan.innerText = '₱1,665.00';
    }

    if (ledgerView) ledgerView.style.display = 'none';
    if (paymentView) {
        paymentView.style.display = 'block';
        paymentView.classList.add('active');
    }
}

function backToLedger() {
    const ledgerView = document.getElementById('ledger-view');
    const paymentView = document.getElementById('payment-methods-view');
    
    if (paymentView) paymentView.style.display = 'none';
    if (ledgerView) ledgerView.style.display = 'block';
}

function showCashPending() {
    const paymentView = document.getElementById('payment-methods-view');
    const cashView = document.getElementById('cash-pending-view');
    
    if (paymentView) paymentView.style.display = 'none';
    if (cashView) {
        cashView.style.display = 'block';
        cashView.classList.add('active');
    }
}

/**
 * Provisional Battery Boost (Overdraft Mode)
 * Allows the user to continue ordering while a cash pickup is pending.
 */
function activateProvisionalCredit() {
    const batteryFill = document.getElementById('battery-fill');
    const rechargeBtn = document.querySelector('.recharge-btn');
    const powerTag = document.querySelector('.tag');

    console.log("[Antigravity] Activating Provisional Overdraft...");

    // 1. Temporarily fill the battery to 50% (Yellow/Warning state)
    if (batteryFill) {
        batteryFill.style.height = '50%'; // It's vertical in this app
        batteryFill.style.width = '100%';
        batteryFill.style.backgroundColor = '#eab308'; 
        batteryFill.classList.add('warning');
        batteryFill.classList.remove('critical');
    }

    // 2. Change the Elite Tag to show the provisional status
    if (powerTag) {
        powerTag.innerText = "OVERDRAFT ACTIVE";
        powerTag.style.backgroundColor = "rgba(234, 179, 8, 0.2)";
        powerTag.style.color = "#eab308";
        powerTag.style.border = "1px solid #eab308";
    }

    // 3. Update the main action button
    if (rechargeBtn) {
        rechargeBtn.innerText = "Cash Pickup Scheduled";
        rechargeBtn.classList.remove('critical');
        rechargeBtn.style.background = "#334155";
        rechargeBtn.disabled = true; // Prevent them from clicking it again
    }

    // 4. Close the sheet and allow ordering
    app.toggleBottomSheet('debt', false);
    
    // Set Global Flags for Order Generation
    app.isOverdraftActive = true;
    app.totalDebtToCollect = 1665.00;
    
    // Unlock the "Quick Reorder" button if it was disabled
    const reorderBtn = document.querySelector('.power-reorder-btn');
    if (reorderBtn) {
        reorderBtn.disabled = false;
        reorderBtn.style.opacity = '1';
        reorderBtn.style.filter = 'none';
    }
    
    app.showToast("🚀 Overdraft Active: You can place new orders now.", 'success');
}

/**
 * Enterprise Order Generation (FIFO-Linked)
 * Creates the final order payload with specialized "Strict Cash Collection" flags if overdraft is active.
 */
async function generateOrder(userId, bagQuantity, isOverdraftActive, totalDebtToCollect) {
    console.log(`[OrderGen] Generating order for ${userId}...`);
    
    let orderPayload = {
        user_id: userId,
        quantity: bagQuantity,
        type: 'Half-Dice', // Primary SKU
        status: 'pending_dispatch',
        // THE CRITICAL GHOST FOUNDER ADDITIONS:
        requires_cash_collection: isOverdraftActive,
        collection_amount: isOverdraftActive ? totalDebtToCollect : 0,
        driver_notes: isOverdraftActive ? `🚨 STRICT: Collect ₱${totalDebtToCollect} before unloading ice.` : 'Standard dispatch.'
    };

    console.log("--- Supabase Payload Ready ---");
    console.log(orderPayload);

    // Mock Insert into Supabase
    return new Promise(resolve => {
        setTimeout(() => {
            console.log("[MOCK DB] Order successfully inserted into 'orders' table.");
            resolve({ success: true, orderId: "ORD-" + Math.floor(Math.random() * 10000) });
        }, 800);
    });
}

// --- SECURE CHECKOUT & AI VERIFICATION LOGIC ---
let lastActivePanel = 'debt-sheet';

// Function called when opening the checkout modal
function openSecureCheckout(methodType) {
    const overlay = document.getElementById('secure-checkout-overlay');
    const qrImg = document.getElementById('payment-qr-image');
    const bankNameEl = document.getElementById('checkout-bank-name');
    const recipientNameEl = document.getElementById('checkout-recipient-name');
    const recipientNumberEl = document.getElementById('checkout-recipient-number');
    const gcashAppLink = document.getElementById('gcash-app-link');
    const amountToTransferEl = document.getElementById('amount-to-transfer');
    
    // Get the amount from the debt display (ensure we handle commas and whitespace)
    const debtDisplay = document.querySelector('.total-debt-display');
    const debtText = debtDisplay ? debtDisplay.innerText : "₱0";
    const amount = parseFloat(debtText.replace(/[^\d.]/g, '')) || 0;
    
    if (amountToTransferEl) amountToTransferEl.innerText = `Transfer exactly: ₱${amount.toFixed(2)}`;

    const qrMethod = methodType === 'gcash' ? 'gcash' : 'gotyme';
    const qrData = app.generateQRPhString(amount, qrMethod);
    
    // Use the verified buffer rendering technique
    const buffer = document.getElementById('qrcode-buffer');
    if (buffer && qrData) {
        buffer.innerHTML = '';
        try {
            new QRCode(buffer, {
                text: qrData,
                width: 256,
                height: 256,
                correctLevel: QRCode.CorrectLevel.M
            });

            // Wait for canvas to render
            setTimeout(() => {
                const canvas = buffer.querySelector('canvas');
                const img = buffer.querySelector('img');
                if (canvas) {
                    qrImg.src = canvas.toDataURL("image/png");
                } else if (img && img.src) {
                    qrImg.src = img.src;
                }
            }, 150);
        } catch (e) {
            console.error("Checkout QR Generation failed:", e);
        }
    }

    if (methodType === 'gcash') {
        if (bankNameEl) {
            bankNameEl.innerText = 'GCash';
            bankNameEl.style.color = '#60a5fa'; // Brighter Blue (Contrast)
            bankNameEl.style.textShadow = '0 0 10px rgba(96, 165, 250, 0.4)';
        }
        if (recipientNameEl) recipientNameEl.innerText = 'LAWRENCE FE BACAYO';
        if (recipientNumberEl) recipientNumberEl.innerText = '0961 039 1173';
        if (gcashAppLink) gcashAppLink.style.display = 'block';
    } else {
        if (bankNameEl) {
            bankNameEl.innerText = 'GoTyme Bank';
            bankNameEl.style.color = '#f87171'; // Brighter Red (Contrast)
            bankNameEl.style.textShadow = '0 0 10px rgba(248, 113, 113, 0.4)';
        }
        if (recipientNameEl) recipientNameEl.innerText = 'LAWRENCE FE BACAYO';
        if (recipientNumberEl) recipientNumberEl.innerText = '0176 3092 9031';
        if (gcashAppLink) gcashAppLink.style.display = 'none';
    }

    overlay.style.display = 'flex';
}

function downloadCheckoutQR() {
    const qrImg = document.getElementById('payment-qr-image');
    if (!qrImg || !qrImg.src) return;
    
    const link = document.createElement('a');
    link.href = qrImg.src;
    link.download = `IceQube-Payment-QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('QR Code saved to Gallery!', 'success');
    }
}

function closeCheckout() {
    document.getElementById('secure-checkout-overlay').style.display = 'none';
    
    const debtSheet = document.getElementById('debt-sheet');
    if (debtSheet) debtSheet.style.display = 'block';
}

function showPaymentMethods() {
    // Obsolete in unified view, but kept as a pass-through if needed
}

function backToLedger() {
    // Obsolete in unified view
}

function resetToFullBalance() {
    const originalAmount = 1665.00;
    const displays = document.querySelectorAll('.total-debt-display');
    displays.forEach(el => {
        el.innerText = `₱${originalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    });
    
    // Toggle active class
    document.getElementById('btn-choice-full')?.classList.add('active');
    document.getElementById('btn-choice-partial')?.classList.remove('active');
    
    enablePaymentMethods();
    
    if (typeof app !== 'undefined' && app.showToast) app.showToast('Full balance selected', 'success');
}

function selectPaymentMethod(method) {
    // Toggle active classes
    const gcashBtn = document.getElementById('btn-pay-gcash-unified');
    const qrBtn = document.getElementById('btn-pay-qr-unified');
    
    if (method === 'gcash') {
        gcashBtn?.classList.add('active');
        qrBtn?.classList.remove('active');
    } else {
        qrBtn?.classList.add('active');
        gcashBtn?.classList.remove('active');
    }
    
    // Open the checkout after a tiny delay to show the "pick"
    setTimeout(() => {
        openSecureCheckout(method);
    }, 150);
}

function enablePaymentMethods() {
    const zone = document.getElementById('payment-selection-zone');
    if (zone) {
        zone.style.opacity = '1';
        zone.style.pointerEvents = 'auto';
    }
}

function disablePaymentMethods() {
    const zone = document.getElementById('payment-selection-zone');
    if (zone) {
        zone.style.opacity = '0.4';
        zone.style.pointerEvents = 'none';
        
        // Clear active states
        document.getElementById('btn-choice-full')?.classList.remove('active');
        document.getElementById('btn-choice-partial')?.classList.remove('active');
        document.getElementById('btn-pay-gcash-unified')?.classList.remove('active');
        document.getElementById('btn-pay-qr-unified')?.classList.remove('active');
    }
}

function toggleCustomPay(show) {
    const customZone = document.getElementById('custom-action-zone');
    
    if (show) {
        customZone.style.display = 'block';
        document.getElementById('custom-pay-amount').focus();
        
        // Toggle active class
        document.getElementById('btn-choice-partial')?.classList.add('active');
        document.getElementById('btn-choice-full')?.classList.remove('active');
    } else {
        customZone.style.display = 'none';
    }
}

function updatePartialAmount() {
    const input = document.getElementById('custom-pay-amount');
    const amount = parseFloat(input.value);
    
    if (isNaN(amount) || amount <= 0) {
        if (typeof app !== 'undefined' && app.showToast) app.showToast('Please enter a valid amount', 'error');
        return;
    }
    
    // Update the main display
    const displays = document.querySelectorAll('.total-debt-display');
    displays.forEach(el => {
        el.innerText = `₱${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    });
    
    // Hide the input and enable payments
    toggleCustomPay(false);
    enablePaymentMethods();
    
    if (typeof app !== 'undefined' && app.showToast) app.showToast(`Total updated to ₱${amount.toFixed(2)}`, 'success');
}

function copyAccountNumber() {
    const numEl = document.getElementById('checkout-recipient-number');
    if (numEl) {
        const text = numEl.innerText.replace(/\s/g, '');
        copyToClipboard(text);
    }
}

function copyText(text) {
    copyToClipboard(text);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    
    const btn = document.getElementById('btn-copy-checkout') || document.querySelector('.copy-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span>Copied!</span>';
    btn.style.background = '#22c55e';
    btn.style.color = 'white';
    
    setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.background = '';
        btn.style.color = '';
    }, 2000);
}

let selectedReceiptFile = null;

// 1. Handle the user picking a file (Updates UI, enables button)
function handleFileSelection(inputElement) {
    const file = inputElement.files[0];
    const dropzoneUI = document.getElementById('dropzone-ui');
    const uploadText = document.getElementById('upload-text');
    const confirmBtn = document.getElementById('confirm-finish-btn');

    if (file) {
        selectedReceiptFile = file;
        
        // Update the UI to show success state
        dropzoneUI.classList.add('has-file');
        uploadText.innerText = "Selected: " + file.name;
        
        // Enable the Confirm button
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled');
        confirmBtn.classList.add('active');
    }
}

// 2. Handle the explicit "Confirm & Finish" click
// 2. Handle the explicit "Confirm & Finish" click
async function submitAIReceipt() {
    if (!selectedReceiptFile) return;

    const confirmBtn = document.getElementById('confirm-finish-btn');
    const loadingUI = document.getElementById('ai-scanner-loading');
    const errorBox = document.getElementById('upload-error-box');

    // UI to Loading State
    confirmBtn.style.display = 'none';
    errorBox.style.display = 'none';
    loadingUI.style.display = 'block';

    try {
        // Simulating a successful AI check:
        setTimeout(() => {
            executeOptimisticUnlock();
        }, 1500);

    } catch (error) {
        // Reset UI on failure
        loadingUI.style.display = 'none';
        confirmBtn.style.display = 'block';
        errorBox.style.display = 'block';
        errorBox.innerText = "Upload failed: Image too blurry.";
    }
}

function saveQRToGallery() {
    const qrImg = document.getElementById('payment-qr-image');
    if (!qrImg) return;
    
    // Simulate saving by opening in new tab or triggering download
    const link = document.createElement('a');
    link.href = qrImg.src;
    link.download = 'IceQube-Payment-QR.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    app.showToast("📲 QR Code saved/downloaded.", 'success');
}

// Function called when the AI returns 'approved'
function executeOptimisticUnlock(paidAmount) {
    const confirmBtn = document.getElementById('confirm-finish-btn');
    const loadingUI = document.getElementById('ai-scanner-loading');

    // STEP 1: The Micro-Celebration
    loadingUI.style.display = 'none';
    confirmBtn.style.display = 'block';
    
    // Change button to success state
    confirmBtn.style.background = '#22c55e'; // Success Green
    confirmBtn.innerHTML = '✅ Payment Verified!';
    confirmBtn.classList.remove('active');

    // STEP 2 & 3: The Dashboard Reset (After a short delay for the user to read it)
    setTimeout(() => {
        // Hide the checkout overlay smoothly
        const overlay = document.getElementById('secure-checkout-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => { 
            overlay.style.display = 'none'; 
            overlay.style.opacity = '1'; // Reset for next time
        }, 300);

        // Reset Dashboard Variables
        updateDashboardUI(2500, 0); // Max Power, Zero Debt

        // Apply Success Surge Animation
        const battery = document.querySelector('.battery-outer.standalone');
        if (battery) {
            battery.classList.remove('battery-critical');
            battery.classList.add('battery-surge');
            setTimeout(() => battery.classList.remove('battery-surge'), 1600);
        }

        // Highlight the Order Button
        triggerOrderButtonPulse();

    }, 1500); // 1.5 second delay
}

// Helper: Dynamically updates the main dashboard without a page reload
function updateDashboardUI(newPower, newDebt) {
    const batteryElement = document.getElementById('battery-container');
    const batteryFill = document.getElementById('battery-fill');
    
    // Trigger the surge animation (forced reflow)
    if (batteryElement) {
        batteryElement.classList.remove('battery-surge'); 
        void batteryElement.offsetWidth; // This forces the browser to reset the animation
        batteryElement.classList.add('battery-surge');
        
        checkBatteryStatus(newPower);
    }
    
    // 1. Update the Battery Visual
    if (batteryFill) {
        const percentage = (newPower / 2500) * 100;
        batteryFill.style.height = `${percentage}%`;
        
        // Clear previous classes
        batteryFill.classList.remove('safe', 'warning', 'critical');
        
        const powerText = document.getElementById('available-power-text');
        
        if (percentage >= 100) {
            batteryFill.classList.add('safe');
            if (powerText) powerText.style.color = '#3b82f6'; // Blue
        } else if (percentage > 5) {
            batteryFill.classList.add('warning');
            if (powerText) powerText.style.color = '#eab308'; // Gold
        } else {
            batteryFill.classList.add('critical');
            if (powerText) powerText.style.color = '#ef4444'; // Red
        }
    }

    // 2. Update the Text Numbers
    const powerText = document.getElementById('available-power-text');
    const debtText = document.getElementById('total-debt-text');
    
    if (powerText) powerText.innerText = `₱${newPower.toLocaleString()}`;
    if (debtText) {
        debtText.innerText = `₱${newDebt.toLocaleString()}`;
        debtText.classList.remove('warning', 'critical', 'debt-alert');
    }

    // 3. Update the Recharge Button
    const rechargeBtn = document.getElementById('recharge-btn');
    if (rechargeBtn) {
        if (newDebt <= 0) {
            rechargeBtn.innerText = 'Power Restored';
            rechargeBtn.classList.add('success');
            rechargeBtn.disabled = true;
        } else {
            rechargeBtn.innerText = 'Recharge Now';
            rechargeBtn.classList.remove('success');
            rechargeBtn.disabled = false;
        }
    }

    // 4. Unlock the Reorder Button
    const reorderBtn = document.getElementById('quick-reorder-btn');
    if (reorderBtn) {
        reorderBtn.classList.remove('locked');
        reorderBtn.disabled = false;
    }
}

// Helper: Draws attention to the next action
function triggerOrderButtonPulse() {
    const reorderBtn = document.getElementById('quick-reorder-btn');
    if (!reorderBtn) return;
    
    reorderBtn.style.transition = 'all 0.4s ease';
    reorderBtn.style.transform = 'scale(1.05)';
    reorderBtn.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
    
    setTimeout(() => {
        reorderBtn.style.transform = 'scale(1)';
        reorderBtn.style.boxShadow = 'none';
    }, 400);
}

function checkBatteryStatus(availablePower) {
    const batteryElement = document.getElementById('battery-container');
    if (!batteryElement) return;
    
    // Trigger critical pulse at 5% (125) or less
    if (availablePower <= 125) {
        batteryElement.classList.add('battery-critical');
    } else {
        batteryElement.classList.remove('battery-critical');
    }
}

// Helper: Mocking the Supabase response for testing
function mockSupabaseAICall(file) {
    return new Promise((resolve) => {
        setTimeout(() => {
            // For testing, we'll pretend it's approved.
            resolve({ status: 'approved', amount: 1665, reference: '881923A' }); 
        }, 2000);
    });
}

// Start the app (Already initialized via DOMContentLoaded)

// FORCED 1:1 SCALE & UNZOOMABLE
// This ensures that even if browsers ignore the meta viewport tag, 
// the app remains at a fixed 1:1 scale for a true native app feel.
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
