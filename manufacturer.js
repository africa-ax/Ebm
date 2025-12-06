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

    hamburgerBtn.addEventListener('click', () => {
        sideMenu.classList.toggle('active');
        menuOverlay.classList.toggle('active');
    });

    menuOverlay.addEventListener('click', () => {
        sideMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    });
}

// Setup navigation
function setupNavigation() {
    // Menu items
    document.getElementById('menu-create-product').addEventListener('click', () => {
        showSection('create-product-section');
        closeMenu();
    });

    document.getElementById('menu-edit-product').addEventListener('click', () => {
        showSection('edit-product-section');
        loadProductsList();
        closeMenu();
    });

    document.getElementById('menu-logout').addEventListener('click', async () => {
        if (confirm('Are you sure you want to logout?')) {
            await auth.signOut();
            window.location.href = 'auth.html';
        }
    });

    // Dashboard action buttons
    document.getElementById('stock-btn').addEventListener('click', () => {
        window.location.href = 'stock.html';
    });

    document.getElementById('sell-btn').addEventListener('click', () => {
        window.location.href = 'seller.html';
    });

    // Back buttons
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        showSection('dashboard-view');
    });

    document.getElementById('back-to-dashboard-edit').addEventListener('click', () => {
        showSection('dashboard-view');
    });
}

// Close menu
function closeMenu() {
    document.getElementById('side-menu').classList.remove('active');
    document.getElementById('menu-overlay').classList.remove('active');
}

// Show section
function showSection(sectionId) {
    // Hide all sections
    document.getElementById('dashboard-view').style.display = 'none';
    document.querySelectorAll('.section-container').forEach(section => {
        section.classList.remove('active');
    });

    // Show requested section
    if (sectionId === 'dashboard-view') {
        document.getElementById('dashboard-view').style.display = 'block';
    } else {
        document.getElementById(sectionId).classList.add('active');
    }
}

// Setup Create Product Form
function setupCreateProductForm(userId) {
    const form = document.getElementById('create-product-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const productData = {
            productName: document.getElementById('product-name').value.trim(),
            productId: document.getElementById('product-id').value.trim(),
            unitOfMeasure: document.getElementById('unit-of-measure').value,
            taxCategory: document.getElementById('tax-category').value,
            vatType: document.getElementById('vat-type').value,
            productCategory: document.getElementById('product-category').value,
            itemClassification: document.getElementById('item-classification').value,
            pricingType: document.getElementById('pricing-type').value,
            unitPrice: parseFloat(document.getElementById('unit-price').value),
            description: document.getElementById('product-description').value.trim(),
            manufacturerId: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            // Check if product ID already exists
            const existingProduct = await db.collection('products')
                .where('productId', '==', productData.productId)
                .where('manufacturerId', '==', userId)
                .get();

            if (!existingProduct.empty) {
                showMessage('message-create', 'error', 'Product ID already exists. Please use a unique ID.');
                return;
            }

            // Create product
            await db.collection('products').add(productData);
            
            showMessage('message-create', 'success', 'Product created successfully!');
            form.reset();
            
            // Scroll to top to see message
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            console.error('Error creating product:', error);
            showMessage('message-create', 'error', 'Failed to create product. Please try again.');
        }
    });
}

// Setup Edit Product Section
function setupEditProductSection(userId) {
    // Search functionality
    const searchInput = document.getElementById('search-products');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterProducts(searchTerm);
    });

    // Modal controls
    document.getElementById('close-modal').addEventListener('click', closeEditModal);
    document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
    
    // Edit form submission
    document.getElementById('edit-product-form').addEventListener('submit', handleEditProductSubmit);
}

