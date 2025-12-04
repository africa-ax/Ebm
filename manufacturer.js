// Import Firebase configuration
import firebaseConfig from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('Manufacturer Dashboard Loading...');

// DOM Elements
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const createProductLink = document.getElementById('createProductLink');
const editProductLink = document.getElementById('editProductLink');
const logoutLink = document.getElementById('logoutLink');
const goToStockBtn = document.getElementById('goToStockBtn');
const goToSellerBtn = document.getElementById('goToSellerBtn');
const purchaseBadge = document.getElementById('purchaseBadge');

// Sections
const createProductSection = document.getElementById('createProductSection');
const editProductSection = document.getElementById('editProductSection');

// Forms
const productForm = document.getElementById('productForm');
const editProductForm = document.getElementById('editProductForm');
const createAlertBox = document.getElementById('createAlertBox');
const editAlertBox = document.getElementById('editAlertBox');
const productList = document.getElementById('productList');

// Current User
let currentUser = null;

// Authentication Check
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    console.log('✅ Manufacturer authenticated:', user.email);
    monitorPurchaseRequests();
  } else {
    console.log('❌ No user authenticated - redirecting...');
    window.location.href = 'auth.html';
  }
});

// ========== SIDEBAR & NAVIGATION ==========

function toggleSidebar() {
  sidebar.classList.toggle('active');
  overlay.classList.toggle('active');
}

hamburgerBtn.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

createProductLink.addEventListener('click', (e) => {
  e.preventDefault();
  showSection('create');
  toggleSidebar();
});

editProductLink.addEventListener('click', (e) => {
  e.preventDefault();
  showSection('edit');
  loadProducts();
  toggleSidebar();
});

function showSection(section) {
  createProductSection.classList.remove('active');
  editProductSection.classList.remove('active');
  
  if (section === 'create') {
    createProductSection.classList.add('active');
  } else if (section === 'edit') {
    editProductSection.classList.add('active');
  }
}

// ========== LOGOUT ==========

logoutLink.addEventListener('click', async (e) => {
  e.preventDefault();
  
  if (confirm('Are you sure you want to logout?')) {
    try {
      await signOut(auth);
      window.location.href = 'auth.html';
    } catch (error) {
      showAlert('Logout failed: ' + error.message, 'error', createAlertBox);
    }
  }
});

// ========== NAVIGATION BUTTONS ==========

goToStockBtn.addEventListener('click', () => {
  window.location.href = 'stock.html';
});

goToSellerBtn.addEventListener('click', () => {
  window.location.href = 'seller.html';
});

// ========== MONITOR PURCHASE REQUESTS ==========

function monitorPurchaseRequests() {
  if (!currentUser) return;

  const purchaseRequestsRef = collection(db, 'purchaseRequests');
  const q = query(
    purchaseRequestsRef,
    where('manufacturerId', '==', currentUser.uid),
    where('status', '==', 'pending')
  );

  onSnapshot(q, (snapshot) => {
    const pendingCount = snapshot.size;
    
    if (pendingCount > 0) {
      purchaseBadge.textContent = pendingCount;
      purchaseBadge.style.display = 'flex';
      console.log(`📦 ${pendingCount} pending purchase requests`);
    } else {
      purchaseBadge.style.display = 'none';
    }
  }, (error) => {
    console.error('Error monitoring purchases:', error);
  });
}

// ========== CREATE PRODUCT ==========

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  console.log('🔄 Creating product...');

  if (!currentUser) {
    showAlert('You must be logged in to create products', 'error', createAlertBox);
    return;
  }

  const submitBtn = productForm.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating Product...';

  const productData = {
    productName: document.getElementById('productName').value.trim(),
    productId: document.getElementById('productId').value.trim(),
    unitOfMeasure: document.getElementById('unitOfMeasure').value,
    taxCategory: document.getElementById('taxCategory').value,
    vatType: document.getElementById('vatType').value,
    productCategory: document.getElementById('productCategory').value,
    itemClassification: document.getElementById('itemClassification').value,
    pricingType: document.getElementById('pricingType').value,
    unitPrice: parseFloat(document.getElementById('unitPrice').value),
    ebmItemCode: document.getElementById('ebmItemCode').value.trim(),
    packageUnit: document.getElementById('packageUnit').value,
    insuranceApplicable: document.getElementById('insuranceApplicable').value,
    productDescription: document.getElementById('productDescription').value.trim(),
    manufacturerId: currentUser.uid,
    manufacturerEmail: currentUser.email,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  try {
    // Check for duplicate Product ID
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('productId', '==', productData.productId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      showAlert('❌ Product ID already exists. Please use a unique Product ID.', 'error', createAlertBox);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Product';
      return;
    }

    // Create product
    const docRef = await addDoc(collection(db, 'products'), productData);
    console.log('✅ Product created:', docRef.id);

    showAlert('✅ Product created successfully! Available across all systems.', 'success', createAlertBox);
    productForm.reset();

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Product';

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error('❌ Error creating product:', error);
    showAlert('❌ Failed to create product: ' + error.message, 'error', createAlertBox);
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Product';
  }
});

