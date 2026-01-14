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

/**
 * 1️⃣ ROLE-BASED ACCESS & UI SETUP
 */
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role;
            
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
            
            // Show Acquired Resources ONLY for manufacturers
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

/**
 * 2️⃣ AUTO-DELETE LOGIC (Enforced for all roles in 'stock' collection)
 * If quantity reaches 0, the product is removed from the inventory.
 */
async function checkAndCleanupStock(docId, data) {
    if (data.quantity <= 0) {
        await db.collection('stock').doc(docId).delete();
        console.log(`Inventory Cleanup: Product ${data.productId} deleted (Quantity: 0)`);
        return true; 
    }
    return false;
}

/**
 * 3️⃣ MERGE & DEDUCTION LOGIC
 * Ensures Product ID consistency across the entire supply chain.
 */
async function processStockTransaction(productData, type = 'buy') {
    // Validation: Enforce required fields and Single Source of Truth ID
    if (!productData.productId || !productData.ownerId) {
        console.error("Transaction Error: Missing Product ID or Owner ID");
        return;
    }

    const stockRef = db.collection('stock');
    const existingQuery = await stockRef
        .where('ownerId', '==', productData.ownerId)
        .where('productId', '==', productData.productId) // Uses the same ID from manufacturer
        .limit(1)
        .get();

    if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const currentQty = existingDoc.data().quantity;
        
        // Deduction (Sell) or Addition (Buy)
        const newQty = (type === 'buy') ? currentQty + productData.quantity : currentQty - productData.quantity;

        if (newQty <= 0) {
            await stockRef.doc(existingDoc.id).delete(); // Auto-delete on zero
        } else {
            await stockRef.doc(existingDoc.id).update({
                quantity: newQty,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } else if (type === 'buy') {
        // Create new entry if it doesn't exist (Only for buying)
        await stockRef.add({
            ...productData,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

/**
 * 4️⃣ DATA LOADING ENGINE
 */
async function loadStock() {
    const tableBody = document.getElementById('stock-body'); 
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" class="loading">Syncing Inventory...</td></tr>';
    
    try {
        stockData = [];
        resourceData = [];
        
        if (userRole === 'manufacturer') {
            await loadManufacturerProduction(); // Items they made (products collection)
            await loadManufacturerResources();   // Items they bought (stock collection)
        } else {
            await loadGenericStock(); // Distributors, Retailers, and Buyers
        }
        
        renderStock(stockData, 'stock-body');
        if (userRole === 'manufacturer') renderStock(resourceData, 'acquired-resources-body', true);

    } catch (error) {
        console.error('Error loading stock:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Failed to load inventory.</td></tr>';
    }
}

async function loadManufacturerProduction() {
    const productsSnapshot = await db.collection('products')
        .where('manufacturerId', '==', currentUser.uid)
        .get();
    
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        stockData.push({ id: doc.id, displayId: product.productId, ...product, purchasedFrom: 'Self' });
    });
}

async function loadManufacturerResources() {
    const resourceSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .where('isResource', '==', true)
        .get();
    
    for (const doc of resourceSnapshot.docs) {
        if (await checkAndCleanupStock(doc.id, doc.data())) continue;
        resourceData.push({ id: doc.id, displayId: doc.data().productId, ...doc.data() });
    }
}

async function loadGenericStock() {
    const stockSnapshot = await db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .get();
    
    for (const doc of stockSnapshot.docs) {
        const data = doc.data();
        if (await checkAndCleanupStock(doc.id, data)) continue; // Enforce delete on zero
        stockData.push({ id: doc.id, displayId: data.productId, ...data });
    }
}

/**
 * 5️⃣ UI RENDERING & UTILITIES
 */
function renderStock(stockArray, targetId, isResource = false) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;
    tbody.innerHTML = stockArray.length === 0 ? '<tr><td colspan="8" style="text-align:center;">No stock available.</td></tr>' : '';

    stockArray.forEach(stock => {
        const row = document.createElement('tr');
        const priceDisplay = stock.sellingPrice ? formatCurrency(stock.sellingPrice) : '<span style="color:orange;">NOT SET</span>';
        
        let actionBtn = `<button class="action-btn" onclick="openPriceModal('${stock.id}')">Set Price</button>`;
        if (isResource || userRole === 'manufacturer') {
            actionBtn = `<button class="action-btn" onclick="openStockModal('${stock.id}', ${stock.quantity})">Update</button>`;
        }

        row.innerHTML = `
            <td><strong>${stock.productName}</strong></td>
            <td>${stock.displayId}</td>
            <td>${stock.quantity}</td>
            <td>${stock.unitOfMeasure || 'units'}</td>
            <td>${getStockBadge(stock.quantity)}</td>
            <td>${formatCurrency(stock.purchasePrice || stock.unitPrice)}</td>
            <td>${isResource ? '-' : priceDisplay}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(row);
    });
}

function getStockBadge(qty) {
    if (qty <= 0) return '<span class="badge badge-out">Out</span>';
    return qty < 10 ? '<span class="badge badge-low">Low</span>' : '<span class="badge badge-ok">OK</span>';
}

function formatCurrency(amt) {
    return new Intl.NumberFormat('en-RW').format(amt || 0) + ' RWF';
}

function setupBackLink() {
    const link = document.querySelector('.back-link');
    const paths = { manufacturer: 'manufacturer.html', distributor: 'distributor.html', retailer: 'retailer.html', buyer: 'buyer.html' };
    if (link && userRole) link.href = paths[userRole] || 'index.html';
}

// ... Existing Price Modal and Search Setup functions from stocck.js ...
function setupSearch() {
    const input = document.getElementById('search-stock');
    if (input) {
        input.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('tbody tr').forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
            });
        };
    }
}

function setupPriceModal() {
    const form = document.getElementById('set-price-form');
    if (form) form.onsubmit = handleSetPrice;
}

async function handleSetPrice(e) {
    e.preventDefault();
    const id = document.getElementById('price-stock-id').value;
    const price = parseFloat(document.getElementById('price-selling-price').value);
    await db.collection('stock').doc(id).update({ sellingPrice: price });
    loadStock();
    document.getElementById('price-modal').style.display = 'none';
}

function updatePriceColumnHeader() {
    const header = document.getElementById('price-column-header');
    if (header) header.textContent = (userRole === 'manufacturer') ? 'Unit Price' : 'Selling Price';
 }