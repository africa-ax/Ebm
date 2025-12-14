
import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global state
let currentUser = null;
let userRole = null;
let selectedSeller = null;
let cart = [];
let recentSellers = [];
let listenersSetup = false; // Fix for duplicate event listeners

// Local storage key for recent sellers
const RECENT_SELLERS_KEY = 'rwanda_commerce_recent_sellers';

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    await loadUserInfo();
    loadRecentSellers();
    
    // Fix: Only setup listeners once to prevent duplicate executions
    if (!listenersSetup) {
        setupEventListeners();
        listenersSetup = true;
    }
    
    updateCartBadge();
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role;
            
            const displayName = userData.businessName || userData.fullName || 'User';
            document.getElementById('user-name').textContent = displayName;
            
            // Update role info text based on role
            let roleInfoText = '';
            if (userRole === 'buyer') {
                roleInfoText = 'Shopping as Buyer - Buy from Manufacturers, Distributors, or Retailers';
            } else if (userRole === 'retailer') {
                roleInfoText = 'Shopping as Retailer - Buy from Manufacturers or Distributors';
            } else if (userRole === 'distributor') {
                roleInfoText = 'Shopping as Distributor - Buy from Manufacturers';
            }
            document.getElementById('role-info').textContent = roleInfoText;
            
            // Show dashboard link for non-buyer roles
            if (userRole !== 'buyer') {
                document.getElementById('menu-dashboard-item').style.display = 'block';
            }
            
            // Update price header based on role
            updatePriceHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Update price header based on role
function updatePriceHeader() {
    const header = document.getElementById('price-header');
    if (userRole === 'distributor') {
        header.textContent = 'Unit Price';
    } else if (userRole === 'retailer') {
        header.textContent = 'Distributor Price';
    } else {
        header.textContent = 'Price';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Menu
    document.getElementById('hamburger-btn').addEventListener('click', toggleMenu);
    document.getElementById('menu-overlay').addEventListener('click', toggleMenu);
    document.getElementById('menu-invoices').addEventListener('click', () => window.location.href = 'invoices.html');
    document.getElementById('menu-logout').addEventListener('click', handleLogout);
    
    if (userRole !== 'buyer') {
        document.getElementById('menu-dashboard').addEventListener('click', () => {
            const dashboards = {
                distributor: 'distributor.html',
                retailer: 'retailer.html'
            };
            window.location.href = dashboards[userRole];
        });
    }
    
    // Search
    document.getElementById('search-btn').addEventListener('click', searchSellers);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSellers();
    });
    
    // Seller selection
    document.getElementById('clear-selection-btn').addEventListener('click', clearSelection);
    
    // Cart
    document.getElementById('view-cart-btn').addEventListener('click', openCartModal);
    document.getElementById('close-cart-modal').addEventListener('click', closeCartModal);
    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
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

// Load recent sellers from localStorage
function loadRecentSellers() {
    const stored = localStorage.getItem(`${RECENT_SELLERS_KEY}_${currentUser.uid}`);
    if (stored) {
        recentSellers = JSON.parse(stored);
        displayRecentSellers();
    }
}

// Save recent sellers to localStorage
function saveRecentSellers() {
    localStorage.setItem(`${RECENT_SELLERS_KEY}_${currentUser.uid}`, JSON.stringify(recentSellers));
}

// Add seller to recent sellers
function addToRecentSellers(seller) {
    // Remove if already exists
    recentSellers = recentSellers.filter(s => s.uid !== seller.uid);
    
    // Add to beginning
    recentSellers.unshift({
        uid: seller.uid,
        businessName: seller.businessName,
        businessTIN: seller.businessTIN,
        role: seller.role
    });
    
    // Keep only last 5
    if (recentSellers.length > 5) {
        recentSellers = recentSellers.slice(0, 5);
    }
    
    saveRecentSellers();
    displayRecentSellers();
}

