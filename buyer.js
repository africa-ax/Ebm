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
let listenersSetup = false;

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
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = displayName;
            
            let roleInfoText = '';
            if (userRole === 'buyer') {
                roleInfoText = 'Shopping as Buyer - Buy from Manufacturers, Distributors, or Retailers';
            } else if (userRole === 'retailer') {
                roleInfoText = 'Shopping as Retailer - Buy from Manufacturers or Distributors';
            } else if (userRole === 'distributor') {
                roleInfoText = 'Shopping as Distributor - Buy from Manufacturers';
            } else if (userRole === 'manufacturer') {
                roleInfoText = 'Shopping as Manufacturer - Sourcing Resources from Distributors or Retailers';
            }
            
            const infoEl = document.getElementById('role-info');
            if (infoEl) infoEl.textContent = roleInfoText;
            
            const dashboardItem = document.getElementById('menu-dashboard-item');
            if (userRole !== 'buyer' && dashboardItem) {
                dashboardItem.style.display = 'block';
            }
            
            updatePriceHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

function updatePriceHeader() {
    const header = document.getElementById('price-header');
    if (!header) return; // FIX: Prevents crash if element is missing in HTML

    if (userRole === 'distributor') {
        header.textContent = 'Unit Price';
    } else if (userRole === 'retailer') {
        header.textContent = 'Distributor Price';
    } else if (userRole === 'manufacturer') {
        header.textContent = 'Resource Price';
    } else {
        header.textContent = 'Price';
    }
}

function setupEventListeners() {
    const hamBtn = document.getElementById('hamburger-btn');
    if (hamBtn) hamBtn.addEventListener('click', toggleMenu);
    
    const overlay = document.getElementById('menu-overlay');
    if (overlay) overlay.addEventListener('click', toggleMenu);

    const invoiceBtn = document.getElementById('menu-invoices');
    if (invoiceBtn) invoiceBtn.addEventListener('click', () => window.location.href = 'invoices.html');

    const logoutBtn = document.getElementById('menu-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const dashBtn = document.getElementById('menu-dashboard');
    if (dashBtn && userRole !== 'buyer') {
        dashBtn.addEventListener('click', () => {
            const dashboards = {
                distributor: 'distributor.html',
                retailer: 'retailer.html',
                manufacturer: 'manufacturer.html'
            };
            window.location.href = dashboards[userRole] || 'index.html';
        });
    }
    
    document.getElementById('search-btn').addEventListener('click', searchSellers);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSellers();
    });
    
    document.getElementById('clear-selection-btn').addEventListener('click', clearSelection);
    document.getElementById('view-cart-btn').addEventListener('click', openCartModal);
    document.getElementById('close-cart-modal').addEventListener('click', closeCartModal);
    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
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

function loadRecentSellers() {
    const stored = localStorage.getItem(`${RECENT_SELLERS_KEY}_${currentUser.uid}`);
    if (stored) {
        recentSellers = JSON.parse(stored);
        displayRecentSellers();
    }
}

function saveRecentSellers() {
    localStorage.setItem(`${RECENT_SELLERS_KEY}_${currentUser.uid}`, JSON.stringify(recentSellers));
}

function addToRecentSellers(seller) {
    recentSellers = recentSellers.filter(s => s.uid !== seller.uid);
    recentSellers.unshift({
        uid: seller.uid,
        businessName: seller.businessName,
        businessTIN: seller.businessTIN,
        role: seller.role,
        businessAddress: seller.businessAddress,
        businessPhone: seller.businessPhone      
    });
    if (recentSellers.length > 5) recentSellers = recentSellers.slice(0, 5);
    saveRecentSellers();
    displayRecentSellers();
}

function displayRecentSellers() {
    const grid = document.getElementById('recent-sellers-grid');
    const section = document.getElementById('recent-sellers-section');
    if (!grid || !section) return;
    
    if (recentSellers.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    grid.innerHTML = '';
    recentSellers.forEach(seller => {
        const card = document.createElement('div');
        card.className = 'recent-seller-card';
        card.innerHTML = `<strong>${seller.businessName}</strong><small>TIN: ${seller.businessTIN}</small>`;
        card.addEventListener('click', () => selectSellerById(seller.uid));
        grid.appendChild(card);
    });
}

async function searchSellers() {
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('search-results');
    if (!searchTerm) { resultsDiv.innerHTML = ''; return; }
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
        let searchRoles = [];
        if (userRole === 'buyer') searchRoles = ['manufacturer', 'distributor', 'retailer'];
        else if (userRole === 'retailer') searchRoles = ['manufacturer', 'distributor'];
        else if (userRole === 'distributor') searchRoles = ['manufacturer'];
        else if (userRole === 'manufacturer') searchRoles = ['distributor', 'retailer'];
        
        const allSellers = [];
        for (const role of searchRoles) {
            const snapshot = await db.collection('users').where('role', '==', role).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if ((data.businessName || '').toLowerCase().includes(searchTerm) || 
                    (data.businessTIN || '').toLowerCase().includes(searchTerm)) {
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
            result.innerHTML = `<strong>${seller.businessName}</strong><div class="seller-info">TIN: ${seller.businessTIN}</div>`;
            result.addEventListener('click', () => selectSeller(seller));
            resultsDiv.appendChild(result);
        });
    } catch (error) {
        console.error('Error searching:', error);
        resultsDiv.innerHTML = '<div class="empty-state">Error searching.</div>';
    }
}

