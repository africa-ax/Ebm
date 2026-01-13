"import firebaseConfig from './firebase-config.js';

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
            document.getElementById('user-name').textContent = displayName;
            
            let roleInfoText = '';
            // UPDATED: Added Manufacturer role logic for shopping interface
            if (userRole === 'buyer') {
                roleInfoText = 'Shopping as Buyer - Buy from Manufacturers, Distributors, or Retailers';
            } else if (userRole === 'retailer') {
                roleInfoText = 'Shopping as Retailer - Buy from Manufacturers or Distributors';
            } else if (userRole === 'distributor') {
                roleInfoText = 'Shopping as Distributor - Buy from Manufacturers';
            } else if (userRole === 'manufacturer') {
                roleInfoText = 'Shopping as Manufacturer - Sourcing Resources from Distributors or Retailers';
            }
            document.getElementById('role-info').textContent = roleInfoText;
            
            // Manufacturers now have access to this buyer dashboard, but still need their dashboard link
            if (userRole !== 'buyer') {
                document.getElementById('menu-dashboard-item').style.display = 'block';
            }
            
            updatePriceHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

function updatePriceHeader() {
    const header = document.getElementById('price-header');
    // UPDATED: Added logic for Manufacturers to see "Resource Price"
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
    document.getElementById('hamburger-btn').addEventListener('click', toggleMenu);
    document.getElementById('menu-overlay').addEventListener('click', toggleMenu);
    document.getElementById('menu-invoices').addEventListener('click', () => window.location.href = 'invoices.html');
    document.getElementById('menu-logout').addEventListener('click', handleLogout);
    
    if (userRole !== 'buyer') {
        document.getElementById('menu-dashboard').addEventListener('click', () => {
            const dashboards = {
                distributor: 'distributor.html',
                retailer: 'retailer.html',
                manufacturer: 'manufacturer.html' // Added manufacturer dashboard link
            };
            window.location.href = dashboards[userRole];
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
    
    if (recentSellers.length > 5) {
        recentSellers = recentSellers.slice(0, 5);
    }
    
    saveRecentSellers();
    displayRecentSellers();
}

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

async function searchSellers() {
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('search-results');
    
    if (!searchTerm) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
        let searchRoles = [];
        // UPDATED: Role-based search logic
        if (userRole === 'buyer') {
            searchRoles = ['manufacturer', 'distributor', 'retailer'];
        } else if (userRole === 'retailer') {
            searchRoles = ['manufacturer', 'distributor'];
        } else if (userRole === 'distributor') {
            searchRoles = ['manufacturer'];
        } else if (userRole === 'manufacturer') {
            // Manufacturers can source from Distributors and Retailers
            searchRoles = ['distributor', 'retailer'];
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

function selectSeller(seller) {
    selectedSeller = seller;
    
    document.getElementById('selected-seller-name').textContent = seller.businessName;
    document.getElementById('selected-seller-info').textContent = `TIN: ${seller.businessTIN} | ${seller.role.charAt(0).toUpperCase() + seller.role.slice(1)}`;
    document.getElementById('selected-seller-section').classList.add('show');
    document.getElementById('products-section').classList.add('show');
    
    addToRecentSellers(seller);
    loadSellerProducts();
    
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
}

function clearSelection() {
    selectedSeller = null;
    document.getElementById('selected-seller-section').classList.remove('show');
    document.getElementById('products-section').classList.remove('show');
    document.getElementById('products-table-body').innerHTML = '<tr><td colspan="5" class="loading">Select a seller to view products</td></tr>';
}

async function loadSellerProducts() {
    const tableBody = document.getElementById('products-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">Loading products...</td></tr>';
    
    try {
        let products = [];
        
        if (selectedSeller.role === 'manufacturer') {
            const snapshot = await db.collection('products')
                .where('manufacturerId', '==', selectedSeller.uid)
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                products.push({
                    id: doc.id,
                    productDocId: doc.id,
                    ...data,
                    price: data.unitPrice,
                    available: data.quantity || 0
                });
            });
        } else {
            const snapshot = await db.collection('stock')
                .where('ownerId', '==', selectedSeller.uid)
                .get();
            
            for (const doc of snapshot.docs) {
                const stockData = doc.data();
                
                if ((stockData.quantity || 0) <= 0 || (stockData.sellingPrice || 0) <= 0) {
                    continue; 
                }
                
                let productName = stockData.productName;
                let unitOfMeasure = stockData.unitOfMeasure;
                let productId = stockData.sku || stockData.productId;
                
                if (stockData.productId) {
                    try {
                        const productDoc = await db.collection('products').doc(stockData.productId).get();
                        if (productDoc.exists) {
                            const productData = productDoc.data();
                            productName = productName || productData.productName;
                            unitOfMeasure = unitOfMeasure || productData.unitOfMeasure;
                            productId = productId || productData.productId;
                        }
                    } catch (err) {
                        console.warn('Could not fetch product details:', err);
                    }
                }
                
                products.push({
                    id: doc.id,
                    stockId: doc.id,
                    productDocId: stockData.productId,
                    productId: productId || 'N/A',
                    productName: productName || 'Product',
                    unitOfMeasure: unitOfMeasure || 'N/A',
                    price: stockData.sellingPrice,
                    available: stockData.quantity || 0
                });
            }
        }
        
        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No products available from this seller</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${product.productName}</strong><br>
                    <small style="color: #888;">${product.productId ? `ID: ${product.productId}` : ''}</small>
                </td>
                <td>${product.unitOfMeasure}</td>
                <td>${product.available}</td>
                <td class="price-cell">${formatCurrency(product.price)} RWF</td>
                <td style="text-align: center;">
                    <button class="add-to-cart-btn" ${product.available === 0 ? 'disabled' : ''} 
                            data-product='${JSON.stringify(product).replace(/'/g, "\\'")}'>
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
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading products: ' + error.message + '</td></tr>';
    }
}

function addToCart(product) {
    const existing = cart.find(item => 
        item.id === product.id || 
        item.productDocId === product.productDocId
    );
    
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
            productDocId: product.productDocId || product.id,
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

function openCartModal() {
    document.getElementById('cart-modal').style.display = 'block';
    renderCart();
}

function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';
}

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
        
        cartItem.querySelector('.remove-item-btn').addEventListener('click', () => removeFromCart(index));
        cartItem.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => updateCartQuantity(index, btn.dataset.action));
        });
        
        cartBody.appendChild(cartItem);
    });
    
    document.getElementById('cart-total-amount').textContent = formatCurrency(total) + ' RWF';
}

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

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartBadge();
    renderCart();
}

