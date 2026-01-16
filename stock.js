/**
 * STOCK UI - READ AND DISPLAY ONLY
 * NO Firestore writes allowed
 * All modifications go through stock.service.js
 */

import firebaseConfig from './firebase-config.js';
import { getOwnerStock, updateSellingPrice } from './services/stock.service.js';

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentUserRole = null;

// Auth check
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }

  currentUser = user;
  await loadUserInfo(user.uid);
  initializeStockPage();
});

async function loadUserInfo(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      currentUserRole = userData.role;
      document.getElementById('user-business-name').textContent = 
        userData.businessName || 'Business';
    }
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

function initializeStockPage() {
  setupBackButton();
  loadStockDisplay();
  setupPriceUpdateModal();
}

function setupBackButton() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const rolePages = {
        'manufacturer': 'manufacturer.html',
        'distributor': 'distributor.html',
        'retailer': 'retailer.html'
      };
      window.location.href = rolePages[currentUserRole] || 'index.html';
    });
  }
}

async function loadStockDisplay() {
  const inventorySection = document.getElementById('inventory-section');
  const rawMaterialsSection = document.getElementById('raw-materials-section');

  if (!currentUser) return;

  try {
    // Show appropriate sections based on role
    if (currentUserRole === 'manufacturer') {
      // Manufacturers see BOTH sections
      inventorySection.style.display = 'block';
      rawMaterialsSection.style.display = 'block';
      
      await loadInventoryStock();
      await loadRawMaterialsStock();
    } else {
      // Distributors and Retailers see ONLY inventory
      inventorySection.style.display = 'block';
      rawMaterialsSection.style.display = 'none';
      
      await loadInventoryStock();
    }
  } catch (error) {
    console.error('Error loading stock:', error);
    showMessage('error', 'Failed to load stock: ' + error.message);
  }
}

async function loadInventoryStock() {
  const inventoryList = document.getElementById('inventory-list');
  if (!inventoryList) return;

  inventoryList.innerHTML = '<div class="loading">Loading inventory...</div>';

  try {
    const inventoryStock = await getOwnerStock(currentUser.uid, 'inventory');

    if (inventoryStock.length === 0) {
      inventoryList.innerHTML = '<div class="empty-state">No inventory stock available</div>';
      return;
    }

    inventoryList.innerHTML = '';
    inventoryStock.forEach(stock => {
      inventoryList.appendChild(createStockCard(stock, 'inventory'));
    });
  } catch (error) {
    console.error('Error loading inventory:', error);
    inventoryList.innerHTML = '<div class="error-state">Error loading inventory</div>';
  }
}

async function loadRawMaterialsStock() {
  const rawMaterialsList = document.getElementById('raw-materials-list');
  if (!rawMaterialsList) return;

  rawMaterialsList.innerHTML = '<div class="loading">Loading raw materials...</div>';

  try {
    const rawMaterialsStock = await getOwnerStock(currentUser.uid, 'raw_material');

    if (rawMaterialsStock.length === 0) {
      rawMaterialsList.innerHTML = '<div class="empty-state">No raw materials in stock</div>';
      return;
    }

    rawMaterialsList.innerHTML = '';
    rawMaterialsStock.forEach(stock => {
      rawMaterialsList.appendChild(createStockCard(stock, 'raw_material'));
    });
  } catch (error) {
    console.error('Error loading raw materials:', error);
    rawMaterialsList.innerHTML = '<div class="error-state">Error loading raw materials</div>';
  }
}