// Display recent sellers
function displayRecentSellers() {
    const grid = document.getElementById('recent-sellers-grid');
    const section = document.getElementById('recent-sellers-section');
    
    if (recentSellers.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    grid.innerHTML = '';
    
    recentSellers.forEach(seller => {
        const card = document.createElement('div');
        card.className = 'recent-seller-card';
        card.innerHTML = `
            <strong>${seller.businessName}</strong>
            <small>TIN: ${seller.businessTIN}</small>
        `;
        card.addEventListener('click', () => selectSellerById(seller.uid));
        grid.appendChild(card);
    });
}

// Search sellers
async function searchSellers() {
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('search-results');
    
    if (!searchTerm) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
        // Determine which roles to search based on current user role
        let searchRoles = [];
        if (userRole === 'buyer') {
            // Buyers can buy from manufacturers, distributors, or retailers
            searchRoles = ['manufacturer', 'distributor', 'retailer'];
        } else if (userRole === 'retailer') {
            // Retailers can buy from manufacturers or distributors (buying freedom)
            searchRoles = ['manufacturer', 'distributor'];
        } else if (userRole === 'distributor') {
            // Distributors can buy from manufacturers only
            searchRoles = ['manufacturer'];
        }
        
        const allSellers = [];
        
        for (const role of searchRoles) {
            const snapshot = await db.collection('users')
                .where('role', '==', role)
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const businessName = (data.businessName || '').toLowerCase();
                const businessTIN = (data.businessTIN || '').toLowerCase();
                const address = (data.businessAddress || '').toLowerCase();
                
                if (businessName.includes(searchTerm) || 
                    businessTIN.includes(searchTerm) || 
                    address.includes(searchTerm)) {
                    allSellers.push({ uid: doc.id, ...data });
                }
            });
        }
        
        if (allSellers.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">No sellers found</div>';
            return;
        }
        
        resultsDiv.innerHTML = '';
        allSellers.forEach(seller => {
            const result = document.createElement('div');
            result.className = 'seller-result';
            result.innerHTML = `
                <strong>${seller.businessName}</strong>
                <div class="seller-info">
                    <span>TIN: ${seller.businessTIN}</span>
                    ${seller.businessAddress ? `<span>📍 ${seller.businessAddress}</span>` : ''}
                    <span>📞 ${seller.businessPhone || 'N/A'}</span>
                </div>
            `;
            result.addEventListener('click', () => selectSeller(seller));
            resultsDiv.appendChild(result);
        });
    } catch (error) {
        console.error('Error searching sellers:', error);
        resultsDiv.innerHTML = '<div class="empty-state">Error searching. Please try again.</div>';
    }
}

// Select seller by ID (for recent sellers)
async function selectSellerById(sellerId) {
    try {
        const sellerDoc = await db.collection('users').doc(sellerId).get();
        if (sellerDoc.exists) {
            selectSeller({ uid: sellerId, ...sellerDoc.data() });
        }
    } catch (error) {
        console.error('Error loading seller:', error);
        showMessage('Failed to load seller', 'error');
    }
}

// Select seller
function selectSeller(seller) {
    selectedSeller = seller;
    
    // Update UI
    document.getElementById('selected-seller-name').textContent = seller.businessName;
    document.getElementById('selected-seller-info').textContent = `TIN: ${seller.businessTIN} | ${seller.role.charAt(0).toUpperCase() + seller.role.slice(1)}`;
    document.getElementById('selected-seller-section').classList.add('show');
    document.getElementById('products-section').classList.add('show');
    
    // Add to recent sellers
    addToRecentSellers(seller);
    
    // Load products
    loadSellerProducts();
    
    // Clear search
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
}

// Clear selection
function clearSelection() {
    selectedSeller = null;
    document.getElementById('selected-seller-section').classList.remove('show');
    document.getElementById('products-section').classList.remove('show');
    document.getElementById('products-table-body').innerHTML = '<tr><td colspan="5" class="loading">Select a seller to view products</td></tr>';
}

