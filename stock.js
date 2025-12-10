import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userRole = null;
let stockData = [];

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    await loadUserInfo();
    setupBackLink();
    loadStock();
    setupSearch();
    setupPriceModal();
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role;
            
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
            
            const businessName = userData.businessName || userData.fullName || 'User';
            document.getElementById('user-info').textContent = businessName;
            
            // Update price column header based on role
            updatePriceColumnHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Update price column header based on role
function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    switch(userRole) {
        case 'manufacturer':
            header.textContent = 'Unit Price';
            break;
        case 'distributor':
        case 'retailer':
            header.textContent = 'Purchase Price';
            break;
        case 'buyer':
            header.textContent = 'Selling Price';
            break;
    }
}

// Setup back link
function setupBackLink() {
    const backLink = document.getElementById('back-link');
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html',
        buyer: 'buyer.html'
    };
    backLink.href = dashboards[userRole] || 'index.html';
}

// Load stock based on role
async function loadStock() {
    const tableBody = document.getElementById('stock-table-body');
    const emptyState = document.getElementById('empty-state');
    
    tableBody.innerHTML = '<tr><td colspan="3" class="loading">Loading stock...</td></tr>';
    
    try {
        stockData = [];
        
        if (userRole === 'manufacturer') {
            await loadManufacturerStock();
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            await loadBusinessStock();
        } else if (userRole === 'buyer') {
            await loadBuyerStock();
        }
        
        if (stockData.length === 0) {
            tableBody.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            renderStockTable();
        }
    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Error loading stock. Please refresh.</td></tr>';
    }
}

// Load manufacturer stock (directly from products)
async function loadManufacturerStock() {
    const productsSnapshot = await db.collection('products')
        .where('manufacturerId', '==', currentUser.uid)
        .get();
    
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        stockData.push({
            id: doc.id,
            type: 'product',
            productName: product.productName,
            productId: product.productId,
            unitPrice: product.unitPrice,
            quantity: product.quantity || 0,
            unitOfMeasure: product.unitOfMeasure,
            taxCategory: product.taxCategory,
            vatType: product.vatType,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            ...product
        });
    });
}

// Load business stock (distributor/retailer)
async function loadBusinessStock() {
    const stockSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .get();
    
    for (const doc of stockSnapshot.docs) {
        const stock = doc.data();
        
        // Get product details
        const productDoc = await db.collection('products').doc(stock.productId).get();
        const product = productDoc.exists ? productDoc.data() : {};
        
        stockData.push({
            id: doc.id,
            type: 'stock',
            stockId: doc.id,
            productName: product.productName || stock.productName,
            productId: stock.productId,
            purchasePrice: stock.purchasePrice,
            sellingPrice: stock.sellingPrice,
            quantity: stock.quantity || 0,
            unitOfMeasure: product.unitOfMeasure,
            taxCategory: product.taxCategory,
            vatType: product.vatType,
            createdAt: stock.createdAt,
            updatedAt: stock.updatedAt,
            ...product
        });
    }
}

// Load buyer stock (from retailers)
async function loadBuyerStock() {
    // Get all retailer stock with selling prices
    const stockSnapshot = await db.collection('stock')
        .where('sellingPrice', '>', 0)
        .get();
    
    for (const doc of stockSnapshot.docs) {
        const stock = doc.data();
        
        // Only show stock from retailers
        const ownerDoc = await db.collection('users').doc(stock.ownerId).get();
        if (ownerDoc.exists && ownerDoc.data().role === 'retailer') {
            const productDoc = await db.collection('products').doc(stock.productId).get();
            const product = productDoc.exists ? productDoc.data() : {};
            
            stockData.push({
                id: doc.id,
                type: 'stock',
                stockId: doc.id,
                productName: product.productName || stock.productName,
                productId: stock.productId,
                sellingPrice: stock.sellingPrice,
                quantity: stock.quantity || 0,
                retailerId: stock.ownerId,
                retailerName: ownerDoc.data().businessName,
                unitOfMeasure: product.unitOfMeasure,
                ...product
            });
        }
    }
}

