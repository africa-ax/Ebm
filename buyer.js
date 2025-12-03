import firebaseConfig from './firebase-config.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

let currentUser = null;
let cart = [];
let currentSellerTIN = null;
let currentSellerName = null;
let sellerStockListener = null;
let requestsListener = null;
let myStockListener = null;

// Show message
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 5000);
}

// Auth check
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }
  
  const userDoc = await db.collection('users').doc(user.uid).get();
  if (!userDoc.exists) {
    await auth.signOut();
    window.location.href = 'auth.html';
    return;
  }
  
  currentUser = userDoc.data();
  document.getElementById('user-info').textContent = currentUser.businessName;
  loadSellers();
  loadMyRequests();
  loadMyStock();
  updateCartDisplay();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'auth.html';
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
  });
});

// Load sellers
async function loadSellers() {
  const searchTerm = document.getElementById('search-sellers').value.toLowerCase();
  
  try {
    const sellersSnapshot = await db.collection('users')
      .where('role', 'in', ['manufacturer', 'distributor', 'retailer'])
      .get();
    
    const sellersList = document.getElementById('sellers-list');
    sellersList.innerHTML = '';
    
    let sellers = [];
    sellersSnapshot.forEach((doc) => {
      const seller = doc.data();
      if (seller.businessTIN !== currentUser.businessTIN) {
        sellers.push(seller);
      }
    });
    
    // Filter by search term
    if (searchTerm) {
      sellers = sellers.filter(s => 
        s.businessName.toLowerCase().includes(searchTerm) ||
        s.businessTIN.includes(searchTerm)
      );
    }
    
    if (sellers.length === 0) {
      sellersList.innerHTML = '<p class="empty-state">No sellers found</p>';
      return;
    }
    
    sellers.forEach(seller => {
      const sellerCard = document.createElement('div');
      sellerCard.className = 'seller-card';
      sellerCard.innerHTML = `
        <div class="seller-header">
          <h3>${seller.businessName}</h3>
          <span class="badge">${seller.role}</span>
        </div>
        <div class="seller-details">
          <p><strong>TIN:</strong> ${seller.businessTIN}</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="viewSellerStock('${seller.businessTIN}', '${seller.businessName}')">
          View Products
        </button>
      `;
      sellersList.appendChild(sellerCard);
    });
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

// Search sellers
document.getElementById('search-sellers').addEventListener('input', () => {
  loadSellers();
});

// View seller stock
window.viewSellerStock = (sellerTIN, sellerName) => {
  currentSellerTIN = sellerTIN;
  currentSellerName = sellerName;
  
  document.getElementById('seller-name').textContent = `${sellerName} - Products`;
  document.getElementById('seller-stock-modal').style.display = 'block';
  
  loadSellerStock();
};

// Load seller stock with real-time listener
function loadSellerStock() {
  if (sellerStockListener) {
    sellerStockListener();
  }
  
  const searchTerm = document.getElementById('search-seller-stock').value.toLowerCase();
  
  let query = db.collection('stock')
    .where('ownerTIN', '==', currentSellerTIN);
  
  sellerStockListener = query.onSnapshot(async (snapshot) => {
    const stockList = document.getElementById('seller-stock-list');
    stockList.innerHTML = '<p>Loading...</p>';
    
    const stockItems = [];
    
    for (const doc of snapshot.docs) {
      const stockData = doc.data();
      if (stockData.quantity > 0) {
        const productDoc = await db.collection('products').doc(stockData.productId).get();
        
        if (productDoc.exists) {
          const productData = productDoc.data();
          stockItems.push({
            ...stockData,
            productId: stockData.productId,
            productName:productName: productData.name,
            unit: productData.unit,
            taxCategory: productData.taxCategory,
            ebmProductCode: productData.ebmProductCode
          });
        }
      }
    }
    
    // Filter by search term
    let filteredStock = stockItems;
    if (searchTerm) {
      filteredStock = stockItems.filter(s => 
        s.productName.toLowerCase().includes(searchTerm)
      );
    }
    
    stockList.innerHTML = '';
    
    if (filteredStock.length === 0) {
      stockList.innerHTML = '<p class="empty-state">No products available</p>';
      return;
    }
    
    filteredStock.forEach(stock => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card';
      productCard.innerHTML = `
        <div class="product-header">
          <h3>${stock.productName}</h3>
          <span class="badge">${stock.unit}</span>
        </div>
        <div class="product-details">
          <p><strong>Price:</strong> ${stock.sellingPrice} RWF per ${stock.unit}</p>
          <p><strong>Available:</strong> ${stock.quantity} ${stock.unit}</p>
        </div>
        <div class="product-actions">
          <input type="number" id="qty-${stock.productId}" min="1" max="${stock.quantity}" value="1" class="qty-input">
          <button class="btn btn-primary btn-sm" onclick="addToCart('${stock.productId}', '${stock.productName}', '${stock.unit}', ${stock.sellingPrice}, ${stock.quantity}, '${stock.taxCategory}', '${stock.ebmProductCode}')">
            Add to Cart
          </button>
        </div>
      `;
      stockList.appendChild(productCard);
    });
  });
}

// Search seller stock
document.getElementById('search-seller-stock').addEventListener('input', () => {
  loadSellerStock();
});

// Add to cart
window.addToCart = (productId, productName, unit, price, maxQty, taxCategory, ebmProductCode) => {
  const qtyInput = document.getElementById(`qty-${productId}`);
  const quantity = parseInt(qtyInput.value);
  
  if (quantity < 1 || quantity > maxQty) {
    showMessage(`Please enter a quantity between 1 and ${maxQty}`, 'error');
    return;
  }
  
  // Check if product already in cart
  const existingItem = cart.find(item => item.productId === productId);
  
  if (existingItem) {
    if (existingItem.quantity + quantity > maxQty) {
      showMessage(`Cannot add more than ${maxQty} items`, 'error');
      return;
    }
    existingItem.quantity += quantity;
    existingItem.total = existingItem.quantity * existingItem.pricePerUnit;
  } else {
    cart.push({
      productId,
      productName,
      unit,
      quantity,
      pricePerUnit: price,
      total: quantity * price,
      taxCategory,
      ebmProductCode
    });
  }
  
  updateCartDisplay();
  showMessage('Added to cart!', 'success');
};

// Update cart display
function updateCartDisplay() {
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  const cartCount = document.getElementById('cart-count');
  
  cartCount.textContent = cart.length;
  
  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="empty-state">Your cart is empty</p>';
    cartTotal.textContent = '0';
    return;
  }
  
  cartItems.innerHTML = '';
  let total = 0;
  
  cart.forEach((item, index) => {
    total += item.total;
    
    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';
    cartItem.innerHTML = `
      <div class="cart-item-details">
        <h4>${item.productName}</h4>
        <p>${item.quantity} ${item.unit} × ${item.pricePerUnit} RWF = ${item.total.toFixed(2)} RWF</p>
      </div>
      <div class="cart-item-actions">
        <input type="number" value="${item.quantity}" min="1" class="qty-input" onchange="updateCartItemQty(${index}, this.value)">
        <button class="btn btn-danger btn-sm" onclick="removeFromCart(${index})">Remove</button>
      </div>
    `;
    cartItems.appendChild(cartItem);
  });
  
  cartTotal.textContent = total.toFixed(2);
}

