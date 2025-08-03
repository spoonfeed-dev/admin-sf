// js/payments.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    updateDoc, 
    doc, 
    addDoc,
    setDoc,
    Timestamp,
    serverTimestamp,
    getDocs 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

class PaymentManager {
    constructor() {
        this.currentUser = null;
        this.restaurantId = 'restaurant_1';
        this.ordersRef = collection(db, `restaurants/${this.restaurantId}/orders`);
        this.paymentsRef = collection(db, `restaurants/${this.restaurantId}/payments`);
        this.tablesRef = collection(db, `restaurants/${this.restaurantId}/tables`);
        this.dailyRevenueRef = collection(db, `restaurants/${this.restaurantId}/dailyRevenue`);
        
        // Payment state
        this.completedSessions = [];
        this.selectedSession = null;
        this.currentBill = null;
        this.appliedDiscount = null;
        
        // ✅ REMOVED: Security features (cashierPin, authenticated)
        
        this.init();
    }

    init() {
        console.log('🔐 Initializing Payment & Accounting System...');
        this.setupAuthListener();
        this.setupEventListeners();
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 1000);
        this.cleanupOldData(); // Clean old data on init
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.loadCompletedSessions();
            } else {
                window.location.href = '../index.html';
            }
        });
    }

    setupEventListeners() {
        // Refresh sessions
        document.getElementById('refresh-sessions').addEventListener('click', () => {
            this.loadCompletedSessions();
        });

        // ✅ NEW: Logout functionality
        document.getElementById('logout-btn').addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Logout failed:', error);
                this.showNotification('Logout failed', 'error');
            }
        });

        // Close payment panel
        document.getElementById('close-panel').addEventListener('click', () => {
            this.closePaymentPanel();
        });

        // Discount type selection
        document.querySelectorAll('input[name="discount-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleDiscountInputs(e.target.value);
            });
        });

        // Apply/Remove discount
        document.getElementById('apply-discount').addEventListener('click', () => {
            this.applyDiscount();
        });

        document.getElementById('remove-discount').addEventListener('click', () => {
            this.removeDiscount();
        });

        // Payment method selection
        document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateCompleteButton();
            });
        });

        // Bill actions
        document.getElementById('print-bill').addEventListener('click', () => {
            this.printBill();
        });

        document.getElementById('complete-payment').addEventListener('click', () => {
            this.completePayment();
        });
    }

    updateDateTime() {
        const now = new Date();
        const options = {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        document.getElementById('current-datetime').textContent = now.toLocaleDateString('en-US', options);
    }

    // ✅ NEW: Clean up data older than 7 days
    async cleanupOldData() {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const cutoffDate = Timestamp.fromDate(sevenDaysAgo);

            // Clean old orders
            const oldOrdersQuery = query(
                this.ordersRef,
                where('timestamp', '<', cutoffDate)
            );

            const oldOrdersSnapshot = await getDocs(oldOrdersQuery);
            const deletePromises = [];

            oldOrdersSnapshot.forEach((doc) => {
                deletePromises.push(doc.ref.delete());
            });

            // Clean old payments
            const oldPaymentsQuery = query(
                this.paymentsRef,
                where('timestamp', '<', cutoffDate)
            );

            const oldPaymentsSnapshot = await getDocs(oldPaymentsQuery);
            oldPaymentsSnapshot.forEach((doc) => {
                deletePromises.push(doc.ref.delete());
            });

            // Clean old daily revenue records
            const oldRevenueQuery = query(
                this.dailyRevenueRef,
                where('date', '<', cutoffDate)
            );

            const oldRevenueSnapshot = await getDocs(oldRevenueQuery);
            oldRevenueSnapshot.forEach((doc) => {
                deletePromises.push(doc.ref.delete());
            });

            await Promise.all(deletePromises);
            console.log('🗑️ Cleaned up old data (>7 days)');
        } catch (error) {
            console.error('❌ Error cleaning up old data:', error);
        }
    }

    // ✅ UPDATED: Load only today's completed sessions
    async loadCompletedSessions() {
        console.log('💳 Loading today\'s completed sessions pending payment...');
        
        // Get today's date range
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const completedOrdersQuery = query(
            this.ordersRef,
            where('status', '==', 'completed'),
            where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
            where('timestamp', '<=', Timestamp.fromDate(endOfDay))
        );

        onSnapshot(completedOrdersQuery, (snapshot) => {
            console.log('📊 Found today\'s completed orders:', snapshot.size);
            
            const sessionMap = new Map();
            const paidSessions = new Set();
            
            snapshot.forEach((doc) => {
                const order = { id: doc.id, ...doc.data() };
                
                console.log('🔍 Processing order:', order.id, 'Session:', order.sessionId, 'Paid:', order.sessionPaid);
                
                if (order.sessionId) {
                    if (order.sessionPaid === true) {
                        paidSessions.add(order.sessionId);
                        return;
                    }
                    
                    if (!sessionMap.has(order.sessionId)) {
                        sessionMap.set(order.sessionId, {
                            sessionId: order.sessionId,
                            tableNumber: order.tableNumber,
                            orders: [],
                            totalAmount: 0,
                            lastCompletedAt: order.timestamp,
                            itemCount: 0
                        });
                    }
                    
                    const session = sessionMap.get(order.sessionId);
                    session.orders.push(order);
                    session.totalAmount += order.total || 0;
                    session.itemCount += order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
                    
                    const orderTime = order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
                    const sessionTime = session.lastCompletedAt?.toDate ? session.lastCompletedAt.toDate() : new Date(session.lastCompletedAt);
                    
                    if (orderTime > sessionTime) {
                        session.lastCompletedAt = order.timestamp;
                    }
                }
            });

            paidSessions.forEach(sessionId => {
                sessionMap.delete(sessionId);
            });

            this.completedSessions = Array.from(sessionMap.values())
                .sort((a, b) => {
                    const aTime = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate() : new Date(a.lastCompletedAt);
                    const bTime = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate() : new Date(b.lastCompletedAt);
                    return bTime - aTime;
                });

            console.log('✅ Processed today\'s sessions for payment:', this.completedSessions.length);
            this.displayCompletedSessions();
            
        }, (error) => {
            console.error('❌ Error loading completed sessions:', error);
            this.showError('Failed to load sessions: ' + error.message);
        });
    }

    displayCompletedSessions() {
        const container = document.getElementById('sessions-grid');
        
        if (this.completedSessions.length === 0) {
            container.innerHTML = `
                <div class="sessions-loading">
                    <i data-lucide="check-circle" style="color: var(--success-color);"></i>
                    <span>No pending sessions - All payments completed!</span>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const sessionsHTML = this.completedSessions.map(session => {
            const completedTime = session.lastCompletedAt?.toDate ? 
                session.lastCompletedAt.toDate() : 
                new Date(session.lastCompletedAt);
            
            const timeString = completedTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="session-card" onclick="paymentManager.selectSession('${session.sessionId}')">
                    <div class="session-header">
                        <div class="table-badge">Table ${session.tableNumber}</div>
                        <div class="session-amount">₹${session.totalAmount.toLocaleString()}</div>
                    </div>
                    <div class="session-details">
                        <div class="session-time">
                            <i data-lucide="clock"></i>
                            <span>Completed at ${timeString}</span>
                        </div>
                        <div class="session-items">${session.itemCount} items</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = sessionsHTML;
        lucide.createIcons();
    }

    selectSession(sessionId) {
        this.selectedSession = this.completedSessions.find(s => s.sessionId === sessionId);
        
        if (this.selectedSession) {
            document.querySelectorAll('.session-card').forEach(card => {
                card.classList.remove('selected');
            });
            event.target.closest('.session-card').classList.add('selected');
            
            this.generateBill();
            this.showPaymentPanel();
            
            console.log('✅ Selected session:', sessionId);
        }
    }

    generateBill() {
        if (!this.selectedSession) return;

        const session = this.selectedSession;
        
        const allItems = [];
        session.orders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const existingItem = allItems.find(i => i.name === item.name);
                    if (existingItem) {
                        existingItem.quantity += item.quantity || 1;
                        existingItem.totalPrice += (item.price || 0) * (item.quantity || 1);
                    } else {
                        allItems.push({
                            name: item.name || 'Unknown Item',
                            price: item.price || 0,
                            quantity: item.quantity || 1,
                            totalPrice: (item.price || 0) * (item.quantity || 1)
                        });
                    }
                });
            }
        });

        const subtotal = session.totalAmount;
        const serviceCharge = Math.round(subtotal * 0.10);
        const gst = Math.round((subtotal + serviceCharge) * 0.05);
        
        this.currentBill = {
            sessionId: session.sessionId,
            tableNumber: session.tableNumber,
            items: allItems.length > 0 ? allItems : [],
            subtotal: subtotal,
            serviceCharge: serviceCharge,
            gst: gst,
            discountAmount: 0,
            total: subtotal + serviceCharge + gst,
            timestamp: new Date()
        };

        this.displayBill();
    }

    displayBill() {
        if (!this.currentBill) return;

        document.getElementById('selected-table').textContent = this.currentBill.tableNumber;
        document.getElementById('session-info').textContent = `Session: ${this.currentBill.sessionId.slice(-8)}`;

        const itemsContainer = document.getElementById('bill-items');
        
        if (this.currentBill.items && Array.isArray(this.currentBill.items) && this.currentBill.items.length > 0) {
            const itemsHTML = this.currentBill.items.map(item => `
                <div class="bill-item">
                    <div class="item-details">
                        <div class="item-name">${item.name || 'Unknown Item'}</div>
                        <div class="item-qty">Qty: ${item.quantity || 1} × ₹${item.price || 0}</div>
                    </div>
                    <div class="item-price">₹${item.totalPrice || 0}</div>
                </div>
            `).join('');
            itemsContainer.innerHTML = itemsHTML;
        } else {
            itemsContainer.innerHTML = `
                <div class="bill-item">
                    <div class="item-details">
                        <div class="item-name">No items found</div>
                        <div class="item-qty">Please check order details</div>
                    </div>
                    <div class="item-price">₹0</div>
                </div>
            `;
        }

        document.getElementById('bill-subtotal').textContent = `₹${this.currentBill.subtotal}`;
        document.getElementById('bill-service').textContent = `₹${this.currentBill.serviceCharge}`;
        document.getElementById('bill-gst').textContent = `₹${this.currentBill.gst}`;
        document.getElementById('bill-total').textContent = `₹${this.currentBill.total}`;
    }

    showPaymentPanel() {
        document.getElementById('payment-panel').classList.remove('hidden');
    }

    closePaymentPanel() {
        document.getElementById('payment-panel').classList.add('hidden');
        this.selectedSession = null;
        this.currentBill = null;
        this.appliedDiscount = null;
        
        this.resetDiscountForm();
        this.resetPaymentMethod();
        
        document.querySelectorAll('.session-card').forEach(card => {
            card.classList.remove('selected');
        });
    }

    toggleDiscountInputs(type) {
        document.getElementById('discount-percentage').disabled = true;
        document.getElementById('discount-coupon').disabled = true;
        document.getElementById('discount-amount').disabled = true;
        
        if (type === 'percentage') {
            document.getElementById('discount-percentage').disabled = false;
            document.getElementById('discount-percentage').focus();
        } else if (type === 'coupon') {
            document.getElementById('discount-coupon').disabled = false;
            document.getElementById('discount-coupon').focus();
        } else if (type === 'amount') {
            document.getElementById('discount-amount').disabled = false;
            document.getElementById('discount-amount').focus();
        }
        
        document.getElementById('apply-discount').disabled = false;
    }

    applyDiscount() {
        if (!this.currentBill) return;

        const discountType = document.querySelector('input[name="discount-type"]:checked')?.value;
        let discountAmount = 0;
        let discountDescription = '';

        if (discountType === 'percentage') {
            const percentage = parseFloat(document.getElementById('discount-percentage').value) || 0;
            if (percentage > 0 && percentage <= 100) {
                discountAmount = Math.round(this.currentBill.subtotal * (percentage / 100));
                discountDescription = `${percentage}% Discount`;
            }
        } else if (discountType === 'amount') {
            const amount = parseFloat(document.getElementById('discount-amount').value) || 0;
            if (amount > 0 && amount <= this.currentBill.subtotal) {
                discountAmount = amount;
                discountDescription = `Fixed Discount`;
            }
        } else if (discountType === 'coupon') {
            const couponCode = document.getElementById('discount-coupon').value.trim();
            if (couponCode) {
                const validCoupons = {
                    'WELCOME10': 10,
                    'SAVE50': 50,
                    'FIRSTTIME': 15
                };
                
                if (validCoupons[couponCode.toUpperCase()]) {
                    const couponValue = validCoupons[couponCode.toUpperCase()];
                    if (couponCode.toUpperCase() === 'SAVE50') {
                        discountAmount = 50;
                    } else {
                        discountAmount = Math.round(this.currentBill.subtotal * (couponValue / 100));
                    }
                    discountDescription = `Coupon: ${couponCode.toUpperCase()}`;
                } else {
                    this.showNotification('Invalid coupon code', 'error');
                    return;
                }
            }
        }

        if (discountAmount > 0) {
            this.appliedDiscount = {
                amount: discountAmount,
                description: discountDescription,
                type: discountType
            };

            this.currentBill.discountAmount = discountAmount;
            this.currentBill.total = this.currentBill.subtotal + this.currentBill.serviceCharge + this.currentBill.gst - discountAmount;

            document.getElementById('discount-row').style.display = 'flex';
            document.getElementById('bill-discount').textContent = `-₹${discountAmount}`;
            document.getElementById('bill-total').textContent = `₹${this.currentBill.total}`;

            document.getElementById('apply-discount').style.display = 'none';
            document.getElementById('remove-discount').style.display = 'inline-flex';

            this.showNotification(`${discountDescription} applied successfully`, 'success');
        }
    }

    removeDiscount() {
        if (this.appliedDiscount && this.currentBill) {
            this.currentBill.discountAmount = 0;
            this.currentBill.total = this.currentBill.subtotal + this.currentBill.serviceCharge + this.currentBill.gst;
            
            document.getElementById('discount-row').style.display = 'none';
            document.getElementById('bill-total').textContent = `₹${this.currentBill.total}`;
            
            this.resetDiscountForm();
            
            this.appliedDiscount = null;
            this.showNotification('Discount removed', 'success');
        }
    }

    resetDiscountForm() {
        document.querySelectorAll('input[name="discount-type"]').forEach(radio => {
            radio.checked = false;
        });
        document.getElementById('discount-percentage').value = '';
        document.getElementById('discount-percentage').disabled = true;
        document.getElementById('discount-coupon').value = '';
        document.getElementById('discount-coupon').disabled = true;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-amount').disabled = true;
        document.getElementById('apply-discount').disabled = true;
        document.getElementById('apply-discount').style.display = 'inline-flex';
        document.getElementById('remove-discount').style.display = 'none';
    }

    resetPaymentMethod() {
        document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.checked = false;
        });
        this.updateCompleteButton();
    }

    updateCompleteButton() {
        const paymentMethodSelected = document.querySelector('input[name="payment-method"]:checked');
        const completeBtn = document.getElementById('complete-payment');
        
        completeBtn.disabled = !paymentMethodSelected;
    }

    printBill() {
        if (!this.currentBill) {
            this.showNotification('No bill selected for printing', 'error');
            return;
        }

        const printContent = this.generatePrintBill();
        
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();

        this.showNotification('Bill sent to printer', 'success');
    }

    generatePrintBill() {
        const bill = this.currentBill;
        const now = new Date();
        
        if (!bill) {
            return '<html><body><h1>No Bill Data Available</h1></body></html>';
        }

        const items = bill.items || [];
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Restaurant Bill</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
                    .bill-info { margin-bottom: 15px; }
                    .items { margin-bottom: 15px; }
                    .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                    .totals { border-top: 1px solid #000; padding-top: 10px; }
                    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px; }
                    .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #000; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>RSS NAGAR</h2>
                    <p>123 Restaurant Street<br>City, State 12345<br>Phone: (555) 123-4567</p>
                </div>
                
                <div class="bill-info">
                    <p><strong>Table:</strong> ${bill.tableNumber || 'N/A'}</p>
                    <p><strong>Date:</strong> ${now.toLocaleDateString()}</p>
                    <p><strong>Time:</strong> ${now.toLocaleTimeString()}</p>
                    <p><strong>Session:</strong> ${bill.sessionId ? bill.sessionId.slice(-8) : 'N/A'}</p>
                </div>
                
                <div class="items">
                    <p><strong>ITEMS ORDERED:</strong></p>
                    ${items.length > 0 ? 
                        items.map(item => `
                            <div class="item">
                                <span>${item.name || 'Unknown Item'} (${item.quantity || 1}x)</span>
                                <span>₹${item.totalPrice || 0}</span>
                            </div>
                        `).join('') :
                        '<div class="item"><span>No items found</span><span>₹0</span></div>'
                    }
                </div>
                
                <div class="totals">
                    <div class="item">
                        <span>Subtotal:</span>
                        <span>₹${bill.subtotal || 0}</span>
                    </div>
                    <div class="item">
                        <span>Service Charge (10%):</span>
                        <span>₹${bill.serviceCharge || 0}</span>
                    </div>
                    <div class="item">
                        <span>GST (5%):</span>
                        <span>₹${bill.gst || 0}</span>
                    </div>
                    ${(bill.discountAmount && bill.discountAmount > 0) ? `
                    <div class="item">
                        <span>Discount:</span>
                        <span>-₹${bill.discountAmount}</span>
                    </div>
                    ` : ''}
                    <div class="total-row">
                        <span>TOTAL:</span>
                        <span>₹${bill.total || 0}</span>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Thank you for dining with us!</p>
                    <p>Visit us again soon</p>
                    <p>GST No: 22AAAAA0000A1Z5</p>
                </div>
            </body>
            </html>
        `;
    }

    // ✅ NEW: Update daily revenue when payment is completed
    async updateDailyRevenue(amount, paymentMethod) {
        try {
            const today = new Date();
            const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const dailyRevenueDocRef = doc(this.dailyRevenueRef, dateString);
            
            // Get current revenue data for today
            const currentRevenue = await getDocs(query(
                this.dailyRevenueRef,
                where('date', '==', dateString)
            ));
            
            let revenueData = {
                date: dateString,
                timestamp: Timestamp.fromDate(today),
                totalRevenue: amount,
                totalSessions: 1,
                paymentMethods: {
                    [paymentMethod]: amount
                },
                hourlyBreakdown: {
                    [today.getHours()]: amount
                }
            };
            
            // If revenue data exists for today, update it
            if (!currentRevenue.empty) {
                const existingData = currentRevenue.docs[0].data();
                revenueData = {
                    ...existingData,
                    totalRevenue: (existingData.totalRevenue || 0) + amount,
                    totalSessions: (existingData.totalSessions || 0) + 1,
                    paymentMethods: {
                        ...existingData.paymentMethods,
                        [paymentMethod]: (existingData.paymentMethods?.[paymentMethod] || 0) + amount
                    },
                    hourlyBreakdown: {
                        ...existingData.hourlyBreakdown,
                        [today.getHours()]: (existingData.hourlyBreakdown?.[today.getHours()] || 0) + amount
                    },
                    lastUpdated: serverTimestamp()
                };
            }
            
            await setDoc(dailyRevenueDocRef, revenueData, { merge: true });
            console.log('✅ Daily revenue updated:', { amount, paymentMethod, date: dateString });
            
        } catch (error) {
            console.error('❌ Error updating daily revenue:', error);
        }
    }

    // ✅ UPDATED: Complete payment with automatic revenue update
    async completePayment() {
        if (!this.currentBill || !this.selectedSession) {
            this.showNotification('Please select a session and generate bill first', 'error');
            return;
        }

        const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;
        
        if (!paymentMethod) {
            this.showNotification('Please select a payment method', 'error');
            return;
        }

        const completeBtn = document.getElementById('complete-payment');
        completeBtn.disabled = true;
        completeBtn.innerHTML = '<i data-lucide="loader" class="spinning"></i> Processing...';
        lucide.createIcons();

        try {
            console.log('🔄 Processing payment for session:', this.selectedSession.sessionId);
            
            const today = new Date();
            
            // Create payment record with day-wise data
            const paymentData = {
                sessionId: this.selectedSession.sessionId,
                tableNumber: this.selectedSession.tableNumber,
                totalAmount: this.currentBill.total,
                paymentMethod: paymentMethod,
                discountApplied: this.appliedDiscount || null,
                billDetails: this.currentBill,
                timestamp: serverTimestamp(),
                paymentDate: today.toISOString().split('T')[0], // Store date for easy querying
                cashierId: this.currentUser?.uid || 'unknown',
                status: 'completed'
            };

            await addDoc(this.paymentsRef, paymentData);
            console.log('✅ Payment record created');

            // ✅ NEW: Update daily revenue automatically
            await this.updateDailyRevenue(this.currentBill.total, paymentMethod);

            // Mark all orders in session as paid
            for (const order of this.selectedSession.orders) {
                const orderRef = doc(this.ordersRef, order.id);
                await updateDoc(orderRef, {
                    sessionPaid: true,
                    paymentTimestamp: serverTimestamp(),
                    paymentMethod: paymentMethod,
                    paymentDate: today.toISOString().split('T')[0] // Store payment date
                });
                console.log('✅ Order marked as paid:', order.id);
            }

            // Update table status to free
            if (this.selectedSession.tableNumber) {
                const tableQuery = query(
                    this.tablesRef, 
                    where('tableNumber', '==', this.selectedSession.tableNumber)
                );
                
                const tableSnapshot = await getDocs(tableQuery);
                if (!tableSnapshot.empty) {
                    const tableDoc = tableSnapshot.docs[0];
                    await updateDoc(tableDoc.ref, {
                        status: 'free',
                        sessionId: null,
                        customerActive: false,
                        lastUpdated: serverTimestamp()
                    });
                    console.log('✅ Table freed:', this.selectedSession.tableNumber);
                }
            }

            this.showNotification(`Payment of ₹${this.currentBill.total} completed successfully! Revenue updated.`, 'success');
            this.closePaymentPanel();
            
            // Reload sessions to remove paid session
            setTimeout(() => {
                this.loadCompletedSessions();
            }, 1000);

        } catch (error) {
            console.error('❌ Payment completion error:', error);
            this.showNotification('Payment processing failed: ' + error.message, 'error');
        } finally {
            completeBtn.disabled = false;
            completeBtn.innerHTML = '<i data-lucide="check-circle"></i> Complete Payment';
            lucide.createIcons();
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        const messageEl = notification.querySelector('.notification-message');
        const iconEl = notification.querySelector('.notification-icon');
        
        messageEl.textContent = message;
        
        if (type === 'error') {
            iconEl.setAttribute('data-lucide', 'alert-circle');
            notification.style.borderColor = 'var(--danger-color)';
        } else {
            iconEl.setAttribute('data-lucide', 'check-circle');
            notification.style.borderColor = 'var(--success-color)';
        }
        
        lucide.createIcons();
        notification.classList.remove('hidden');
        
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    showError(message) {
        console.error('Payment Error:', message);
        this.showNotification(message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.paymentManager = new PaymentManager();
});
