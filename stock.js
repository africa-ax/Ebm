import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userRole = null;
let stockData = [];
let resourceData = [];

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
            
            // Toggle Acquired Resources visibility for Manufacturers
            const resourceSection = document.getElementById('acquired-resources-section');
            if (resourceSection) {
                resourceSection.style.display = (userRole === 'manufacturer') ? 'block' : 'none';
            }
            
            updatePriceColumnHeader();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// 1️⃣ AUTO-DELETE: Cleanup function for zero-quantity items
async function checkAndCleanupStock(docId, data) {
    if (data.quantity <= 0) {
        await db.collection('stock').doc(docId).delete();
        console.log(`Auto-deleted zero quantity item: ${docId}`);
        return true;
    }
    return false;
}

// 2️⃣ MERGING LOGIC: Use this when processing purchases/acquisitions
async function addOrMergeStock(purchaseData) {
    // Validation: Enforce required fields
    if (!purchaseData.productId || purchaseData.quantity <= 0 || !purchaseData.ownerId) {
        console.error("Invalid stock data: Missing Product ID or non-positive quantity");
        return null;
    }

    const stockRef = db.collection('stock');
    
    try {
        // Find existing stock with same productId and ownerId
        const existingQuery = await stockRef
            .where('ownerId', '==', purchaseData.ownerId)
            .where('productId', '==', purchaseData.productId)
            .limit(1)
            .get();

        if (!existingQuery.empty) {
            // Merge: Update existing quantity
            const existingDoc = existingQuery.docs[0];
            const existingData = existingDoc.data();
            const newQuantity = existingData.quantity + purchaseData.quantity;
            
            await stockRef.doc(existingDoc.id).update({
                quantity: newQuantity,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`Merged stock for product ${purchaseData.productId}. New quantity: ${newQuantity}`);
            return existingDoc.id;
        } else {
            // Create new stock entry
            const docRef = await stockRef.add({
                ...purchaseData,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`Created new stock entry for product ${purchaseData.productId}`);
            return docRef.id;
        }
    } catch (error) {
        console.error("Error in addOrMergeStock:", error);
        return null;
    }
}

async function loadStock() {
    const tableBody = document.getElementById('stock-body'); 
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading inventory...</td></tr>';
    
    try {
        stockData = [];
        resourceData = [];
        
        if (userRole === 'manufacturer') {
            await loadManufacturerStock();
            await loadAcquiredResources(); 
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            await loadBusinessStock();
        }
        
        renderStock(stockData, 'stock-body');
        if (userRole === 'manufacturer') {
            renderStock(resourceData, 'resources-body', true);
        }
    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading stock.</td></tr>';
    }
}

async function loadManufacturerStock() {
    const productsSnapshot = await db.collection('products')
        .where('manufacturerId', '==', currentUser.uid)
        .get();
    
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        // Use the manufacturer's productId as the consistent ID
        stockData.push({
            id: doc.id,
            displayId: product.productId || doc.id, // Use productId from manufacturer
            productName: product.productName,
            unitOfMeasure: product.unitOfMeasure,
            quantity: product.quantity || 0,
            unitPrice: product.unitPrice,
            isResource: false,
            purchasedFrom: 'Self-Manufactured',
            productId: product.productId || doc.id // Store the actual product ID
        });
    });
}

async function loadAcquiredResources() {
    const resourceSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .where('isResource', '==', true)
        .get();
    
    for (const doc of resourceSnapshot.docs) {
        const data = doc.data();
        // Trigger Auto-Delete check
        const isDeleted = await checkAndCleanupStock(doc.id, data);
        if (isDeleted) continue;

        resourceData.push({
            id: doc.id,
            displayId: data.productId, // Use the productId from stock
            productName: data.productName,
            quantity: data.quantity || 0,
            unitOfMeasure: data.unitOfMeasure || 'N/A',
            purchasePrice: data.purchasePrice,
            isResource: true,
            purchasedFrom: data.sellerName || 'Supplier',
            productId: data.productId // Store the actual product ID
        });
    }
}

async function loadBusinessStock() {
    const stockSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .get();
    
    for (const doc of stockSnapshot.docs) {
        const data = doc.data();
        // Trigger Auto-Delete check
        const isDeleted = await checkAndCleanupStock(doc.id, data);
        if (isDeleted) continue;

        stockData.push({
            id: doc.id,
            displayId: data.productId, // Use the productId from stock
            productName: data.productName,
            quantity: data.quantity || 0,
            unitOfMeasure: data.unitOfMeasure || 'N/A',
            purchasePrice: data.purchasePrice,
            sellingPrice: data.sellingPrice,
            isResource: false,
            purchasedFrom: data.sellerName || 'Supplier',
            productId: data.productId // Store the actual product ID
        });
    }
}