// Update cart item quantity
window.updateCartItemQty = (index, newQty) => {
  const quantity = parseInt(newQty);
  if (quantity < 1) {
    showMessage('Quantity must be at least 1', 'error');
    return;
  }
  
  cart[index].quantity = quantity;
  cart[index].total = quantity * cart[index].pricePerUnit;
  updateCartDisplay();
};

// Remove from cart
window.removeFromCart = (index) => {
  cart.splice(index, 1);
  updateCartDisplay();
  showMessage('Item removed from cart', 'success');
};

// Submit purchase request
document.getElementById('submit-request-btn').addEventListener('click', async () => {
  if (cart.length === 0) {
    showMessage('Your cart is empty', 'error');
    return;
  }
  
  if (!currentSellerTIN || !currentSellerName) {
    showMessage('Seller information missing', 'error');
    return;
  }
  
  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  
  const requestData = {
    buyerTIN: currentUser.businessTIN,
    buyerName: currentUser.businessName,
    sellerTIN: currentSellerTIN,
    sellerName: currentSellerName,
    status: 'pending',
    items: cart.map(item => ({
      productId: item.productId,
      productName: item.productName,
      unit: item.unit,
      quantity: item.quantity,
      sellerPrice: item.pricePerUnit,
      totalCost: item.total,
      taxCategory: item.taxCategory,
      ebmProductCode: item.ebmProductCode
    })),
    totalAmount: totalAmount,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection('purchaseRequests').add(requestData);
    showMessage('Purchase request submitted successfully!', 'success');
    cart = [];
    currentSellerTIN = null;
    currentSellerName = null;
    updateCartDisplay();
    document.getElementById('seller-stock-modal').style.display = 'none';
    
    // Switch to requests tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="requests"]').classList.add('active');
    document.getElementById('requests-tab').classList.add('active');
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Load my purchase requests with real-time listener
function loadMyRequests() {
  if (requestsListener) {
    requestsListener();
  }
  
  const filterStatus = document.getElementById('filter-my-status').value;
  
  let query = db.collection('purchaseRequests')
    .where('buyerTIN', '==', currentUser.businessTIN)
    .orderBy('createdAt', 'desc');
  
  requestsListener = query.onSnapshot((snapshot) => {
    const requestsList = document.getElementById('my-requests-list');
    requestsList.innerHTML = '';
    
    let requests = [];
    snapshot.forEach((doc) => {
      requests.push({ id: doc.id, ...doc.data() });
    });
    
    // Filter by status
    if (filterStatus !== 'all') {
      requests = requests.filter(r => r.status === filterStatus);
    }
    
    if (requests.length === 0) {
      requestsList.innerHTML = '<p class="empty-state">No purchase requests found</p>';
      return;
    }
    
    requests.forEach(request => {
      const statusClass = request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning';
      const requestCard = document.createElement('div');
      requestCard.className = 'request-card';
      requestCard.innerHTML = `
        <div class="request-header">
          <h3>Request to ${request.sellerName}</h3>
          <span class="badge badge-${statusClass}">${request.status.toUpperCase()}</span>
        </div>
        <div class="request-details">
          <p><strong>Seller TIN:</strong> ${request.sellerTIN}</p>
          <p><strong>Items:</strong> ${request.items.length}</p>
          <p><strong>Total Amount:</strong> ${request.totalAmount.toFixed(2)} RWF</p>
          <p><strong>Date:</strong> ${request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
        </div>
        <div class="request-items">
          <strong>Items:</strong>
          <ul>
            ${request.items.map(item => `<li>${item.productName}: ${item.quantity} ${item.unit} @ ${item.sellerPrice} RWF</li>`).join('')}
          </ul>
        </div>
      `;
      requestsList.appendChild(requestCard);
    });
  });
}

// Filter my requests
document.getElementById('filter-my-status').addEventListener('change', () => {
  loadMyRequests();
});

// Load my stock with real-time listener
function loadMyStock() {
  if (myStockListener) {
    myStockListener();
  }
  
  const searchTerm = document.getElementById('search-my-stock').value.toLowerCase();
  
  let query = db.collection('stock')
    .where('ownerTIN', '==', currentUser.businessTIN);
  
  myStockListener = query.onSnapshot(async (snapshot) => {
    const stockList = document.getElementById('my-stock-list');
    stockList.innerHTML = '<p>Loading...</p>';
    
    const stockItems = [];
    
    for (const doc of snapshot.docs) {
      const stockData = doc.data();
      const productDoc = await db.collection('products').doc(stockData.productId).get();
      
      if (productDoc.exists) {
        const productData = productDoc.data();
        stockItems.push({
          id: doc.id,
          ...stockData,
          productName: productData.name,
          unit: productData.unit
        });
      }
    }
    
    // Filter by search term
    let filteredStock = stockItems;
    if (searchTerm) {
      filteredStock = stockItems.filter(s => 
        s.productName.toLowerCase().includes(searchTerm)
      );
    }
    
    stockList.innerHTML = '';
    
    if (filteredStock.length === 0) {
      stockList.innerHTML = '<p class="empty-state">No stock items found</p>';
      return;
    }
    
    filteredStock.forEach(stock => {
      const stockCard = document.createElement('div');
      stockCard.className = 'stock-card';
      stockCard.innerHTML = `
        <div class="stock-header">
          <h3>${stock.productName}</h3>
          <span class="badge">${stock.unit}</span>
        </div>
        <div class="stock-details">
          <p><strong>Quantity:</strong> ${stock.quantity}</p>
          <p><strong>Cost Price:</strong> ${stock.costPrice} RWF</p>
          <p><strong>Selling Price:</strong> ${stock.sellingPrice} RWF</p>
        </div>
      `;
      stockList.appendChild(stockCard);
    });
  });
}

// Search my stock
document.getElementById('search-my-stock').addEventListener('input', () => {
  loadMyStock();
});

// Modal controls
document.querySelectorAll('.close').forEach(closeBtn => {
  closeBtn.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
    if (sellerStockListener) {
      sellerStockListener();
      sellerStockListener = null;
    }
  });
});

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
    if (sellerStockListener) {
      sellerStockListener();
      sellerStockListener = null;
    }
  }
});
