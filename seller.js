import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global state
let currentUser = null;
let userRole = null;
let userData = null;
let orders = {
    pending: [],
    approved: [],
    rejected: [],
    invoiced: []
};
let currentOrderForAction = null;

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    await loadUserInfo();
    setupUI();
    setupEventListeners();
    loadOrders();
    setupRealtimeListener();
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            userRole = userData.role;
            
            const displayName = userData.businessName || userData.fullName || 'User';
            document.getElementById('user-name').textContent = displayName;
            document.getElementById('user-info').textContent = displayName;
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Setup UI based on role
function setupUI() {
    // Show quick action section for retailers
    if (userRole === 'retailer') {
        document.getElementById('quick-action-retailer').style.display = 'flex';
    }
    
    // Setup dashboard link
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html'
    };
    document.getElementById('menu-dashboard').href = dashboards[userRole] || 'index.html';
}

// Setup event listeners
function setupEventListeners() {
    // Menu
    document.getElementById('hamburger-btn').addEventListener('click', toggleMenu);
    document.getElementById('menu-overlay').addEventListener('click', toggleMenu);
    document.getElementById('menu-logout').addEventListener('click', handleLogout);
    document.getElementById('menu-create-order').addEventListener('click', createOrderManually);
    document.getElementById('create-order-btn')?.addEventListener('click', createOrderManually);
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Modals
    document.getElementById('close-order-modal').addEventListener('click', closeOrderModal);
    document.getElementById('close-reject-modal').addEventListener('click', closeRejectModal);
    document.getElementById('cancel-reject').addEventListener('click', closeRejectModal);
    document.getElementById('confirm-reject').addEventListener('click', confirmRejectOrder);
}

// Toggle menu
function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
    document.getElementById('menu-overlay').classList.toggle('active');
}

// Handle logout
async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        await auth.signOut();
        window.location.href = 'auth.html';
    }
}

// Create order manually (open buyer.html as walk-in customer)
function createOrderManually() {
    window.location.href = 'buyer.html?direct=true';
}

// Switch tab
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
}

// Setup realtime listener for new orders
function setupRealtimeListener() {
    db.collection('purchaseRequests')
        .where('sellerId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(() => {
            loadOrders();
        }, (error) => {
            console.error('Error in realtime listener:', error);
        });
}