// Render stock table
function renderStockTable() {
    const tableBody = document.getElementById('stock-table-body');
    tableBody.innerHTML = '';
    
    stockData.forEach((item, index) => {
        const row = createStockRow(item, index);
        tableBody.appendChild(row);
        
        // Create expanded row
        const expandedRow = createExpandedRow(item, index);
        tableBody.appendChild(expandedRow);
    });
}

// Create stock row
function createStockRow(item, index) {
    const row = document.createElement('tr');
    row.dataset.index = index;
    
    // Product name cell
    const nameCell = document.createElement('td');
    nameCell.innerHTML = `
        <strong>${item.productName}</strong>
        <br>
        <small style="color: #888;">ID: ${item.productId}</small>
    `;
    
    // Price cell
    const priceCell = document.createElement('td');
    priceCell.className = 'price-cell';
    let priceValue = 0;
    
    if (userRole === 'manufacturer') {
        priceValue = item.unitPrice;
    } else if (userRole === 'distributor' || userRole === 'retailer') {
        priceValue = item.purchasePrice;
    } else if (userRole === 'buyer') {
        priceValue = item.sellingPrice;
    }
    
    priceCell.textContent = formatCurrency(priceValue) + ' RWF';
    
    // Action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'action-cell';
    actionCell.innerHTML = '<button class="view-details-btn">View Details</button>';
    
    row.appendChild(nameCell);
    row.appendChild(priceCell);
    row.appendChild(actionCell);
    
    // Click to expand
    row.addEventListener('click', () => toggleExpandedRow(index));
    
    return row;
}

// Create expanded row
function createExpandedRow(item, index) {
    const row = document.createElement('tr');
    row.className = 'expanded-row';
    row.dataset.index = index;
    
    const cell = document.createElement('td');
    cell.colSpan = 3;
    
    const content = document.createElement('div');
    content.className = 'expanded-content';
    
    // Info grid
    const grid = document.createElement('div');
    grid.className = 'expanded-grid';
    
    // Common fields
    grid.innerHTML = `
        <div class="info-item">
            <div class="info-label">Product Name</div>
            <div class="info-value">${item.productName}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Product ID</div>
            <div class="info-value">${item.productId}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Unit of Measure</div>
            <div class="info-value">${item.unitOfMeasure || 'N/A'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Quantity</div>
            <div class="info-value">
                ${item.quantity}
                ${getStockBadge(item.quantity)}
            </div>
        </div>
    `;
    
    // Role-specific fields
    if (userRole === 'manufacturer') {
        grid.innerHTML += `
            <div class="info-item">
                <div class="info-label">Unit Price</div>
                <div class="info-value">${formatCurrency(item.unitPrice)} RWF</div>
            </div>
            <div class="info-item">
                <div class="info-label">Tax Category</div>
                <div class="info-value">${item.taxCategory || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">VAT Type</div>
                <div class="info-value">${item.vatType || 'N/A'}${item.vatType !== 'exempt' ? '%' : ''}</div>
            </div>
        `;
    } else if (userRole === 'distributor' || userRole === 'retailer') {
        grid.innerHTML += `
            <div class="info-item">
                <div class="info-label">Purchase Price</div>
                <div class="info-value">${formatCurrency(item.purchasePrice)} RWF</div>
            </div>
            <div class="info-item">
                <div class="info-label">Selling Price</div>
                <div class="info-value">${item.sellingPrice ? formatCurrency(item.sellingPrice) + ' RWF' : 'Not Set'}</div>
            </div>
        `;
    } else if (userRole === 'buyer') {
        grid.innerHTML += `
            <div class="info-item">
                <div class="info-label">Selling Price</div>
                <div class="info-value">${formatCurrency(item.sellingPrice)} RWF</div>
            </div>
            <div class="info-item">
                <div class="info-label">Retailer</div>
                <div class="info-value">${item.retailerName || 'N/A'}</div>
            </div>
        `;
    }
    
    content.appendChild(grid);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'expanded-actions';
    
    if (userRole === 'manufacturer') {
        actions.innerHTML = `
            <input type="number" class="quantity-input" value="${item.quantity}" min="0" data-id="${item.id}">
            <button class="btn btn-primary btn-sm update-quantity-btn" data-id="${item.id}">Update Quantity</button>
        `;
    } else if ((userRole === 'distributor' || userRole === 'retailer') && !item.sellingPrice) {
        actions.innerHTML = `
            <button class="btn btn-primary set-price-btn" data-stock-id="${item.id}">Set Selling Price</button>
        `;
    }
    
    content.appendChild(actions);
    
    // Setup action handlers
    setTimeout(() => {
        if (userRole === 'manufacturer') {
            const updateBtn = content.querySelector('.update-quantity-btn');
            if (updateBtn) {
                updateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    updateQuantity(item.id);
                });
            }
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            const setPriceBtn = content.querySelector('.set-price-btn');
            if (setPriceBtn) {
                setPriceBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPriceModal(item);
                });
            }
        }
    }, 0);
    
    cell.appendChild(content);
    row.appendChild(cell);
    
    return row;
}