// Load seller products
async function loadSellerProducts() {
    const tableBody = document.getElementById('products-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">Loading products...</td></tr>';
    
    try {
        let products = [];
        
        if (selectedSeller.role === 'manufacturer') {
            // Load manufacturer products
            const snapshot = await db.collection('products')
                .where('manufacturerId', '==', selectedSeller.uid)
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                products.push({
                    id: doc.id,
                    ...data,
                    price: data.unitPrice,
                    available: data.quantity || 0
                });
            });
        } else {
            // Load stock for distributor/retailer
            const snapshot = await db.collection('stock')
                .where('ownerId', '==', selectedSeller.uid)
                .where('sellingPrice', '>', 0)
                .get();
            
            for (const doc of snapshot.docs) {
                const stockData = doc.data();
                
                // Get product details
                const productDoc = await db.collection('products').doc(stockData.productId).get();
                const productData = productDoc.exists ? productDoc.data() : {};
                
                products.push({
                    id: doc.id,
                    stockId: doc.id,
                    productId: stockData.productId,
                    productName: productData.productName,
                    unitOfMeasure: productData.unitOfMeasure,
                    price: stockData.sellingPrice,
                    available: stockData.quantity || 0,
                    ...productData
                });
            }
        }
        
        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No products available from this seller</td></tr>';
            return;
        }
        
        // Render products
        tableBody.innerHTML = '';
        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${product.productName}</strong><br>
                    <small style="color: #888;">ID: ${product.productId}</small>
                </td>
                <td>${product.unitOfMeasure || 'N/A'}</td>
                <td>${product.available}</td>
                <td class="price-cell">${formatCurrency(product.price)} RWF</td>
                <td style="text-align: center;">
                    <button class="add-to-cart-btn" ${product.available === 0 ? 'disabled' : ''} 
                            data-product='${JSON.stringify(product)}'>
                        ${product.available === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                </td>
            `;
            
            const btn = row.querySelector('.add-to-cart-btn');
            if (product.available > 0) {
                btn.addEventListener('click', () => addToCart(product));
            }
            
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading products:', error);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading products</td></tr>';
    }
}

// Add to cart
function addToCart(product) {
    // Check if already in cart
    const existing = cart.find(item => item.id === product.id);
    
    if (existing) {
        if (existing.quantity < product.available) {
            existing.quantity++;
        } else {
            showMessage('Maximum available quantity already in cart', 'warning');
            return;
        }
    } else {
        cart.push({
            id: product.id,
            productId: product.productId,
            stockId: product.stockId,
            productName: product.productName,
            unitOfMeasure: product.unitOfMeasure,
            unitPrice: product.price,
            quantity: 1,
            maxQuantity: product.available
        });
    }
    
    updateCartBadge();
    showMessage('Added to cart!', 'success');
}

// Update cart badge
function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (itemCount > 0) {
        badge.textContent = itemCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Open cart modal
function openCartModal() {
    document.getElementById('cart-modal').style.display = 'block';
    renderCart();
}

// Close cart modal
function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';
}

// Render cart
function renderCart() {
    const cartBody = document.getElementById('cart-body');
    const cartFooter = document.getElementById('cart-footer');
    
    if (cart.length === 0) {
        cartBody.innerHTML = '<div class="empty-cart"><p>Your cart is empty</p></div>';
        cartFooter.style.display = 'none';
        return;
    }
    
    cartFooter.style.display = 'block';
    cartBody.innerHTML = '';
    
    let total = 0;
    
    cart.forEach((item, index) => {
        const itemTotal = item.unitPrice * item.quantity;
        total += itemTotal;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-header">
                <div>
                    <strong>${item.productName}</strong><br>
                    <small style="color: #888;">${formatCurrency(item.unitPrice)} RWF per ${item.unitOfMeasure}</small>
                </div>
                <button class="remove-item-btn" data-index="${index}">Remove</button>
            </div>
            <div class="cart-item-controls">
                <div class="quantity-control">
                    <button class="qty-btn" data-index="${index}" data-action="decrease">-</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" data-index="${index}" data-action="increase">+</button>
                </div>
                <div class="item-total">${formatCurrency(itemTotal)} RWF</div>
            </div>
        `;
        
        // Event listeners
        cartItem.querySelector('.remove-item-btn').addEventListener('click', () => removeFromCart(index));
        cartItem.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => updateCartQuantity(index, btn.dataset.action));
        });
        
        cartBody.appendChild(cartItem);
    });
    
    document.getElementById('cart-total-amount').textContent = formatCurrency(total) + ' RWF';
}

