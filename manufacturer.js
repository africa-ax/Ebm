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
    // setupPublicProductForm(userId); // REMOVED: No longer needed, as product creation is now immediately public
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

    // Removed: Public Product Menu Item as per user request to eliminate double work
    // document.getElementById('menu-public-product').addEventListener('click', () => {
    //     showSection('public-product-section');
    //     closeMenu();
    // });

    document.getElementById('menu-edit-product').addEventListener('click', () => {
        showSection('edit-product-section');
        loadProductsList();
        closeMenu();
    });
    
    document.getElementById('menu-requests').addEventListener('click', () => {
        showSection('requests-section');
        loadPurchaseRequests();
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
    
    document.getElementById('buy-btn').addEventListener('click', () => {
        window.location.href = 'buyer.html';
    });

    // Back buttons
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        showSection('dashboard-view');
    });

    // Removed: Back button for public section as per user request
    // document.getElementById('back-to-dashboard-public').addEventListener('click', () => {
    //     showSection('dashboard-view');
    // });

    document.getElementById('back-to-dashboard-edit').addEventListener('click', () => {
        showSection('dashboard-view');
    });
    
    document.getElementById('back-to-dashboard-requests').addEventListener('click', () => {
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

// Setup Create Product Form (Existing - Full Details)
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
            quantity: 0, // Default quantity is 0, can be updated in stock
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

            // Create product (This product is now immediately available/public)
            await db.collection('products').add(productData);
            
            showMessage('message-create', 'success', 'Product created successfully and is now public! You can set the quantity in the Stock section.');
            form.reset();
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            console.error('Error creating product:', error);
            showMessage('message-create', 'error', 'Failed to create product. Please try again.');
        }
    });
}

// Removed: setupPublicProductForm function (implementation is not provided, but the call is removed).

// Setup Edit Product Section (Modal and List)
function setupEditProductSection(userId) {
    const productsList = document.getElementById('products-list');
    const editModal = document.getElementById('edit-product-modal');
    const editForm = document.getElementById('edit-product-form');
    const closeBtn = document.querySelector('.edit-modal .close');
    const cancelBtn = document.getElementById('cancel-edit');

    // Close Modal listeners
    closeBtn.addEventListener('click', closeEditModal);
    cancelBtn.addEventListener('click', closeEditModal);
    window.addEventListener('click', (event) => {
        if (event.target == editModal) {
            closeEditModal();
        }
    });

    // Edit form submission
    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        updateProduct();
    });
    
    // List setup and loading is done in loadProductsList()
}

// Function to open the edit modal
function openEditModal(productData) {
    document.getElementById('edit-doc-id').value = productData.id;
    document.getElementById('edit-product-name').value = productData.data.productName || '';
    document.getElementById('edit-product-id').value = productData.data.productId || '';
    document.getElementById('edit-unit-of-measure').value = productData.data.unitOfMeasure || '';
    document.getElementById('edit-tax-category').value = productData.data.taxCategory || '';
    document.getElementById('edit-vat-type').value = productData.data.vatType || '';
    document.getElementById('edit-product-category').value = productData.data.productCategory || '';
    document.getElementById('edit-item-classification').value = productData.data.itemClassification || '';
    document.getElementById('edit-pricing-type').value = productData.data.pricingType || '';
    document.getElementById('edit-unit-price').value = productData.data.unitPrice || 0;
    document.getElementById('edit-product-description').value = productData.data.description || '';

    document.getElementById('edit-product-modal').style.display = 'block';
}

// Function to close the edit modal
function closeEditModal() {
    document.getElementById('edit-product-modal').style.display = 'none';
    document.getElementById('message-edit').style.display = 'none';
}

// Load and display products list
async function loadProductsList() {
    const userId = auth.currentUser.uid;
    const productsList = document.getElementById('products-list');
    
    try {
        const snapshot = await db.collection('products')
            .where('manufacturerId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        productsList.innerHTML = '';

        // Convert to array and sort manually if needed
        const products = [];
        snapshot.forEach((doc) => {
            products.push({ id: doc.id, data: doc.data() });
        });

        // Sort by createdAt manually (newest first)
        products.sort((a, b) => {
            const timeA = a.data.createdAt?.toMillis() || 0;
            const timeB = b.data.createdAt?.toMillis() || 0;
            return timeB - timeA;
        });

        // Create cards
        products.forEach(({ id, data }) => {
            const productCard = createProductCard(id, data);
            productsList.appendChild(productCard);
        });

        if (products.length === 0) {
            productsList.innerHTML = '<p class="text-center">No products found. Use the "Create New Product" menu item to add one.</p>';
        }

    } catch (error) {
        console.error('Error loading products:', error);
        productsList.innerHTML = '<p class="text-center error">Failed to load products. Please check console for details.</p>';
    }
}

// Create HTML card for a product
function createProductCard(docId, data) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    // Format Price
    const formattedPrice = formatCurrency(data.unitPrice);
    const categoryName = formatCategoryName(data.productCategory || 'N/A');

    card.innerHTML = `
        <div class="product-card-header">
            <h3>${data.productName}</h3>
            <div class="product-card-actions">
                <button class="btn btn-sm btn-edit" data-id="${docId}">Edit</button>
                <button class="btn btn-sm btn-danger" data-id="${docId}">Delete</button>
            </div>
        </div>
        <div class="product-card-details">
            <div><strong>Product ID:</strong> <span>${data.productId}</span></div>
            <div><strong>Category:</strong> <span>${categoryName}</span></div>
            <div><strong>UoM:</strong> <span>${data.unitOfMeasure}</span></div>
            <div><strong>Price:</strong> <span>${formattedPrice} RWF</span></div>
            <div><strong>VAT Type:</strong> <span>${data.vatType}%</span></div>
            <div><strong>Stock Quantity:</strong> <span>${data.quantity || 0}</span></div>
        </div>
        <p class="product-description">${data.description || 'No description provided.'}</p>
    `;

    // Add event listeners for actions
    card.querySelector('.btn-edit').addEventListener('click', () => {
        openEditModal({ id: docId, data });
    });
    
    card.querySelector('.btn-danger').addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete product: ${data.productName}? This action cannot be undone.`)) {
            deleteProduct(docId);
        }
    });

    return card;
}

// Delete product
async function deleteProduct(docId) {
    try {
        await db.collection('products').doc(docId).delete();
        showMessage('message-edit', 'success', 'Product deleted successfully!');
        loadProductsList();
    } catch (error) {
        console.error('Error deleting product:', error);
        showMessage('message-edit', 'error', 'Failed to delete product. Please try again.');
    }
}

// Update product
async function updateProduct() {
    const docId = document.getElementById('edit-doc-id').value;
    
    const updatedData = {
        productName: document.getElementById('edit-product-name').value.trim(),
        // productId cannot be changed
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

function loadPurchaseRequests() {
    // Placeholder function to avoid breaking manufacturer.js, actual implementation would go here
    console.log("Loading purchase requests...");
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