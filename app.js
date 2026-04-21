/**
 * IceQube AI Dispatcher Logic
 * Premium Ice Supply - Cagayan de Oro
 */

const CONFIG = {
    PRICING: {
        '3kg': 40,
        '1kg': 15
    },
    WAREHOUSE: "Piaping Itum, Macabalan (near the Post Office)",
    HOURS: { START: 8, END: 22 }, // 8 AM - 10 PM
    DELIVERY_FEE: 25 // Flat fee for demo
};

const STATE = {
    INITIAL: 'INITIAL',
    IDENTIFIED: 'IDENTIFIED',
    ORDERING_QTY: 'ORDERING_QTY',
    ORDERING_TYPE: 'ORDERING_TYPE',
    LOGISTICS_METHOD: 'LOGISTICS_METHOD',
    LOGISTICS_PIN: 'LOGISTICS_PIN',
    RECURRING_PROMPT: 'RECURRING_PROMPT',
    CONFIRMATION: 'CONFIRMATION'
};

class IceQubeDispatcher {
    constructor() {
        this.currentState = STATE.INITIAL;
        this.customer = {
            id: 'messenger_user_123',
            name: 'Valued Customer',
            isBusiness: false,
            address: null
        };
        this.order = {
            qty3kg: 0,
            qty1kg: 0,
            type: null, // 'Full Dice' or 'Half-Dice'
            method: null, // 'Delivery' or 'Self-Pickup'
            time: 'Now',
            total: 0
        };

        this.chatContainer = document.getElementById('chat-messages');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.quickActions = document.getElementById('quick-actions');

        this.init();
    }

