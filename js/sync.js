// Local Browser Sync Prototype using BroadcastChannel
// This allows the Customer App, Command Center, and Rider App to communicate instantly in the same browser.

const ORDERS_CHANNEL_NAME = 'iceqube_orders_sync';
const DELIVERIES_CHANNEL_NAME = 'iceqube_deliveries_sync';

// Initialize Channels
if (!window.BroadcastChannel) {
    alert("Warning: This browser does not support real-time sync (BroadcastChannel). Please use a modern browser.");
    console.error("BroadcastChannel not supported.");
}

const ordersChannel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
const deliveriesChannel = new BroadcastChannel(DELIVERIES_CHANNEL_NAME);

console.log("🌐 [IceQube Sync] Channels Initialized:", ORDERS_CHANNEL_NAME, DELIVERIES_CHANNEL_NAME);

window.IceQubeSync = {
    // --- PUBLISHERS ---
    
    // Called by Customer App when a new order is placed
    publishNewOrder: function(orderData) {
        console.log("📡 [Sync] Publishing New Order:", orderData.order_id);
        alert("📡 SYNC: Order Published! Check Command Center.");
        
        // Also save to localStorage to persist state across reloads
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        // Don't duplicate if already exists
        if (!existingOrders.find(o => o.order_id === orderData.order_id)) {
            existingOrders.unshift(orderData);
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }

        ordersChannel.postMessage({
            type: 'NEW_ORDER',
            payload: orderData
        });
        alert("📡 SYNC: Order broadcasted to Command Center!");
    },

    // Called by Command Center when dispatching an order to a rider
    publishDispatch: function(dispatchData) {
        console.log("📡 [Sync] Publishing Dispatch to Rider:", dispatchData.riderId);
        
        // Save to localStorage for persistence
        const existingDeliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
        existingDeliveries.push(dispatchData);
        localStorage.setItem('ice_deliveries', JSON.stringify(existingDeliveries));

        // ALSO Update the order status in the orders list
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        
        // ROBUST ID MATCHING
        const cleanId = id => id ? String(id).replace('#', '').trim() : '';
        const targetId = cleanId(dispatchData.orderId);

        const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
        if (orderIdx > -1) {
            existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
            existingOrders[orderIdx].rider = dispatchData.riderId;
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }

        deliveriesChannel.postMessage({
            type: 'NEW_DISPATCH',
            payload: dispatchData
        });

        alert("🚀 SYNC: Dispatch signal sent to riders!");
    },

    // Called by Rider App when delivery is completed
    publishDeliveryComplete: function(completionData) {
        console.log("📡 [Sync] Publishing Delivery Complete:", completionData.orderId);
        
        // Update localStorage
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        const orderIdx = existingOrders.findIndex(o => o.order_id === completionData.orderId);
        if (orderIdx > -1) {
            existingOrders[orderIdx].delivery_status = 'Delivered';
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }

        deliveriesChannel.postMessage({
            type: 'DELIVERY_COMPLETED',
            payload: completionData
        });
    },

    // --- SUBSCRIBERS ---

    // Listen for events on the Orders Channel
    onOrderEvent: function(callback) {
        ordersChannel.onmessage = function(event) {
            console.log("📥 [Sync] Received Order Event:", event.data.type);
            if (event.data.type === 'NEW_ORDER') {
                alert("📥 SYNC: New Order Received! (" + event.data.payload.order_id + ")");
            }
            callback(event.data);
        };
    },

    // Listen for events on the Deliveries Channel
    onDeliveryEvent: function(callback) {
        deliveriesChannel.onmessage = function(event) {
            console.log("📥 [Sync] Received Delivery Event:", event.data.type);
            
            const data = event.data;
            const payload = data.payload;
            const cleanId = id => id ? String(id).replace('#', '').trim() : '';

            // SYNC LOCALSTORAGE FOR RECEIVER
            if (data.type === 'NEW_DISPATCH') {
                const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                const targetId = cleanId(payload.orderId);
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
                
                if (orderIdx > -1) {
                    existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
                    existingOrders[orderIdx].rider = payload.riderId;
                    localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    console.log("✅ [Sync] Receiver LocalStorage updated for Dispatch:", payload.orderId);
                } else {
                    // Fallback: If not found, add it to local storage anyway so it shows up
                    // ONLY if not already there as an external order
                    if (!existingOrders.find(o => cleanId(o.order_id) === targetId)) {
                        existingOrders.unshift({
                            order_id: payload.orderId,
                            customer_name: "External Order",
                            delivery_status: 'Awaiting Acceptance',
                            rider: payload.riderId,
                            items: { fullDice: {'3kg': 1} } // Dummy items
                        });
                        localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    }
                }
            } else if (data.type === 'ORDER_CLAIMED') {
                const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                const targetId = cleanId(payload.orderId);
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
                
                if (orderIdx > -1) {
                    existingOrders[orderIdx].rider = payload.riderId;
                    localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    console.log("✅ [Sync] Receiver LocalStorage updated for Claim:", payload.orderId);
                }
            }

            callback(data);
        };
    }
};