// Update cart quantity
function updateCartQuantity(index, action) {
    const item = cart[index];
    
    if (action === 'increase') {
        if (item.quantity < item.maxQuantity) {
            item.quantity++;
        } else {
            showMessage('Maximum available quantity reached', 'warning');
        }
    } else {
        if (item.quantity > 1) {
            item.quantity--;
        } else {
            removeFromCart(index);
            return;
        }
    }
    
    updateCartBadge();
    renderCart();
}

// Remove from cart
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartBadge();
    renderCart();
}

// Clear cart
function clearCart() {
    if (confirm('Are you sure you want to clear your cart?')) {
        cart = [];
        updateCartBadge();
        renderCart();
    }
}

// Place order
async function placeOrder() {
    if (!selectedSeller) {
        showMessage('No seller selected', 'error');
        return;
    }
    
    if (cart.length === 0) {
        showMessage('Cart is empty', 'error');
        return;
    }
    
    try {
        // IMPORTANT: Get buyer info first
        let buyerName = 'Customer';
        let buyerTIN = 'N/A';
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                buyerName = userData.businessName || userData.fullName || 'Customer';
                buyerTIN = userData.businessTIN || userData.phone || 'N/A';
            }
        } catch (error) {
            console.error('Error loading buyer info:', error);
        }
        
        // Prepare items
        const items = cart.map(item => ({
            productDocId: item.id, // Fix: Explicitly save Firestore Doc ID
            productId: item.productId || item.id, // Fallback to ID if SKU missing
            stockId: item.stockId || null,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: item.unitPrice * item.quantity
        }));
        
        const totalAmount = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        
        // CRITICAL: Create complete order data
        const orderData = {
            buyerId: currentUser.uid,
            buyerName: buyerName,  // Add buyer name here
            buyerTIN: buyerTIN,    // Add buyer TIN here
            
            sellerId: selectedSeller.uid,  // MUST BE INCLUDED
            sellerName: selectedSeller.businessName || 'Seller',
            
            items: items,
            totalAmount: totalAmount,
            status: 'pending',  // MUST BE INCLUDED
            
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('Saving order data:', orderData);
        
        // Save to Firestore
        const docRef = await db.collection('purchaseRequests').add(orderData);
        console.log('Order saved with ID:', docRef.id);
        
        showMessage(`Order #${docRef.id.substring(0, 8)} placed successfully!`, 'success');
        
        // Reset cart
        cart = [];
        updateCartBadge();
        closeCartModal();
        
        // Clear selection to start fresh
        setTimeout(() => clearSelection(), 1500);
        
    } catch (error) {
        console.error('Error placing order:', error);
        showMessage('Failed to place order: ' + error.message, 'error');
    }
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}
2. seller.js
Fixes Applied:

Updated approveOrder logic to check productDocId first when looking up manufacturer stock, ensuring the "Insufficient Stock" error is resolved for manually updated products.

JavaScript
￼
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
    // Show quick action section and menu button ONLY for retailers
    if (userRole === 'retailer') {
        document.getElementById('quick-action-retailer').style.display = 'flex';
        document.getElementById('menu-create-order').style.display = 'block';
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
        .onSnapshot((snapshot) => {
            console.log('Realtime update: New pending orders');
            loadOrders();
        }, (error) => {
            console.error('Error in realtime listener:', error);
        });
}

