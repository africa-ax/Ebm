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
    loadOrders(); // Initial load
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            userRole = userData.role;
            
            const displayName = userData.businessName || userData.fullName || 'User';
            
            // Safe DOM updates
            const nameEl = document.getElementById('user-name');
            const infoEl = document.getElementById('user-info');
            const badgeEl = document.getElementById('role-badge');
            
            if (nameEl) nameEl.textContent = displayName;
            if (infoEl) infoEl.textContent = displayName;
            if (badgeEl) badgeEl.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

function setupUI() {
    const retailerAction = document.getElementById('quick-action-retailer');
    const createOrderMenu = document.getElementById('menu-create-order');
    
    if (userRole === 'retailer') {
        if (retailerAction) retailerAction.style.display = 'flex';
        if (createOrderMenu) createOrderMenu.style.display = 'block';
    }
    
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html'
    };
    const dashLink = document.getElementById('menu-dashboard');
    if (dashLink) dashLink.href = dashboards[userRole] || 'index.html';
}

function setupEventListeners() {
    const clickEvents = {
        'hamburger-btn': toggleMenu,
        'menu-overlay': toggleMenu,
        'menu-logout': handleLogout,
        'menu-create-order': createOrderManually,
        'create-order-btn': createOrderManually,
        'close-order-modal': closeOrderModal,
        'close-reject-modal': closeRejectModal,
        'cancel-reject': closeRejectModal,
        'confirm-reject': confirmRejectOrder
    };

    for (const [id, func] of Object.entries(clickEvents)) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', func);
    }
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

