import { auth, database } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { ref, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Hamburger Menu Functionality
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuItems = document.querySelectorAll('.menu-item[data-section]');
    const frontButtons = document.getElementById('frontButtons');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Menu Item Navigation
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            
            // Remove active class from all menu items
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');
            
            // Hide all content sections
            document.querySelectorAll('.content-section').forEach(cs => {
                cs.classList.remove('active');
            });
            
            // Show selected section and hide front buttons
            document.getElementById(section).classList.add('active');
            frontButtons.style.display = 'none';
            
            // Close sidebar
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            
            // Reload products if edit section is selected
            if (section === 'edit-product') {
                loadProducts();
            }
        });
    });

    // Logout Functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'auth.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert('Error logging out. Please try again.');
            }
        });
    }

    // Create Product Form Submission
    const createProductForm = document.getElementById('createProductForm');
    if (createProductForm) {
        createProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
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
                barcode: document.getElementById('barcode').value.trim(),
                productDescription: document.getElementById('productDescription').value.trim(),
                createdAt: new Date().toISOString(),
                createdBy: auth.currentUser.uid
            };
            
            try {
                // Check if product ID already exists
                const productRef = ref(database, `products/${productData.productId}`);
                const snapshot = await get(productRef);
                
                if (snapshot.exists()) {
                    showAlert('createAlert', 'Product ID already exists. Please use a unique ID.', 'error');
                    return;
                }
                
                // Save product to database
                await set(productRef, productData);
                
                showAlert('createAlert', 'Product created successfully!', 'success');
                
                // Reset form
                document.getElementById('createProductForm').reset();
                
                // Auto-hide success message after 3 seconds
                setTimeout(() => {
                    document.getElementById('createAlert').innerHTML = '';
                }, 3000);
                
            } catch (error) {
                console.error('Error creating product:', error);
                showAlert('createAlert', 'Error creating product. Please try again.', 'error');
            }
        });
    }

    // Update Product Form Submission
    const editProductForm = document.getElementById('editProductForm');
    if (editProductForm) {
        editProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const productKey = document.getElementById('editProductKey').value;
            
            const updatedData = {
                productName: document.getElementById('editProductName').value.trim(),
                unitOfMeasure: document.getElementById('editUnitOfMeasure').value,
                taxCategory: document.getElementById('editTaxCategory').value,
                vatType: document.getElementById('editVatType').value,
                productCategory: document.getElementById('editProductCategory').value,
                itemClassification: document.getElementById('editItemClassification').value,
                pricingType: document.getElementById('editPricingType').value,
                unitPrice: parseFloat(document.getElementById('editUnitPrice').value),
                barcode: document.getElementById('editBarcode').value.trim(),
                productDescription: document.getElementById('editProductDescription').value.trim(),
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser.uid
            };
            
            try {
                const productRef = ref(database, `products/${productKey}`);
                await update(productRef, updatedData);
                
                showAlert('editAlert', 'Product updated successfully!', 'success');
                
                // Reload products after short delay
                setTimeout(() => {
                    cancelEdit();
                    loadProducts();
                }, 2000);
                
            } catch (error) {
                console.error('Error updating product:', error);
                showAlert('editAlert', 'Error updating product. Please try again.', 'error');
            }
        });
    }
});

// Check authentication
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'auth.html';
    } else {
        document.getElementById('userEmail').textContent = user.email;
        loadProducts();
        monitorPurchaseRequests();
    }
});

// Load Products for Edit Section
async function loadProducts() {
    const productListDiv = document.getElementById('productList');
    
    try {
        const productsRef = ref(database, 'products');
        const snapshot = await get(productsRef);
        
        if (!snapshot.exists()) {
            productListDiv.innerHTML = '<p style="text-align: center; color: #666;">No products found. Create your first product!</p>';
            return;
        }
        
        const products = snapshot.val();
        let html = '';
        
        Object.keys(products).forEach(key => {
            const product = products[key];
            html += `
                <div class="product-card" onclick="selectProductForEdit('${key}')">
                    <h3>${product.productName}</h3>
                    <p><strong>Product ID:</strong> ${product.productId}</p>
                    <p><strong>Category:</strong> ${product.productCategory}</p>
                    <p><strong>Price:</strong> ${product.unitPrice} RWF / ${product.unitOfMeasure}</p>
                    <p><strong>VAT:</strong> ${product.vatType}${product.vatType !== 'exempt' ? '%' : ''}</p>
                </div>
            `;
        });
        
        productListDiv.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading products:', error);
        productListDiv.innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading products.</p>';
    }
}

// Select Product for Editing
window.selectProductForEdit = async function(productKey) {
    try {
        const productRef = ref(database, `products/${productKey}`);
        const snapshot = await get(productRef);
        
        if (!snapshot.exists()) {
            showAlert('editAlert', 'Product not found.', 'error');
            return;
        }
        
        const product = snapshot.val();
        
        // Hide product list and show edit form
        document.getElementById('productList').style.display = 'none';
        document.getElementById('editProductForm').classList.remove('hidden');
        
        // Populate form
        document.getElementById('editProductKey').value = productKey;
        document.getElementById('editProductName').value = product.productName;
        document.getElementById('editProductId').value = product.productId;
        document.getElementById('editUnitOfMeasure').value = product.unitOfMeasure;
        document.getElementById('editTaxCategory').value = product.taxCategory;
        document.getElementById('editVatType').value = product.vatType;
        document.getElementById('editProductCategory').value = product.productCategory;
        document.getElementById('editItemClassification').value = product.itemClassification;
        document.getElementById('editPricingType').value = product.pricingType;
        document.getElementById('editUnitPrice').value = product.unitPrice;
        document.getElementById('editBarcode').value = product.barcode || '';
        document.getElementById('editProductDescription').value = product.productDescription || '';
        
        // Scroll to form
        document.getElementById('editProductForm').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error loading product:', error);
        showAlert('editAlert', 'Error loading product details.', 'error');
    }
};

// Cancel Edit
window.cancelEdit = function() {
    document.getElementById('productList').style.display = 'grid';
    document.getElementById('editProductForm').classList.add('hidden');
    document.getElementById('editProductForm').reset();
    document.getElementById('editAlert').innerHTML = '';
};

// Monitor Purchase Requests
function monitorPurchaseRequests() {
    const purchasesRef = ref(database, 'purchaseRequests');
    
    onValue(purchasesRef, (snapshot) => {
        const purchaseBadge = document.getElementById('purchaseBadge');
        
        if (!snapshot.exists()) {
            purchaseBadge.classList.add('hidden');
            return;
        }
        
        const purchases = snapshot.val();
        const pendingCount = Object.values(purchases).filter(p => p.status === 'pending').length;
        
        if (pendingCount > 0) {
            purchaseBadge.textContent = pendingCount;
            purchaseBadge.classList.remove('hidden');
        } else {
            purchaseBadge.classList.add('hidden');
        }
    });
}

// Alert Display Function
function showAlert(elementId, message, type) {
    const alertDiv = document.getElementById(elementId);
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    alertDiv.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    
    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            alertDiv.innerHTML = '';
        }, 5000);
    }
}