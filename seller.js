import firebaseConfig from '../firebase-config.js';
import { sendInvoice } from '../ebm/ebmInterface.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

let currentUser = null;
let stockListener = null;
let requestsListener = null;
let currentRequestId = null;

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
  loadStock();
  loadRequests();
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

// Load stock with real-time listener
function loadStock() {
  if (stockListener) {
    stockListener();
  }
  
  const searchTerm = document.getElementById('search-stock').value.toLowerCase();
  
  let query = db.collection('stock')
    .where('ownerTIN', '==', currentUser.businessTIN);
  
  stockListener = query.onSnapshot(async (snapshot) => {
    const stockList = document.getElementById('stock-list');
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
          <p><strong>Margin:</strong> ${((stock.sellingPrice - stock.costPrice) / stock.costPrice * 100).toFixed(2)}%</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="editStock('${stock.id}', '${stock.productId}', '${stock.productName}', ${stock.quantity}, ${stock.costPrice}, ${stock.sellingPrice})">
          Update Price
        </button>
      `;
      stockList.appendChild(stockCard);
    });
  });
}

// Search stock
document.getElementById('search-stock').addEventListener('input', () => {
  loadStock();
});

// Edit stock
window.editStock = (stockId, productId, productName, quantity, costPrice, sellingPrice) => {
  document.getElementById('stock-product-id').value = stockId;
  document.getElementById('stock-product-name').value = productName;
  document.getElementById('stock-quantity').value = quantity;
  document.getElementById('stock-cost-price').value = costPrice;
  document.getElementById('stock-selling-price').value = sellingPrice;
  
  document.getElementById('stock-modal').style.display = 'block';
};

// Update stock
document.getElementById('update-stock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const stockId = document.getElementById('stock-product-id').value;
  const sellingPrice = parseFloat(document.getElementById('stock-selling-price').value);
  
  try {
    await db.collection('stock').doc(stockId).update({
      sellingPrice: sellingPrice,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showMessage('Selling price updated successfully!', 'success');
    document.getElementById('stock-modal').style.display = 'none';
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Load purchase requests with real-time listener
function loadRequests() {
  if (requestsListener) {
    requestsListener();
  }
  
  const filterStatus = document.getElementById('filter-status').value;
  
  let query = db.collection('purchaseRequests')
    .where('sellerTIN', '==', currentUser.businessTIN)
    .orderBy('createdAt', 'desc');
  
  requestsListener = query.onSnapshot((snapshot) => {
    const requestsList = document.getElementById('requests-list');
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
          <h3>Request from ${request.buyerName}</h3>
          <span class="badge badge-${statusClass}">${request.status.toUpperCase()}</span>
        </div>
        <div class="request-details">
          <p><strong>Buyer TIN:</strong> ${request.buyerTIN}</p>
          <p><strong>Items:</strong> ${request.items.length}</p>
          <p><strong>Total Amount:</strong> ${request.totalAmount.toFixed(2)} RWF</p>
          <p><strong>Date:</strong> ${request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="viewRequest('${request.id}')">View Details</button>
      `;
      requestsList.appendChild(requestCard);
    });
  });
}

// Filter requests
document.getElementById('filter-status').addEventListener('change', () => {
  loadRequests();
});