    init() {
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });

        // Start the flow
        setTimeout(() => this.identifyCustomer(), 1000);
    }

    // --- Core Conversation Engine ---

    async identifyCustomer() {
        this.addMessage("ai", `<img src="ice_bg.png" class="product-image" alt="Premium Ice">
Welcome to **IceQube CDO**. Searching for your profile...`);
        
        // Simulating Supabase Fetch
        await this.mockDelay(1500);
        
        const isReturning = Math.random() > 0.3; // 70% chance of returning
        if (isReturning) {
            this.addMessage("ai", `Welcome back! I've located your profile. Are we ordering for the usual spot in **CDO**?`);
            this.setQuickActions(["Yes, same spot", "New Location"]);
            this.currentState = STATE.IDENTIFIED;
        } else {
            this.addMessage("ai", `I see you're new here. I'm the IceQube AI Dispatcher. How can I help you today?`);
            this.setQuickActions(["Order Ice", "Pricing Info"]);
            this.currentState = STATE.IDENTIFIED;
        }
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;

        this.addMessage("user", text);
        this.userInput.value = '';
        this.processInput(text);
    }

    processInput(text) {
        const lower = text.toLowerCase();

        switch (this.currentState) {
            case STATE.IDENTIFIED:
                if (lower.includes('order') || lower.includes('yes')) {
                    this.askQuantity();
                } else {
                    this.addMessage("ai", "I can help you with premium 1kg and 3kg bags. Would you like to start an order?");
                    this.setQuickActions(["Start Order"]);
                }
                break;

            case STATE.ORDERING_QTY:
                this.handleQtyInput(text);
                break;

            case STATE.ORDERING_TYPE:
                if (lower.includes('full') || lower.includes('dice')) {
                    this.order.type = "Full Dice";
                    this.askLogistics();
                } else if (lower.includes('half')) {
                    this.order.type = "Half-Dice";
                    this.askLogistics();
                } else {
                    this.addMessage("ai", "Please select 'Full Dice' (Cocktails) or 'Half-Dice' (Smoothies).");
                }
                break;

            case STATE.LOGISTICS_METHOD:
                if (lower.includes('delivery')) {
                    this.order.method = "Delivery";
                    this.handleDeliveryTime();
                } else if (lower.includes('pickup') || lower.includes('self')) {
                    this.order.method = "Self-Pickup";
                    this.providePickupInfo();
                }
                break;

            case STATE.LOGISTICS_PIN:
                this.order.address = text;
                this.checkRecurring();
                break;

            case STATE.RECURRING_PROMPT:
                this.finalizeOrder();
                break;
        }
    }

    // --- State Handlers ---

    askQuantity() {
        this.addMessage("ai", "Great. How many bags would you like?\n\n- **3kg Bag** (₱40)\n- **1kg Bag** (₱15)");
        this.setQuickActions(["5x 3kg", "10x 3kg", "5x 1kg"]);
        this.currentState = STATE.ORDERING_QTY;
    }

    handleQtyInput(text) {
        // Simple parser for demo
        const match3kg = text.match(/(\d+)\s*x?\s*3kg/i);
        const match1kg = text.match(/(\d+)\s*x?\s*1kg/i);
        
        if (match3kg) this.order.qty3kg = parseInt(match3kg[1]);
        if (match1kg) this.order.qty1kg = parseInt(match1kg[1]);

        // Bulk Tier Notifier Logic
        const bulkNotifier = document.getElementById('bulk-notifier');
        if (this.order.qty3kg >= 15) {
            bulkNotifier.style.display = 'block';
        } else {
            bulkNotifier.style.display = 'none';
        }

        if (this.order.qty3kg > 0 || this.order.qty1kg > 0) {
            this.askType();
        } else {
            this.addMessage("ai", "Please specify quantity (e.g., '5 x 3kg').");
        }
    }

    askType() {
        let msg = "What type of ice? \n\n<div class='product-description'>- **Full Dice**: Best for cocktails/coffee.</div><div class='product-description'>- **Half-Dice**: Best for shakes/sodas.</div>";
        if (this.customer.isBusiness) {
            msg += "\n\n*Recommendation: Half-Dice for your blended drinks.*";
        }
        this.addMessage("ai", msg);
        this.setQuickActions(["Full Dice", "Half-Dice"]);
        this.currentState = STATE.ORDERING_TYPE;
    }

    askLogistics() {
        this.addMessage("ai", "Got it. Delivery to your CDO location or Self-Pickup at Macabalan?");
        this.setQuickActions(["Delivery", "Self-Pickup"]);
        this.currentState = STATE.LOGISTICS_METHOD;
    }

    handleDeliveryTime() {
        const now = new Date();
        const hour = now.getHours();

        if (hour >= CONFIG.HOURS.END || hour < CONFIG.HOURS.START) {
            this.addMessage("ai", `It's currently after hours (10 PM). Shall I schedule this for **8:00 AM tomorrow**?`);
            this.setQuickActions(["Yes, 8 AM", "Cancel"]);
            this.order.time = "Tomorrow 8 AM";
        } else {
            this.addMessage("ai", "Delivering ASAP. Please send your **Google Maps Pin** or address.");
            this.currentState = STATE.LOGISTICS_PIN;
        }
    }

    providePickupInfo() {
        this.addMessage("ai", `Excellent. Our warehouse is at:\n**${CONFIG.WAREHOUSE}**\n\nLandmark: Near the Post Office.\nOpen until 10 PM.`);
        this.checkRecurring();
    }

    checkRecurring() {
        if (this.customer.isBusiness || Math.random() > 0.5) {
            this.addMessage("ai", "Would you like to automate this as a **weekly recurring order**?");
            this.setQuickActions(["Yes, Weekly", "No, Just this once"]);
            this.currentState = STATE.RECURRING_PROMPT;
        } else {
            this.finalizeOrder();
        }
    }

    async finalizeOrder() {
        const subtotal = (this.order.qty3kg * CONFIG.PRICING['3kg']) + (this.order.qty1kg * CONFIG.PRICING['1kg']);
        const delivery = this.order.method === "Delivery" ? CONFIG.DELIVERY_FEE : 0;
        this.order.total = subtotal + delivery;

        this.addMessage("ai", `**Order Summary:**\n- ${this.order.qty3kg}x 3kg Bags\n- ${this.order.qty1kg}x 1kg Bags\n- Type: ${this.order.type}\n- Method: ${this.order.method}\n\n**Total: ₱${this.order.total}**`);
        this.addMessage("ai", "Processing with Supabase... 🧊");
        
        // Mock Supabase Call
        await this.mockDelay(2000);
        
        this.addMessage("ai", "✅ **Order Confirmed!** Our rider is being dispatched. Stay cool, CDO!");
        this.setQuickActions(["New Order", "Track Order"]);
        this.currentState = STATE.IDENTIFIED;
    }

    // --- UI Helpers ---

    addMessage(type, text) {
        const group = document.createElement('div');
        group.className = `message-group ${type}`;
        
        const msg = document.createElement('div');
        msg.className = 'message';
        // Basic Markdown-ish formatting
        let formattedText = text.replace(/\n/g, '<br>');
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        msg.innerHTML = formattedText;
        
        group.appendChild(msg);
        this.chatContainer.appendChild(group);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    setQuickActions(actions) {
        this.quickActions.innerHTML = '';
        actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = 'quick-btn';
            btn.textContent = act;
            btn.onclick = () => {
                this.addMessage("user", act);
                this.processInput(act);
            };
            this.quickActions.appendChild(btn);
        });
    }

    mockDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    new IceQubeDispatcher();
});
