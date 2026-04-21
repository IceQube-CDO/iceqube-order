/**
 * IceQube Premium Ordering Logic
 * Premium Ice Supply - Cagayan de Oro
 */

const CONFIG = {
    PRICING: {
        REGULAR: 40,
        BULK: 35
    },
    BULK_THRESHOLD: 10, // Unlock bulk discount at 10 bags
    DELIVERY_FEE: 25
};

class IceQubeOrderSystem {
    constructor() {
        this.quantity = 0;
        this.isBulk = false;

        // UI Elements
        this.qtyDisplay = document.getElementById('qty-display');
        this.totalDisplay = document.getElementById('total-price');
        this.unitPriceDisplay = document.getElementById('unit-price');
        this.bulkPrompt = document.getElementById('bulk-prompt');
        this.plusBtn = document.getElementById('plus-btn');
        this.minusBtn = document.getElementById('minus-btn');
        this.confirmBtn = document.getElementById('confirm-btn');

        this.init();
    }

    init() {
        this.plusBtn.addEventListener('click', () => this.updateQuantity(1));
        this.minusBtn.addEventListener('click', () => this.updateQuantity(-1));
        this.confirmBtn.addEventListener('click', () => this.handleCheckout());
        
        this.refreshUI();
    }

    updateQuantity(delta) {
        this.quantity = Math.max(0, this.quantity + delta);
        this.checkBulkStatus();
        this.refreshUI();
        
        // Add a small bounce effect on change
        this.qtyDisplay.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.qtyDisplay.style.transform = 'scale(1)';
        }, 100);
    }

    checkBulkStatus() {
        this.isBulk = this.quantity >= CONFIG.BULK_THRESHOLD;
        if (this.isBulk) {
            this.bulkPrompt.style.display = 'block';
        } else {
            this.bulkPrompt.style.display = 'none';
        }
    }

    calculateTotal() {
        const pricePerBag = this.isBulk ? CONFIG.PRICING.BULK : CONFIG.PRICING.REGULAR;
        return this.quantity * pricePerBag;
    }

    refreshUI() {
        const pricePerBag = this.isBulk ? CONFIG.PRICING.BULK : CONFIG.PRICING.REGULAR;
        const total = this.calculateTotal();

        this.qtyDisplay.textContent = this.quantity;
        this.unitPriceDisplay.textContent = `₱${pricePerBag.toFixed(2)}`;
        this.totalDisplay.textContent = `₱${total.toFixed(2)}`;
        
        this.confirmBtn.disabled = this.quantity === 0;
        
        if (this.isBulk) {
            this.unitPriceDisplay.style.color = '#38b2ac'; // Accent color for discount
        } else {
            this.unitPriceDisplay.style.color = '#007AFF';
        }
    }

    async handleCheckout() {
        this.confirmBtn.textContent = 'Processing...';
        this.confirmBtn.disabled = true;

        // Mock API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        alert(`✅ Order Confirmed!\n\nTotal: ₱${this.calculateTotal().toFixed(2)}\nQuantity: ${this.quantity} bags\n\nOur rider is being dispatched to Piaping Itum!`);
        
        this.confirmBtn.textContent = 'Confirm Order';
        this.quantity = 0;
        this.checkBulkStatus();
        this.refreshUI();
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    new IceQubeOrderSystem();
});
