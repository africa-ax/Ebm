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
            
            // The dashboard does not have a general user-info field, but we keep this for consistency if it's used elsewhere
            const businessName = userData.businessName || userData.fullName || 'User';
            // document.getElementById('user-info').textContent = businessName; 
            
            // Update price column header based on role
            updatePriceColumnHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Setup back link dynamically
function setupBackLink() {
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html'
    };
    const backLink = document.querySelector('.back-link');
    if (backLink && userRole) {
        backLink.href = dashboards[userRole] || 'index.html';
    }
}

// Update price column header based on role
function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (header) {
        if (userRole === 'retailer') {
            header.textContent = 'Selling Price (RWF)';
        } else {
            // Distributors or manufacturers (if they use this page) might just see it as Cost
            header.textContent = 'Transfer/Selling Price (RWF)';
        }
    }
}

// Load stock from Firestore
async function loadStock() {
    try {
        showMessage('Loading stock...', 'info');
        
        // Load only stock items owned by the current user
        const stockSnapshot = await db.collection('stock')
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        stockData = [];
        for (const doc of stockSnapshot.docs) {
            const stock = doc.data();
            // The seller.js fix ensures:
            // stock.productId = Firestore Document ID
            // stock.sku = Product SKU
            // stock.unitOfMeasure is present
            
            stockData.push({ id: doc.id, ...stock });
        }
        
        showMessage(`Loaded ${stockData.length} stock items.`, 'success');
        renderStock(stockData);
    } catch (error) {
        console.error('Error loading stock:', error);
        showMessage('Failed to load stock. Please check permissions.', 'error');
    }
}

// Render stock to the table
function renderStock(stockArray) {
    const tbody = document.getElementById('stock-body');
    tbody.innerHTML = '';

    if (stockArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; color: #666;"><div class="empty-icon">📦</div><p>Your stock is empty. Purchase from a supplier!</p></td></tr>';
        return;
    }
    
    stockArray.forEach(stock => {
        const row = document.createElement('tr');
        row.dataset.stockId = stock.id;
        
        // Use stock.sku if available, otherwise fallback to stock.productId (Firestore Doc ID)
        const displayId = stock.sku || stock.productId || 'N/A';
        const sellingPriceText = stock.sellingPrice ? formatCurrency(stock.sellingPrice) : '<span style="color: #ff5722; font-weight: 600;">NOT SET</span>';
        
        row.innerHTML = `
            <td>
                <strong>${stock.productName || 'N/A'}</strong>
                <small style="display: block; color: #888;">From: ${stock.purchasedFrom || 'N/A'}</small>
            </td>
            <td>${displayId}</td>
            <td style="font-weight: bold;">${stock.quantity || 0}</td>
            
            <td>${stock.unitOfMeasure || 'N/A'}</td> 
            
            <td class="status-cell">${getStockBadge(stock.quantity || 0)}</td>
            <td>${formatCurrency(stock.purchasePrice)}</td>
            <td>${sellingPriceText}</td>
            <td>
                ${userRole === 'retailer' ? 
                    `<button class="action-btn btn-set-price" onclick="openPriceModal('${stock.id}')">Set Price</button>` :
                    '<span style="color: #888;">N/A</span>'
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Price setting modal functionality
function setupPriceModal() {
    document.getElementById('close-price-modal').addEventListener('click', closePriceModal);
    document.getElementById('cancel-price').addEventListener('click', closePriceModal);
    document.getElementById('set-price-form').addEventListener('submit', handleSetPrice);
}

// Open modal and populate data
window.openPriceModal = function(stockId) {
    const stock = stockData.find(s => s.id === stockId);
    if (!stock) return;
    
    document.getElementById('price-stock-id').value = stockId;
    document.getElementById('price-product-name').value = stock.productName;
    document.getElementById('price-purchase-price').value = formatCurrency(stock.purchasePrice);
    
    // Set the current price or leave empty for a new price
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
    
    // We must parse the purchase price string from the disabled field back to a number
    const purchasePriceString = document.getElementById('price-purchase-price').value.replace(/,/g, ''); 
    const purchasePrice = parseFloat(purchasePriceString);
    
    const sellingPrice = parseFloat(document.getElementById('price-selling-price').value);

    if (isNaN(sellingPrice) || sellingPrice < 0) {
        showMessage('Selling price must be a valid positive number.', 'error');
        return;
    }
    
    // Optional: Add a check to prevent selling below cost
    if (sellingPrice < purchasePrice) {
         if (!confirm(`Warning: Your selling price (${formatCurrency(sellingPrice)} RWF) is below your purchase price (${formatCurrency(purchasePrice)} RWF). Do you want to continue?`)) {
            return;
        }
    }

    try {
        await db.collection('stock').doc(stockId).update({
            sellingPrice: sellingPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Selling price set successfully!', 'success');
        closePriceModal();
        loadStock(); // Reload to update the table
    } catch (error) {
        console.error('Error setting price:', error);
        showMessage('Failed to set price', 'error');
    }
}

// Search functionality
function setupSearch() {
    document.getElementById('search-stock').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const tbody = document.getElementById('stock-body');
        const rows = tbody.querySelectorAll('tr');
        
        rows.forEach(row => {
            // Check if it's a data row, not an empty state row
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
