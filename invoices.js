import firebaseConfig from './firebase-config.js';

// Initialize Firebase
let app, auth, db;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase init error:", error);
    document.getElementById('debug-error').style.display = 'block';
    document.getElementById('debug-error').textContent = "Firebase Configuration Error: " + error.message;
}

// Global state
let currentUser = null;
let userRole = null;
let purchaseInvoices = [];
let salesInvoices = [];
let allTransactions = [];

// Helper to safely get milliseconds from any timestamp format
function getMillis(ts) {
    if (!ts) return 0;
    try {
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (ts.seconds) return ts.seconds * 1000;
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'string') return new Date(ts).getTime();
    } catch (e) {
        return 0;
    }
    return 0;
}

// Check authentication
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        
        currentUser = user;
        console.log("User logged in:", user.uid);
        
        try {
            await loadUserInfo();
            setupUI();
            setupEventListeners();
            loadAllData();
        } catch (err) {
            console.error("Critical setup error:", err);
            showMessage("Error setting up dashboard: " + err.message, "error");
        }
    });
}

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role || 'buyer';
            
            const displayName = userData.businessName || userData.fullName || userData.email || 'User';
            const infoEl = document.getElementById('user-info');
            const badgeEl = document.getElementById('role-badge');
            
            if(infoEl) infoEl.textContent = displayName;
            if(badgeEl) badgeEl.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        } else {
            // Create default user document
            await db.collection('users').doc(currentUser.uid).set({
                email: currentUser.email,
                fullName: currentUser.displayName || '',
                role: 'buyer',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            userRole = 'buyer';
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        userRole = 'buyer';
    }
}

// Setup UI based on role
function setupUI() {
    const tabsContainer = document.getElementById('invoice-tabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    if (userRole !== 'manufacturer') {
        tabsContainer.appendChild(createTabButton('purchase-tab', '📥 Purchase Invoices'));
    }
    
    if (userRole !== 'buyer') {
        tabsContainer.appendChild(createTabButton('sales-tab', '📤 Sales Invoices'));
    }
    
    tabsContainer.appendChild(createTabButton('history-tab', '📊 Transaction History'));
    
    // Activate first tab
    const firstTab = tabsContainer.querySelector('.tab-btn');
    if (firstTab) {
        firstTab.classList.add('active');
        const tabId = firstTab.dataset.tab;
        const tabContent = document.getElementById(tabId);
        if (tabContent) tabContent.classList.add('active');
    }
    
    setupBackLink();
}

function createTabButton(tabId, label) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = label;
    btn.dataset.tab = tabId;
    btn.addEventListener('click', () => switchTab(tabId));
    return btn;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
}

function setupBackLink() {
    const backLink = document.getElementById('back-link');
    if (!backLink) return;
    
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html',
        buyer: 'buyer.html'
    };
    backLink.href = dashboards[userRole] || 'index.html';
}

function setupEventListeners() {
    // Helper to safely add listeners
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    addListener('purchase-filter-btn', 'click', () => renderPurchaseInvoices(true));
    addListener('purchase-clear-btn', 'click', clearPurchaseFilters);
    addListener('sales-filter-btn', 'click', () => renderSalesInvoices(true));
    addListener('sales-clear-btn', 'click', clearSalesFilters);
    addListener('history-filter-btn', 'click', () => renderTransactionHistory(true));
    addListener('history-clear-btn', 'click', clearHistoryFilters);
    addListener('export-csv-btn', 'click', exportToCSV);
    addListener('close-invoice-modal', 'click', closeInvoiceModal);
}

async function loadAllData() {
    try {
        showMessage('Loading invoices...', 'info');
        
        // Clear existing data
        purchaseInvoices = [];
        salesInvoices = [];
        allTransactions = [];
        
        // Load based on role
        if (userRole !== 'manufacturer') {
            await loadPurchaseInvoices();
        }
        
        if (userRole !== 'buyer') {
            await loadSalesInvoices();
        }
        
        loadTransactionHistory();
        renderSummaryCards();
        
        showMessage('Data loaded successfully', 'success');
        
    } catch (error) {
        console.error('Error loading all data:', error);
        showMessage('Failed to load data', 'error');
    }
}