// Logic for Approving Orders with Stock Merging & Auto-Cleanup
window.approveOrder = async function(orderId) {
    const order = orders.pending.find(o => o.id === orderId);
    if (!order) return;
    
    if (!confirm('Approve this order and transfer inventory to the buyer?')) return;
    
    try {
        showMessage('Processing order approval...', 'info');
        
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        const buyerData = buyerDoc.exists ? buyerDoc.data() : null;

        for (const item of order.items) {
            // 1. Deduct Stock from Seller
            if (userRole === 'manufacturer') {
                await db.collection('products').doc(item.productId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else if (item.stockId) {
                const stockRef = db.collection('stock').doc(item.stockId);
                const stockSnap = await stockRef.get();
                
                if (stockSnap.exists) {
                    const newQty = (stockSnap.data().quantity || 0) - item.quantity;
                    if (newQty <= 0) {
                        await stockRef.delete(); // Auto-cleanup zero quantity
                    } else {
                        await stockRef.update({ quantity: newQty });
                    }
                }
            }

            // 2. Transfer/Merge Stock to Buyer
            if (buyerData && buyerData.role !== 'buyer') {
                await transferInventoryToBuyer(order.buyerId, buyerData, item);
            }
        }

        // 3. Update Order Status
        await db.collection('purchaseRequests').doc(order.id).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('✅ Order approved and inventory transferred!', 'success');
        loadOrders();
    } catch (error) {
        console.error('Approval Error:', error);
        showMessage('Failed to approve order', 'error');
    }
};

async function transferInventoryToBuyer(buyerId, buyerData, item) {
    const stockRef = db.collection('stock');
    const existingQuery = await stockRef
        .where('ownerId', '==', buyerId)
        .where('productId', '==', item.productId)
        .limit(1).get();

    if (!existingQuery.empty) {
        // Merge Quantity
        await stockRef.doc(existingQuery.docs[0].id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        // Create New Entry
        await stockRef.add({
            ownerId: buyerId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure || 'pcs',
            purchasePrice: item.unitPrice,
            sellerName: userData.businessName || 'Supplier',
            isResource: buyerData.role === 'manufacturer',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

async function loadOrders() {
    try {
        const snapshot = await db.collection('purchaseRequests')
            .where('sellerId', '==', currentUser.uid)
            .get();
        
        const tempOrders = { pending: [], approved: [], rejected: [], invoiced: [] };
        const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        allOrders.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
        
        allOrders.forEach(order => {
            const status = order.status || 'pending';
            if (status === 'approved' && order.invoiceId) tempOrders.invoiced.push(order);
            else if (tempOrders[status]) tempOrders[status].push(order);
        });

        orders = tempOrders;
        renderAllTabs();
        updateSummary();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function renderAllTabs() {
    renderTable('pending-orders-body', orders.pending, ['date', 'buyer', 'id', 'summary', 'actions']);
    renderTable('approved-orders-body', orders.approved, ['date', 'buyer', 'id', 'summary', 'status', 'actions']);
    renderTable('rejected-orders-body', orders.rejected, ['date', 'buyer', 'id', 'summary', 'actions']);
    renderTable('invoiced-orders-body', orders.invoiced, ['date', 'buyer', 'id', 'invoice', 'amount', 'actions']);
}

function renderTable(elementId, data, columns) {
    const tbody = document.getElementById(elementId);
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">No orders found</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(order => {
        const cols = columns.map(col => {
            switch(col) {
                case 'date': return `<td>${formatDate(order.createdAt)}</td>`;
                case 'buyer': return `<td><strong>${order.buyerName || 'Customer'}</strong><br><small>TIN: ${order.buyerTIN || 'N/A'}</small></td>`;
                case 'id': return `<td class="order-id">ORD-${order.id.substring(0,8).toUpperCase()}</td>`;
                case 'summary': return `<td>${order.items?.length || 0} items<br><span class="amount-display">${formatCurrency(order.totalAmount)} RWF</span></td>`;
                case 'status': return `<td><span class="status-badge status-${order.status}">${order.status}</span></td>`;
                case 'invoice': return `<td class="invoice-number">${order.invoiceId || 'N/A'}</td>`;
                case 'amount': return `<td class="amount-display">${formatCurrency(order.totalAmount)} RWF</td>`;
                case 'actions': 
                    let btns = `<button class="action-btn btn-view" onclick="viewOrderDetails('${order.id}')">View</button>`;
                    if (order.status === 'pending') {
                        btns = `<button class="action-btn btn-approve" onclick="approveOrder('${order.id}')">Approve</button>
                                <button class="action-btn btn-reject" onclick="openRejectModal('${order.id}')">Reject</button>` + btns;
                    }
                    return `<td><div class="action-buttons">${btns}</div></td>`;
                default: return '<td></td>';
            }
        });
        return `<tr>${cols.join('')}</tr>`;
    }).join('');
}

// Helper Functions
function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
    document.getElementById('menu-overlay').classList.toggle('active');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === tabId.replace('-tab', '')));
}

window.openRejectModal = function(orderId) {
    currentOrderForAction = orderId;
    document.getElementById('reject-modal').style.display = 'block';
};

function closeRejectModal() {
    document.getElementById('reject-modal').style.display = 'none';
}

function closeOrderModal() {
    document.getElementById('order-modal').style.display = 'none';
}

async function confirmRejectOrder() {
    const reason = document.getElementById('reject-reason-input').value;
    try {
        await db.collection('purchaseRequests').doc(currentOrderForAction).update({
            status: 'rejected',
            rejectionReason: reason || 'No reason provided'
        });
        showMessage('Order rejected', 'success');
        closeRejectModal();
        loadOrders();
    } catch (e) { showMessage('Failed to reject', 'error'); }
}

function updateSummary() {
    const pendingCount = orders.pending.length;
    if (document.getElementById('summary-pending')) document.getElementById('summary-pending').textContent = pendingCount;
    const badge = document.getElementById('pending-badge');
    if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'block' : 'none';
    }
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-RW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amt) {
    return new Intl.NumberFormat('en-RW').format(amt || 0);
}

function showMessage(text, type) {
    const el = document.getElementById('message');
    if (el) {
        el.textContent = text;
        el.className = `message ${type}`;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 4000);
    }
}

async function handleLogout() {
    if (confirm('Logout?')) {
        await auth.signOut();
        window.location.href = 'auth.html';
    }
}

function createOrderManually() {
    window.location.href = 'buyer.html?direct=true';
}

function setupRealtimeListener() {
    db.collection('purchaseRequests')
        .where('sellerId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(() => loadOrders(), (err) => console.error(err));
}
