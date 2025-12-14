
import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Check authentication
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    // Load user business info
    loadUserBusinessInfo(user.uid);
    
    // Initialize dashboard
    initializeDashboard(user.uid);
});

// Load user business information
async function loadUserBusinessInfo(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role !== 'manufacturer') {
                alert('Access denied. This page is for manufacturers only.');
                auth.signOut();
                return;
            }
            document.getElementById('user-business-name').textContent = userData.businessName || 'Manufacturer';
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Initialize Dashboard
function initializeDashboard(userId) {
    setupMenuToggle();
    setupNavigation();
    setupCreateProductForm(userId);
    setupEditProductSection(userId);
    monitorPurchaseRequests(userId);
}

// Setup hamburger menu toggle
function setupMenuToggle() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            sideMenu.classList.toggle('active');
            menuOverlay.classList.toggle('active');
        });
    }

    if (menuOverlay) {
        menuOverlay.addEventListener('click', () => {
            sideMenu.classList.remove('active');
            menuOverlay.classList.remove('active');
        });
    }
}

// Setup navigation
function setupNavigation() {
    const safeAddListener = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    safeAddListener('menu-create-product', () => { showSection('create-product-section'); closeMenu(); });
    safeAddListener('menu-edit-product', () => { showSection('edit-product-section'); loadProductsList(); closeMenu(); });
    
    safeAddListener('menu-logout', async () => {
        if (confirm('Are you sure you want to logout?')) {
            await auth.signOut();
            window.location.href = 'auth.html';
        }
    });

    safeAddListener('stock-btn', () => window.location.href = 'stock.html');
    safeAddListener('sell-btn', () => window.location.href = 'seller.html');
    safeAddListener('buy-btn', () => window.location.href = 'buyer.html');
    
    safeAddListener('back-to-dashboard', () => showSection('dashboard-view'));
    safeAddListener('back-to-dashboard-edit', () => showSection('dashboard-view'));
}

// Close menu
function closeMenu() {
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    if (sideMenu) sideMenu.classList.remove('active');
    if (menuOverlay) menuOverlay.classList.remove('active');
}

// Show section
function showSection(sectionId) {
    const dashboard = document.getElementById('dashboard-view');
    if (dashboard) dashboard.style.display = 'none';
    
    document.querySelectorAll('.section-container').forEach(section => {
        section.classList.remove('active');
    });

    if (sectionId === 'dashboard-view') {
        if (dashboard) dashboard.style.display = 'block';
    } else {
        const target = document.getElementById(sectionId);
        if (target) target.classList.add('active');
    }
}

// Setup Create Product Form
function setupCreateProductForm(userId) {
    const form = document.getElementById('create-product-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Grab values safely
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };

        const initialStockInput = document.getElementById('initial-stock');
        const initialStock = initialStockInput ? parseInt(initialStockInput.value) : 0;

        // 1. Prepare Private Data
        const productData = {
            productName: getVal('product-name'),
            productId: getVal('product-id'), // Custom SKU
            unitOfMeasure: getVal('unit-of-measure'),
            taxCategory: getVal('tax-category'),
            vatType: getVal('vat-type'),
            productCategory: getVal('product-category'),
            itemClassification: getVal('item-classification'),
            pricingType: getVal('pricing-type'),
            unitPrice: parseFloat(getVal('unit-price') || 0),
            quantity: isNaN(initialStock) ? 0 : initialStock, // Set Initial Stock Here
            description: getVal('product-description'),
            manufacturerId: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!productData.productName || !productData.productId) {
            showMessage('message-create', 'error', 'Product Name and ID are required.');
            return;
        }

        try {
            // Check duplicates in private collection
            const existingProduct = await db.collection('products')
                .where('productId', '==', productData.productId)
                .where('manufacturerId', '==', userId)
                .get();

            if (!existingProduct.empty) {
                showMessage('message-create', 'error', 'Product ID already exists in your inventory.');
                return;
            }

            // Check duplicates in public registry
            const existingPublic = await db.collection('public_products')
                .where('productId', '==', productData.productId)
                .get();
                
            if (!existingPublic.empty) {
                showMessage('message-create', 'error', 'This Product ID is already registered in the public system.');
                return;
            }

            // 2. Save to Private Collection
            // Note: productData includes 'quantity', so it appears in stock immediately
            await db.collection('products').add(productData);

            // 3. Save to Public Collection
            const publicData = {
                productName: productData.productName,
                productId: productData.productId, // Custom SKU
                vatType: productData.vatType,
                manufacturerId: userId,
                registeredAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('public_products').add(publicData);
            
            showMessage('message-create', 'success', `Product created with ${productData.quantity} initial stock!`);
            form.reset();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            console.error('Error creating product:', error);
            showMessage('message-create', 'error', 'Failed to create product: ' + error.message);
        }
    });
}

