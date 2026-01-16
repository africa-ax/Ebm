
import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userRole = null;

// --- AUTHENTICATION ---
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    currentUser = user;
    await loadUserRole();
    setupEventListeners();
    loadStockData();
});

async function loadUserRole() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            userRole = data.role;
            document.getElementById('user-business-name').textContent = data.businessName || 'User';
            
            // UI Visibility Rules
            if (userRole === 'manufacturer') {
                document.getElementById('raw-materials-section').classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error("Error loading role:", error);
    }
}

// --- CORE STOCK LOGIC (CENTRALIZED) ---

/**
 * Handles the transfer of stock between seller and buyer.
 * Uses a transaction to ensure atomic updates.
 */
async function transferStockOnPurchase(sellerId, buyerId, productId, quantity, purchasePrice, productDetails) {
    const sellerStockRef = db.collection('stock')
        .where('ownerId', '==', sellerId)
        .where('productId', '==', productId)
        .limit(1);

    const buyerStockRef = db.collection('stock')
        .where('ownerId', '==', buyerId)
        .where('productId', '==', productId)
        .limit(1);

    return db.runTransaction(async (transaction) => {
        const sellerSnap = await transaction.get(sellerStockRef);
        const buyerSnap = await transaction.get(buyerStockRef);

        if (sellerSnap.empty) throw new Error("Seller stock not found.");
        
        const sellerDoc = sellerSnap.docs[0];
        const newSellerQty = sellerDoc.data().quantity - quantity;

        // 1. Reduce Seller Stock or Delete if Zero
        if (newSellerQty <= 0) {
            transaction.delete(sellerDoc.ref);
        } else {
            transaction.update(sellerDoc.ref, { 
                quantity: newSellerQty,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // 2. Add or Merge Buyer Stock
        const buyerType = (userRole === 'manufacturer') ? 'raw_material' : 'inventory';
        
        if (!buyerSnap.empty) {
            const buyerDoc = buyerSnap.docs[0];
            transaction.update(buyerDoc.ref, {
                quantity: buyerDoc.data().quantity + quantity,
                purchasePrice: purchasePrice, // Update to latest purchase price
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const newStockDoc = db.collection('stock').doc();
            transaction.set(newStockDoc, {
                ownerId: buyerId,
                productId: productId,
                productName: productDetails.productName,
                unitOfMeasure: productDetails.unitOfMeasure,
                quantity: quantity,
                purchasePrice: purchasePrice,
                sellingPrice: null, // Buyer must set their own selling price
                stockType: buyerType,
                sourceOwnerId: sellerId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

// --- UI DATA LOADING ---

function loadStockData() {
    // Real-time listener for stock
    db.collection('stock')
        .where('ownerId', '==', currentUser.uid)
        .onSnapshot((snapshot) => {
            const inventoryGrid = document.getElementById('inventory-grid');
            const rawGrid = document.getElementById('raw-materials-grid');
            
            inventoryGrid.innerHTML = '';
            rawGrid.innerHTML = '';

            let hasInventory = false;
            let hasRaw = false;

            snapshot.forEach(doc => {
                const item = { id: doc.id, ...doc.data() };
                const card = createStockCard(item);

                if (item.stockType === 'inventory') {
                    inventoryGrid.appendChild(card);
                    hasInventory = true;
                } else if (item.stockType === 'raw_material') {
                    rawGrid.appendChild(card);
                    hasRaw = true;
                }
            });

            if (!hasInventory) inventoryGrid.innerHTML = '<p class="empty-state">No inventory stock available.</p>';
            if (!hasRaw) rawGrid.innerHTML = '<p class="empty-state">No raw materials found.</p>';
        });
}

function createStockCard(item) {
    const div = document.createElement('div');
    div.className = `stock-card ${item.stockType}`;
    
    const sellingPriceText = item.sellingPrice 
        ? `${formatCurrency(item.sellingPrice)} RWF` 
        : '<span style="color:red">Price Not Set</span>';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
            <strong>${item.productName}</strong>
            <span class="badge ${item.stockType === 'inventory' ? 'badge-inventory' : 'badge-raw'}">
                ${item.stockType.replace('_', ' ').toUpperCase()}
            </span>
        </div>
        <div style="font-size: 0.9rem; margin-top:10px;">
            ID: ${item.productId}<br>
            Quantity: <b>${item.quantity} ${item.unitOfMeasure}</b><br>
            Purchase Price: ${formatCurrency(item.purchasePrice)} RWF
        </div>
        <div class="price-input-group">
            <span>Selling: ${sellingPriceText}</span>
            ${item.stockType === 'inventory' ? `<button class="btn-sm" onclick="openPriceModal('${item.id}', '${item.productName}', ${item.sellingPrice || 0})">Edit</button>` : ''}
        </div>
    `;
    return div;
}

// --- PRICE MANAGEMENT ---

window.openPriceModal = (id, name, currentPrice) => {
    document.getElementById('modal-product-name').textContent = name;
    document.getElementById('new-selling-price').value = currentPrice;
    document.getElementById('save-price-btn').onclick = () => updateSellingPrice(id);
    document.getElementById('price-modal').classList.remove('hidden');
};

async function updateSellingPrice(docId) {
    const newPrice = parseFloat(document.getElementById('new-selling-price').value);
    if (isNaN(newPrice) || newPrice < 0) return showToast("Invalid price", "error");

    try {
        await db.collection('stock').doc(docId).update({
            sellingPrice: newPrice,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Price updated successfully", "success");
        closeModal();
    } catch (error) {
        showToast("Update failed", "error");
    }
}

// --- HELPERS & EVENTS ---

function setupEventListeners() {
    document.getElementById('hamburger-btn').addEventListener('click', () => {
        document.getElementById('side-menu').classList.toggle('active');
        document.getElementById('menu-overlay').classList.toggle('active');
    });

    document.getElementById('menu-logout').addEventListener('click', () => auth.signOut());
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    
    document.getElementById('stock-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.stock-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(term) ? 'block' : 'none';
        });
    });
}

function closeModal() {
    document.getElementById('price-modal').classList.add('hidden');
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW').format(amount || 0);
}

function showToast(msg, type) {
    const toast = document.getElementById('message-toast');
    toast.textContent = msg;
    toast.style.backgroundColor = type === 'success' ? '#059669' : '#dc2626';
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
