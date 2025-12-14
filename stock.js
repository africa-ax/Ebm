
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
    const backLink = document.querySelector('.back-link'); // Fixed selector to class if using previous html or id
    const backLinkId = document.getElementById('back-link');
    
    if (backLinkId && userRole) {
        backLinkId.href = dashboards[userRole] || 'index.html';
    } else if (backLink && userRole) {
        backLink.href = dashboards[userRole] || 'index.html';
    }
}

// Update price column header based on role
function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (!header) return;

    if (userRole === 'retailer') {
        header.textContent = 'Selling Price (RWF)';
    } else if (userRole === 'distributor') {
        header.textContent = 'Selling Price (RWF)';
    } else if (userRole === 'manufacturer') {
        header.textContent = 'Unit Price (RWF)';
    }
}

// Load stock based on role
async function loadStock() {
    const tableBody = document.getElementById('stock-body'); // Changed to match updated HTML ID
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading stock...</td></tr>';
    
    try {
        stockData = [];
        
        if (userRole === 'manufacturer') {
            await loadManufacturerStock();
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            await loadBusinessStock();
        } else if (userRole === 'buyer') {
             // Buyers usually use buyer.html, but if they access stock, it shows nothing or buying history
             // Current requirement focuses on Reselling Flow
        }
        
        renderStock(stockData);
    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading stock. Please refresh.</td></tr>';
    }
}

// Load manufacturer stock (Direct from Products Collection)
async function loadManufacturerStock() {
    // Manufacturers see what they CREATED
    const productsSnapshot = await db.collection('products')
        .where('manufacturerId', '==', currentUser.uid)
        .get();
    
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        stockData.push({
            id: doc.id, // Doc ID
            displayId: product.productId, // Custom SKU
            productName: product.productName,
            unitOfMeasure: product.unitOfMeasure,
            quantity: product.quantity || 0,
            unitPrice: product.unitPrice, // Cost/Selling price for them
            sellingPrice: null, // Manufacturers use unitPrice
            purchasedFrom: 'Self-Manufactured'
        });
    });
}

// Load Distributor/Retailer Stock (From Stock Collection)
async function loadBusinessStock() {
    // Distributors/Retailers see what they BOUGHT
    const stockSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .get();
    
    // We use Promise.all to fetch product details efficiently
    const stockPromises = stockSnapshot.docs.map(async (doc) => {
        const stock = doc.data();
        
        // Stock Item Base Data (From seller.js save)
        let item = {
            id: doc.id,
            displayId: stock.sku || stock.productId, // SKU or Doc ID
            productName: stock.productName,
            quantity: stock.quantity || 0,
            unitOfMeasure: stock.unitOfMeasure || 'N/A', // Prioritize saved unit
            purchasePrice: stock.purchasePrice,
            sellingPrice: stock.sellingPrice,
            purchasedFrom: stock.manufacturerName || stock.purchasedFrom || 'Supplier'
        };

        // If unitOfMeasure is missing in stock doc, try to fetch from Products collection
        // This handles older data
        if (!stock.unitOfMeasure && stock.productId) {
            try {
                const productDoc = await db.collection('products').doc(stock.productId).get();
                if (productDoc.exists) {
                    const productData = productDoc.data();
                    item.unitOfMeasure = productData.unitOfMeasure;
                    // Also update display ID if we only had Doc ID before
                    if (!item.displayId || item.displayId === stock.productId) {
                         item.displayId = productData.productId;
                    }
                }
            } catch (err) {
                console.warn('Could not fetch extra product details', err);
            }
        }
        
        return item;
    });

    stockData = await Promise.all(stockPromises);
}