function createStockCard(stock, stockType) {
  const card = document.createElement('div');
  card.className = 'stock-card';

  const totalValue = stock.quantity * (stock.sellingPrice || stock.purchasePrice);
  const priceDisplay = stockType === 'inventory' && stock.sellingPrice !== null
    ? formatCurrency(stock.sellingPrice)
    : formatCurrency(stock.purchasePrice);

  const priceLabel = stockType === 'inventory' 
    ? (stock.sellingPrice !== null ? 'Selling Price' : 'Cost Price (Set Selling Price)')
    : 'Purchase Price';

  const setPriceBtn = stockType === 'inventory' && stock.sellingPrice === null
    ? `<button class="btn btn-warning btn-sm set-price-btn" data-stock-id="${stock.id}">Set Price</button>`
    : '';

  const updatePriceBtn = stockType === 'inventory' && stock.sellingPrice !== null
    ? `<button class="btn btn-primary btn-sm update-price-btn" data-stock-id="${stock.id}">Update Price</button>`
    : '';

  card.innerHTML = `
    <div class="stock-card-header">
      <h3>${stock.productName}</h3>
      <span class="stock-badge ${stockType === 'inventory' ? 'badge-inventory' : 'badge-raw'}">${formatStockType(stockType)}</span>
    </div>
    <div class="stock-details">
      <div class="stock-detail-row">
        <span class="label">Product ID:</span>
        <span class="value">${stock.productId}</span>
      </div>
      <div class="stock-detail-row">
        <span class="label">Quantity:</span>
        <span class="value quantity-value">${formatQuantity(stock.quantity)} ${stock.unitOfMeasure}</span>
      </div>
      <div class="stock-detail-row">
        <span class="label">${priceLabel}:</span>
        <span class="value">${priceDisplay} RWF</span>
      </div>
      <div class="stock-detail-row">
        <span class="label">Total Value:</span>
        <span class="value total-value">${formatCurrency(totalValue)} RWF</span>
      </div>
    </div>
    <div class="stock-actions">
      ${setPriceBtn}
      ${updatePriceBtn}
    </div>
  `;

  // Attach event listeners
  const setPriceButton = card.querySelector('.set-price-btn');
  if (setPriceButton) {
    setPriceButton.addEventListener('click', () => openPriceModal(stock));
  }

  const updatePriceButton = card.querySelector('.update-price-btn');
  if (updatePriceButton) {
    updatePriceButton.addEventListener('click', () => openPriceModal(stock));
  }

  return card;
}

function setupPriceUpdateModal() {
  const modal = document.getElementById('price-modal');
  const closeBtn = document.getElementById('close-price-modal');
  const cancelBtn = document.getElementById('cancel-price-btn');
  const form = document.getElementById('price-update-form');

  if (closeBtn) {
    closeBtn.addEventListener('click', closePriceModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closePriceModal);
  }

  if (form) {
    form.addEventListener('submit', handlePriceUpdate);
  }
}

function openPriceModal(stock) {
  const modal = document.getElementById('price-modal');
  const productNameEl = document.getElementById('price-modal-product-name');
  const stockIdInput = document.getElementById('price-modal-stock-id');
  const sellingPriceInput = document.getElementById('selling-price-input');

  if (productNameEl) productNameEl.textContent = stock.productName;
  if (stockIdInput) stockIdInput.value = stock.id;
  if (sellingPriceInput) {
    sellingPriceInput.value = stock.sellingPrice || '';
    sellingPriceInput.focus();
  }

  if (modal) modal.style.display = 'block';
}

function closePriceModal() {
  const modal = document.getElementById('price-modal');
  const form = document.getElementById('price-update-form');
  
  if (modal) modal.style.display = 'none';
  if (form) form.reset();
}

async function handlePriceUpdate(e) {
  e.preventDefault();

  const stockId = document.getElementById('price-modal-stock-id').value;
  const sellingPrice = parseFloat(document.getElementById('selling-price-input').value);

  if (isNaN(sellingPrice) || sellingPrice < 0) {
    showMessage('error', 'Please enter a valid price');
    return;
  }

  try {
    await updateSellingPrice({ stockId, sellingPrice });
    showMessage('success', 'Selling price updated successfully');
    closePriceModal();
    await loadInventoryStock(); // Refresh display
  } catch (error) {
    console.error('Error updating price:', error);
    showMessage('error', 'Failed to update price: ' + error.message);
  }
}

function formatStockType(type) {
  return type === 'inventory' ? 'Inventory' : 'Raw Material';
}

function formatQuantity(qty) {
  return new Intl.NumberFormat('en-RW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(qty);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-RW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

function showMessage(type, message) {
  const messageEl = document.getElementById('message');
  if (!messageEl) return;

  messageEl.className = `message ${type}`;
  messageEl.textContent = message;
  messageEl.style.display = 'block';

  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 5000);
}