// ========== LOAD PRODUCTS FOR EDITING ==========

async function loadProducts() {
  if (!currentUser) return;

  productList.innerHTML = '<div class="loading">Loading products...</div>';

  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('manufacturerId', '==', currentUser.uid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      productList.innerHTML = '<div class="loading">No products found. Create your first product!</div>';
      return;
    }

    productList.innerHTML = '';

    querySnapshot.forEach((doc) => {
      const product = doc.data();
      const productItem = document.createElement('div');
      productItem.className = 'product-item';
      productItem.innerHTML = `
        <div class="product-info">
          <h3>${product.productName}</h3>
          <p>ID: ${product.productId} | Price: $${product.unitPrice} | Category: ${product.productCategory}</p>
        </div>
        <button class="edit-btn" onclick="editProduct('${doc.id}')">Edit</button>
      `;
      productList.appendChild(productItem);
    });

    console.log(`✅ Loaded ${querySnapshot.size} products`);

  } catch (error) {
    console.error('❌ Error loading products:', error);
    productList.innerHTML = '<div class="loading">Error loading products. Please try again.</div>';
  }
}

// ========== EDIT PRODUCT ==========

window.editProduct = async function(docId) {
  try {
    const productsRef = collection(db, 'products');
    const querySnapshot = await getDocs(query(productsRef));
    
    let productData = null;
    querySnapshot.forEach((doc) => {
      if (doc.id === docId) {
        productData = doc.data();
      }
    });

    if (!productData) {
      showAlert('Product not found', 'error', editAlertBox);
      return;
    }

    // Populate edit form
    document.getElementById('editDocId').value = docId;
    document.getElementById('editProductName').value = productData.productName;
    document.getElementById('editProductId').value = productData.productId;
    document.getElementById('editUnitOfMeasure').value = productData.unitOfMeasure;
    document.getElementById('editTaxCategory').value = productData.taxCategory;
    document.getElementById('editVatType').value = productData.vatType;
    document.getElementById('editProductCategory').value = productData.productCategory;
    document.getElementById('editItemClassification').value = productData.itemClassification;
    document.getElementById('editPricingType').value = productData.pricingType;
    document.getElementById('editUnitPrice').value = productData.unitPrice;
    document.getElementById('editEbmItemCode').value = productData.ebmItemCode || '';
    document.getElementById('editPackageUnit').value = productData.packageUnit;
    document.getElementById('editInsuranceApplicable').value = productData.insuranceApplicable;
    document.getElementById('editProductDescription').value = productData.productDescription || '';

    // Show edit form
    editProductForm.style.display = 'block';
    productList.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error('❌ Error loading product:', error);
    showAlert('Failed to load product: ' + error.message, 'error', editAlertBox);
  }
};

// ========== UPDATE PRODUCT ==========

editProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  console.log('🔄 Updating product...');

  const submitBtn = editProductForm.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating Product...';

  const docId = document.getElementById('editDocId').value;

  const updatedData = {
    productName: document.getElementById('editProductName').value.trim(),
    unitOfMeasure: document.getElementById('editUnitOfMeasure').value,
    taxCategory: document.getElementById('editTaxCategory').value,
    vatType: document.getElementById('editVatType').value,
    productCategory: document.getElementById('editProductCategory').value,
    itemClassification: document.getElementById('editItemClassification').value,
    pricingType: document.getElementById('editPricingType').value,
    unitPrice: parseFloat(document.getElementById('editUnitPrice').value),
    ebmItemCode: document.getElementById('editEbmItemCode').value.trim(),
    packageUnit: document.getElementById('editPackageUnit').value,
    insuranceApplicable: document.getElementById('editInsuranceApplicable').value,
    productDescription: document.getElementById('editProductDescription').value.trim(),
    lastUpdated: new Date().toISOString()
  };

  try {
    const productRef = doc(db, 'products', docId);
    await updateDoc(productRef, updatedData);

    console.log('✅ Product updated successfully');
    showAlert('✅ Product updated successfully! Changes reflected across all systems.', 'success', editAlertBox);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Update Product';

    // Reset and reload
    setTimeout(() => {
      editProductForm.style.display = 'none';
      productList.style.display = 'block';
      loadProducts();
    }, 2000);

  } catch (error) {
    console.error('❌ Error updating product:', error);
    showAlert('❌ Failed to update product: ' + error.message, 'error', editAlertBox);
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update Product';
  }
});

// ========== HELPER FUNCTIONS ==========

function showAlert(message, type, alertElement) {
  alertElement.textContent = message;
  alertElement.className = `alert ${type}`;
  alertElement.style.display = 'block';

  setTimeout(() => {
    alertElement.style.display = 'none';
  }, 5000);
}

console.log('✅ Manufacturer Dashboard Ready!');
