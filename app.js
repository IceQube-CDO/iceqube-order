/**
 * IceQube CDO - High-Fidelity Mobile App Logic
 * Includes secure Messenger notification via Supabase Proxy
 */

const SUPABASE_URL = 'https://tbbezmpobjdkwpoflfcs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EcCGzl4oN7_rSmkUIZoYLA_WWbTE7iA';
const FB_RECIPIENT_ID = '7335934696483858'; // Admin PSID

class IceQubeApp {
    constructor() {
        this.currentStep = 0;
        this.steps = ['start', 'qty', 'schedule', 'logistics', 'payment', 'complete', 'automate'];
        
        this.orderData = {
            qty: {
                fullDice: { '3kg': 0, '1kg': 0 },
                halfDice: { '3kg': 0, '1kg': 0 }
            },
            schedule: { type: null, date: '', time: '' },
            logistics: { type: null, address: '', lat: null, lng: null, fee: 30 },
            payment: { method: null, verified: false },
            total: 0,
            id: null
        };

        this.map = null;
        this.mapMarker = null;
        this.supabase = null;

        this.init();
    }

    init() {
        // Initialize Supabase
        try {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (e) {
            console.error("Supabase Init Error:", e);
        }

        this.showStep(0);
        this.updateTotal();
    }

    // --- Navigation Core ---
    showStep(index) {
        this.currentStep = index;
        document.querySelectorAll('.step-content').forEach((step, i) => {
            step.classList.toggle('active', i === index);
        });
        
        const bar = document.getElementById('progress-bar');
        if (bar) {
            const percentage = (index / (this.steps.length - 1)) * 100;
            bar.style.width = `${percentage}%`;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        }
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    // --- Step 2: Quantity Logic ---
    slideQty(type) {
        const track = document.getElementById('qty-carousel-track');
        const tabFull = document.getElementById('tab-full-dice');
        const tabHalf = document.getElementById('tab-half-dice');

        if (type === 'half-dice') {
            track.style.transform = 'translateX(-50%)';
            tabFull.classList.remove('active');
            tabHalf.classList.add('active');
        } else {
            track.style.transform = 'translateX(0)';
            tabFull.classList.add('active');
            tabHalf.classList.remove('active');
        }
    }

    updateQty(iceType, size, delta) {
        const current = this.orderData.qty[iceType][size];
        const updated = Math.max(0, current + delta);
        this.orderData.qty[iceType][size] = updated;
        
        document.getElementById(`qty-${iceType}-${size}`).textContent = updated;
        this.updateTotal();
    }

    updateTotal() {
        const q3 = this.orderData.qty.fullDice['3kg'] + this.orderData.qty.halfDice['3kg'];
        const q1 = this.orderData.qty.fullDice['1kg'] + this.orderData.qty.halfDice['1kg'];
        
        let price3 = 40;
        let price1 = 15;

        // Bulk Tiers
        if (q3 >= 15) price3 = 35;
        if (q1 >= 40) price1 = 14;

        const subtotal = (q3 * price3) + (q1 * price1);
        this.orderData.total = subtotal;

        // UI Updates
        const notifier = document.getElementById('bulk-notifier');
        if (notifier) {
            notifier.style.display = (q3 >= 15 || q1 >= 40) ? 'flex' : 'none';
        }

        const nextBtn = document.getElementById('qty-next');
        if (nextBtn) {
            nextBtn.textContent = `Confirm Order (₱${subtotal})`;
            nextBtn.disabled = subtotal === 0;
        }
    }

    confirmQuantity() {
        // Paradox Protection (14 -> 15 bags)
        const q3 = this.orderData.qty.fullDice['3kg'] + this.orderData.qty.halfDice['3kg'];
        if (q3 === 14) {
             if (confirm("🔥 Bonus: Add 1 more bag to unlock the ₱35 Bulk Tier? (It's actually cheaper!)")) {
                if (this.orderData.qty.fullDice['3kg'] > 0) this.orderData.qty.fullDice['3kg']++;
                else this.orderData.qty.halfDice['3kg']++;
                this.updateTotal();
             }
        }
        this.nextStep();
    }

    // --- Step 3: Schedule Logic ---
    selectSchedule(type, el) {
        this.orderData.schedule.type = type;
        document.querySelectorAll('#step-schedule .card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        const inputs = document.getElementById('schedule-inputs');
        const nextBtn = document.getElementById('schedule-next');
        
        if (type === 'Deliver Now') {
            inputs.style.display = 'none';
            nextBtn.style.display = 'none';
            setTimeout(() => this.nextStep(), 300);
        } else {
            inputs.style.display = 'block';
            nextBtn.style.display = 'flex';
            this.validateSchedule();
        }
    }

    validateSchedule() {
        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        document.getElementById('schedule-next').disabled = !(date && time);
    }

    // --- Step 4: Logistics & Map ---
    selectLogistics(type, el) {
        this.orderData.logistics.type = type;
        document.querySelectorAll('#step-logistics .card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        const delView = document.getElementById('logistics-delivery');
        const pickView = document.getElementById('logistics-pickup');
        const nextBtn = document.getElementById('btn-logistics-next');

        nextBtn.style.display = 'flex';

        if (type === 'Doorstep Delivery') {
            delView.classList.add('active');
            pickView.classList.remove('active');
            nextBtn.disabled = !this.orderData.logistics.lat;
        } else {
            delView.classList.remove('active');
            pickView.classList.add('active');
            nextBtn.disabled = false;
            this.orderData.logistics.fee = 0;
            this.updateFinalTotal();
        }
    }

    openMapOverlay() {
        document.getElementById('map-overlay').style.display = 'flex';
        if (!this.map) {
            this.initMap();
        } else {
            setTimeout(() => this.map.invalidateSize(), 150);
        }
    }

    closeMapOverlay() {
        document.getElementById('map-overlay').style.display = 'none';
    }

    initMap() {
        const warehouse = [8.5020, 124.6608];
        this.map = L.map('map-container').setView(warehouse, 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        
        this.mapMarker = L.marker(warehouse, { draggable: true }).addTo(this.map);
        this.mapMarker.on('dragend', (e) => this.reverseGeocode(e.target.getLatLng()));
        this.map.on('click', (e) => {
            this.mapMarker.setLatLng(e.latlng);
            this.reverseGeocode(e.latlng);
        });
    }

    async reverseGeocode(latlng) {
        const addrText = document.getElementById('map-address-text');
        addrText.innerText = "Fetching address...";
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`);
            const data = await res.json();
            this._tempAddress = data.display_name.split(',').slice(0, 3).join(',');
            this._tempLat = latlng.lat;
            this._tempLng = latlng.lng;
            addrText.innerText = this._tempAddress;
        } catch (e) {
            addrText.innerText = "Location Pin Set";
        }
    }

    confirmMapLocation() {
        if (!this._tempLat) return;
        this.orderData.logistics.address = this._tempAddress;
        this.orderData.logistics.lat = this._tempLat;
        this.orderData.logistics.lng = this._tempLng;
        
        document.getElementById('delivery-location').value = this.orderData.logistics.address;
        this.closeMapOverlay();
        this.calculateDeliveryFee();
    }

    async calculateDeliveryFee() {
        const { lat, lng } = this.orderData.logistics;
        const origin = '124.6608,8.5020'; // Warehouse
        try {
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${origin};${lng},${lat}?overview=false`);
            const data = await res.json();
            const distance = data.routes[0].distance / 1000;
            this.orderData.logistics.fee = Math.max(30, Math.ceil(distance) * 10);
            this.updateFinalTotal();
            document.getElementById('btn-logistics-next').disabled = false;
        } catch (e) {
            this.orderData.logistics.fee = 30;
            this.updateFinalTotal();
        }
    }

    updateFinalTotal() {
        const total = this.orderData.total + this.orderData.logistics.fee;
        const summary = document.getElementById('delivery-summary');
        summary.style.display = 'block';
        document.getElementById('summary-subtotal').textContent = `₱${this.orderData.total}`;
        document.getElementById('summary-delivery-fee').textContent = `₱${this.orderData.logistics.fee}`;
        document.getElementById('summary-total').textContent = `₱${total}`;
    }

    goToPayment() {
        this.nextStep();
    }

    // --- Step 5: Payment Logic ---
    selectPayment(method, el) {
        this.orderData.payment.method = method;
        document.querySelectorAll('#step-payment .card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        const codBox = document.getElementById('cod-verification-box');
        codBox.style.display = (method === 'Cash on Delivery') ? 'block' : 'none';
        
        document.getElementById('btn-finish-order').disabled = (method === 'Cash on Delivery' && !this.orderData.payment.verified);
        if (method === 'GCash') document.getElementById('btn-finish-order').disabled = false;
    }

    sendVerificationCode() {
        const phone = document.getElementById('cod-phone-input').value;
        if (phone.length < 10) return alert("Please enter a valid phone number.");
        document.getElementById('otp-reveal-section').style.display = 'block';
        alert("Simulated: OTP '1234' sent to " + phone);
    }

    verifyOTP() {
        const otp = document.getElementById('cod-otp-input').value;
        if (otp === '1234') {
            this.orderData.payment.verified = true;
            document.getElementById('btn-finish-order').disabled = false;
            document.getElementById('otp-reveal-section').innerHTML = "<p style='color: #166534; font-weight: 700; margin-top: 10px;'>✅ Verified</p>";
        }
    }

    async finishOrder() {
        const btn = document.getElementById('btn-finish-order');
        btn.textContent = "Placing Order...";
        btn.disabled = true;

        this.orderData.id = "IQ-" + Math.floor(10000 + Math.random() * 90000);
        
        // Update Final Receipt UI
        document.getElementById('finish-id').textContent = `#${this.orderData.id}`;
        document.getElementById('finish-qty').textContent = `${this.orderData.qty.fullDice['3kg'] + this.orderData.qty.halfDice['3kg']} Full Dice (3kg)`;
        document.getElementById('finish-logistics').textContent = this.orderData.logistics.type;
        document.getElementById('finish-payment').textContent = this.orderData.payment.method;
        document.getElementById('finish-total').textContent = `₱${this.orderData.total + this.orderData.logistics.fee}`;

        // Call Supabase Messenger Proxy
        await this.notifyMessenger();

        setTimeout(() => this.nextStep(), 1500);
    }

    async notifyMessenger() {
        if (!this.supabase) return;

        const message = `🧊 NEW ORDER: #${this.orderData.id}\nItems: ${document.getElementById('finish-qty').textContent}\nLogistics: ${this.orderData.logistics.type}\nTotal: ${document.getElementById('finish-total').textContent}\n\nProcessed via IceQube Secure Edge.`;

        try {
            const { data, error } = await this.supabase.functions.invoke('messenger-proxy', {
                body: { recipientId: FB_RECIPIENT_ID, message: message }
            });

            if (error) console.error("Messenger Proxy Error:", error);
            else console.log("Messenger Notified:", data);
        } catch (e) {
            console.error("Invoke Error:", e);
        }
    }

    // --- Step 7: Automation ---
    goToAutomate() {
        this.nextStep();
    }

    toggleDay(day, el) {
        el.classList.toggle('active');
        this.renderScheduleList();
    }

    renderScheduleList() {
        const container = document.getElementById('dynamic-schedule-list');
        container.innerHTML = "";
        const activeDays = document.querySelectorAll('.day-pill.active');
        
        activeDays.forEach(day => {
            const row = document.createElement('div');
            row.className = 'card';
            row.style.marginBottom = '0.75rem';
            row.innerHTML = `
                <div>
                    <h3 style="margin-bottom: 0;">Every ${day.textContent}</h3>
                    <p style="font-size: 0.8rem;">Ice arrival by 9:00 AM</p>
                </div>
                <div style="font-weight: 700; color: var(--accent);">Active</div>
            `;
            container.appendChild(row);
        });
    }

    saveSchedule() {
        alert("Subscription saved! You'll receive automated notifications before each dispatch.");
        this.returnToMessenger();
    }

    returnToMessenger() {
        window.location.href = "https://m.me/IceQubeCDO";
    }
}

// Global Init
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new IceQubeApp();
    window.app = app;
});
