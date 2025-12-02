import firebaseConfig from '../firebase-config.js';
import { sendInvoice } from '../ebm/ebmInterface.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

let currentUser = null;
let saleCart = [];
let productsListener = null;

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
  if (!userDoc.exists || userDoc.data().role !== 'retailer') {
    showMessage('Access denied. Retailer only.', 'error');
    await auth.signOut();
    window.location.href = 'auth.html';
    return;
  }
  
  currentUser = userDoc.data();
  document.getElementById('user-info').textContent = currentUser.businessName;
  loadProducts();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'auth.html';
});

// Load products with real-time listener
function loadProducts() {
  if (productsListener) {
    productsListener();
  }
  
  const searchTerm = document.getElementById('search-products').value.toLowerCase();
  
  let query = db.collection('stock')
    .where('ownerTIN', '==', currentUser.businessTIN);
  
  productsListener = query.onSnapshot(async (snapshot) => {
    const productsList = document.getElementById('products-list');
    productsList.innerHTML = '<p>Loading...</p>';
    
    const products = [];
    
    for (const doc of snapshot.docs) {
      const stockData = doc.data();
      if (stockData.quantity > 0) {
        const productDoc = await db.collection('products').doc(stockData.productId).get();
        
        if (productDoc.exists) {
          const productData = productDoc.data();
          products.push({
            stockId: doc.id,
            productId: stockData.productId,
            productName: productData.name,
            unit: productData.unit,
            price: stockData.sellingPrice,
            quantity: stockData.quantity,
            taxCategory: productData.taxCategory,
            ebmProductCode: productData.ebmProductCode
          });
        }
      }
    }
    
    // Filter by search term
    let filteredProducts = products;
    if (searchTerm) {
      filteredProducts = products.filter(p => 
        p.productName.toLowerCase().includes(searchTerm)
      );
    }
    
    productsList.innerHTML = '';
    
    if (filteredProducts.length === 0) {
      productsList.innerHTML = '<p class="empty-state">No products available</p>';
      return;
    }
    
    filteredProducts.forEach(product => {
      const productCard = document.createElement('div');
      productCard.className = 'product-tile';
      productCard.innerHTML = `
        <h4>${product.productName}</h4>
        <p class="price">${product.price} RWF</p>
        <p class="stock">Stock: ${product.quantity} ${product.unit}</p>
        <button class="btn btn-primary btn-sm" onclick="addToSale('${product.stockId}', '${product.productId}', '${product.productName}', '${product.unit}', ${product.price}, ${product.quantity}, '${product.taxCategory}', '${product.ebmProductCode}')">
          Add to Sale
        </button>
      `;
      productsList.appendChild(productCard);
    });
  });
}

// Search products
document.getElementById('search-products').addEventListener('input', () => {
  loadProducts();
});

// Add to sale
window.addToSale = (stockId, productId, productName, unit, price, maxQty, taxCategory, ebmProductCode) => {
  const existingItem = saleCart.find(item => item.productId === productId);
  
  if (existingItem) {
    if (existingItem.quantity >= maxQty) {
      showMessage(`Cannot add more than ${maxQty} items`, 'error');
      return;
    }
    existingItem.quantity += 1;
    existingItem.total = existingItem.quantity * existingItem.price;
  } else {
    saleCart.push({
      stockId,
      productId,
      productName,
      unit,
      quantity: 1,
      price,
      total: price,
      taxCategory,
      ebmProductCode
    });
  }
  
  updateSaleDisplay();
};

// Update sale display
function updateSaleDisplay() {
  const saleItems = document.getElementById('sale-items');
  const saleSubtotal = document.getElementById('sale-subtotal');
  const saleVat = document.getElementById('sale-vat');
  const saleTotal = document.getElementById('sale-total');
  
  if (saleCart.length === 0) {
    saleItems.innerHTML = '<p class="empty-state">No items in current sale</p>';
    saleSubtotal.textContent = '0 RWF';
    saleVat.textContent = '0 RWF';
    saleTotal.textContent = '0 RWF';
    return;
  }
  
  saleItems.innerHTML = '';
  let subtotal = 0;
  let vatAmount = 0;
  
  saleCart.forEach((item, index) => {
    subtotal += item.total;
    
    // Calculate VAT based on tax category
    if (item.taxCategory === 'A') {
      vatAmount += item.total * 0.18;
    }
    
    const saleItem = document.createElement('div');
    saleItem.className = 'sale-item';
    saleItem.innerHTML = `
      <div class="sale-item-details">
        <strong>${item.productName}</strong>
        <p>${item.quantity} ${item.unit} × ${item.price} RWF = ${item.total.toFixed(2)} RWF</p>
      </div>
      <div class="sale-item-actions">
        <button class="btn btn-sm" onclick="decrementSaleItem(${index})">-</button>
        <span>${item.quantity}</span>
        <button class="btn btn-sm" onclick="incrementSaleItem(${index})">+</button>
        <button class="btn btn-danger btn-sm" onclick="removeSaleItem(${index})">×</button>
      </div>
    `;
    saleItems.appendChild(saleItem);
  });
  
  const total = subtotal + vatAmount;
  
  saleSubtotal.textContent = subtotal.toFixed(2) + ' RWF';
  saleVat.textContent = vatAmount.toFixed(2) + ' RWF';
  saleTotal.textContent = total.toFixed(2) + ' RWF';
}