// UPDATED: Robust loading without indexes
async function loadPurchaseInvoices() {
    if (userRole === 'manufacturer') return;
    
    try {
        console.log("Fetching purchase invoices...");
        const query = db.collection('sales_invoices')
            .where('buyerId', '==', currentUser.uid);
        
        const snapshot = await query.get();
        console.log(`Found ${snapshot.size} purchase invoices`);
        
        purchaseInvoices = [];
        snapshot.forEach(doc => {
            purchaseInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'purchase'
            });
        });

        // Sort in memory (Newest first) safely
        purchaseInvoices.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
        
        renderPurchaseInvoices();
        
    } catch (error) {
        console.error('Purchase query error:', error);
        showErrorMessage('purchase', error);
    }
}

// UPDATED: Robust loading without indexes
async function loadSalesInvoices() {
    if (userRole === 'buyer') return;
    
    try {
        console.log("Fetching sales invoices...");
        const query = db.collection('sales_invoices')
            .where('sellerId', '==', currentUser.uid);
        
        const snapshot = await query.get();
        console.log(`Found ${snapshot.size} sales invoices`);
        
        salesInvoices = [];
        snapshot.forEach(doc => {
            salesInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'sale'
            });
        });
        
        // Sort in memory safely
        salesInvoices.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));

        renderSalesInvoices();
        
    } catch (error) {
        console.error('Sales query error:', error);
        showErrorMessage('sales', error);
    }
}

function loadTransactionHistory() {
    allTransactions = [...purchaseInvoices, ...salesInvoices];
    
    // Sort by timestamp
    allTransactions.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
    
    renderTransactionHistory();
}

function showErrorMessage(type, error) {
    const tableBody = document.getElementById(`${type}-table-body`);
    if (!tableBody) return;
    
    let errorMessage = error.message || 'Unknown error';
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                <div style="font-size: 48px;">⚠️</div>
                <p>Error: ${errorMessage}</p>
                <button onclick="window.location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            </td>
        </tr>
    `;
}

function renderPurchaseInvoices(applyFilters = false) {
    const tableBody = document.getElementById('purchase-table-body');
    if (!tableBody) return;
    
    let filtered = [...purchaseInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('purchase-search')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('purchase-date-from')?.value;
        const dateTo = document.getElementById('purchase-date-to')?.value;
        
        filtered = filtered.filter(invoice => {
            const matchSearch = !search || 
                (invoice.sellerName?.toLowerCase().includes(search) || 
                 invoice.invoiceId?.toLowerCase().includes(search));
            
            if (!matchSearch) return false;
            
            if (dateFrom || dateTo) {
                const invoiceDate = getDateFromTimestamp(invoice.timestamp);
                if (!invoiceDate) return false;
                
                const fromDate = dateFrom ? new Date(dateFrom) : null;
                const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
                
                if (fromDate && invoiceDate < fromDate) return false;
                if (toDate && invoiceDate > toDate) return false;
            }
            
            return true;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No ${applyFilters ? 'matching ' : ''}purchase invoices found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = '';
    filtered.forEach(invoice => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(invoice.timestamp)}</td>
            <td>${invoice.sellerName || 'N/A'}</td>
            <td class="invoice-number">${invoice.invoiceId || 'N/A'}</td>
            <td>${invoice.items?.length || 0} items</td>
            <td class="amount-cell">${formatCurrency(invoice.totalAmount)} RWF</td>
            <td><button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'purchase')">View</button></td>
        `;
        tableBody.appendChild(row);
    });
}