// Toggle expanded row
function toggleExpandedRow(index) {
    const allRows = document.querySelectorAll('.expanded-row');
    const allMainRows = document.querySelectorAll('tbody tr:not(.expanded-row)');
    const expandedRow = document.querySelector(`.expanded-row[data-index="${index}"]`);
    const mainRow = document.querySelector(`tbody tr[data-index="${index}"]`);
    
    // Close all other expanded rows
    allRows.forEach((row, i) => {
        if (i !== index * 2 + 1) {
            row.classList.remove('show');
        }
    });
    
    allMainRows.forEach((row, i) => {
        if (i !== index) {
            row.classList.remove('expanded');
        }
    });
    
    // Toggle current row
    expandedRow.classList.toggle('show');
    mainRow.classList.toggle('expanded');
}

// Update quantity (manufacturer only)
async function updateQuantity(productId) {
    const input = document.querySelector(`.quantity-input[data-id="${productId}"]`);
    const newQuantity = parseInt(input.value);
    
    if (isNaN(newQuantity) || newQuantity < 0) {
        showMessage('Please enter a valid quantity', 'error');
        return;
    }
    
    try {
        await db.collection('products').doc(productId).update({
            quantity: newQuantity,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Quantity updated successfully!', 'success');
        loadStock();
    } catch (error) {
        console.error('Error updating quantity:', error);
        showMessage('Failed to update quantity', 'error');
    }
}

// Price modal functions
function setupPriceModal() {
    document.getElementById('cancel-price').addEventListener('click', closePriceModal);
    document.getElementById('set-price-form').addEventListener('submit', handleSetPrice);
}

function openPriceModal(item) {
    document.getElementById('price-stock-id').value = item.id;
    document.getElementById('price-product-name').value = item.productName;
    document.getElementById('price-purchase-price').value = item.purchasePrice;
    document.getElementById('price-selling-price').value = item.sellingPrice || '';
    document.getElementById('price-modal').style.display = 'block';
}

function closePriceModal() {
    document.getElementById('price-modal').style.display = 'none';
    document.getElementById('set-price-form').reset();
}

async function handleSetPrice(e) {
    e.preventDefault();
    
    const stockId = document.getElementById('price-stock-id').value;
    const sellingPrice = parseFloat(document.getElementById('price-selling-price').value);
    
    try {
        await db.collection('stock').doc(stockId).update({
            sellingPrice: sellingPrice,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Selling price set successfully!', 'success');
        closePriceModal();
        loadStock();
    } catch (error) {
        console.error('Error setting price:', error);
        showMessage('Failed to set price', 'error');
    }
}

// Search functionality
function setupSearch() {
    document.getElementById('search-stock').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('tbody tr:not(.expanded-row)');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}

// Utility functions
function getStockBadge(quantity) {
    if (quantity === 0) {
        return '<span class="badge badge-out">Out of Stock</span>';
    } else if (quantity < 10) {
        return '<span class="badge badge-low">Low Stock</span>';
    } else {
        return '<span class="badge badge-ok">In Stock</span>';
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
    }, 4000);
}