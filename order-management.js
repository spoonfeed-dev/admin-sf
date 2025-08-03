// js/order-management.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    updateDoc, 
    where,
    Timestamp,
    getDocs 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

class OrderManagement {
    constructor() {
        this.currentUser = null;
        this.restaurantId = 'restaurant_1';
        this.ordersRef = collection(db, `restaurants/${this.restaurantId}/orders`);
        this.allOrders = [];
        this.filteredOrders = [];
        this.currentFilter = 'all';
        this.deleteOrderId = null;
        this.deleteOrderNumber = null;
        
        this.init();
    }

    init() {
        console.log('📋 Initializing Order Management with Day-wise Data...');
        this.setupAuthListener();
        this.setupEventListeners();
        this.updateCurrentDate();
        this.cleanupOldOrders(); // Clean old orders on init
        this.startDailyCleanup(); // Setup automatic daily cleanup
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.displayUserInfo();
                this.loadTodaysOrders(); // ✅ Load only today's orders
            } else {
                window.location.href = '../index.html';
            }
        });
    }

    setupEventListeners() {
        // Logout
        document.getElementById('logout-btn').addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Logout failed:', error);
            }
        });

        // Filters
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.filterAndDisplayOrders();
        });

        document.getElementById('search-orders').addEventListener('input', () => {
            this.filterAndDisplayOrders();
        });

        document.getElementById('refresh-orders').addEventListener('click', () => {
            this.showRefreshFeedback();
        });

        // Modal events
        document.getElementById('cancel-delete').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        document.getElementById('confirm-delete').addEventListener('click', () => {
            this.confirmDelete();
        });

        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        // Close modal on outside click
        document.getElementById('delete-modal').addEventListener('click', (e) => {
            if (e.target.id === 'delete-modal') {
                this.hideDeleteModal();
            }
        });

        // Export functionality
        document.getElementById('export-orders').addEventListener('click', () => {
            this.exportTodaysOrders();
        });
    }

    displayUserInfo() {
        const userEmailElement = document.getElementById('user-email');
        if (userEmailElement && this.currentUser) {
            userEmailElement.textContent = this.currentUser.email;
        }
    }

    updateCurrentDate() {
        const today = new Date();
        const dateString = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Update page title or header if you have a date display element
        console.log('📅 Current date:', dateString);
        
        // You can add this to show today's date in the header
        const headerDate = document.getElementById('current-date');
        if (headerDate) {
            headerDate.textContent = dateString;
        }
    }

    // ✅ NEW: Load only today's orders
    loadTodaysOrders() {
        console.log('📋 Loading today\'s orders...');
        
        // Get today's date range
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const todaysOrdersQuery = query(
            this.ordersRef,
            where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
            where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('timestamp', 'desc')
        );

        onSnapshot(todaysOrdersQuery, (snapshot) => {
            this.allOrders = [];
            snapshot.forEach((doc) => {
                const orderData = { id: doc.id, ...doc.data() };
                this.allOrders.push(orderData);
            });

            console.log('✅ Today\'s orders loaded:', this.allOrders.length);
            this.updateStats();
            this.filterAndDisplayOrders();
        }, (error) => {
            console.error('❌ Error loading today\'s orders:', error);
            this.showError('Failed to load today\'s orders');
        });
    }

    // ✅ NEW: Clean up orders older than today
    async cleanupOldOrders() {
        try {
            console.log('🧹 Cleaning up old orders...');
            
            const today = new Date();
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            
            // Query for orders older than today
            const oldOrdersQuery = query(
                this.ordersRef,
                where('timestamp', '<', Timestamp.fromDate(startOfToday))
            );

            const oldOrdersSnapshot = await getDocs(oldOrdersQuery);
            const deletePromises = [];

            oldOrdersSnapshot.forEach((doc) => {
                deletePromises.push(deleteDoc(doc.ref));
            });

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                console.log(`🗑️ Cleaned up ${deletePromises.length} old orders`);
            } else {
                console.log('✨ No old orders to clean up');
            }

        } catch (error) {
            console.error('❌ Error cleaning up old orders:', error);
        }
    }

    // ✅ NEW: Setup automatic daily cleanup at midnight
    startDailyCleanup() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        // Schedule first cleanup at midnight
        setTimeout(() => {
            this.cleanupOldOrders();
            this.loadTodaysOrders(); // Reload today's orders
            
            // Then schedule cleanup every 24 hours
            setInterval(() => {
                this.cleanupOldOrders();
                this.loadTodaysOrders();
            }, 24 * 60 * 60 * 1000); // 24 hours
            
        }, msUntilMidnight);

        console.log(`⏰ Daily cleanup scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
    }

    updateStats() {
        const totalOrders = this.allOrders.length;
        const pendingOrders = this.allOrders.filter(order => order.status === 'pending').length;
        const preparingOrders = this.allOrders.filter(order => order.status === 'preparing').length;
        const readyOrders = this.allOrders.filter(order => order.status === 'ready').length;
        const completedOrders = this.allOrders.filter(order => order.status === 'completed').length;

        document.getElementById('total-orders').textContent = totalOrders;
        document.getElementById('pending-orders').textContent = pendingOrders;
        
        // Update additional stats if elements exist
        const preparingEl = document.getElementById('preparing-orders');
        const readyEl = document.getElementById('ready-orders');
        const completedEl = document.getElementById('completed-orders');
        
        if (preparingEl) preparingEl.textContent = preparingOrders;
        if (readyEl) readyEl.textContent = readyOrders;
        if (completedEl) completedEl.textContent = completedOrders;
    }

    filterAndDisplayOrders() {
        const searchTerm = document.getElementById('search-orders').value.toLowerCase();
        
        this.filteredOrders = this.allOrders.filter(order => {
            // Filter by status
            const statusMatch = this.currentFilter === 'all' || order.status === this.currentFilter;
            
            // Filter by search term
            const searchMatch = !searchTerm || 
                (order.orderNumber && order.orderNumber.toString().includes(searchTerm)) ||
                (order.tableNumber && order.tableNumber.toString().includes(searchTerm)) ||
                (order.sessionId && order.sessionId.toLowerCase().includes(searchTerm)) ||
                (order.items && order.items.some(item => 
                    item.name && item.name.toLowerCase().includes(searchTerm)
                ));
            
            return statusMatch && searchMatch;
        });

        this.displayOrders();
    }

    displayOrders() {
        const container = document.getElementById('orders-container');
        
        if (this.filteredOrders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i data-lucide="clipboard-list"></i>
                    </div>
                    <h3>No Orders Found</h3>
                    <p>No orders match your current filters for today.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const ordersHTML = this.filteredOrders.map(order => {
            const orderTime = order.timestamp?.toDate ? 
                order.timestamp.toDate() : 
                new Date(order.timestamp);
            
            const timeString = orderTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const itemsHTML = order.items ? order.items.map(item => `
                <div class="order-item">
                    <div class="item-details">
                        <div class="item-qty">${item.quantity || item.qty || 1}</div>
                        <div class="item-name">${item.name || 'Unknown Item'}</div>
                    </div>
                    <div class="item-price">₹${((item.price || 0) * (item.quantity || item.qty || 1)).toLocaleString()}</div>
                </div>
            `).join('') : '<div class="order-item"><div class="item-name">No items found</div></div>';

            return `
                <div class="order-card status-${order.status || 'pending'}">
                    <div class="order-header">
                        <div class="order-info">
                            <div class="table-number">Table ${order.tableNumber || 'N/A'}</div>
                            <div class="order-number">#${order.orderNumber || order.id.slice(-6)}</div>
                            ${order.sessionId ? `<div class="session-id">Session: ${order.sessionId.slice(-8)}</div>` : ''}
                            <div class="order-time">${timeString}</div>
                        </div>
                        <div class="order-status">
                            <div class="status-badge status-${order.status || 'pending'}">
                                ${(order.status || 'pending').toUpperCase()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="order-items">
                        ${itemsHTML}
                    </div>
                    
                    <div class="order-footer">
                        <div class="order-total">₹${(order.total || 0).toLocaleString()}</div>
                        <div class="order-actions">
                            ${this.getOrderActions(order)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = ordersHTML;
        lucide.createIcons();
    }

    getOrderActions(order) {
        const actions = [];
        
        // Status progression actions
        switch (order.status) {
            case 'pending':
                actions.push(`
                    <button class="action-btn btn-preparing" onclick="orderManagement.updateOrderStatus('${order.id}', 'preparing')">
                        <i data-lucide="chef-hat"></i>
                        Start Preparing
                    </button>
                `);
                break;
            case 'preparing':
                actions.push(`
                    <button class="action-btn btn-ready" onclick="orderManagement.updateOrderStatus('${order.id}', 'ready')">
                        <i data-lucide="check-circle"></i>
                        Mark Ready
                    </button>
                `);
                break;
            case 'ready':
                actions.push(`
                    <button class="action-btn btn-complete" onclick="orderManagement.updateOrderStatus('${order.id}', 'completed')">
                        <i data-lucide="utensils"></i>
                        Complete
                    </button>
                `);
                break;
        }
        
        // Delete action (for all statuses)
        actions.push(`
            <button class="action-btn btn-delete" onclick="orderManagement.showDeleteModal('${order.id}', '${order.orderNumber || order.id.slice(-6)}')">
                <i data-lucide="trash-2"></i>
                Delete
            </button>
        `);
        
        return actions.join('');
    }

    async updateOrderStatus(orderId, newStatus) {
        try {
            const orderRef = doc(this.ordersRef, orderId);
            await updateDoc(orderRef, {
                status: newStatus,
                lastUpdated: Timestamp.now()
            });
            
            console.log(`✅ Order ${orderId} status updated to ${newStatus}`);
            this.showSuccessMessage(`Order status updated to ${newStatus}`);
        } catch (error) {
            console.error('❌ Error updating order status:', error);
            this.showError('Failed to update order status');
        }
    }

    showDeleteModal(orderId, orderNumber) {
        this.deleteOrderId = orderId;
        this.deleteOrderNumber = orderNumber;
        
        const modal = document.getElementById('delete-modal');
        const orderNumberSpan = document.getElementById('delete-order-number');
        
        if (orderNumberSpan) {
            orderNumberSpan.textContent = orderNumber;
        }
        
        modal.classList.add('active');
    }

    hideDeleteModal() {
        const modal = document.getElementById('delete-modal');
        modal.classList.remove('active');
        this.deleteOrderId = null;
        this.deleteOrderNumber = null;
    }

    async confirmDelete() {
        if (!this.deleteOrderId) return;

        try {
            const orderRef = doc(this.ordersRef, this.deleteOrderId);
            await deleteDoc(orderRef);
            
            console.log(`🗑️ Order ${this.deleteOrderId} deleted successfully`);
            this.showSuccessMessage(`Order #${this.deleteOrderNumber} deleted successfully`);
            this.hideDeleteModal();
        } catch (error) {
            console.error('❌ Error deleting order:', error);
            this.showError('Failed to delete order');
        }
    }

    showRefreshFeedback() {
        const refreshBtn = document.getElementById('refresh-orders');
        const originalText = refreshBtn.innerHTML;
        
        refreshBtn.innerHTML = '<i data-lucide="loader" class="spinning"></i> Refreshing...';
        refreshBtn.disabled = true;
        
        // Force reload today's orders
        this.loadTodaysOrders();
        
        setTimeout(() => {
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
            lucide.createIcons();
            this.showSuccessMessage('Orders refreshed successfully');
        }, 1000);
    }

    // ✅ UPDATED: Export only today's orders
    exportTodaysOrders() {
        if (this.allOrders.length === 0) {
            this.showError('No orders to export for today');
            return;
        }

        const today = new Date().toLocaleDateString('en-US');
        const csvContent = this.generateCSV(this.allOrders);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `orders-${today.replace(/\//g, '-')}.csv`;
        link.click();
        
        window.URL.revokeObjectURL(url);
        this.showSuccessMessage('Today\'s orders exported successfully');
    }

    generateCSV(orders) {
        const headers = ['Order ID', 'Table', 'Status', 'Time', 'Items', 'Total', 'Session ID'];
        const rows = orders.map(order => {
            const orderTime = order.timestamp?.toDate ? 
                order.timestamp.toDate() : 
                new Date(order.timestamp);
            
            const items = order.items ? 
                order.items.map(item => `${item.name} (${item.quantity || item.qty || 1})`).join('; ') : 
                'No items';
            
            return [
                order.orderNumber || order.id,
                order.tableNumber || 'N/A',
                order.status || 'pending',
                orderTime.toLocaleString(),
                items,
                order.total || 0,
                order.sessionId || 'N/A'
            ];
        });
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${field}"`).join(',')
        ).join('\n');
    }

    showSuccessMessage(message) {
        // You can implement a toast notification system here
        console.log('✅ Success:', message);
        
        // If you have a notification system, use it here
        // For now, we'll use a simple alert
        // alert(message);
    }

    showError(message) {
        console.error('❌ Error:', message);
        
        // You can implement a proper error notification system here
        // For now, we'll use console.error
        // alert('Error: ' + message);
    }
}

// Initialize order management when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.orderManagement = new OrderManagement();
});
