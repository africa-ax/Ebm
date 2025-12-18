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
let listenersSetup = false;

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    await loadUserInfo();
    setupUI();
    
    if (!listenersSetup) {
        setupEventListeners();
        listenersSetup = true;
    }

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

function setupUI() {
    if (userRole === 'retailer') {
        document.getElementById('quick-action-retailer').style.display = 'flex';
        document.getElementById('menu-create-order').style.display = 'block';
    }
    
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html'
    };
    document.getElementById('menu-dashboard').href = dashboards[userRole] || 'index.html';
}

function setupEventListeners() {
    document.getElementById('hamburger-btn').addEventListener('click', toggleMenu);
    document.getElementById('menu-overlay').addEventListener('click', toggleMenu);
    document.getElementById('menu-logout').addEventListener('click', handleLogout);
    document.getElementById('menu-create-order').addEventListener('click', createOrderManually);
    document.getElementById('create-order-btn')?.addEventListener('click', createOrderManually);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    document.getElementById('close-order-modal').addEventListener('click', closeOrderModal);
    document.getElementById('close-reject-modal').addEventListener('click', closeRejectModal);
    document.getElementById('cancel-reject').addEventListener('click', closeRejectModal);
    document.getElementById('confirm-reject').addEventListener('click', confirmRejectOrder);
}

function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
    document.getElementById('menu-overlay').classList.toggle('active');
}

async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        await auth.signOut();
        window.location.href = 'auth.html';
    }
}

function createOrderManually() {
    window.location.href = 'buyer.html?direct=true';
}

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

function setupRealtimeListener() {
    db.collection('purchaseRequests')
        .where('sellerId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot((snapshot) => {
            console.log('Realtime update: New pending orders');
            loadOrders();
        }, (error) => {
            console.error('Error in realtime listener:', error);
            loadOrders();
        });
}

async function loadOrders() {
    try {
        console.log('Loading orders for seller:', currentUser.uid);
        
        const snapshot = await db.collection('purchaseRequests')
            .where('sellerId', '==', currentUser.uid)
            .get();
        
        console.log('Found', snapshot.size, 'orders total');
        
        const tempOrders = {
            pending: [],
            approved: [],
            rejected: [],
            invoiced: []
        };
        
        const allOrders = [];
        for (const doc of snapshot.docs) {
            const orderData = doc.data();
            const order = { id: doc.id, ...orderData };
            
            // Ensure buyer info is present, fetching if necessary (e.g., for old orders)
            if (!order.buyerName && order.buyerId) {
                try {
                    const buyerDoc = await db.collection('users').doc(order.buyerId).get();
                    if (buyerDoc.exists) {
                        const buyerData = buyerDoc.data();
                        order.buyerName = buyerData.businessName || buyerData.fullName || 'Customer';
                        order.buyerTIN = buyerData.businessTIN || buyerData.phone || 'N/A';
                        order.buyerPhone = buyerData.businessPhone || buyerData.phone || 'N/A';
                        order.buyerAddress = buyerData.businessAddress || 'N/A';
                        order.buyerRole = buyerData.role || 'buyer';
                    }
                } catch (error) {
                    console.error('Error loading buyer:', error);
                    order.buyerName = 'Unknown Buyer';
                }
            }
            
            if (!order.totalAmount && order.items) {
                order.totalAmount = order.items.reduce((sum, item) => sum + (item.total || 0), 0);
            }
            
            allOrders.push(order);
        }
        
        allOrders.sort((a, b) => {
            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return timeB - timeA;
        });
        
        allOrders.forEach(order => {
            const status = order.status || 'pending';
            if (status === 'approved' && order.invoiceId) {
                tempOrders.invoiced.push(order);
            } else if (tempOrders[status]) {
                tempOrders[status].push(order);
            } else {
                console.log('Unknown status:', status, 'for order:', order.id);
            }
        });

        orders = tempOrders;
        
        renderPendingOrders();
        renderApprovedOrders();
        renderRejectedOrders();
        renderInvoicedOrders();
        updateSummary();
    } catch (error) {
        console.error('Error loading orders:', error);
        showMessage('Failed to load orders: ' + error.message, 'error');
    }
}

