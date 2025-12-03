import firebaseConfig from './firebase-config.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

let currentUser = null;
let invoicesListener = null;

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
  loadInvoices();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'auth.html';
});

// Back to dashboard
document.getElementById('back-btn').addEventListener('click', () => {
  switch(currentUser.role) {
    case 'manufacturer':
      window.location.href = 'manufacturer.html';
      break;
    case 'distributor':
      window.location.href = 'seller.html';
      break;
    case 'retailer':
      window.location.href = 'retailer.html';
      break;
    default:
      window.location.href = 'buyer.html';
  }
});

// Load invoices with real-time listener
function loadInvoices() {
  if (invoicesListener) {
    invoicesListener();
  }
  
  const filterType = document.getElementById('filter-type').value;
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo = document.getElementById('filter-date-to').value;
  
  // Build query based on filter type
  let query;
  
  if (filterType === 'sales') {
    query = db.collection('invoices')
      .where('sellerTIN', '==', currentUser.businessTIN);
  } else if (filterType === 'purchases') {
    query = db.collection('invoices')
      .where('buyerTIN', '==', currentUser.businessTIN);
  } else {
    // All invoices
    query = db.collection('invoices');
  }
  
  query = query.orderBy('timestamp', 'desc');
  
  invoicesListener = query.onSnapshot((snapshot) => {
    const invoicesList = document.getElementById('invoices-list');
    invoicesList.innerHTML = '';
    
    let invoices = [];
    snapshot.forEach((doc) => {
      const invoice = { id: doc.id, ...doc.data() };
      
      // Filter by user TIN (for "all" type)
      if (filterType === 'all') {
        if (invoice.sellerTIN === currentUser.businessTIN || invoice.buyerTIN === currentUser.businessTIN) {
          invoices.push(invoice);
        }
      } else {
        invoices.push(invoice);
      }
    });
    
    // Filter by date range
    if (dateFrom || dateTo) {
      invoices = invoices.filter(invoice => {
        if (!invoice.timestamp) return false;
        
        const invoiceDate = new Date(invoice.timestamp.toDate());
        const invoiceDateStr = invoiceDate.toISOString().split('T')[0];
        
        if (dateFrom && invoiceDateStr < dateFrom) return false;
        if (dateTo && invoiceDateStr > dateTo) return false;
        
        return true;
      });
    }
    
    if (invoices.length === 0) {
      invoicesList.innerHTML = '<p class="empty-state">No invoices found</p>';
      return;
    }
    
    invoices.forEach(invoice => {
      const isSeller = invoice.sellerTIN === currentUser.businessTIN;
      const invoiceCard = document.createElement('div');
      invoiceCard.className = 'invoice-card';
      
      const ebmStatusClass = invoice.ebmStatus === 'success' ? 'success' : invoice.ebmStatus === 'failed' ? 'danger' : 'warning';
      
      invoiceCard.innerHTML = `
        <div class="invoice-header">
          <h3>${isSeller ? 'Sale' : 'Purchase'} Invoice</h3>
          <span class="badge badge-${ebmStatusClass}">EBM: ${invoice.ebmStatus || 'pending'}</span>
        </div>
        <div class="invoice-details">
          <p><strong>${isSeller ? 'Buyer' : 'Seller'}:</strong> ${isSeller ? invoice.buyerName : invoice.sellerName}</p>
          <p><strong>TIN:</strong> ${isSeller ? invoice.buyerTIN : invoice.sellerTIN}</p>
          <p><strong>Items:</strong> ${invoice.items.length}</p>
          <p><strong>Total Amount:</strong> ${invoice.totalAmount.toFixed(2)} RWF</p>
          <p><strong>Date:</strong> ${invoice.timestamp ? new Date(invoice.timestamp.toDate()).toLocaleString() : 'N/A'}</p>
          ${invoice.ebmResponse && invoice.ebmResponse.invoiceNumber ? `<p><strong>EBM Invoice #:</strong${invoice.ebmResponse && invoice.ebmResponse.invoiceNumber ? `<p><strong>EBM Invoice #:</strong> ${invoice.ebmResponse.invoiceNumber}</p>` : ''}
          ${invoice.ebmResponse && invoice.ebmResponse.verificationCode ? `<p><strong>Verification Code:</strong> ${invoice.ebmResponse.verificationCode}</p>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" onclick="viewInvoice('${invoice.id}')">View Details</button>
      `;
      invoicesList.appendChild(invoiceCard);
    });
  });
}

// Apply filters
document.getElementById('apply-filter-btn').addEventListener('click', () => {
  loadInvoices();
});

// View invoice details
window.viewInvoice = async (invoiceId) => {
  const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
  if (!invoiceDoc.exists) return;
  
  const invoice = invoiceDoc.data();
  const detailsDiv = document.getElementById('invoice-details');
  
  const isSeller = invoice.sellerTIN === currentUser.businessTIN;
  
  let itemsHtml = '<table class="invoice-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>';
  
  invoice.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td>${item.productName}</td>
        <td>${item.quantity}</td>
        <td>${item.price.toFixed(2)} RWF</td>
        <td>${item.total.toFixed(2)} RWF</td>
      </tr>
    `;
  });
  
  itemsHtml += '</tbody></table>';
  
  const ebmStatusClass = invoice.ebmStatus === 'success' ? 'success' : invoice.ebmStatus === 'failed' ? 'danger' : 'warning';
  
  detailsDiv.innerHTML = `
    <div class="invoice-document">
      <div class="invoice-doc-header">
        <h2>INVOICE</h2>
        <p class="invoice-type">${isSeller ? 'SALES INVOICE' : 'PURCHASE INVOICE'}</p>
      </div>
      
      <div class="invoice-info-section">
        <div class="invoice-info-block">
          <h4>From (Seller)</h4>
          <p><strong>${invoice.sellerName}</strong></p>
          <p>TIN: ${invoice.sellerTIN}</p>
        </div>
        
        <div class="invoice-info-block">
          <h4>To (Buyer)</h4>
          <p><strong>${invoice.buyerName}</strong></p>
          <p>TIN: ${invoice.buyerTIN}</p>
        </div>
        
        <div class="invoice-info-block">
          <h4>Invoice Details</h4>
          <p><strong>Date:</strong> ${invoice.timestamp ? new Date(invoice.timestamp.toDate()).toLocaleString() : 'N/A'}</p>
          ${invoice.ebmResponse && invoice.ebmResponse.invoiceNumber ? `<p><strong>Invoice #:</strong> ${invoice.ebmResponse.invoiceNumber}</p>` : ''}
          ${invoice.ebmResponse && invoice.ebmResponse.verificationCode ? `<p><strong>Verification:</strong> ${invoice.ebmResponse.verificationCode}</p>` : ''}
          <p><strong>EBM Status:</strong> <span class="badge badge-${ebmStatusClass}">${invoice.ebmStatus || 'pending'}</span></p>
        </div>
      </div>
      
      <div class="invoice-items-section">
        <h4>Items</h4>
        ${itemsHtml}
      </div>
      
      <div class="invoice-totals">
        ${invoice.subtotal ? `<p><strong>Subtotal:</strong> ${invoice.subtotal.toFixed(2)} RWF</p>` : ''}
        ${invoice.vat ? `<p><strong>VAT (18%):</strong> ${invoice.vat.toFixed(2)} RWF</p>` : ''}
        <p class="total-line"><strong>TOTAL AMOUNT:</strong> ${invoice.totalAmount.toFixed(2)} RWF</p>
      </div>
      
      ${invoice.ebmResponse ? `
        <div class="ebm-section">
          <h4>EBM Response</h4>
          <pre>${JSON.stringify(invoice.ebmResponse, null, 2)}</pre>
        </div>
      ` : ''}
    </div>
  `;
  
  document.getElementById('invoice-modal').style.display = 'block';
};

// Print invoice
document.getElementById('print-invoice-btn').addEventListener('click', () => {
  window.print();
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
