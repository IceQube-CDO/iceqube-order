// Local Browser Sync Prototype using BroadcastChannel
// This allows the Customer App, Command Center, and Rider App to communicate instantly in the same browser.

const ORDERS_CHANNEL_NAME = 'iceqube_orders_sync';
const DELIVERIES_CHANNEL_NAME = 'iceqube_deliveries_sync';

// Initialize Channels
if (!window.BroadcastChannel) {
    console.warn("Warning: This browser does not support real-time sync (BroadcastChannel). Please use a modern browser.");
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
        
        // Also save to localStorage to persist state across reloads
        const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
        // Don't duplicate if already exists
        if (!existingOrders.find(o => o.order_id === orderData.order_id)) {
            orderData.is_real = true; // Mark as real for the purge logic
            existingOrders.unshift(orderData);
            localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
        }
        ordersChannel.postMessage({
            type: 'NEW_ORDER',
            payload: orderData
        });
    },

    // Called by Command Center when dispatching an order to a rider
    publishDispatch: function(dispatchData) {
        console.log("📡 [Sync] Publishing Dispatch to Rider:", dispatchData.riderId);
        
        // Save to localStorage for persistence
        const existingDeliveries = JSON.parse(localStorage.getItem('ice_deliveries') || '[]');
        dispatchData.is_real = true; // Mark as real for the purge logic
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

    // Generic Delivery Event Publisher
    publishDeliveryEvent: function(event) {
        console.log("📡 [Sync] Publishing Delivery Event:", event.type);
        deliveriesChannel.postMessage(event);
    },

    // --- SUBSCRIBERS ---

    // Listen for events on the Orders Channel
    onOrderEvent: function(callback) {
        ordersChannel.onmessage = function(event) {
            console.log("📥 [Sync] Received Order Event:", event.data.type);
            callback(event.data);
        };
    },

    // Listen for events on the Deliveries Channel
    onDeliveryEvent: function(callback) {
        deliveriesChannel.onmessage = function(event) {
            console.log("📥 [Sync] Received Delivery Event:", event.data.type);
            
            const data = event.data;
            const payload = data.payload;
            const cleanId = id => id ? String(id).toUpperCase().replace('#', '').replace('IQ-', '').trim() : '';

            // SYNC LOCALSTORAGE FOR RECEIVER
            if (data.type === 'NEW_DISPATCH') {
                const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                const targetId = cleanId(payload.orderId);
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
                
                if (orderIdx > -1) {
                    // Only update to 'Awaiting Acceptance' if it's currently 'Pending' or undefined
                    const currentStatus = existingOrders[orderIdx].delivery_status;
                    if (!currentStatus || currentStatus === 'Pending' || currentStatus === 'Dispatched') {
                        existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
                        existingOrders[orderIdx].rider = payload.riderId;
                        
                        // Also merge in any fresh details that might have been missing
                        if (payload.orderDetails) {
                            existingOrders[orderIdx] = { ...existingOrders[orderIdx], ...payload.orderDetails };
                            // Ensure status and rider are preserved if merged from old details
                            existingOrders[orderIdx].delivery_status = 'Awaiting Acceptance';
                            existingOrders[orderIdx].rider = payload.riderId;
                        }

                        localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                        console.log("✅ [Sync] Status updated with details:", payload.orderId);
                    }
                } else {
                    // Fallback: If not found, add it
                    const newOrder = {
                        order_id: payload.orderId,
                        customer_name: "External Order",
                        delivery_status: 'Awaiting Acceptance',
                        rider: payload.riderId,
                        items: { fullDice: {'3kg': 1} },
                        created_at: new Date().toISOString(),
                        ...(payload.orderDetails || {})
                    };
                    
                    // Force the status and rider to match the dispatch
                    newOrder.delivery_status = 'Awaiting Acceptance';
                    newOrder.rider = payload.riderId;

                    existingOrders.unshift(newOrder);
                    localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    console.log("✅ [Sync] New order added from dispatch details:", payload.orderId);
                }
            } else if (data.type === 'ORDER_CLAIMED') {
                const existingOrders = JSON.parse(localStorage.getItem('ice_orders') || '[]');
                const targetId = cleanId(payload.orderId);
                const orderIdx = existingOrders.findIndex(o => cleanId(o.order_id) === targetId);
                
                if (orderIdx > -1) {
                    existingOrders[orderIdx].rider = payload.riderId;
                    // When an order is claimed, it officially becomes 'In Transit'
                    existingOrders[orderIdx].delivery_status = 'In Transit';
                    localStorage.setItem('ice_orders', JSON.stringify(existingOrders));
                    console.log("✅ [Sync] Status set to In Transit (Claimed):", payload.orderId);
                }
            }

            callback(data);
        };
    }
};