// Load all orders
async function loadOrders() {
    try {
        console.log('Loading orders for seller:', currentUser.uid);
        
        // SIMPLE QUERY - No orderBy to avoid index requirement
        const snapshot = await db.collection('purchaseRequests')
            .where('sellerId', '==', currentUser.uid)
            .get();
        
        console.log('Found', snapshot.size, 'orders total');
        
        // Reset orders
        orders = {
            pending: [],
            approved: [],
            rejected: [],
            invoiced: []
        };
        
        // Get all orders and sort manually
        const allOrders = [];
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
                        order.buyerPhone = buyerData.businessPhone || buyerData.phone || 'N/A';
                        order.buyerAddress = buyerData.businessAddress || 'N/A';
                        order.buyerRole = buyerData.role || 'buyer';
                    }
                } catch (error) {
                    console.error('Error loading buyer:', error);
                }
            }
            
            // Calculate total amount if not present
            if (!order.totalAmount && order.items) {
                order.totalAmount = order.items.reduce((sum, item) => sum + (item.total || 0), 0);
            }
            
            allOrders.push(order);
        }
        
        // Sort manually by createdAt descending
        allOrders.sort((a, b) => {
            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return timeB - timeA; // Descending
        });
        
        // Categorize sorted orders
        allOrders.forEach(order => {
            const status = order.status || 'pending';
            if (status === 'approved' && order.invoiceId) {
                orders.invoiced.push(order);
            } else if (orders[status]) {
                orders[status].push(order);
            } else {
                console.log('Unknown status:', status, 'for order:', order.id);
            }
        });
        
        // Render all tabs
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