// View request details
window.viewRequest = async (requestId) => {
  currentRequestId = requestId;
  const requestDoc = await db.collection('purchaseRequests').doc(requestId).get();
  if (!requestDoc.exists) return;
  
  const request = requestDoc.data();
  const detailsDiv = document.getElementById('request-details');
  
  let itemsHtml = '<table class="items-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>';
  
  request.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td>${item.productName} (${item.unit})</td>
        <td>${item.quantity}</td>
        <td>${item.sellerPrice.toFixed(2)} RWF</td>
        <td>${item.totalCost.toFixed(2)} RWF</td>
      </tr>
    `;
  });
  
  itemsHtml += '</tbody></table>';
  
  detailsDiv.innerHTML = `
    <div class="request-full-details">
      <p><strong>Buyer:</strong> ${request.buyerName} (${request.buyerTIN})</p>
      <p><strong>Status:</strong> ${request.status.toUpperCase()}</p>
      <p><strong>Date:</strong> ${request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
      ${itemsHtml}
      <p class="total-line"><strong>Total Amount:</strong> ${request.totalAmount.toFixed(2)} RWF</p>
    </div>
  `;
  
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');
  
  if (request.status === 'pending') {
    approveBtn.style.display = 'inline-block';
    rejectBtn.style.display = 'inline-block';
  } else {
    approveBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
  }
  
  document.getElementById('request-modal').style.display = 'block';
};

// Approve request (Firestore transaction)
document.getElementById('approve-btn').addEventListener('click', async () => {
  if (!currentRequestId) return;
  
  if (!confirm('Are you sure you want to approve this request?')) return;
  
  try {
    await db.runTransaction(async (transaction) => {
      // Get request
      const requestRef = db.collection('purchaseRequests').doc(currentRequestId);
      const requestDoc = await transaction.get(requestRef);
      
      if (!requestDoc.exists) {
        throw new Error('Request not found');
      }
      
      const request = requestDoc.data();
      
      if (request.status !== 'pending') {
        throw new Error('Request is not pending');
      }
      
      // Check and reduce seller stock, increase buyer stock
      for (const item of request.items) {
        // Get seller stock
        const sellerStockQuery = await db.collection('stock')
          .where('ownerTIN', '==', currentUser.businessTIN)
          .where('productId', '==', item.productId)
          .get();
        
        if (sellerStockQuery.empty) {
          throw new Error(`Stock not found for product ${item.productName}`);
        }
        
        const sellerStockDoc = sellerStockQuery.docs[0];
        const sellerStock = sellerStockDoc.data();
        
        if (sellerStock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${item.productName}`);
        }
        
        // Reduce seller stock
        transaction.update(sellerStockDoc.ref, {
          quantity: sellerStock.quantity - item.quantity,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Check if buyer has this product in stock
        const buyerStockQuery = await db.collection('stock')
          .where('ownerTIN', '==', request.buyerTIN)
          .where('productId', '==', item.productId)
          .get();
        
        if (buyerStockQuery.empty) {
          // Create new stock for buyer
          const newStockRef = db.collection('stock').doc();
          transaction.set(newStockRef, {
            ownerTIN: request.buyerTIN,
            productId: item.productId,
            quantity: item.quantity,
            costPrice: item.sellerPrice,
            sellingPrice: item.sellerPrice * 1.2, // Default 20% markup
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Update existing buyer stock
          const buyerStockDoc = buyerStockQuery.docs[0];
          const buyerStock = buyerStockDoc.data();
          transaction.update(buyerStockDoc.ref, {
            quantity: buyerStock.quantity + item.quantity,
            costPrice: item.sellerPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      // Update request status
      transaction.update(requestRef, {
        status: 'approved',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Create invoice
      const invoiceRef = db.collection('invoices').doc();
      const invoiceData = {
        sellerTIN: currentUser.businessTIN,
        sellerName: currentUser.businessName,
        buyerTIN: request.buyerTIN,
        buyerName: request.buyerName,
        items: request.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.sellerPrice,
          taxCategory: item.taxCategory || 'A',
          ebmProductCode: item.ebmProductCode || '',
          total: item.totalCost
        })),
        totalAmount: request.totalAmount,
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
      .where('buyerTIN', '==', (await db.collection('purchaseRequests').doc(currentRequestId).get()).data().buyerTIN)
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
    }
    
    showMessage('Request approved successfully!', 'success');
    document.getElementById('request-modal').style.display = 'none';
    currentRequestId = null;
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Reject request
document.getElementById('reject-btn').addEventListener('click', async () => {
  if (!currentRequestId) return;
  
  if (!confirm('Are you sure you want to reject this request?')) return;
  
  try {
    await db.collection('purchaseRequests').doc(currentRequestId).update({
      status: 'rejected',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showMessage('Request rejected', 'success');
    document.getElementById('request-modal').style.display = 'none';
    currentRequestId = null;
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Modal controls
document.querySelectorAll('.close').forEach(closeBtn => {
  closeBtn.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  });
});

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});