function clearCart() {
    if (confirm('Are you sure you want to clear your cart?')) {
        cart = [];
        updateCartBadge();
        renderCart();
    }
}

// Place order - UPDATED with purchaseType flag
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
        
        const items = cart.map(item => ({
            productDocId: item.productDocId || item.id,
            productId: item.productId || item.productDocId || item.id,
            stockId: item.stockId || null,
            productName: item.productName,
            unitOfMeasure: item.unitOfMeasure,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: item.unitPrice * item.quantity
        }));
        
        const totalAmount = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        
        // UPDATED: Included purchaseType metadata
        const orderData = {
            buyerId: currentUser.uid,
            buyerName: buyerName,
            buyerTIN: buyerTIN,
            
            sellerId: selectedSeller.uid,
            sellerName: selectedSeller.businessName || 'Seller',
            sellerTIN: selectedSeller.businessTIN || 'N/A',           
            sellerAddress: selectedSeller.businessAddress || 'N/A',   
            sellerPhone: selectedSeller.businessPhone || 'N/A',       
            
            items: items,
            totalAmount: totalAmount,
            status: 'pending',
            
            // Metadata for routing to "Acquired Resources"
            purchaseType: userRole === 'manufacturer' ? 'resource' : 'inventory',
            
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('Saving order data:', orderData);
        
        const docRef = await db.collection('purchaseRequests').add(orderData);
        
        showMessage(`Order #${docRef.id.substring(0, 8)} placed successfully!`, 'success');
        
        cart = [];
        updateCartBadge();
        closeCartModal();
        
        setTimeout(() => clearSelection(), 1500);
        
    } catch (error) {
        console.error('Error placing order:', error);
        showMessage('Failed to place order: ' + error.message, 'error');
    }
}

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
