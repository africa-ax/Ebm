import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userRole = null;
let stockData = [];
let resourceData = []; // New state for acquired resources

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
            updatePriceColumnHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Setup back link
function setupBackLink() {
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html',
        buyer: 'buyer.html'
    };
    const backLinkId = document.getElementById('back-link');
    
    if (backLinkId && userRole) {
        backLinkId.href = dashboards[userRole] || 'index.html';
    }
}

// Update price column header based on role
function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (!header) return;

    if (userRole === 'retailer' || userRole === 'distributor') {
        header.textContent = 'Selling Price (RWF)';
    } else if (userRole === 'manufacturer') {
        header.textContent = 'Unit Price (RWF)';
    }
}

// UPDATED: Load stock with dedicated logic for Manufacturers
async function loadStock() {
    const tableBody = document.getElementById('stock-body'); 
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading inventory...</td></tr>';
    
    try {
        stockData = [];
        resourceData = [];
        
        if (userRole === 'manufacturer') {
            await loadManufacturerStock();
            await loadAcquiredResources(); // New function for raw materials
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            await loadBusinessStock();
        }
        
        renderStock(stockData, 'stock-body');
        
        // Render Acquired Resources section if manufacturer
        if (userRole === 'manufacturer') {
            renderStock(resourceData, 'resources-body', true);
        }
    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading stock.</td></tr>';
    }
}

// Load manufacturer stock (Direct from Products Collection)
async function loadManufacturerStock() {
    const productsSnapshot = await db.collection('products')
        .where('manufacturerId', '==', currentUser.uid)
        .get();
    
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        stockData.push({
            id: doc.id,
            displayId: product.productId,
            productName: product.productName,
            unitOfMeasure: product.unitOfMeasure,
            quantity: product.quantity || 0,
            unitPrice: product.unitPrice,
            isResource: false,
            purchasedFrom: 'Self-Manufactured'
        });
    });
}

// NEW: Load items bought by Manufacturer for internal use
async function loadAcquiredResources() {
    const resourceSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .where('isResource', '==', true) // Filter for materials not for resale
        .get();
    
    const resourcePromises = resourceSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            displayId: data.sku || data.productId,
            productName: data.productName,
            quantity: data.quantity || 0,
            unitOfMeasure: data.unitOfMeasure || 'N/A',
            purchasePrice: data.purchasePrice,
            isResource: true,
            purchasedFrom: data.sellerName || data.purchasedFrom || 'Supplier'
        };
    });

    resourceData = await Promise.all(resourcePromises);
}

// Load Distributor/Retailer Stock
async function loadBusinessStock() {
    const stockSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .get();
    
    const stockPromises = stockSnapshot.docs.map(async (doc) => {
        const stock = doc.data();
        let item = {
            id: doc.id,
            displayId: stock.sku || stock.productId,
            productName: stock.productName,
            quantity: stock.quantity || 0,
            unitOfMeasure: stock.unitOfMeasure || 'N/A',
            purchasePrice: stock.purchasePrice,
            sellingPrice: stock.sellingPrice,
            isResource: false,
            purchasedFrom: stock.sellerName || stock.purchasedFrom || 'Supplier'
        };
        return item;
    });

    stockData = await Promise.all(stockPromises);
}

