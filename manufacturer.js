import firebaseConfig from '../firebase-config.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

let currentUser = null;
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
  if (!userDoc.exists || userDoc.data().role !== 'manufacturer') {
    showMessage('Access denied. Manufacturer only.', 'error');
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

// Add product
document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const productData = {
    manufacturerTIN: currentUser.businessTIN,
    name: document.getElementById('product-name').value,
    unit: document.getElementById('product-unit').value,
    taxCategory: document.getElementById('product-tax-category').value,
    barcode: document.getElementById('product-barcode').value || '',
    ebmProductCode: document.getElementById('product-ebm-code').value,
    description: document.getElementById('product-description').value || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection('products').add(productData);
    showMessage('Product added successfully!', 'success');
    document.getElementById('product-form').reset();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Load products with real-time listener
function loadProducts() {
  if (productsListener) {
    productsListener();
  }
  
  const searchTerm = document.getElementById('search-products').value.toLowerCase();
  
  let query = db.collection('products')
    .where('manufacturerTIN', '==', currentUser.businessTIN)
    .orderBy('createdAt', 'desc');
  
  productsListener = query.onSnapshot((snapshot) => {
    const productsList = document.getElementById('products-list');
    productsList.innerHTML = '';
    
    let products = [];
    snapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() });
    });
    
    // Filter by search term
    if (searchTerm) {
      products = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        p.ebmProductCode.toLowerCase().includes(searchTerm) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm))
      );
    }
    
    if (products.length === 0) {
      productsList.innerHTML = '<p class="empty-state">No products found</p>';
      return;
    }
    
    products.forEach(product => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card';
      productCard.innerHTML = `
        <div class="product-header">
          <h3>${product.name}</h3>
          <span class="badge">${product.unit}</span>
        </div>
        <div class="product-details">
          <p><strong>EBM Code:</strong> ${product.ebmProductCode}</p>
          <p><strong>Tax Category:</strong> ${product.taxCategory}</p>
          ${product.barcode ? `<p><strong>Barcode:</strong> ${product.barcode}</p>` : ''}
          ${product.description ? `<p><strong>Description:</strong> ${product.description}</p>` : ''}
        </div>
        <div class="product-actions">
          <button class="btn btn-secondary btn-sm" onclick="editProduct('${product.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">Delete</button>
        </div>
      `;
      productsList.appendChild(productCard);
    });
  });
}

// Search products
document.getElementById('search-products').addEventListener('input', () => {
  loadProducts();
});

// Edit product
window.editProduct = async (productId) => {
  const productDoc = await db.collection('products').doc(productId).get();
  if (!productDoc.exists) return;
  
  const product = productDoc.data();
  document.getElementById('edit-product-id').value = productId;
  document.getElementById('edit-product-name').value = product.name;
  document.getElementById('edit-product-unit').value = product.unit;
  document.getElementById('edit-product-tax-category').value = product.taxCategory;
  document.getElementById('edit-product-barcode').value = product.barcode || '';
  document.getElementById('edit-product-ebm-code').value = product.ebmProductCode;
  document.getElementById('edit-product-description').value = product.description || '';
  
  document.getElementById('edit-modal').style.display = 'block';
};

// Update product
document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const productId = document.getElementById('edit-product-id').value;
  const updateData = {
    name: document.getElementById('edit-product-name').value,
    unit: document.getElementById('edit-product-unit').value,
    taxCategory: document.getElementById('edit-product-tax-category').value,
    barcode: document.getElementById('edit-product-barcode').value || '',
    ebmProductCode: document.getElementById('edit-product-ebm-code').value,
    description: document.getElementById('edit-product-description').value || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection('products').doc(productId).update(updateData);
    showMessage('Product updated successfully!', 'success');
    document.getElementById('edit-modal').style.display = 'none';
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Delete product
window.deleteProduct = async (productId) => {
  if (!confirm('Are you sure you want to delete this product?')) return;
  
  try {
    await db.collection('products').doc(productId).delete();
    showMessage('Product deleted successfully!', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
};

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