// Increment sale item
window.incrementSaleItem = async (index) => {
  const item = saleCart[index];
  const stockDoc = await db.collection('stock').doc(item.stockId).get();
  const stockData = stockDoc.data();
  
  if (item.quantity >= stockData.quantity) {
    showMessage('Cannot exceed available stock', 'error');
    return;
  }
  
  item.quantity += 1;
  item.total = item.quantity * item.price;
  updateSaleDisplay();
};

// Decrement sale item
window.decrementSaleItem = (index) => {
  const item = saleCart[index];
  
  if (item.quantity <= 1) {
    removeSaleItem(index);
    return;
  }
  
  item.quantity -= 1;
  item.total = item.quantity * item.price;
  updateSaleDisplay();
};

// Remove sale item
window.removeSaleItem = (index) => {
  saleCart.splice(index, 1);
  updateSaleDisplay();
};

// Clear sale
document.getElementById('clear-sale-btn').addEventListener('click', () => {
  if (saleCart.length === 0) return;
  
  if (confirm('Clear all items from current sale?')) {
    saleCart = [];
    updateSaleDisplay();
  }
});

// Complete sale
document.getElementById('complete-sale-btn').addEventListener('click', async () => {
  if (saleCart.length === 0) {
    showMessage('No items in sale', 'error');
    return;
  }
  
  if (!confirm('Complete this sale?')) return;
  
  try {
    await db.runTransaction(async (transaction) => {
      // Reduce stock for each item
      for (const item of saleCart) {
        const stockRef = db.collection('stock').doc(item.stockId);
        const stockDoc = await transaction.get(stockRef);
        
        if (!stockDoc.exists) {
          throw new Error(`Stock not found for ${item.productName}`);
        }
        
        const stockData = stockDoc.data();
        
        if (stockData.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${item.productName}`);
        }
        
        transaction.update(stockRef, {
          quantity: stockData.quantity - item.quantity,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      
      // Create invoice
      let subtotal = 0;
      let vatAmount = 0;
      
      const invoiceItems = saleCart.map(item => {
        subtotal += item.total;
        
        if (item.taxCategory === 'A') {
          vatAmount += item.total * 0.18;
        }
        
        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          taxCategory: item.taxCategory,
          ebmProductCode: item.ebmProductCode,
          total: item.total
        };
      });
      
      const totalAmount = subtotal + vatAmount;
      
      const invoiceRef = db.collection('invoices').doc();
      const invoiceData = {
        sellerTIN: currentUser.businessTIN,
        sellerName: currentUser.businessName,
        buyerTIN: 'N/A',
        buyerName: 'Walk-in Customer',
        customerType: 'walk-in',
        items: invoiceItems,
        subtotal: subtotal,
        vat: vatAmount,
        totalAmount: totalAmount,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        ebmStatus: 'pending',
        ebmResponse: null
      };
      
      transaction.set(invoiceRef, invoiceData);
      
      return { invoiceRef, invoiceData };
    });
    
    // Get the created invoice and send to EBM
    const invoicesQuery = await db.collection('invoices')
      .where('sellerTIN', '==', currentUser.businessTIN)
      .where('customerType', '==', 'walk-in')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (!invoicesQuery.empty) {
      const invoiceDoc = invoicesQuery.docs[0];
      const invoiceData = invoiceDoc.data();
      
      // Send to EBM
      const ebmResponse = await sendInvoice(invoiceData);
      
      // Update invoice with EBM response
      await db.collection('invoices').doc(invoiceDoc.id).update({
        ebmStatus: ebmResponse.success ? 'success' : 'failed',
        ebmResponse: ebmResponse
      });
      
      showMessage(`Sale completed! Invoice: ${ebmResponse.invoiceNumber}`, 'success');
    } else {
      showMessage('Sale completed!', 'success');
    }
    
    saleCart = [];
    updateSaleDisplay();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});