// UPDATED: Render stock table with logic to disable actions for resources
function renderStock(stockArray, targetId, isResourceTable = false) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (stockArray.length === 0) {
        const colSpan = 8;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; padding: 30px; color: #666;">No items found.</td></tr>`;
        return;
    }
    
    stockArray.forEach(stock => {
        const row = document.createElement('tr');
        
        const sellingPriceText = stock.sellingPrice ? formatCurrency(stock.sellingPrice) : '<span style="color: #ff5722; font-weight: 600;">NOT SET</span>';
        
        // Determine Action Button
        let actionBtn = '<span style="color: #888;">N/A</span>';
        
        // Resource Logic: Resources (Raw materials) cannot be resold, so "Set Price" is hidden
        if (isResourceTable || stock.isResource) {
            actionBtn = `<span class="badge" style="background:#e9ecef; color:#495057;">Internal Use</span>`;
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            actionBtn = `<button class="action-btn btn-set-price" onclick="openPriceModal('${stock.id}')">Set Price</button>`;
        } else if (userRole === 'manufacturer') {
            actionBtn = `<button class="action-btn btn-set-price" onclick="openStockModal('${stock.id}', ${stock.quantity})">Update Stock</button>`;
        }

        row.innerHTML = `
            <td>
                <strong>${stock.productName || 'Unknown'}</strong>
                <small style="display: block; color: #888;">From: ${stock.purchasedFrom}</small>
            </td>
            <td>${stock.displayId || 'N/A'}</td>
            <td style="font-weight: bold;">${stock.quantity}</td>
            <td>${stock.unitOfMeasure || 'N/A'}</td> 
            <td>${getStockBadge(stock.quantity)}</td>
            <td>${stock.purchasePrice ? formatCurrency(stock.purchasePrice) : '-'}</td>
            <td>${isResourceTable ? '-' : (stock.unitPrice ? formatCurrency(stock.unitPrice) : sellingPriceText)}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(row);
    });
}

// Price setting and Stock Update modal logic...
// [Existing code for handleSetPrice, setupPriceModal, openPriceModal, etc. remains the same]

function setupPriceModal() {
    const closeBtn = document.getElementById('close-price-modal');
    const form = document.getElementById('set-price-form');
    if (closeBtn) closeBtn.addEventListener('click', closePriceModal);
    if (form) form.addEventListener('submit', handleSetPrice);
}

window.openPriceModal = function(stockId) {
    const stock = stockData.find(s => s.id === stockId);
    if (!stock) return;
    document.getElementById('price-stock-id').value = stockId;
    document.getElementById('price-product-name').value = stock.productName;
    document.getElementById('price-purchase-price').value = formatCurrency(stock.purchasePrice);
    document.getElementById('price-selling-price').value = stock.sellingPrice || '';
    document.getElementById('price-modal').style.display = 'block';
};

function closePriceModal() {
    document.getElementById('price-modal').style.display = 'none';
}

async function handleSetPrice(e) {
    e.preventDefault();
    const stockId = document.getElementById('price-stock-id').value;
    const sellingPrice = parseFloat(document.getElementById('price-selling-price').value);

    try {
        await db.collection('stock').doc(stockId).update({
            sellingPrice: sellingPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage('Price updated!', 'success');
        closePriceModal();
        loadStock();
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

function setupSearch() {
    const searchInput = document.getElementById('search-stock');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('tbody tr');
        rows.forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    });
}

window.openStockModal = function(id, currentQty) {
    document.getElementById('stock-modal').style.display = 'block';
    document.getElementById('update-stock-id').value = id;
    document.getElementById('new-stock-qty').value = currentQty;
};

const stockForm = document.getElementById('update-stock-form');
if (stockForm) {
    stockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('update-stock-id').value;
        const newQty = parseInt(document.getElementById('new-stock-qty').value);
        try {
            await db.collection('products').doc(id).update({ quantity: newQty });
            showMessage('Stock updated!', 'success');
            document.getElementById('stock-modal').style.display = 'none';
            loadStock();
        } catch (error) {
            showMessage('Update failed.', 'error');
        }
    });
}

function getStockBadge(quantity) {
    if (quantity === 0) return '<span class="badge" style="background:#f8d7da; color:#721c24;">Out of Stock</span>';
    if (quantity < 10) return '<span class="badge" style="background:#fff3cd; color:#856404;">Low Stock</span>';
    return '<span class="badge" style="background:#d4edda; color:#155724;">In Stock</span>';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW', { minimumFractionDigits: 0 }).format(amount || 0);
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