function renderPendingOrders() {
    const tbody = document.getElementById('pending-orders-body');
    if (!tbody) return;
    
    if (orders.pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No pending orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.pending.forEach(order => {
        const itemCount = order.items?.length || 0;
        const totalAmount = order.totalAmount || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <div class="buyer-info">
                    <strong>${order.buyerName || 'Customer'}</strong><br>
                    <small style="color: #888;">TIN: ${order.buyerTIN || 'N/A'} | ${order.buyerRole || 'Buyer'}</small>
                </div>
            </td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>
                <div class="order-summary">
                    <span class="item-count">${itemCount} ${itemCount === 1 ? 'item' : 'items'}</span>
                    <div class="amount-display">${formatCurrency(totalAmount)} RWF</div>
                </div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-approve" onclick="approveOrder('${order.id}')">✓ Approve</button>
                    <button class="action-btn btn-reject" onclick="openRejectModal('${order.id}')">✗ Reject</button>
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View Details</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderApprovedOrders() {
    const tbody = document.getElementById('approved-orders-body');
    if (!tbody) return;
    
    if (orders.approved.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No approved orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.approved.forEach(order => {
        const itemCount = order.items?.length || 0;
        const totalAmount = order.totalAmount || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <div class="buyer-info">
                    <strong>${order.buyerName || 'Customer'}</strong><br>
                    <small style="color: #888;">TIN: ${order.buyerTIN || 'N/A'} | ${order.buyerRole || 'Buyer'}</small>
                </div>
            </td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>
                <div class="order-summary">
                    <span class="item-count">${itemCount} ${itemCount === 1 ? 'item' : 'items'}</span>
                    <div class="amount-display">${formatCurrency(totalAmount)} RWF</div>
                </div>
            </td>
            <td><span class="status-badge status-approved">Approved</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                    ${order.invoiceId ? `<button class="action-btn btn-invoice" onclick="viewInvoice('${order.invoiceId}')">📄 Invoice</button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderRejectedOrders() {
    const tbody = document.getElementById('rejected-orders-body');
    if (!tbody) return;

    if (orders.rejected.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No rejected orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.rejected.forEach(order => {
        const itemCount = order.items?.length || 0;
        const totalAmount = order.totalAmount || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <div class="buyer-info">
                    <strong>${order.buyerName || 'Customer'}</strong><br>
                    <small style="color: #888;">TIN: ${order.buyerTIN || 'N/A'} | ${order.buyerRole || 'Buyer'}</small>
                </div>
            </td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td>
                <div class="order-summary">
                    <span class="item-count">${itemCount} ${itemCount === 1 ? 'item' : 'items'}</span>
                    <div class="amount-display">${formatCurrency(totalAmount)} RWF</div>
                </div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 View</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderInvoicedOrders() {
    const tbody = document.getElementById('invoiced-orders-body');
    if (!tbody) return;

    if (orders.invoiced.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">📭</div><p>No invoiced orders</p></td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    orders.invoiced.forEach(order => {
        const itemCount = order.items?.length || 0;
        const totalAmount = order.totalAmount || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <div class="buyer-info">
                    <strong>${order.buyerName || 'Customer'}</strong><br>
                    <small style="color: #888;">TIN: ${order.buyerTIN || 'N/A'} | ${order.buyerRole || 'Buyer'}</small>
                </div>
            </td>
            <td class="order-id">ORD-${order.id.substring(0, 8).toUpperCase()}</td>
            <td class="invoice-number">
                <strong>${order.invoiceId || 'N/A'}</strong>
                <small style="display: block; color: #888;">Invoice ID</small>
            </td>
            <td>
                <div class="order-summary">
                    <div class="amount-display">${formatCurrency(totalAmount)} RWF</div>
                </div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">👁 Order</button>
                    <button class="action-btn btn-invoice" onclick="viewInvoice('${order.invoiceId}')">📄 Invoice</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateSummary() {
    const pendingCount = orders.pending.length;
    const approvedToday = orders.approved.filter(o => isToday(o.createdAt)).length;
    const pendingRevenue = orders.pending.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    
    document.getElementById('summary-pending').textContent = pendingCount;
    document.getElementById('summary-approved').textContent = approvedToday;
    document.getElementById('summary-revenue').textContent = formatCurrency(pendingRevenue) + ' RWF';
    
    const badge = document.getElementById('pending-badge');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

window.viewOrderDetails = async function(orderId) {
    const allOrders = [...orders.pending, ...orders.approved, ...orders.rejected, ...orders.invoiced];
    const order = allOrders.find(o => o.id === orderId);
    
    if (!order) return;
    
    const modalBody = document.getElementById('order-modal-body');
    const modalFooter = document.getElementById('order-modal-footer');
    
    const subtotal = order.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
    
    modalBody.innerHTML = `
        <div class="detail-section">
            <div class="detail-title">Order Information</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Order ID</div>
                    <div class="detail-value">ORD-${order.id.substring(0, 8).toUpperCase()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Date & Time</div>
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
                    <div class="detail-value" style="color: #667eea; font-weight: bold;">${order.invoiceId}</div>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Buyer Information</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Business/Name</div>
                    <div class="detail-value">${order.buyerName || 'Customer'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">TIN Number</div>
                    <div class="detail-value">${order.buyerTIN || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Phone</div>
                    <div class="detail-value">${order.buyerPhone || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Role</div>
                    <div class="detail-value">${order.buyerRole || 'Buyer'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Order Items (${order.items?.length || 0} items)</div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th>Unit Price (RWF)</th>
                        <th>Quantity</th>
                        <th style="text-align: right;">Total (RWF)</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items?.map(item => `
                        <tr>
                            <td>
                                <strong>${item.productName}</strong>
                                ${item.productId ? `<br><small style="color: #888;">ID: ${item.productId}</small>` : ''}
                            </td>
                            <td>${formatCurrency(item.unitPrice)}</td>
                            <td>${item.quantity}</td>
                            <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total)}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4">No items</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600; padding: 15px;">Subtotal:</td>
                        <td style="text-align: right; font-weight: 600; padding: 15px;">${formatCurrency(subtotal)} RWF</td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600; padding: 15px; border-top: 2px solid #e0e0e0;">Total Amount:</td>
                        <td style="text-align: right; font-weight: bold; padding: 15px; font-size: 18px; color: #667eea; border-top: 2px solid #e0e0e0;">
                            ${formatCurrency(order.totalAmount || subtotal)} RWF
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>

        ${order.rejectionReason ? `
        <div class="detail-section" style="background: #fff3cd; padding: 15px; border-radius: 8px;">
            <div class="detail-title" style="color: #856404;">Rejection Reason</div>
            <p style="margin: 0; color: #856404;">${order.rejectionReason}</p>
        </div>
        ` : ''}
    `;
    
    modalFooter.innerHTML = '';
    if (order.status === 'pending') {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
            <button class="btn btn-danger" onclick="closeOrderModal(); openRejectModal('${order.id}')">✗ Reject Order</button>
            <button class="btn btn-success" onclick="closeOrderModal(); approveOrder('${order.id}')">✓ Approve & Generate Invoice</button>
        `;
    } else {
        modalFooter.innerHTML = `
            <button class="btn btn-primary" onclick="closeOrderModal()">Close</button>
            ${order.invoiceId ? `<button class="btn btn-invoice" onclick="closeOrderModal(); viewInvoice('${order.invoiceId}')">📄 View Invoice</button>` : ''}
        `;
    }
    
    document.getElementById('order-modal').style.display = 'block';
};

// View Invoice - UPDATED to display all buyer/seller fields from the invoice

window.viewInvoice = async function(invoiceId) {
    try {
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (invoiceDoc.exists) {
            const invoice = invoiceDoc.data();
            
            const modalBody = document.getElementById('order-modal-body');
            const modalFooter = document.getElementById('order-modal-footer');
            
            modalBody.innerHTML = `
                <div class="detail-section">
                    <div class="detail-title">Invoice Information</div>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Invoice ID</div>
                            <div class="detail-value" style="color: #667eea; font-weight: bold;">${invoice.invoiceId}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Issue Date</div>
                            <div class="detail-value">${formatDate(invoice.timestamp)}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">EBM Serial</div>
                            <div class="detail-value">${invoice.ebmSerial || 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="detail-title">Invoice Items</div>
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>Product Name</th>
                                <th>VAT Type</th> <th>Unit Price</th>
                                <th>Qty</th>
                                <th style="text-align: right;">Total (RWF)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoice.items?.map(item => `
                                <tr>
                                    <td>${item.productName}</td>
                                    <td><span class="status-badge status-invoiced">${item.vatType || 'Standard'}</span></td>
                                    <td>${formatCurrency(item.unitPrice)}</td>
                                    <td>${item.quantity}</td>
                                    <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total)}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="5">No items</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="text-align: right; font-weight: 600; padding: 15px;">Total Amount:</td>
                                <td style="text-align: right; font-weight: bold; padding: 15px; font-size: 18px; color: #667eea;">
                                    ${formatCurrency(invoice.totalAmount)} RWF
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            
            modalFooter.innerHTML = `
                <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
                <button class="btn btn-primary" onclick="printInvoice('${invoiceId}')">🖨️ Print Invoice</button>
            `;
            
            document.getElementById('order-modal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading invoice:', error);
        showMessage('Failed to load invoice', 'error');
    }
};
// Print Invoice - UPDATED to display all buyer fields from the invoice
window.printInvoice = async function(invoiceId) {
    try {
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (invoiceDoc.exists) {
            const invoice = invoiceDoc.data();
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invoice ${invoice.invoiceId}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
                        .section-title { font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #ddd; margin-bottom: 10px; }
                        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        .table th { background: #f8f9fa; padding: 10px; text-align: left; border: 1px solid #ddd; }
                        .table td { padding: 10px; border: 1px solid #ddd; }
                        .total { text-align: right; font-size: 18px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>${invoice.sellerName}</h2>
                        <p>TIN: ${invoice.sellerTIN} | ${invoice.sellerAddress}</p>
                        <h3>TAX INVOICE</h3>
                        <p>No: ${invoice.invoiceId} | Date: ${formatDate(invoice.timestamp)}</p>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Buyer Information</div>
                        <p><strong>Name:</strong> ${invoice.buyerName} | <strong>TIN:</strong> ${invoice.buyerTIN}</p>
                    </div>

                    <table class="table">
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th>VAT Type</th>
                                <th>Unit Price</th>
                                <th>Qty</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoice.items?.map(item => `
                                <tr>
                                    <td>${item.productName}</td>
                                    <td>${item.vatType || 'Standard'}</td>
                                    <td>${formatCurrency(item.unitPrice)}</td>
                                    <td>${item.quantity}</td>
                                    <td>${formatCurrency(item.total)} RWF</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="total">
                        TOTAL AMOUNT: ${formatCurrency(invoice.totalAmount)} RWF
                    </div>
                    
                    <script>
                        window.onload = function() { window.print(); setTimeout(() => window.close(), 500); };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    } catch (error) {
        console.error('Error printing invoice:', error);
    }
};

function closeOrderModal() {
    document.getElementById('order-modal').style.display = 'none';
}

window.approveOrder = async function(orderId) {
    const order = orders.pending.find(o => o.id === orderId);
    if (!order) return;
    
    if (!confirm('Approve this order, transfer inventory to buyer, and generate EBM invoice?')) return;
    
    try {
        showMessage('Processing order approval...', 'info');
        
        let buyerData = null;
        try {
            const buyerDoc = await db.collection('users').doc(order.buyerId).get();
            if (buyerDoc.exists) {
                buyerData = buyerDoc.data();
                order.buyerRole = buyerData.role;
                order.buyerName = buyerData.businessName || buyerData.fullName || 'Customer';
                order.buyerTIN = buyerData.businessTIN || buyerData.phone || 'N/A';
                order.buyerAddress = buyerData.businessAddress || 'N/A';
                order.buyerPhone = buyerData.businessPhone || buyerData.phone || 'N/A';
            }
        } catch (error) {
            console.error('Error loading buyer info:', error);
        }
        
        for (const item of order.items) {
            item.orderId = order.id;
            let productDetails = null;

            // Fetch product metadata (VAT/Tax Category) based on seller role
            if (userRole === 'manufacturer') {
                const docIdToUse = item.productDocId || item.productId;
                let productDoc = await db.collection('products').doc(docIdToUse).get();
                if (!productDoc.exists) {
                    const querySnapshot = await db.collection('products').where('productId', '==', item.productId).limit(1).get();
                    if (!querySnapshot.empty) productDoc = querySnapshot.docs[0];
                }
                if (productDoc.exists) {
                    productDetails = productDoc.data();
                    productDetails.docId = productDoc.id;
                }
            } else {
                if (item.stockId) {
                    const stockDoc = await db.collection('stock').doc(item.stockId).get();
                    if (stockDoc.exists) {
                        productDetails = stockDoc.data();
                    }
                }
            }

            // --- THE FIX: MAP VAT DATA TO ITEM ---
            if (productDetails) {
                // Determine rate for ebmMock calculations
                const isExempt = ['exempt', 'zero', 'A'].includes(productDetails.vatType);
                item.vatRate = isExempt ? 0 : 18;
                
                // Assign labels for the invoice and UI
                item.vatType = productDetails.vatType || 'Standard';
                item.taxType = productDetails.taxCategory || 'B';
                item.productDetails = productDetails;
            } else {
                item.vatRate = 18;
                item.vatType = 'Standard';
                item.taxType = 'B';
            }
            
            // Inventory subtraction logic
            if (userRole === 'manufacturer' && productDetails?.docId) {
                await db.collection('products').doc(productDetails.docId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else if (item.stockId) {
                await db.collection('stock').doc(item.stockId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        if (buyerData && buyerData.role !== 'buyer') {
            for (const item of order.items) {
                if (item.productDetails) {
                    await transferInventoryToBuyer(order.buyerId, buyerData, item);
                }
            }
        }
        
        const invoiceData = {
            sellerName: userData.businessName || 'Seller',
            sellerTIN: userData.businessTIN || '000000000',
            sellerAddress: userData.businessAddress || 'Kigali, Rwanda',
            sellerPhone: userData.businessPhone || 'N/A',
            buyerName: order.buyerName || 'Customer',
            buyerTIN: order.buyerTIN || 'N/A',
            buyerAddress: order.buyerAddress || 'N/A',
            buyerPhone: order.buyerPhone || 'N/A',
            items: order.items, 
            totalAmount: order.totalAmount,
            timestamp: new Date()
        };
        
        const invoice = window.ebmMock.generateInvoice(invoiceData); // Generate invoice with item VAT info
        
        await db.collection('sales_invoices').doc(invoice.invoiceId).set({
            ...invoice,
            sellerId: currentUser.uid,
            buyerId: order.buyerId,
            orderId: order.id,
            buyerRole: order.buyerRole,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('purchaseRequests').doc(order.id).update({
            status: 'approved',
            invoiceId: invoice.invoiceId,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            inventoryTransferred: true
        });
        
        showMessage('✅ Order approved and invoice generated!', 'success');
        loadOrders();
        
        setTimeout(() => { viewInvoice(invoice.invoiceId); }, 1000);
    } catch (error) {
        console.error('Error approving order:', error);
        showMessage('Failed to approve order: ' + error.message, 'error');
    }
};

async function transferInventoryToBuyer(buyerId, buyerData, item) {
    const buyerRole = buyerData.role;
    const productDetails = item.productDetails;
    
    try {
        if (buyerRole === 'manufacturer') {
            await addToRawMaterials(buyerId, buyerData, item, productDetails);
        } else if (buyerRole === 'distributor' || buyerRole === 'retailer') {
            await addToStock(buyerId, buyerData, item, productDetails);
        }
    } catch (error) {
        console.error(`Error transferring inventory for ${item.productName}:`, error);
        throw error;
    }
}

async function addToRawMaterials(buyerId, buyerData, item, productDetails) {
    const refId = productDetails.docId || item.productDocId || item.productId;

    const rawMaterialData = {
        productId: refId,
        sku: productDetails.productId || item.productId,
        productName: item.productName,
        originalManufacturerId: productDetails.manufacturerId || currentUser.uid,
        originalManufacturerName: userData.businessName || 'Manufacturer',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitOfMeasure: productDetails.unitOfMeasure || 'pcs',
        category: productDetails.category || 'raw_material',
        description: productDetails.description || '',
        receivedFrom: userData.businessName || 'Supplier',
        receivedFromId: currentUser.uid,
        ownerId: buyerId,
        ownerTIN: buyerData.businessTIN || buyerData.phone || 'N/A',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const existingQuery = await db.collection('raw_materials')
        .where('ownerId', '==', buyerId)
        .where('productId', '==', refId)
        .limit(1)
        .get();
    
    if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        await db.collection('raw_materials').doc(existingDoc.id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated existing raw material: ${item.productName}`);
    } else {
        await db.collection('raw_materials').add(rawMaterialData);
        console.log(`Added new raw material: ${item.productName}`);
    }
}

async function addToStock(buyerId, buyerData, item, productDetails) {
    const refId = productDetails.docId || item.productDocId || item.productId;

    const stockData = {
        productId: refId,
        sku: productDetails.productId || item.productId,
        productName: item.productName,
        manufacturerId: productDetails.manufacturerId || currentUser.uid,
        manufacturerName: productDetails.manufacturerName || userData.businessName || 'Manufacturer',
        quantity: item.quantity,
        purchasePrice: item.unitPrice,
        sellingPrice: null,
        unitOfMeasure: productDetails.unitOfMeasure || item.unitOfMeasure || 'pcs',
        category: productDetails.category || 'general',
        description: productDetails.description || '',
        vatType: productDetails.vatType || 'standard',
        taxCategory: productDetails.taxCategory || 'B',
        purchasedFrom: userData.businessName || 'Supplier',
        purchasedFromId: currentUser.uid,
        purchaseOrderId: item.orderId || 'UNKNOWN_ORDER', 
        ownerId: buyerId,
        ownerTIN: buyerData.businessTIN || buyerData.phone || 'N/A',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const existingQuery = await db.collection('stock')
        .where('ownerId', '==', buyerId)
        .where('productId', '==', refId)
        .limit(1)
        .get();
    
    if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        await db.collection('stock').doc(existingDoc.id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated existing stock: ${item.productName}`);
    } else {
        await db.collection('stock').add(stockData);
        console.log(`Added new stock: ${item.productName}`);
    }
}

function closeRejectModal() {
    document.getElementById('reject-modal').style.display = 'none';
    currentOrderForAction = null;
}

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
        
        showMessage('Order rejected successfully', 'success');
        closeRejectModal();
        loadOrders();
    } catch (error) {
        console.error('Error rejecting order:', error);
        showMessage('Failed to reject order', 'error');
    }
}

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
    if (messageEl) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 4000);
    } else {
        console.log(`${type.toUpperCase()}: ${text}`);
    }
}
