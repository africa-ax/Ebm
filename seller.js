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
    loadOrders(); // Explicitly call loadOrders on auth change
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            userRole = userData.role;
            
            const displayName = userData.businessName || userData.fullName || 'User';
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
    const elements = {
        'hamburger-btn': () => toggleMenu(),
        'menu-overlay': () => toggleMenu(),
        'menu-logout': () => handleLogout(),
        'menu-create-order': () => createOrderManually(),
        'close-order-modal': () => closeOrderModal(),
        'close-reject-modal': () => closeRejectModal(),
        'cancel-reject': () => closeRejectModal(),
        'confirm-reject': () => confirmRejectOrder()
    };

    for (const [id, func] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', func);
    }
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
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
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
}

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

async function loadOrders() {
    try {
        const snapshot = await db.collection('purchaseRequests')
            .where('sellerId', '==', currentUser.uid)
            .get();
        
        const tempOrders = { pending: [], approved: [], rejected: [], invoiced: [] };
        const allOrders = [];

        for (const doc of snapshot.docs) {
            const orderData = doc.data();
            allOrders.push({ id: doc.id, ...orderData });
        }
        
        allOrders.sort((a, b) => {
            const timeA = a.createdAt?.toDate?.() || 0;
            const timeB = b.createdAt?.toDate?.() || 0;
            return timeB - timeA;
        });
        
        allOrders.forEach(order => {
            const status = order.status || 'pending';
            if (status === 'approved' && order.invoiceId) tempOrders.invoiced.push(order);
            else if (tempOrders[status]) tempOrders[status].push(order);
        });

        orders = tempOrders;
        renderPendingOrders();
        renderApprovedOrders();
        renderRejectedOrders();
        renderInvoicedOrders();
        updateSummary();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Logic for approving orders and merging stock
window.approveOrder = async function(orderId) {
    const order = orders.pending.find(o => o.id === orderId);
    if (!order) return;
    
    if (!confirm('Approve this order and transfer inventory to the buyer?')) return;
    
    try {
        showMessage('Processing approval...', 'info');
        
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        const buyerData = buyerDoc.exists ? buyerDoc.data() : null;

        for (const item of order.items) {
            // Deduct Seller Stock
            if (userRole === 'manufacturer') {
                await db.collection('products').doc(item.productId).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else if (item.stockId) {
                const stockRef = db.collection('stock').doc(item.stockId);
                const snap = await stockRef.get();
                if (snap.exists) {
                    const newQty = (snap.data().quantity || 0) - item.quantity;
                    if (newQty <= 0) await stockRef.delete();
                    else await stockRef.update({ quantity: newQty });
                }
            }

            // Transfer to Buyer
            if (buyerData && buyerData.role !== 'buyer') {
                await transferInventoryToBuyer(order.buyerId, buyerData, item);
            }
        }

        await db.collection('purchaseRequests').doc(order.id).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('✅ Order approved!', 'success');
        loadOrders();
    } catch (error) {
        console.error('Error:', error);
        showMessage('Failed to approve', 'error');
    }
};

async function transferInventoryToBuyer(buyerId, buyerData, item) {
    const stockRef = db.collection('stock');
    const existing = await stockRef
        .where('ownerId', '==', buyerId)
        .where('productId', '==', item.productId)
        .limit(1).get();

    if (!existing.empty) {
        await stockRef.doc(existing.docs[0].id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
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

// Rendering Functions
function renderPendingOrders() {
    const tbody = document.getElementById('pending-orders-body');
    if (!tbody) return;
    if (orders.pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No pending orders</td></tr>';
        return;
    }
    tbody.innerHTML = orders.pending.map(order => `
        <tr>
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.buyerName}</td>
            <td>${formatCurrency(order.totalAmount)} RWF</td>
            <td>
                <button onclick="approveOrder('${order.id}')">Approve</button>
                <button onclick="viewOrderDetails('${order.id}')">View</button>
            </td>
        </tr>
    `).join('');
}

// Add simplified versions of other renderers if needed or keep existing ones
function renderApprovedOrders() { /* Logic similar to pending */ }
function renderRejectedOrders() { /* Logic similar to pending */ }
function renderInvoicedOrders() { /* Logic similar to pending */ }

function updateSummary() {
    const pendingCount = orders.pending.length;
    const badge = document.getElementById('pending-badge');
    if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'block' : 'none';
    }
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-RW');
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW').format(amount || 0);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        setTimeout(() => { messageEl.style.display = 'none'; }, 4000);
    }
}