// Setup Edit Product Section
function setupEditProductSection(userId) {
    const searchInput = document.getElementById('search-products');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterProducts(e.target.value.toLowerCase());
        });
    }

    const safeAddListener = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    safeAddListener('close-modal', closeEditModal);
    safeAddListener('cancel-edit', closeEditModal);
    
    const editForm = document.getElementById('edit-product-form');
    if (editForm) {
        editForm.addEventListener('submit', handleEditProductSubmit);
    }
}

// Load products list
async function loadProductsList() {
    const productsList = document.getElementById('products-list');
    if (!productsList) return;
    
    const userId = auth.currentUser.uid;
    productsList.innerHTML = '<div class="loading-spinner">Loading products...</div>';

    try {
        let snapshot = await db.collection('products')
            .where('manufacturerId', '==', userId)
            .get();

        if (snapshot.empty) {
            productsList.innerHTML = '<div class="empty-state">No products created yet.</div>';
            return;
        }

        productsList.innerHTML = '';
        
        const products = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        
        // Sort in memory to avoid index requirement errors
        products.sort((a, b) => {
            const dateA = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
            const dateB = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
            return dateB - dateA;
        });
        
        products.forEach(({ id, data }) => {
            productsList.appendChild(createProductCard(id, data));
        });
    } catch (error) {
        console.error('Error loading products:', error);
        productsList.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`;
    }
}

// Create product card
function createProductCard(docId, product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-product-name', (product.productName || '').toLowerCase());
    card.setAttribute('data-product-id', (product.productId || '').toLowerCase());

    card.innerHTML = `
        <div class="product-card-header">
            <h3>${product.productName}</h3>
            <div class="product-card-actions">
                <button class="btn btn-primary btn-sm edit-product-btn" data-doc-id="${docId}">Edit</button>
            </div>
        </div>
        <div class="product-card-details">
            <div class="product-detail-item">
                <strong>ID</strong> ${product.productId}
            </div>
            <div class="product-detail-item">
                <strong>Stock</strong> ${formatCurrency(product.quantity || 0)} ${product.unitOfMeasure}
            </div>
            <div class="product-detail-item">
                <strong>Price</strong> ${formatCurrency(product.unitPrice)} RWF
            </div>
            <div class="product-detail-item">
                <strong>VAT</strong> ${product.vatType}
            </div>
        </div>
    `;

    card.querySelector('.edit-product-btn').addEventListener('click', () => {
        openEditModal(docId, product);
    });

    return card;
}

// Filter products
function filterProducts(searchTerm) {
    const cards = document.querySelectorAll('.product-card');
    cards.forEach(card => {
        const name = card.getAttribute('data-product-name');
        const id = card.getAttribute('data-product-id');
        if (name.includes(searchTerm) || id.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Open edit modal
function openEditModal(docId, product) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal('edit-product-doc-id', docId);
    setVal('edit-product-name', product.productName);
    setVal('edit-product-id', product.productId);
    setVal('edit-unit-of-measure', product.unitOfMeasure);
    setVal('edit-tax-category', product.taxCategory);
    setVal('edit-vat-type', product.vatType);
    setVal('edit-product-category', product.productCategory);
    setVal('edit-item-classification', product.itemClassification);
    setVal('edit-pricing-type', product.pricingType);
    setVal('edit-unit-price', product.unitPrice);
    setVal('edit-product-description', product.description || '');
    setVal('edit-product-quantity', product.quantity || 0);

    document.getElementById('edit-modal').style.display = 'block';
}

// Close edit modal
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('edit-product-form');
    if (form) form.reset();
}

// Handle edit product submit
async function handleEditProductSubmit(e) {
    e.preventDefault();

    const docId = document.getElementById('edit-product-doc-id').value;
    const qtyInput = document.getElementById('edit-product-quantity');
    const newQty = qtyInput ? parseInt(qtyInput.value) : 0;

    const updatedData = {
        productName: document.getElementById('edit-product-name').value.trim(),
        unitOfMeasure: document.getElementById('edit-unit-of-measure').value,
        taxCategory: document.getElementById('edit-tax-category').value,
        vatType: document.getElementById('edit-vat-type').value,
        productCategory: document.getElementById('edit-product-category').value,
        itemClassification: document.getElementById('edit-item-classification').value,
        pricingType: document.getElementById('edit-pricing-type').value,
        unitPrice: parseFloat(document.getElementById('edit-unit-price').value),
        description: document.getElementById('edit-product-description').value.trim(),
        quantity: newQty, // Updates stock
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('products').doc(docId).update(updatedData);
        showMessage('message-edit', 'success', 'Product and stock updated successfully!');
        closeEditModal();
        loadProductsList();
    } catch (error) {
        console.error('Error updating:', error);
        showMessage('message-edit', 'error', 'Failed to update: ' + error.message);
    }
}

function monitorPurchaseRequests(userId) {
    db.collection('purchaseRequests')
        .where('sellerId', '==', userId)
        .where('status', '==', 'pending')
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('request-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        });
}

function showMessage(elementId, type, message) {
    const messageEl = document.getElementById(elementId);
    if (!messageEl) return;
    
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;
    messageEl.style.display = 'block';

    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatCategoryName(str) {
    if (!str) return '';
    return str.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}