// Render pending orders
function renderPendingOrders() {
    const tbody = document.getElementById('pending-orders-body');
    
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

// Render approved orders
function renderApprovedOrders() {
    const tbody = document.getElementById('approved-orders-body');
    
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

// Render rejected orders
function renderRejectedOrders() {
    const tbody = document.getElementById('rejected-orders-body');
    
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

// Render invoiced orders
function renderInvoicedOrders() {
    const tbody = document.getElementById('invoiced-orders-body');
    
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
    
    // Calculate subtotal
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
    
    // Setup footer buttons
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

// View invoice
window.viewInvoice = async function(invoiceId) {
    try {
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (invoiceDoc.exists) {
            const invoice = invoiceDoc.data();
            
            // Create invoice modal content
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
                        <div class="detail-item">
                            <div class="detail-label">Order ID</div>
                            <div class="detail-value">${invoice.orderId ? 'ORD-' + invoice.orderId.substring(0, 8).toUpperCase() : 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="detail-title">Seller Information</div>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Name</div>
                            <div class="detail-value">${invoice.sellerName}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">TIN</div>
                            <div class="detail-value">${invoice.sellerTIN}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Address</div>
                            <div class="detail-value">${invoice.sellerAddress}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Phone</div>
                            <div class="detail-value">${invoice.sellerPhone}</div>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="detail-title">Buyer Information</div>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Name</div>
                            <div class="detail-value">${invoice.buyerName}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">TIN</div>
                            <div class="detail-value">${invoice.buyerTIN}</div>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="detail-title">Invoice Items</div>
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
                            ${invoice.items?.map(item => `
                                <tr>
                                    <td>${item.productName}</td>
                                    <td>${formatCurrency(item.unitPrice)} RWF</td>
                                    <td>${item.quantity}</td>
                                    <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total)} RWF</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4">No items</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align: right; font-weight: 600; padding: 15px;">Total Amount:</td>
                                <td style="text-align: right; font-weight: bold; padding: 15px; font-size: 18px; color: #667eea;">
                                    ${formatCurrency(invoice.totalAmount)} RWF
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="detail-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <h3 style="color: #28a745; margin-bottom: 10px;">✅ Invoice Generated Successfully</h3>
                    <p style="margin: 0; color: #666;">This invoice has been saved to your records and is available to the buyer.</p>
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

// Print invoice
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
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .company-name { font-size: 24px; font-weight: bold; color: #667eea; }
                        .invoice-title { font-size: 20px; margin: 10px 0; }
                        .section { margin-bottom: 20px; }
                        .section-title { font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        .table th { background: #f0f0f0; padding: 10px; text-align: left; }
                        .table td { padding: 10px; border-bottom: 1px solid #ddd; }
                        .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
                        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-name">${userData.businessName || 'Business'}</div>
                        <div class="invoice-title">TAX INVOICE</div>
                        <div>Invoice No: ${invoice.invoiceId}</div>
                        <div>Date: ${formatDate(invoice.timestamp)}</div>
                        <div>EBM Serial: ${invoice.ebmSerial || 'N/A'}</div>
                    </div>
                    
                    <div class="grid">
                        <div class="section">
                            <div class="section-title">Seller Information</div>
                            <div><strong>Name:</strong> ${invoice.sellerName}</div>
                            <div><strong>TIN:</strong> ${invoice.sellerTIN}</div>
                            <div><strong>Address:</strong> ${invoice.sellerAddress}</div>
                            <div><strong>Phone:</strong> ${invoice.sellerPhone}</div>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">Buyer Information</div>
                            <div><strong>Name:</strong> ${invoice.buyerName}</div>
                            <div><strong>TIN:</strong> ${invoice.buyerTIN}</div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Items</div>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Unit Price</th>
                                    <th>Qty</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${invoice.items?.map(item => `
                                    <tr>
                                        <td>${item.productName}</td>
                                        <td>${formatCurrency(item.unitPrice)} RWF</td>
                                        <td>${item.quantity}</td>
                                        <td>${formatCurrency(item.total)} RWF</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="total">
                        <strong>TOTAL AMOUNT: ${formatCurrency(invoice.totalAmount)} RWF</strong>
                    </div>
                    
                    <div class="footer">
                        <p>Thank you for your business!</p>
                        <p>This is a computer-generated invoice.</p>
                    </div>
                    
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(() => window.close(), 1000);
                        };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    } catch (error) {
        console.error('Error printing invoice:', error);
        showMessage('Failed to print invoice', 'error');
    }
};

// Close order modal
function closeOrderModal() {
    document.getElementById('order-modal').style.display = 'none';
}

// Approve order with inventory transfer and EBM compliance check
window.approveOrder = async function(orderId) {
    const order = orders.pending.find(o => o.id === orderId);
    if (!order) return;
    
    if (!confirm('Approve this order, transfer inventory to buyer, and generate EBM invoice?')) return;
    
    try {
        showMessage('Processing order approval...', 'info');
        
        // Step 1: Get buyer information
        let buyerData = null;
        try {
            const buyerDoc = await db.collection('users').doc(order.buyerId).get();
            if (buyerDoc.exists) {
                buyerData = buyerDoc.data();
                order.buyerRole = buyerData.role;
                order.buyerName = buyerData.businessName || buyerData.fullName || 'Customer';
                order.buyerTIN = buyerData.businessTIN || buyerData.phone || 'N/A';
            }
        } catch (error) {
            console.error('Error loading buyer info:', error);
        }
        
        // Step 2: Validate and deduct stock from seller + FETCH EBM TAX DATA
        // We use the same loop to deduct stock AND gather tax info from Firestore product ID
        for (const item of order.items) {
            
            // --- CRITICAL FIX: Ensure item has orderId for transfer ---
            // This prevents the "undefined" error when saving to stock
            item.orderId = order.id;
            
            let productDetails = null;

            if (userRole === 'manufacturer') {
                // Check product quantity from products collection
                
                // 1. IMPROVED LOOKUP: Try the reliable Document ID first
                // Use productDocId if available, otherwise fall back to productId (for old orders)
                const docIdToUse = item.productDocId || item.productId;
                
                let productDoc = await db.collection('products').doc(docIdToUse).get();
                
                // 2. If not found (e.g., using SKU instead of Doc ID), try query
                if (!productDoc.exists) {
                    const querySnapshot = await db.collection('products')
                        .where('productId', '==', item.productId)
                        .limit(1)
                        .get();
                    
                    if (!querySnapshot.empty) {
                        productDoc = querySnapshot.docs[0];
                    }
                }
                
                // 3. If STILL not found, throw error
                if (!productDoc.exists) {
                    showMessage(`Product ${item.productName} not found in database`, 'error');
                    return;
                }
                
                const product = productDoc.data();
                const currentQty = product.quantity !== undefined ? product.quantity : 0;

                if (currentQty < item.quantity) {
                    showMessage(`Insufficient stock for ${item.productName}. Available: ${currentQty}, Requested: ${item.quantity}`, 'error');
                    return;
                }
                
                // Deduct stock from seller (using the correct document ID)
                await db.collection('products').doc(productDoc.id).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                productDetails = product;
                
            } else {
                // Check stock collection (Distributor/Retailer)
                const stockIdToUse = item.stockId;
                if (!stockIdToUse) {
                     console.warn('Item missing stockId', item);
                     // If stock ID is missing, we can't deduct safely
                     showMessage(`Error: Missing stock reference for ${item.productName}`, 'error');
                     return;
                }

                const stockDoc = await db.collection('stock').doc(stockIdToUse).get();
                if (!stockDoc.exists) {
                    showMessage(`Stock for ${item.productName} not found`, 'error');
                    return;
                }
                
                const stock = stockDoc.data();
                const availableQty = stock.quantity !== undefined ? stock.quantity : 0;
                
                if (availableQty < item.quantity) {
                    showMessage(`Insufficient stock for ${item.productName}. Available: ${availableQty}, Requested: ${item.quantity}`, 'error');
                    return;
                }
                
                // Deduct stock from seller
                await db.collection('stock').doc(stockIdToUse).update({
                    quantity: firebase.firestore.FieldValue.increment(-item.quantity),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Get product details from products collection for tax info
                // We also use safe lookup here in case the ID format varies
                if (stock.productId) {
                    let productDoc = await db.collection('products').doc(stock.productId).get();
                    // Fallback lookup
                    if(!productDoc.exists) {
                         const q = await db.collection('products').where('productId', '==', stock.productId).limit(1).get();
                         if(!q.empty) productDoc = q.docs[0];
                    }

                    if (productDoc.exists) {
                        productDetails = productDoc.data();
                    }
                }
            }

            // Assign details for inventory transfer
            item.productDetails = productDetails;

            // *** CRITICAL: Assign Tax Data for EBM Mock ***
            if (productDetails) {
                // Map Firestore 'vatType' to percentage for EBM Mock
                if (productDetails.vatType === 'exempt' || productDetails.vatType === 'zero') {
                    item.vatRate = 0;
                } else {
                    item.vatRate = 18; // Default standard rate
                }
                // Map Firestore 'taxCategory' (A, B, C, D)
                item.taxType = productDetails.taxCategory || 'B';
            }
        }
        
        // Step 3: TRANSFER INVENTORY TO BUYER based on buyer role
        if (buyerData && buyerData.role !== 'buyer') {
            for (const item of order.items) {
                // Only transfer if we successfully found product details
                if (item.productDetails) {
                    await transferInventoryToBuyer(order.buyerId, buyerData, item);
                }
            }
        }
        
        // Step 4: Generate EBM invoice using ebmMock
        // Ensure seller data is fully populated
        const invoiceData = {
            sellerName: userData.businessName || 'Seller',
            sellerTIN: userData.businessTIN || '000000000',
            sellerAddress: userData.businessAddress || 'Kigali, Rwanda',
            sellerPhone: userData.businessPhone || 'N/A',
            buyerName: order.buyerName || 'Customer',
            buyerTIN: order.buyerTIN || 'N/A',
            items: order.items, // Now contains vatRate and taxType from Firestore
            totalAmount: order.totalAmount,
            timestamp: new Date()
        };
        
        const invoice = window.ebmMock.generateInvoice(invoiceData);
        
        // Step 5: Save invoice to Firestore
        await db.collection('sales_invoices').doc(invoice.invoiceId).set({
            ...invoice,
            sellerId: currentUser.uid,
            buyerId: order.buyerId,
            orderId: order.id,
            buyerRole: order.buyerRole,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 6: Update order status
        await db.collection('purchaseRequests').doc(order.id).update({
            status: 'approved',
            invoiceId: invoice.invoiceId,
            buyerName: order.buyerName,
            buyerTIN: order.buyerTIN,
            buyerRole: order.buyerRole,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            inventoryTransferred: true
        });
        
        showMessage('✅ Order approved, inventory transferred, and invoice generated successfully!', 'success');
        loadOrders();
        
        // Auto-open the invoice view
        setTimeout(() => {
            viewInvoice(invoice.invoiceId);
        }, 1000);
    } catch (error) {
        console.error('Error approving order:', error);
        showMessage('Failed to approve order: ' + error.message, 'error');
    }
};

// Transfer inventory to buyer based on buyer role
async function transferInventoryToBuyer(buyerId, buyerData, item) {
    const buyerRole = buyerData.role;
    const productDetails = item.productDetails;
    
    try {
        if (buyerRole === 'manufacturer') {
            // Manufacturer receives raw materials
            await addToRawMaterials(buyerId, buyerData, item, productDetails);
        } else if (buyerRole === 'distributor' || buyerRole === 'retailer') {
            // Distributor/Retailer receives stock
            await addToStock(buyerId, buyerData, item, productDetails);
        }
    } catch (error) {
        console.error(`Error transferring inventory for ${item.productName}:`, error);
        throw error;
    }
}

// Add to raw materials collection for manufacturers
async function addToRawMaterials(buyerId, buyerData, item, productDetails) {
    const rawMaterialData = {
        productId: item.productId,
        productName: item.productName,
        originalManufacturerId: productDetails.manufacturerId || currentUser.uid,
        originalManufacturerName: userData.businessName || 'Manufacturer',
        quantity: item.quantity,
        unitPrice: item.unitPrice, // Purchase price
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
    
    // Check if raw material already exists
    const existingQuery = await db.collection('raw_materials')
        .where('ownerId', '==', buyerId)
        .where('productId', '==', item.productId)
        .limit(1)
        .get();
    
    if (!existingQuery.empty) {
        // Update existing raw material quantity
        const existingDoc = existingQuery.docs[0];
        await db.collection('raw_materials').doc(existingDoc.id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated existing raw material: ${item.productName}`);
    } else {
        // Add new raw material
        await db.collection('raw_materials').add(rawMaterialData);
        console.log(`Added new raw material: ${item.productName}`);
    }
}

// Add to stock collection for distributors and retailers
async function addToStock(buyerId, buyerData, item, productDetails) {
    const stockData = {
        productId: item.productId,
        productName: item.productName,
        manufacturerId: productDetails.manufacturerId || currentUser.uid,
        manufacturerName: productDetails.manufacturerName || userData.businessName || 'Manufacturer',
        quantity: item.quantity,
        purchasePrice: item.unitPrice, // Price buyer paid
        sellingPrice: null, // Empty for them to set later
        unitOfMeasure: productDetails.unitOfMeasure || 'pcs',
        category: productDetails.category || 'general',
        description: productDetails.description || '',
        purchasedFrom: userData.businessName || 'Supplier',
        purchasedFromId: currentUser.uid,
        // --- CRITICAL FIX: Fallback if order ID is missing (should be fixed by approveOrder update) ---
        purchaseOrderId: item.orderId || 'UNKNOWN_ORDER', 
        ownerId: buyerId,
        ownerTIN: buyerData.businessTIN || buyerData.phone || 'N/A',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Check if stock already exists
    const existingQuery = await db.collection('stock')
        .where('ownerId', '==', buyerId)
        .where('productId', '==', item.productId)
        .limit(1)
        .get();
    
    if (!existingQuery.empty) {
        // Update existing stock quantity
        const existingDoc = existingQuery.docs[0];
        await db.collection('stock').doc(existingDoc.id).update({
            quantity: firebase.firestore.FieldValue.increment(item.quantity),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated existing stock: ${item.productName}`);
    } else {
        // Add new stock
        await db.collection('stock').add(stockData);
        console.log(`Added new stock: ${item.productName}`);
    }
}

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
        
        showMessage('Order rejected successfully', 'success');
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