// Render stock table
function renderStock(stockArray) {
    const tbody = document.getElementById('stock-body');
    tbody.innerHTML = '';

    if (stockArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; color: #666;"><div class="empty-icon">📦</div><p>Your stock is empty.</p></td></tr>';
        return;
    }
    
    stockArray.forEach(stock => {
        const row = document.createElement('tr');
        row.dataset.stockId = stock.id;
        
        const sellingPriceText = stock.sellingPrice ? formatCurrency(stock.sellingPrice) : '<span style="color: #ff5722; font-weight: 600;">NOT SET</span>';
        
        // Determine Action Button
        let actionBtn = '<span style="color: #888;">N/A</span>';
        
        // Distributors and Retailers can SET PRICE
        if (userRole === 'distributor' || userRole === 'retailer') {
            actionBtn = `<button class="action-btn btn-set-price" onclick="openPriceModal('${stock.id}')">Set Price</button>`;
        } 
        // Manufacturers Update Quantity via Manufacturer Dashboard, not here usually, 
        // but if they use this view, we could show 'Manage'
        else if (userRole === 'manufacturer') {
             actionBtn = `<span style="color: #667eea;">Manage in Dashboard</span>`;
        }

        row.innerHTML = `
            <td>
                <strong>${stock.productName || 'Unknown Product'}</strong>
                <small style="display: block; color: #888;">From: ${stock.purchasedFrom}</small>
            </td>
            <td>${stock.displayId || 'N/A'}</td>
            <td style="font-weight: bold;">${stock.quantity}</td>
            <td>${stock.unitOfMeasure || 'N/A'}</td> 
            <td class="status-cell">${getStockBadge(stock.quantity)}</td>
            <td>${userRole === 'manufacturer' ? '-' : formatCurrency(stock.purchasePrice)}</td>
            <td>${userRole === 'manufacturer' ? formatCurrency(stock.unitPrice) : sellingPriceText}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(row);
    });
}

// Price setting modal functionality
function setupPriceModal() {
    const closeBtn = document.getElementById('close-price-modal');
    const cancelBtn = document.getElementById('cancel-price');
    const form = document.getElementById('set-price-form');

    if (closeBtn) closeBtn.addEventListener('click', closePriceModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closePriceModal);
    if (form) form.addEventListener('submit', handleSetPrice);
}

// Open modal and populate data
window.openPriceModal = function(stockId) {
    const stock = stockData.find(s => s.id === stockId);
    if (!stock) return;
    
    document.getElementById('price-stock-id').value = stockId;
    document.getElementById('price-product-name').value = stock.productName;
    document.getElementById('price-purchase-price').value = formatCurrency(stock.purchasePrice);
    document.getElementById('price-selling-price').value = stock.sellingPrice || '';
    
    document.getElementById('price-modal').style.display = 'block';
};

// Close modal
function closePriceModal() {
    document.getElementById('price-modal').style.display = 'none';
    document.getElementById('set-price-form').reset();
}

// Handle price submission
async function handleSetPrice(e) {
    e.preventDefault();
    const stockId = document.getElementById('price-stock-id').value;
    const sellingPrice = parseFloat(document.getElementById('price-selling-price').value);

    // Get purchase price raw number (remove commas from formatted string)
    const purchasePriceStr = document.getElementById('price-purchase-price').value.toString().replace(/,/g, '');
    const purchasePrice = parseFloat(purchasePriceStr) || 0;

    if (isNaN(sellingPrice) || sellingPrice < 0) {
        showMessage('Selling price must be a valid positive number.', 'error');
        return;
    }
    
    // Warning if selling below cost (Business Logic)
    if (sellingPrice < purchasePrice) {
         if (!confirm(`Warning: Selling Price (${formatCurrency(sellingPrice)}) is lower than Purchase Price (${formatCurrency(purchasePrice)}). Continue?`)) {
            return;
        }
    }

    try {
        await db.collection('stock').doc(stockId).update({
            sellingPrice: sellingPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Selling price set successfully! Item is now visible to buyers.', 'success');
        closePriceModal();
        loadStock(); // Reload table
    } catch (error) {
        console.error('Error setting price:', error);
        showMessage('Failed to set price', 'error');
    }
}

// Search functionality
function setupSearch() {
    const searchInput = document.getElementById('search-stock');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#stock-body tr');
        
        rows.forEach(row => {
            if (row.cells.length > 1) { 
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            }
        });
    });
}

// Utility functions
function getStockBadge(quantity) {
    if (quantity === 0) {
        return '<span class="badge badge-out" style="background:#f8d7da; color:#721c24; padding:5px; border-radius:4px;">Out of Stock</span>';
    } else if (quantity < 10) {
        return '<span class="badge badge-low" style="background:#fff3cd; color:#856404; padding:5px; border-radius:4px;">Low Stock</span>';
    } else {
        return '<span class="badge badge-ok" style="background:#d4edda; color:#155724; padding:5px; border-radius:4px;">In Stock</span>';
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
    if (messageEl) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 4000);
    } else {
        console.log(`${type.toUpperCase()}: ${text}`);
    }
}
