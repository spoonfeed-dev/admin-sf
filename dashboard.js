// js/dashboard.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
    collection, 
    query, 
    orderBy, 
    limit, 
    onSnapshot, 
    where, 
    Timestamp,
    getDocs 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

class DashboardManager {
    constructor() {
        this.currentUser = null;
        this.salesChart = null;
        this.restaurantId = 'restaurant_1';
        this.ordersRef = collection(db, `restaurants/${this.restaurantId}/orders`);
        this.menuRef = collection(db, `restaurants/${this.restaurantId}/menuItems`);
        this.dailyRevenueRef = collection(db, `restaurants/${this.restaurantId}/dailyRevenue`);
        
        // ✅ NEW: Selected date for viewing historical data
        this.selectedDate = new Date().toISOString().split('T')[0]; // Today's date
        
        this.realtimeData = {
            todayRevenue: 0,
            todayOrders: 0,
            activeCustomers: 0,
            avgRating: 4.8
        };
        
        this.init();
    }

    init() {
        console.log('🚀 Initializing Dashboard with Day-wise Data Tracking...');
        this.setupAuthListener();
        this.setupEventListeners();
        this.updateCurrentDate();
        this.initializeSalesChart();
        this.setupDateSelector();
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.displayUserInfo();
                this.loadDashboardData();
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

        // Chart period controls
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateSalesChart(e.target.dataset.period);
            });
        });
    }

    // ✅ NEW: Setup date selector for historical data
    setupDateSelector() {
        const dateInput = document.getElementById('selected-date');
        const todayBtn = document.getElementById('today-btn');
        
        // Set default to today
        dateInput.value = this.selectedDate;
        
        // Date change handler
        dateInput.addEventListener('change', (e) => {
            this.selectedDate = e.target.value;
            this.loadDashboardData();
            console.log('📅 Date changed to:', this.selectedDate);
        });
        
        // Today button handler
        todayBtn.addEventListener('click', () => {
            const today = new Date().toISOString().split('T')[0];
            this.selectedDate = today;
            dateInput.value = today;
            this.loadDashboardData();
            console.log('📅 Switched to today:', today);
        });
    }

    displayUserInfo() {
        const userEmailElement = document.getElementById('user-email');
        if (userEmailElement && this.currentUser) {
            userEmailElement.textContent = this.currentUser.email;
        }
    }

    updateCurrentDate() {
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            const selectedDateObj = new Date(this.selectedDate + 'T00:00:00');
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            dateElement.textContent = selectedDateObj.toLocaleDateString('en-US', options);
        }
    }

    async loadDashboardData() {
        try {
            console.log('📊 Loading dashboard data for date:', this.selectedDate);
            this.updateCurrentDate();
            
            await Promise.all([
                this.loadDayMetrics(),
                this.loadPopularItems(),
                this.loadRecentOrders(),
                this.loadSalesOverview()
            ]);
            
            console.log('✅ Dashboard data loaded successfully for', this.selectedDate);
        } catch (error) {
            console.error('❌ Error loading dashboard data:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    // ✅ UPDATED: Load metrics for selected date with comparison
    async loadDayMetrics() {
        const selectedDate = new Date(this.selectedDate + 'T00:00:00');
        const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const endOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
        
        // Previous day for comparison
        const previousDay = new Date(startOfDay);
        previousDay.setDate(previousDay.getDate() - 1);
        const prevDayString = previousDay.toISOString().split('T')[0];

        try {
            // ✅ NEW: Get revenue from daily revenue collection
            const dailyRevenueQuery = query(
                this.dailyRevenueRef,
                where('date', '==', this.selectedDate)
            );
            
            const revenueSnapshot = await getDocs(dailyRevenueQuery);
            let dailyRevenueData = null;
            
            if (!revenueSnapshot.empty) {
                dailyRevenueData = revenueSnapshot.docs[0].data();
            }
            
            // Get previous day revenue for comparison
            const prevRevenueQuery = query(
                this.dailyRevenueRef,
                where('date', '==', prevDayString)
            );
            
            const prevRevenueSnapshot = await getDocs(prevRevenueQuery);
            let prevDayRevenue = 0;
            let prevDaySessions = 0;
            
            if (!prevRevenueSnapshot.empty) {
                const prevData = prevRevenueSnapshot.docs[0].data();
                prevDayRevenue = prevData.totalRevenue || 0;
                prevDaySessions = prevData.totalSessions || 0;
            }

            // Update revenue display
            const currentRevenue = dailyRevenueData?.totalRevenue || 0;
            const currentSessions = dailyRevenueData?.totalSessions || 0;
            
            document.getElementById('today-revenue').textContent = `₹${currentRevenue.toLocaleString()}`;
            document.getElementById('today-sessions').textContent = currentSessions;
            
            // Calculate percentage changes
            const revenueChange = prevDayRevenue > 0 ? 
                (((currentRevenue - prevDayRevenue) / prevDayRevenue) * 100).toFixed(1) : 0;
            const sessionsChange = prevDaySessions > 0 ? 
                (((currentSessions - prevDaySessions) / prevDaySessions) * 100).toFixed(1) : 0;
            
            // Update change indicators
            const revenueChangeEl = document.getElementById('revenue-change');
            const sessionsChangeEl = document.getElementById('sessions-change');
            
            revenueChangeEl.textContent = `${revenueChange >= 0 ? '+' : ''}${revenueChange}% from yesterday`;
            sessionsChangeEl.textContent = `${sessionsChange >= 0 ? '+' : ''}${sessionsChange}% from yesterday`;
            
            // Update change colors
            revenueChangeEl.className = `metric-change ${revenueChange >= 0 ? 'positive' : 'negative'}`;
            sessionsChangeEl.className = `metric-change ${sessionsChange >= 0 ? 'positive' : 'negative'}`;

            // Get active orders (only for today)
            if (this.selectedDate === new Date().toISOString().split('T')[0]) {
                const activeOrdersQuery = query(
                    this.ordersRef,
                    where('status', 'in', ['pending', 'preparing', 'ready']),
                    where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
                    where('timestamp', '<=', Timestamp.fromDate(endOfDay))
                );

                onSnapshot(activeOrdersQuery, (snapshot) => {
                    const activeCount = snapshot.size;
                    document.getElementById('active-orders').textContent = activeCount;
                });
            } else {
                document.getElementById('active-orders').textContent = '0';
            }

            console.log('📊 Day metrics updated:', {
                date: this.selectedDate,
                revenue: currentRevenue,
                sessions: currentSessions,
                revenueChange: `${revenueChange}%`,
                sessionsChange: `${sessionsChange}%`
            });

        } catch (error) {
            console.error('❌ Error loading day metrics:', error);
        }

        // Update average rating (placeholder)
        document.getElementById('avg-rating').textContent = this.realtimeData.avgRating;
    }

    // ✅ UPDATED: Load popular items for selected date
    async loadPopularItems() {
        const selectedDate = new Date(this.selectedDate + 'T00:00:00');
        const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const endOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

        const popularItemsQuery = query(
            this.ordersRef,
            where('status', '==', 'completed'),
            where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
            where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('timestamp', 'desc')
        );

        try {
            const snapshot = await getDocs(popularItemsQuery);
            const itemCounts = {};
            
            snapshot.forEach((doc) => {
                const order = doc.data();
                if (order.items) {
                    order.items.forEach(item => {
                        const name = item.name;
                        const qty = item.quantity || item.qty || 1;
                        itemCounts[name] = (itemCounts[name] || 0) + qty;
                    });
                }
            });

            const popularItems = Object.entries(itemCounts)
                .map(([name, sales]) => ({ name, sales }))
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 5);

            this.displayPopularItems(popularItems);
        } catch (error) {
            console.error('❌ Error loading popular items:', error);
            this.displayPopularItems([]);
        }
    }

    displayPopularItems(items) {
        const container = document.getElementById('popular-items');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `
                <div class="item-placeholder">
                    <i data-lucide="coffee"></i>
                    <span>No orders found for ${this.selectedDate}</span>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const itemsHTML = items.map(item => `
            <div class="popular-item">
                <div class="item-name">${item.name}</div>
                <div class="item-sales">${item.sales} sold</div>
            </div>
        `).join('');

        container.innerHTML = itemsHTML;
    }

    // ✅ UPDATED: Load recent orders for selected date
    async loadRecentOrders() {
        const selectedDate = new Date(this.selectedDate + 'T00:00:00');
        const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const endOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

        const recentOrdersQuery = query(
            this.ordersRef,
            where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
            where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('timestamp', 'desc'),
            limit(10)
        );

        try {
            const snapshot = await getDocs(recentOrdersQuery);
            const orders = [];
            
            snapshot.forEach((doc) => {
                orders.push({ id: doc.id, ...doc.data() });
            });

            this.displayRecentOrders(orders);
        } catch (error) {
            console.error('❌ Error loading recent orders:', error);
            this.displayRecentOrders([]);
        }
    }

    displayRecentOrders(orders) {
        const container = document.getElementById('recent-orders');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="order-placeholder">
                    <i data-lucide="clipboard-list"></i>
                    <span>No orders found for ${this.selectedDate}</span>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const ordersHTML = orders.map(order => {
            const orderTime = order.timestamp?.toDate ? 
                order.timestamp.toDate() : 
                new Date(order.timestamp);
            
            const timeString = orderTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="recent-order">
                    <div class="order-info">
                        <div class="order-header-info">
                            <div class="order-id">#${order.id.slice(-6)}</div>
                            <div class="table-info">Table ${order.tableNumber}</div>
                            ${order.sessionId ? `<div class="session-info">Session: ${order.sessionId.slice(-8)}</div>` : ''}
                        </div>
                        <div class="order-time">${timeString}</div>
                    </div>
                    <div class="order-amount-info">
                        <div class="order-amount">₹${(order.total || 0).toLocaleString()}</div>
                        <div class="order-status status-${order.status}">${order.status}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = ordersHTML;
    }

    // ✅ UPDATED: Load sales overview with day-wise data
    async loadSalesOverview() {
        try {
            // Get last 7 days of revenue data
            const endDate = new Date(this.selectedDate + 'T23:59:59');
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 6); // Last 7 days including selected date
            
            const salesQuery = query(
                this.dailyRevenueRef,
                where('date', '>=', startDate.toISOString().split('T')[0]),
                where('date', '<=', this.selectedDate),
                orderBy('date', 'asc')
            );
            
            const salesSnapshot = await getDocs(salesQuery);
            const salesData = [];
            
            // Create array for last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date(endDate);
                date.setDate(date.getDate() - i);
                const dateString = date.toISOString().split('T')[0];
                
                const dayData = salesSnapshot.docs.find(doc => doc.data().date === dateString);
                
                salesData.push({
                    date: dateString,
                    revenue: dayData?.data().totalRevenue || 0,
                    sessions: dayData?.data().totalSessions || 0
                });
            }
            
            this.updateSalesChartWithDayData(salesData);
            
        } catch (error) {
            console.error('❌ Error loading sales overview:', error);
        }
    }

    // ✅ NEW: Update sales chart with day-wise data
    updateSalesChartWithDayData(salesData) {
        if (!this.salesChart) return;
        
        const labels = salesData.map(data => {
            const date = new Date(data.date + 'T00:00:00');
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const revenues = salesData.map(data => data.revenue);
        
        this.salesChart.data.labels = labels;
        this.salesChart.data.datasets[0].data = revenues;
        this.salesChart.update();
        
        console.log('📈 Sales chart updated with day-wise data:', salesData);
    }

    initializeSalesChart() {
        const ctx = document.getElementById('salesChart')?.getContext('2d');
        if (!ctx) return;

        this.salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Revenue (₹)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(148, 163, 184, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(148, 163, 184, 0.1)'
                        }
                    }
                }
            }
        });
    }

    updateSalesChart(period) {
        // This method can be expanded to show different periods
        console.log('📊 Chart period changed to:', period);
        this.loadSalesOverview();
    }

    showError(message) {
        console.error('Dashboard Error:', message);
        // You can add a notification system here
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});