// Load all orders
async function loadOrders() {
    try {
        const snapshot = await db.collection('purchaseRequests')
            .where('sellerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        // Reset orders
        orders = {
            pending: [],
            approved: [],
            rejected: [],
            invoiced: []
        };
        
        // Categorize orders
        for (const doc of snapshot.docs) {
            const orderData = doc.data();
            const order = { id: doc.id, ...orderData };
            
            // Get buyer name if not present
            if (!order.buyerName && order.buyerId) {
                try {
                    const buyerDoc = await db.collection('users').doc(order.buyerId).get();
                    if (buyerDoc.exists) {
                        const buyerData = buyerDoc.data();
                        order.buyerName = buyerData.businessName || buyerData.fullName || 'Customer';
                        order.buyerTIN = buyerData.businessTIN || buyerData.phone || 'N/A';
                    }
                } catch (error) {
                    console.error('Error loading buyer:', error);
                }
            }
            
            const status = order.status || 'pending';
            if (status === 'approved' && order.invoiceId) {
                orders.invoiced.push(order);
            } else if (orders[status]) {
                orders[status].push(order);
            }
        }
        
        // Render all tabs
        renderPendingOrders();
        renderApprovedOrders();
        renderRejectedOrders();
        renderInvoicedOrders();
        updateSummary();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Render pending orders
function renderPendingOrders() {
    const tbody = document.getElementById('pending-orders-body');
    
    if (orders.pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No pending orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.pending.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.buyerName || 'Customer'}</td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>${order.items?.length || 0} items</td>
            <td style="font-weight: 600; color: #28a745;">${formatCurrency(order.totalAmount)} RWF</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-approve" onclick="approveOrder('${order.id}')">✓ Approve</button>
                    <button class="action-btn btn-reject" onclick="openRejectModal('${order.id}')">✗ Reject</button>
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render approved orders
function renderApprovedOrders() {
    const tbody = document.getElementById('approved-orders-body');
    
    if (orders.approved.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">📭</div><p>No approved orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.approved.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.buyerName || 'Customer'}</td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>${order.items?.length || 0} items</td>
            <td style="font-weight: 600; color: #28a745;">${formatCurrency(order.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">Approved</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render rejected orders
function renderRejectedOrders() {
    const tbody = document.getElementById('rejected-orders-body');
    
    if (orders.rejected.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No rejected orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.rejected.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.buyerName || 'Customer'}</td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>${order.items?.length || 0} items</td>
            <td style="font-weight: 600; color: #dc3545;">${formatCurrency(order.totalAmount)} RWF</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render invoiced orders
function renderInvoicedOrders() {
    const tbody = document.getElementById('invoiced-orders-body');
    
    if (orders.invoiced.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No invoiced orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.invoiced.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.buyerName || 'Customer'}</td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td class="invoice-number">${order.invoiceId || 'N/A'}</td>
            <td style="font-weight: 600; color: #667eea;">${formatCurrency(order.totalAmount)} RWF</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update summary
function updateSummary() {
    const pendingCount = orders.pending.length;
    const approvedToday = orders.approved.filter(o => isToday(o.createdAt)).length;
    const pendingRevenue = orders.pending.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    
    document.getElementById('summary-pending').textContent = pendingCount;
    document.getElementById('summary-approved').textContent = approvedToday;
    document.getElementById('summary-revenue').textContent = formatCurrency(pendingRevenue) + ' RWF';
    
    // Update badge
    const badge = document.getElementById('pending-badge');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// View order details
window.viewOrderDetails = async function(orderId) {
    const allOrders = [...orders.pending, ...orders.approved, ...orders.rejected, ...orders.invoiced];
    const order = allOrders.find(o => o.id === orderId);
    
    if (!order) return;
    
    const modalBody = document.getElementById('order-modal-body');
    const modalFooter = document.getElementById('order-modal-footer');
    
    modalBody.innerHTML = `
        <div class="detail-section">
            <div class="detail-title">Order Information</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Order ID</div>
                    <div class="detail-value">ORD-${order.id.substring(0, 8).toUpperCase()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Date</div>
                    <div class="detail-value">${formatDate(order.createdAt)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        <span class="status-badge status-${order.status || 'pending'}">
                            ${(order.status || 'pending').toUpperCase()}
                        </span>
                    </div>
                </div>
                ${order.invoiceId ? `
                <div class="detail-item">
                    <div class="detail-label">Invoice ID</div>
                    <div class="detail-value">${order.invoiceId}</div>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Buyer Information</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Buyer Name</div>
                    <div class="detail-value">${order.buyerName || 'Customer'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Buyer TIN/Phone</div>
                    <div class="detail-value">${order.buyerTIN || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Order Items</div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th>Unit Price</th>
                        <th>Quantity</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items?.map(item => `
                        <tr>
                            <td>${item.productName}</td>
                            <td>${formatCurrency(item.unitPrice)} RWF</td>
                            <td>${item.quantity}</td>
                            <td style="text-align: right;">${formatCurrency(item.total)} RWF</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4">No items</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="order-total">
            Grand Total: ${formatCurrency(order.totalAmount)} RWF
        </div>

        ${order.rejectionReason ? `
        <div class="detail-section" style="background: #fff3cd; padding: 15px; border-radius: 8px;">
            <div class="detail-title" style="color: #856404;">Rejection Reason</div>
            <p style="margin: 0; color: #856404;">${order.rejectionReason}</p>
        </div>
        ` : ''}
    `;
    
    // Setup footer buttons
    modalFooter.innerHTML = '';
    if (order.status === 'pending') {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
            <button class="btn btn-danger" onclick="closeOrderModal(); openRejectModal('${order.id}')">✗ Reject</button>
            <button class="btn btn-success" onclick="closeOrderModal(); approveOrder('${order.id}')">✓ Approve</button>
        `;
    } else {
        modalFooter.innerHTML = `
            <button class="btn btn-primary" onclick="closeOrderModal()">Close</button>
        `;
    }
    
    document.getElementById('order-modal').style.display = 'block';
};

// Close order modal
function closeOrderModal() {
    document.getElementById('order-modal').style.display = 'none';
}

// Approve order
window.approveOrder = async function(orderId) {
    const order = orders.pending.find(o => o.id === orderId);
    if (!order) return;
    
    if (!confirm('Approve this order and generate EBM invoice?')) return;
    
    try {
        showMessage('Processing order approval...', 'info');
        
        // Step 1: Validate and deduct stock
        for (const item of order.items) {
            if (userRole === 'manufacturer') {
                // Check product quantity
                const productDoc = await db.collection('products').doc(item.productId).get();
                if (!productDoc.exists) {
                    showMessage(`Product ${item.productName} not found`, 'error');
                    return;
                }
                
                const product = productDoc.data();
                if ((product.quantity || 0) < item.quantity) {
                    showMessage(`Insufficient stock for ${item.productName}. Available: ${product.quantity}, Requested: ${item.quantity}`, 'error');
                    return;
                }
                
                // Deduct stock
                await db.collection('products').doc(item.productId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Check stock collection
                const stockDoc = await db.collection('stock').doc(item.stockId).get();
                if (!stockDoc.exists) {
                    showMessage(`Stock for ${item.productName} not found`, 'error');
                    return;
                }
                
                const stock = stockDoc.data();
                if ((stock.quantity || 0) < item.quantity) {
                    showMessage(`Insufficient stock for ${item.productName}. Available: ${stock.quantity}, Requested: ${item.quantity}`, 'error');
                    return;
                }
                
                // Deduct stock
                await db.collection('stock').doc(item.stockId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Step 2: Generate EBM invoice
        const invoice = window.ebmMock.generateInvoice({
            sellerName: userData.businessName || 'Seller',
            sellerTIN: userData.businessTIN || '000000000',
            buyerName: order.buyerName || 'Customer',
            buyerTIN: order.buyerTIN || 'N/A',
            items: order.items,
            totalAmount: order.totalAmount,
            timestamp: new Date()
        });
        
        // Step 3: Save invoice to Firestore
        await db.collection('sales_invoices').doc(invoice.invoiceId).set({
            ...invoice,
            sellerId: currentUser.uid,
            buyerId: order.buyerId,
            orderId: order.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 4: Update order status
        await db.collection('purchaseRequests').doc(order.id).update({
            status: 'approved',
            invoiceId: invoice.invoiceId,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 5: Add buyer name to order for invoices.html
        await db.collection('purchaseRequests').doc(order.id).update({
            buyerName: order.buyerName
        });
        
        showMessage('Order approved and invoice generated successfully!', 'success');
        loadOrders();
    } catch (error) {
        console.error('Error approving order:', error);
        showMessage('Failed to approve order: ' + error.message, 'error');
    }
};

// Open reject modal
window.openRejectModal = function(orderId) {
    currentOrderForAction = orderId;
    document.getElementById('reject-reason-input').value = '';
    document.getElementById('reject-modal').style.display = 'block';
};

// Close reject modal
function closeRejectModal() {
    document.getElementById('reject-modal').style.display = 'none';
    currentOrderForAction = null;
}

// Confirm reject order
async function confirmRejectOrder() {
    if (!currentOrderForAction) return;
    
    const reason = document.getElementById('reject-reason-input').value.trim();
    
    try {
        await db.collection('purchaseRequests').doc(currentOrderForAction).update({
            status: 'rejected',
            rejectionReason: reason || 'No reason provided',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Order rejected', 'success');
        closeRejectModal();
        loadOrders();
    } catch (error) {
        console.error('Error rejecting order:', error);
        showMessage('Failed to reject order', 'error');
    }
}

// Utility functions
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-RW', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

function isToday(timestamp) {
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 4000);
}