function renderStock(stockArray, targetId, isResourceTable = false) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (stockArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #666;">No items found.</td></tr>`;
        return;
    }
    
    stockArray.forEach(stock => {
        const row = document.createElement('tr');
        const sellingPriceText = stock.sellingPrice ? formatCurrency(stock.sellingPrice) : '<span style="color: #ff5722; font-weight: 600;">NOT SET</span>';
        
        let actionBtn = '<span style="color: #888;">N/A</span>';
        if (isResourceTable || stock.isResource) {
            actionBtn = `<span class="badge" style="background:#e9ecef; color:#495057;">Internal Use</span>`;
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            actionBtn = `<button class="action-btn btn-set-price" onclick="openPriceModal('${stock.id}')">Set Price</button>`;
        } else if (userRole === 'manufacturer') {
            actionBtn = `<button class="action-btn btn-set-price" onclick="openStockModal('${stock.id}', ${stock.quantity}, '${stock.productId || stock.id}')">Update Stock</button>`;
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

// Add this function for instant stock updates when distributor/retailer buys
async function updateStockAfterPurchase(purchaseData) {
    try {
        // For distributor/retailer: Add to their stock
        if (userRole === 'distributor' || userRole === 'retailer') {
            const stockEntry = {
                productId: purchaseData.productId, // Use the manufacturer's productId
                productName: purchaseData.productName,
                quantity: purchaseData.quantity,
                unitOfMeasure: purchaseData.unitOfMeasure,
                purchasePrice: purchaseData.unitPrice, // Buying price
                ownerId: currentUser.uid,
                sellerId: purchaseData.sellerId,
                sellerName: purchaseData.sellerName,
                isResource: false,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await addOrMergeStock(stockEntry);
            
            // For manufacturer: Deduct from their stock
            if (purchaseData.sellerId) {
                // Find the manufacturer's product document
                const manufacturerProducts = await db.collection('products')
                    .where('manufacturerId', '==', purchaseData.sellerId)
                    .where('productId', '==', purchaseData.productId)
                    .limit(1)
                    .get();
                
                if (!manufacturerProducts.empty) {
                    const manufacturerDoc = manufacturerProducts.docs[0];
                    const manufacturerProduct = manufacturerDoc.data();
                    const newQuantity = manufacturerProduct.quantity - purchaseData.quantity;
                    
                    // Update manufacturer's stock
                    await db.collection('products').doc(manufacturerDoc.id).update({
                        quantity: Math.max(0, newQuantity), // Prevent negative stock
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    console.log(`Manufacturer stock updated: ${purchaseData.productId} - New quantity: ${newQuantity}`);
                }
            }
            
            // Reload stock to show updates
            loadStock();
            return true;
        }
    } catch (error) {
        console.error('Error updating stock after purchase:', error);
        return false;
    }
}

// Modal and Form Handlers
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

const stockForm = document.getElementById('update-stock-form');
if (stockForm) {
    stockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('update-stock-id').value;
        const newQty = parseInt(document.getElementById('new-stock-qty').value);
        const productId = document.getElementById('update-product-id').value;
        
        try {
            // Update the quantity in products collection
            await db.collection('products').doc(id).update({ 
                quantity: newQty,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Also update in stock collection if it exists (for consistency)
            const stockQuery = await db.collection('stock')
                .where('ownerId', '==', currentUser.uid)
                .where('productId', '==', productId)
                .limit(1)
                .get();
            
            if (!stockQuery.empty) {
                const stockDoc = stockQuery.docs[0];
                await db.collection('stock').doc(stockDoc.id).update({
                    quantity: newQty,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            showMessage('Stock updated!', 'success');
            document.getElementById('stock-modal').style.display = 'none';
            loadStock();
        } catch (error) {
            showMessage('Update failed: ' + error.message, 'error');
        }
    });
}

// Utility Functions
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

window.openStockModal = function(id, currentQty, productId) {
    document.getElementById('stock-modal').style.display = 'block';
    document.getElementById('update-stock-id').value = id;
    document.getElementById('new-stock-qty').value = currentQty;
    document.getElementById('update-product-id').value = productId || '';
};

function getStockBadge(quantity) {
    if (quantity <= 0) return '<span class="badge" style="background:#f8d7da; color:#721c24;">Out of Stock</span>';
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

function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (!header) return;
    header.textContent = (userRole === 'manufacturer') ? 'Unit Price (RWF)' : 'Selling Price (RWF)';
}

function setupBackLink() {
    const dashboards = { manufacturer: 'manufacturer.html', distributor: 'distributor.html', retailer: 'retailer.html', buyer: 'buyer.html' };
    const backLink = document.getElementById('back-link');
    if (backLink && userRole) backLink.href = dashboards[userRole] || 'index.html';
}

// Export the updateStockAfterPurchase function for use in other files
window.updateStockAfterPurchase = updateStockAfterPurchase;
window.addOrMergeStock = addOrMergeStock;

// Also, make sure to add this hidden input to your stock.html modal:
// <input type="hidden" id="update-product-id" value="">
```