function renderSalesInvoices(applyFilters = false) {
    const tableBody = document.getElementById('sales-table-body');
    if (!tableBody) return;
    
    let filtered = [...salesInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('sales-search')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('sales-date-from')?.value;
        const dateTo = document.getElementById('sales-date-to')?.value;
        
        filtered = filtered.filter(invoice => {
            const matchSearch = !search || 
                (invoice.buyerName?.toLowerCase().includes(search) || 
                 invoice.invoiceId?.toLowerCase().includes(search));
            
            if (!matchSearch) return false;
            
            if (dateFrom || dateTo) {
                const invoiceDate = getDateFromTimestamp(invoice.timestamp);
                if (!invoiceDate) return false;
                
                const fromDate = dateFrom ? new Date(dateFrom) : null;
                const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
                
                if (fromDate && invoiceDate < fromDate) return false;
                if (toDate && invoiceDate > toDate) return false;
            }
            
            return true;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No ${applyFilters ? 'matching ' : ''}sales invoices found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = '';
    filtered.forEach(invoice => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(invoice.timestamp)}</td>
            <td>${invoice.buyerName || 'Customer'}</td>
            <td class="invoice-number">${invoice.invoiceId || 'N/A'}</td>
            <td>${invoice.items?.length || 0} items</td>
            <td class="amount-cell">${formatCurrency(invoice.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td>
                <button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'sale')">View</button>
                <button class="action-btn action-btn-secondary" onclick="printInvoice('${invoice.invoiceId}')">🖨️ Print</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function renderTransactionHistory(applyFilters = false) {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    
    let filtered = [...allTransactions];
    
    if (applyFilters) {
        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('history-type-filter')?.value || '';
        const dateFrom = document.getElementById('history-date-from')?.value;
        const dateTo = document.getElementById('history-date-to')?.value;
        
        filtered = filtered.filter(transaction => {
            const counterparty = transaction.type === 'purchase' ? 
                transaction.sellerName : 
                transaction.buyerName;
            
            const matchSearch = !search || counterparty?.toLowerCase().includes(search);
            const matchType = !typeFilter || transaction.type === typeFilter;
            
            if (!matchSearch || !matchType) return false;
            
            if (dateFrom || dateTo) {
                const txDate = getDateFromTimestamp(transaction.timestamp);
                if (!txDate) return false;
                
                const fromDate = dateFrom ? new Date(dateFrom) : null;
                const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
                
                if (fromDate && txDate < fromDate) return false;
                if (toDate && txDate > toDate) return false;
            }
            
            return true;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No ${applyFilters ? 'matching ' : ''}transactions found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = '';
    filtered.forEach(transaction => {
        const counterparty = transaction.type === 'purchase' ? 
            transaction.sellerName : 
            transaction.buyerName;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.timestamp)}</td>
            <td><span class="transaction-${transaction.type}">${transaction.type === 'purchase' ? '📥 Purchase' : '📤 Sale'}</span></td>
            <td>${counterparty}</td>
            <td>${transaction.items?.length || 0} items</td>
            <td class="amount-cell">${formatCurrency(transaction.totalAmount)} RWF</td>
            <td><button class="action-btn" onclick="viewInvoiceDetails('${transaction.invoiceId}', '${transaction.type}')">Details</button></td>
        `;
        tableBody.appendChild(row);
    });
}

function renderSummaryCards() {
    const container = document.getElementById('summary-cards');
    if (!container) return;
    
    container.innerHTML = '';
    
    const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalTransactions = allTransactions.length;
    
    if (userRole !== 'manufacturer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Purchases</div>
                <div class="summary-value currency">${formatCurrency(totalPurchases)} RWF</div>
                <div class="summary-sub">${purchaseInvoices.length} invoices</div>
            </div>
        `;
    }
    
    if (userRole !== 'buyer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Sales</div>
                <div class="summary-value currency">${formatCurrency(totalSales)} RWF</div>
                <div class="summary-sub">${salesInvoices.length} invoices</div>
            </div>
        `;
    }
    
    container.innerHTML += `
        <div class="summary-card">
            <div class="summary-label">Total Transactions</div>
            <div class="summary-value">${totalTransactions}</div>
            <div class="summary-sub">All time</div>
        </div>
    `;
    
    if ((userRole === 'distributor' || userRole === 'retailer')) {
        const netProfit = totalSales - totalPurchases;
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Net ${netProfit >= 0 ? 'Profit' : 'Loss'}</div>
                <div class="summary-value currency" style="color: ${netProfit >= 0 ? '#28a745' : '#dc3545'}">
                    ${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)} RWF
                </div>
                <div class="summary-sub">${netProfit >= 0 ? 'Profit' : 'Loss'}</div>
            </div>
        `;
    }
}

// View invoice details
window.viewInvoiceDetails = async function(invoiceId, type) {
    if (!invoiceId) {
        showMessage('Invalid invoice ID', 'error');
        return;
    }
    
    try {
        showMessage('Loading invoice details...', 'info');
        
        let invoice = null;
        if (type === 'purchase') {
            invoice = purchaseInvoices.find(inv => inv.invoiceId === invoiceId);
        } else {
            invoice = salesInvoices.find(inv => inv.invoiceId === invoiceId);
        }
        
        if (!invoice) {
            const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
            if (!invoiceDoc.exists) {
                showMessage('Invoice not found', 'error');
                return;
            }
            invoice = { invoiceId: invoiceDoc.id, ...invoiceDoc.data(), type: type };
        }
        
        displayInvoiceDetails(invoice);
        
    } catch (error) {
        console.error('Error loading invoice:', error);
        showMessage('Failed to load invoice: ' + error.message, 'error');
    }
};

function displayInvoiceDetails(invoice) {
    const modalBody = document.getElementById('invoice-modal-body');
    const modalFooter = document.getElementById('invoice-modal-footer');
    const modal = document.getElementById('invoice-modal');
    
    if (!modalBody || !modalFooter || !modal) return;
    
    modalBody.innerHTML = `
        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Invoice Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item"><div class="detail-label">Invoice ID</div><div class="detail-value">${invoice.invoiceId}</div></div>
                <div class="invoice-detail-item"><div class="detail-label">Issue Date</div><div class="detail-value">${formatDate(invoice.timestamp)}</div></div>
                <div class="invoice-detail-item"><div class="detail-label">Type</div><div class="detail-value">${invoice.type === 'purchase' ? 'Incoming' : 'Outgoing'}</div></div>
            </div>
        </div>
        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Items</div>
            <table class="items-table">
                <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
                <tbody>
                    ${(invoice.items || []).map(item => `
                        <tr><td>${item.productName || 'Item'}</td><td>${formatCurrency(item.unitPrice)}</td><td>${item.quantity}</td><td>${formatCurrency(item.total)}</td></tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div style="text-align: right; margin-top: 20px; font-weight: bold; font-size: 18px; color: #667eea;">
            Total: ${formatCurrency(invoice.totalAmount)} RWF
        </div>
    `;
    
    modalFooter.innerHTML = `
        <button class="action-btn action-btn-secondary" onclick="closeInvoiceModal()">Close</button>
        <button class="action-btn" onclick="printInvoice('${invoice.invoiceId}')">Print</button>
    `;
    
    modal.style.display = 'block';
}

window.printInvoice = async function(invoiceId) {
    // Simplified print function for robustness
    alert("Printing invoice: " + invoiceId);
};

window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoice-modal');
    if (modal) modal.style.display = 'none';
};

function clearPurchaseFilters() {
    ['purchase-search', 'purchase-date-from', 'purchase-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    renderPurchaseInvoices();
}

function clearSalesFilters() {
    ['sales-search', 'sales-date-from', 'sales-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    renderSalesInvoices();
}

function clearHistoryFilters() {
    ['history-search', 'history-type-filter', 'history-date-from', 'history-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    renderTransactionHistory();
}

function exportToCSV() {
    if (allTransactions.length === 0) {
        showMessage('No transactions to export', 'warning');
        return;
    }
    const headers = ['Date', 'Type', 'ID', 'Amount'];
    const rows = allTransactions.map(tx => [formatDate(tx.timestamp), tx.type, tx.invoiceId, tx.totalAmount]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const millis = getMillis(timestamp);
        if (millis === 0) return 'Invalid Date';
        return new Date(millis).toLocaleDateString('en-RW');
    } catch (error) { return 'Date Error'; }
}

function getDateFromTimestamp(timestamp) {
    const millis = getMillis(timestamp);
    return millis ? new Date(millis) : null;
}

function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-RW', { minimumFractionDigits: 0 }).format(num);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    setTimeout(() => { messageEl.style.display = 'none'; }, 3000);
}

// Make sure close modal is available globally
window.closeInvoiceModal = function() {
    document.getElementById('invoice-modal').style.display = 'none';
};