// Load products list
async function loadProductsList() {
    const productsList = document.getElementById('products-list');
    const userId = auth.currentUser.uid;

    productsList.innerHTML = '<div class="loading-spinner">Loading products...</div>';

    try {
        const snapshot = await db.collection('products')
            .where('manufacturerId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            productsList.innerHTML = '<div class="empty-state">No products created yet. Create your first product!</div>';
            return;
        }

        productsList.innerHTML = '';
        snapshot.forEach((doc) => {
            const product = doc.data();
            const productCard = createProductCard(doc.id, product);
            productsList.appendChild(productCard);
        });
    } catch (error) {
        console.error('Error loading products:', error);
        productsList.innerHTML = '<div class="empty-state">Error loading products. Please refresh.</div>';
    }
}

// Create product card
function createProductCard(docId, product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-product-name', product.productName.toLowerCase());
    card.setAttribute('data-product-id', product.productId.toLowerCase());

    card.innerHTML = `
        <div class="product-card-header">
            <h3>${product.productName}</h3>
            <div class="product-card-actions">
                <button class="btn btn-primary btn-sm edit-product-btn" data-doc-id="${docId}">Edit</button>
            </div>
        </div>
        <div class="product-card-details">
            <div class="product-detail-item">
                <strong>Product ID</strong>
                ${product.productId}
            </div>
            <div class="product-detail-item">
                <strong>Unit Price</strong>
                ${formatCurrency(product.unitPrice)} RWF
            </div>
            <div class="product-detail-item">
                <strong>Unit of Measure</strong>
                ${product.unitOfMeasure}
            </div>
            <div class="product-detail-item">
                <strong>VAT Type</strong>
                ${product.vatType}${product.vatType !== 'exempt' ? '%' : ''}
            </div>
            <div class="product-detail-item">
                <strong>Tax Category</strong>
                ${product.taxCategory}
            </div>
            <div class="product-detail-item">
                <strong>Category</strong>
                ${formatCategoryName(product.productCategory)}
            </div>
            <div class="product-detail-item">
                <strong>Classification</strong>
                ${formatCategoryName(product.itemClassification)}
            </div>
            <div class="product-detail-item">
                <strong>Pricing Type</strong>
                ${formatCategoryName(product.pricingType)}
            </div>
        </div>
        ${product.description ? `<p style="margin-top: 15px; color: #666; font-size: 14px; font-style: italic;">${product.description}</p>` : ''}
    `;

    // Add edit button listener
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
    document.getElementById('edit-product-doc-id').value = docId;
    document.getElementById('edit-product-name').value = product.productName;
    document.getElementById('edit-product-id').value = product.productId;
    document.getElementById('edit-unit-of-measure').value = product.unitOfMeasure;
    document.getElementById('edit-tax-category').value = product.taxCategory;
    document.getElementById('edit-vat-type').value = product.vatType;
    document.getElementById('edit-product-category').value = product.productCategory;
    document.getElementById('edit-item-classification').value = product.itemClassification;
    document.getElementById('edit-pricing-type').value = product.pricingType;
    document.getElementById('edit-unit-price').value = product.unitPrice;
    document.getElementById('edit-product-description').value = product.description || '';

    document.getElementById('edit-modal').style.display = 'block';
}

// Close edit modal
function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('edit-product-form').reset();
}

// Handle edit product submit
async function handleEditProductSubmit(e) {
    e.preventDefault();

    const docId = document.getElementById('edit-product-doc-id').value;
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
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('products').doc(docId).update(updatedData);
        showMessage('message-edit', 'success', 'Product updated successfully!');
        closeEditModal();
        loadProductsList();
        
        // Scroll to top to see message
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error updating product:', error);
        showMessage('message-edit', 'error', 'Failed to update product. Please try again.');
    }
}

// Monitor purchase requests for badge
function monitorPurchaseRequests(userId) {
    db.collection('purchaseRequests')
        .where('sellerId', '==', userId)
        .where('status', '==', 'pending')
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('request-badge');
            
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }, (error) => {
            console.error('Error monitoring requests:', error);
        });
}

// Utility Functions
function showMessage(elementId, type, message) {
    const messageEl = document.getElementById(elementId);
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
    return str.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}