async function selectSellerById(sellerId) {
    try {
        const sellerDoc = await db.collection('users').doc(sellerId).get();
        if (sellerDoc.exists) selectSeller({ uid: sellerId, ...sellerDoc.data() });
    } catch (error) { showMessage('Failed to load seller', 'error'); }
}

function selectSeller(seller) {
    selectedSeller = seller;
    document.getElementById('selected-seller-name').textContent = seller.businessName;
    document.getElementById('selected-seller-info').textContent = `TIN: ${seller.businessTIN} | ${seller.role}`;
    document.getElementById('selected-seller-section').classList.add('show');
    document.getElementById('products-section').classList.add('show');
    addToRecentSellers(seller);
    loadSellerProducts();
}

function clearSelection() {
    selectedSeller = null;
    document.getElementById('selected-seller-section').classList.remove('show');
    document.getElementById('products-section').classList.remove('show');
}

async function loadSellerProducts() {
    const tableBody = document.getElementById('products-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
    
    try {
        let products = [];
        if (selectedSeller.role === 'manufacturer') {
            const snap = await db.collection('products').where('manufacturerId', '==', selectedSeller.uid).get();
            snap.forEach(doc => products.push({ id: doc.id, ...doc.data(), price: doc.data().unitPrice, available: doc.data().quantity || 0 }));
        } else {
            const snap = await db.collection('stock').where('ownerId', '==', selectedSeller.uid).get();
            snap.forEach(doc => {
                const d = doc.data();
                if (d.quantity > 0 && d.sellingPrice > 0) {
                    products.push({ id: doc.id, ...d, price: d.sellingPrice, available: d.quantity });
                }
            });
        }
        
        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No products found</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        products.forEach(p => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${p.productName}</td><td>${p.unitOfMeasure}</td><td>${p.available}</td><td>${formatCurrency(p.price)} RWF</td><td><button class="add-to-cart-btn">Add</button></td>`;
            row.querySelector('button').onclick = () => addToCart(p);
            tableBody.appendChild(row);
        });
    } catch (e) { tableBody.innerHTML = '<tr><td>Error loading.</td></tr>'; }
}

function addToCart(product) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.quantity < product.available) existing.quantity++;
        else return showMessage('Max quantity reached', 'warning');
    } else {
        cart.push({ ...product, unitPrice: product.price, quantity: 1, maxQuantity: product.available });
    }
    updateCartBadge();
    showMessage('Added to cart!', 'success');
}

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

function openCartModal() { document.getElementById('cart-modal').style.display = 'block'; renderCart(); }
function closeCartModal() { document.getElementById('cart-modal').style.display = 'none'; }

function renderCart() {
    const body = document.getElementById('cart-body');
    if (cart.length === 0) { body.innerHTML = 'Empty'; return; }
    body.innerHTML = '';
    let total = 0;
    cart.forEach((item, i) => {
        total += item.unitPrice * item.quantity;
        const div = document.createElement('div');
        div.innerHTML = `${item.productName} - ${item.quantity} x ${item.unitPrice}`;
        body.appendChild(div);
    });
    document.getElementById('cart-total-amount').textContent = formatCurrency(total) + ' RWF';
}

function clearCart() { cart = []; updateCartBadge(); renderCart(); }

async function placeOrder() {
    if (!selectedSeller || cart.length === 0) return;
    try {
        const orderData = {
            buyerId: currentUser.uid,
            sellerId: selectedSeller.uid,
            items: cart,
            status: 'pending',
            purchaseType: userRole === 'manufacturer' ? 'resource' : 'inventory',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('purchaseRequests').add(orderData);
        showMessage('Order placed!', 'success');
        clearCart();
        closeCartModal();
    } catch (e) { showMessage('Order failed', 'error'); }
}

function formatCurrency(amount) { return new Intl.NumberFormat('en-RW').format(amount || 0); }

function showMessage(text, type) {
    const el = document.getElementById('message');
    if (!el) return;
    el.textContent = text;
    el.className = `message ${type}`;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}
