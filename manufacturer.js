// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, push, onValue, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyB5uSxd29wVSWt65IQsfVBo86IQG234Nbo",
  authDomain: "smartebm-8ea35.firebaseapp.com",
  projectId: "smartebm-8ea35",
  storageBucket: "smartebm-8ea35.firebasestorage.app",
  messagingSenderId: "94063570937",
  appId: "1:94063570937:web:512243fbd8fcefc1cfd728",
  measurementId: "G-T793ST5F56"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// DOM Elements
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const createProductLink = document.getElementById('createProductLink');
const logoutLink = document.getElementById('logoutLink');
const goToStockBtn = document.getElementById('goToStockBtn');
const goToSellerBtn = document.getElementById('goToSellerBtn');
const purchaseBadge = document.getElementById('purchaseBadge');
const productForm = document.getElementById('productForm');
const alertBox = document.getElementById('alertBox');

// Current User
let currentUser = null;

// Authentication Check
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    console.log('Manufacturer authenticated:', user.email);
    // Start monitoring purchase requests
    monitorPurchaseRequests();
  } else {
    // Redirect to auth page if not logged in
    window.location.href = 'auth.html';
  }
});

// Toggle Sidebar
function toggleSidebar() {
  sidebar.classList.toggle('active');
  overlay.classList.toggle('active');
}

hamburgerBtn.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

// Close sidebar when clicking menu items
createProductLink.addEventListener('click', (e) => {
  e.preventDefault();
  toggleSidebar();
  document.getElementById('createProductSection').classList.add('active');
});

// Logout Functionality
logoutLink.addEventListener('click', async (e) => {
  e.preventDefault();
  
  if (confirm('Are you sure you want to logout?')) {
    try {
      await signOut(auth);
      window.location.href = 'auth.html';
    } catch (error) {
      showAlert('Logout failed: ' + error.message, 'error');
    }
  }
});

// Navigation Buttons
goToStockBtn.addEventListener('click', () => {
  window.location.href = 'stock.html';
});

goToSellerBtn.addEventListener('click', () => {
  window.location.href = 'seller.html';
});

// Monitor Purchase Requests (Real-time)
function monitorPurchaseRequests() {
  if (!currentUser) return;

  const purchaseRequestsRef = ref(database, 'purchaseRequests');
  const manufacturerQuery = query(
    purchaseRequestsRef,
    orderByChild('manufacturerId'),
    equalTo(currentUser.uid)
  );

  onValue(manufacturerQuery, (snapshot) => {
    if (snapshot.exists()) {
      const requests = snapshot.val();
      // Count pending requests only
      const pendingCount = Object.values(requests).filter(
        req => req.status === 'pending'
      ).length;

      if (pendingCount > 0) {
        purchaseBadge.textContent = pendingCount;
        purchaseBadge.style.display = 'flex';
      } else {
        purchaseBadge.style.display = 'none';
      }
    } else {
      purchaseBadge.style.display = 'none';
    }
  });
}

// Product Form Submission
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser) {
    showAlert('You must be logged in to create products', 'error');
    return;
  }

  // Get form values
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
    // Check if product ID already exists
    const productsRef = ref(database, 'products');
    const productQuery = query(
      productsRef,
      orderByChild('productId'),
      equalTo(productData.productId)
    );

    const snapshot = await new Promise((resolve, reject) => {
      onValue(productQuery, resolve, reject, { onlyOnce: true });
    });

    if (snapshot.exists()) {
      showAlert('Product ID already exists. Please use a unique Product ID.', 'error');
      return;
    }

    // Create product in database
    const newProductRef = push(ref(database, 'products'));
    await set(newProductRef, {
      ...productData,
      firebaseId: newProductRef.key
    });

    showAlert('Product created successfully! This product is now available across all systems.', 'success');
    productForm.reset();

    // Scroll to top to show success message
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error('Error creating product:', error);
    showAlert('Failed to create product: ' + error.message, 'error');
  }
});

// Show Alert Function
function showAlert(message, type) {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    alertBox.style.display = 'none';
  }, 5000);
}

// Generate unique product ID (helper function - optional)
function generateProductId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 7);
  return `PROD-${timestamp}-${randomStr}`.toUpperCase();
}

// Optional: Add button to auto-generate product ID
document.getElementById('productId').addEventListener('focus', function() {
  if (!this.value) {
    const generate = confirm('Would you like to auto-generate a Product ID?');
    if (generate) {
      this.value = generateProductId();
    }
  }
});

console.log('Manufacturer Dashboard Initialized');
