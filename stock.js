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
    await loadStock(); // Added await
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
        showMessage('Error loading user information', 'error');
    }
}

// 1️⃣ AUTO-DELETE: Cleanup function for zero-quantity items
async function checkAndCleanupStock(docId, data) {
    try {
        if (data.quantity <= 0) {
            await db.collection('stock').doc(docId).delete();
            console.log(`Auto-deleted zero quantity item: ${docId}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error in checkAndCleanupStock:', error);
        return false;
    }
}

// 2️⃣ MERGING LOGIC: Use this when processing purchases/acquisitions
async function addOrMergeStock(purchaseData) {
    try {
        // Validation: Enforce required fields
        if (!purchaseData.productId || purchaseData.quantity <= 0 || !purchaseData.ownerId) {
            console.error("Invalid stock data:", purchaseData);
            return null;
        }

        const stockRef = db.collection('stock');
        
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
    if (!tableBody) {
        console.error('Stock table body not found');
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="8" class="loading">Loading inventory...</td></tr>';
    
    try {
        stockData = [];
        resourceData = [];
        
        console.log('Loading stock for user role:', userRole);
        
        if (userRole === 'manufacturer') {
            await loadManufacturerStock();
            await loadAcquiredResources(); 
        } else if (userRole === 'distributor' || userRole === 'retailer') {
            await loadBusinessStock();
        } else {
            console.warn('Unknown user role:', userRole);
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Unknown user role</td></tr>';
            return;
        }
        
        console.log('Stock data loaded:', stockData.length, 'items');
        console.log('Resource data loaded:', resourceData.length, 'items');
        
        renderStock(stockData, 'stock-body');
        if (userRole === 'manufacturer') {
            renderStock(resourceData, 'resources-body', true);
        }
    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading stock: ' + error.message + '</td></tr>';
    }
}

async function loadManufacturerStock() {
    try {
        const productsSnapshot = await db.collection('products')
            .where('manufacturerId', '==', currentUser.uid)
            .get();
        
        console.log('Manufacturer products found:', productsSnapshot.size);
        
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            // Use the manufacturer's productId as the consistent ID
            stockData.push({
                id: doc.id,
                displayId: product.productId || doc.id, // Use productId from manufacturer
                productName: product.productName || 'Unnamed Product',
                unitOfMeasure: product.unitOfMeasure || 'N/A',
                quantity: product.quantity || 0,
                unitPrice: product.unitPrice || 0,
                isResource: false,
                purchasedFrom: 'Self-Manufactured',
                productId: product.productId || doc.id // Store the actual product ID
            });
        });
    } catch (error) {
        console.error('Error loading manufacturer stock:', error);
        throw error;
    }
}

async function loadAcquiredResources() {
    try {
        const resourceSnapshot = await db.collection('stock')
            .where('ownerId', '==', currentUser.uid)
            .where('isResource', '==', true)
            .get();
        
        console.log('Manufacturer resources found:', resourceSnapshot.size);
        
        for (const doc of resourceSnapshot.docs) {
            const data = doc.data();
            // Trigger Auto-Delete check
            const isDeleted = await checkAndCleanupStock(doc.id, data);
            if (isDeleted) continue;

            resourceData.push({
                id: doc.id,
                displayId: data.productId || doc.id, // Use the productId from stock
                productName: data.productName || 'Unknown Resource',
                quantity: data.quantity || 0,
                unitOfMeasure: data.unitOfMeasure || 'N/A',
                purchasePrice: data.purchasePrice || 0,
                isResource: true,
                purchasedFrom: data.sellerName || 'Supplier',
                productId: data.productId || doc.id // Store the actual product ID
            });
        }
    } catch (error) {
        console.error('Error loading acquired resources:', error);
        throw error;
    }
}

async function loadBusinessStock() {
    try {
        const stockSnapshot = await db.collection('stock')
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        console.log('Business stock found:', stockSnapshot.size);
        
        for (const doc of stockSnapshot.docs) {
            const data = doc.data();
            // Trigger Auto-Delete check
            const isDeleted = await checkAndCleanupStock(doc.id, data);
            if (isDeleted) continue;

            stockData.push({
                id: doc.id,
                displayId: data.productId || doc.id, // Use the productId from stock
                productName: data.productName || 'Unknown Product',
                quantity: data.quantity || 0,
                unitOfMeasure: data.unitOfMeasure || 'N/A',
                purchasePrice: data.purchasePrice || 0,
                sellingPrice: data.sellingPrice || 0,
                isResource: data.isResource || false,
                purchasedFrom: data.sellerName || 'Supplier',
                productId: data.productId || doc.id // Store the actual product ID
            });
        }
    } catch (error) {
        console.error('Error loading business stock:', error);
        throw error;
    }
}

function renderStock(stockArray, targetId, isResourceTable = false) {
    const tbody = document.getElementById(targetId);
    if (!tbody) {
        console.error('Target table body not found:', targetId);
        return;
    }
    
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
                <strong>${stock.productName}</strong>
                <small style="display: block; color: #888;">From: ${stock.purchasedFrom}</small>
            </td>
            <td>${stock.displayId}</td>
            <td style="font-weight: bold;">${stock.quantity}</td>
            <td>${stock.unitOfMeasure}</td> 
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
        console.log('Updating stock after purchase:', purchaseData);
        
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
                isResource: false
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
            await loadStock();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error updating stock after purchase:', error);
        showMessage('Error updating stock: ' + error.message, 'error');
        return false;
    }
}

// Modal and Form Handlers
async function handleSetPrice(e) {
    e.preventDefault();
    const stockId = document.getElementById('price-stock-id').value;
    const sellingPrice = parseFloat(document.getElementById('price-selling-price').value);

    if (!stockId || isNaN(sellingPrice)) {
        showMessage('Please enter a valid price', 'error');
        return;
    }

    try {
        await db.collection('stock').doc(stockId).update({
            sellingPrice: sellingPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage('Price updated!', 'success');
        closePriceModal();
        await loadStock();
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
        
        if (!id || isNaN(newQty)) {
            showMessage('Please enter valid values', 'error');
            return;
        }
        
        try {
            // Update the quantity in products collection
            await db.collection('products').doc(id).update({ 
                quantity: newQty,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Also update in stock collection if it exists (for consistency)
            if (productId) {
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
            }
            
            showMessage('Stock updated!', 'success');
            document.getElementById('stock-modal').style.display = 'none';
            await loadStock();
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
    if (!stock) {
        showMessage('Stock item not found', 'error');
        return;
    }
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
    if (productId) {
        document.getElementById('update-product-id').value = productId;
    }
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
    } else {
        console.log(`${type}: ${text}`);
    }
}

function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (!header) return;
    header.textContent = (userRole === 'manufacturer') ? 'Unit Price (RWF)' : 'Selling Price (RWF)';
}

function setupBackLink() {
    const dashboards = { 
        manufacturer: 'manufacturer.html', 
        distributor: 'distributor.html', 
        retailer: 'retailer.html', 
        buyer: 'buyer.html' 
    };
    const backLink = document.getElementById('back-link');
    if (backLink && userRole) {
        backLink.href = dashboards[userRole] || 'index.html';
    }
}

// Export the updateStockAfterPurchase function for use in other files
window.updateStockAfterPurchase = updateStockAfterPurchase;
window.addOrMergeStock = addOrMergeStock;
window.loadStock = loadStock; // Export for manual reloading if needed
```