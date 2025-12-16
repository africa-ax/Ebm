"import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global state
let currentUser = null;
let userRole = null;
let purchaseInvoices = [];
let salesInvoices = [];
let allTransactions = [];

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    await loadUserInfo();
    setupUI();
    setupEventListeners();
    loadAllData();
});

// Load user information
async function loadUserInfo() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role || 'buyer';
            
            const displayName = userData.businessName || userData.fullName || userData.email || 'User';
            document.getElementById('user-info').textContent = displayName;
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
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
    // Purchase filters
    const purchaseFilterBtn = document.getElementById('purchase-filter-btn');
    const purchaseClearBtn = document.getElementById('purchase-clear-btn');
    
    if (purchaseFilterBtn) purchaseFilterBtn.addEventListener('click', () => renderPurchaseInvoices(true));
    if (purchaseClearBtn) purchaseClearBtn.addEventListener('click', clearPurchaseFilters);
    
    // Sales filters
    const salesFilterBtn = document.getElementById('sales-filter-btn');
    const salesClearBtn = document.getElementById('sales-clear-btn');
    
    if (salesFilterBtn) salesFilterBtn.addEventListener('click', () => renderSalesInvoices(true));
    if (salesClearBtn) salesClearBtn.addEventListener('click', clearSalesFilters);
    
    // History filters
    const historyFilterBtn = document.getElementById('history-filter-btn');
    const historyClearBtn = document.getElementById('history-clear-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    
    if (historyFilterBtn) historyFilterBtn.addEventListener('click', () => renderTransactionHistory(true));
    if (historyClearBtn) historyClearBtn.addEventListener('click', clearHistoryFilters);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
    
    // Modal
    const closeModalBtn = document.getElementById('close-invoice-modal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeInvoiceModal);
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

// UPDATED: No sorting in Firestore to avoid indexes
async function loadPurchaseInvoices() {
    if (userRole === 'manufacturer') return;
    
    try {
        // Query without sorting first
        const query = db.collection('sales_invoices')
            .where('buyerId', '==', currentUser.uid);
        
        const snapshot = await query.get();
        
        purchaseInvoices = [];
        snapshot.forEach(doc => {
            purchaseInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'purchase'
            });
        });

        // Sort in memory (Newest first)
        purchaseInvoices.sort((a, b) => {
            const timeA = a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || 0;
            const timeB = b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || 0;
            return timeB - timeA;
        });
        
        renderPurchaseInvoices();
        
    } catch (error) {
        console.error('Purchase query error:', error);
        showErrorMessage('purchase', error);
    }
}

// UPDATED: No sorting in Firestore to avoid indexes
async function loadSalesInvoices() {
    if (userRole === 'buyer') return;
    
    try {
        // Query without sorting first
        const query = db.collection('sales_invoices')
            .where('sellerId', '==', currentUser.uid);
        
        const snapshot = await query.get();
        
        salesInvoices = [];
        snapshot.forEach(doc => {
            salesInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'sale'
            });
        });
        
        // Sort in memory (Newest first)
        salesInvoices.sort((a, b) => {
            const timeA = a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || 0;
            const timeB = b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || 0;
            return timeB - timeA;
        });

        renderSalesInvoices();
        
    } catch (error) {
        console.error('Sales query error:', error);
        showErrorMessage('sales', error);
    }
}

function loadTransactionHistory() {
    allTransactions = [...purchaseInvoices, ...salesInvoices];
    
    // Sort by timestamp (newest first)
    allTransactions.sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || 0;
        const timeB = b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || 0;
        return timeB - timeA;
    });
    
    renderTransactionHistory();
}

// Show error message
function showErrorMessage(type, error) {
    const tableBody = document.getElementById(`${type}-table-body`);
    if (!tableBody) return;
    
    let errorMessage = error.message || 'Unknown error';
    
    // Generic error display
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                <div style="font-size: 48px;">⚠️</div>
                <p>Error: ${errorMessage}</p>
                <button onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}Invoices()" style="margin-top: 15px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            </td>
        </tr>
    `;
}

// Render functions
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
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'purchase')">View</button>
            </td>
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
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'sale')">View</button>
                <button class="action-btn btn-print" onclick="printInvoice('${invoice.invoiceId}')">🖨️ Print</button>
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
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${transaction.invoiceId}', '${transaction.type}')">Details</button>
            </td>
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
        
        // First check local cache
        if (type === 'purchase') {
            invoice = purchaseInvoices.find(inv => inv.invoiceId === invoiceId);
        } else {
            invoice = salesInvoices.find(inv => inv.invoiceId === invoiceId);
        }
        
        // If not in cache, fetch from Firestore
        if (!invoice) {
            const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
            if (!invoiceDoc.exists) {
                showMessage('Invoice not found', 'error');
                return;
            }
            
            invoice = {
                invoiceId: invoiceDoc.id,
                ...invoiceDoc.data(),
                type: type
            };
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
    
    if (!modalBody || !modalFooter || !modal) {
        showMessage('Modal elements not found', 'error');
        return;
    }
    
    modalBody.innerHTML = `
        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Invoice Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Invoice ID</div>
                    <div class="detail-value invoice-id">${invoice.invoiceId}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Issue Date</div>
                    <div class="detail-value">${formatDate(invoice.timestamp)}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">EBM Serial</div>
                    <div class="detail-value">${invoice.ebmSerial || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Order ID</div>
                    <div class="detail-value">${invoice.orderId ? 'ORD-' + invoice.orderId.substring(0, 8).toUpperCase() : 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Transaction Type</div>
                    <div class="detail-value">${invoice.type === 'purchase' ? 'Purchase (Incoming)' : 'Sale (Outgoing)'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        <span class="status-badge status-approved">✅ Approved</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="invoice-detail-section">
            <div class="invoice-detail-title">${invoice.type === 'purchase' ? 'Seller' : 'Your'} Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${invoice.sellerName || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">TIN</div>
                    <div class="detail-value">${invoice.sellerTIN || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Address</div>
                    <div class="detail-value">${invoice.sellerAddress || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Phone</div>
                    <div class="detail-value">${invoice.sellerPhone || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="invoice-detail-section">
            <div class="invoice-detail-title">${invoice.type === 'purchase' ? 'Your' : 'Buyer'} Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${invoice.buyerName || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">TIN</div>
                    <div class="detail-value">${invoice.buyerTIN || 'N/A'}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Role</div>
                    <div class="detail-value">${invoice.buyerRole || 'Customer'}</div>
                </div>
            </div>
        </div>

        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Items (${invoice.items?.length || 0} items)</div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th>Unit Price (RWF)</th>
                        <th>Quantity</th>
                        <th style="text-align: right;">Total (RWF)</th>
                    </tr>
                </thead>
                <tbody>
                    ${(invoice.items || []).map((item, index) => `
                        <tr>
                            <td>${item.productName || `Item ${index + 1}`}</td>
                            <td>${formatCurrency(item.unitPrice || 0)}</td>
                            <td>${item.quantity || 0}</td>
                            <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total || 0)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600; padding: 15px; border-top: 2px solid #e0e0e0;">Total Amount:</td>
                        <td style="text-align: right; font-weight: bold; padding: 15px; font-size: 18px; color: #667eea; border-top: 2px solid #e0e0e0;">
                            ${formatCurrency(invoice.totalAmount || 0)} RWF
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    
    modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="closeInvoiceModal()">Close</button>
        <button class="btn btn-primary" onclick="printInvoice('${invoice.invoiceId}')">🖨️ Print Invoice</button>
    `;
    
    modal.style.display = 'block';
}

// Print invoice function
window.printInvoice = async function(invoiceId) {
    try {
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
            showMessage('Invoice not found', 'error');
            return;
        }
        
        const invoice = invoiceDoc.data();
        const printWindow = window.open('', '_blank');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice ${invoiceId}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .company-name { font-size: 24px; font-weight: bold; color: #667eea; }
                    .invoice-title { font-size: 20px; margin: 10px 0; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .table th { background: #f0f0f0; padding: 10px; text-align: left; }
                    .table td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
                    .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${invoice.sellerName || 'Company Name'}</div>
                    <div class="invoice-title">TAX INVOICE</div>
                    <div>Invoice No: ${invoiceId}</div>
                    <div>Date: ${formatDate(invoice.timestamp)}</div>
                    <div>EBM Serial: ${invoice.ebmSerial || 'N/A'}</div>
                </div>
                
                <div class="grid">
                    <div class="section">
                        <div class="section-title">Seller Information</div>
                        <div><strong>Name:</strong> ${invoice.sellerName || 'N/A'}</div>
                        <div><strong>TIN:</strong> ${invoice.sellerTIN || 'N/A'}</div>
                        <div><strong>Address:</strong> ${invoice.sellerAddress || 'N/A'}</div>
                        <div><strong>Phone:</strong> ${invoice.sellerPhone || 'N/A'}</div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Buyer Information</div>
                        <div><strong>Name:</strong> ${invoice.buyerName || 'N/A'}</div>
                        <div><strong>TIN:</strong> ${invoice.buyerTIN || 'N/A'}</div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">Items</div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Unit Price</th>
                                <th>Qty</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(invoice.items || []).map(item => `
                                <tr>
                                    <td>${item.productName || 'Item'}</td>
                                    <td>${formatCurrency(item.unitPrice || 0)} RWF</td>
                                    <td>${item.quantity || 0}</td>
                                    <td>${formatCurrency(item.total || 0)} RWF</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="total">
                    <strong>TOTAL AMOUNT: ${formatCurrency(invoice.totalAmount || 0)} RWF</strong>
                </div>
                
                <div class="footer">
                    <p>Thank you for your business!</p>
                    <p>This is a computer-generated EBM invoice.</p>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        
    } catch (error) {
        console.error('Error printing invoice:', error);
        showMessage('Failed to print invoice', 'error');
    }
};

function closeInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    if (modal) modal.style.display = 'none';
}

function clearPurchaseFilters() {
    const search = document.getElementById('purchase-search');
    const dateFrom = document.getElementById('purchase-date-from');
    const dateTo = document.getElementById('purchase-date-to');
    
    if (search) search.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    renderPurchaseInvoices();
}

function clearSalesFilters() {
    const search = document.getElementById('sales-search');
    const dateFrom = document.getElementById('sales-date-from');
    const dateTo = document.getElementById('sales-date-to');
    
    if (search) search.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    renderSalesInvoices();
}

function clearHistoryFilters() {
    const search = document.getElementById('history-search');
    const typeFilter = document.getElementById('history-type-filter');
    const dateFrom = document.getElementById('history-date-from');
    const dateTo = document.getElementById('history-date-to');
    
    if (search) search.value = '';
    if (typeFilter) typeFilter.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    renderTransactionHistory();
}

function exportToCSV() {
    if (allTransactions.length === 0) {
        showMessage('No transactions to export', 'warning');
        return;
    }
    
    try {
        const headers = ['Date', 'Type', 'Invoice ID', 'Counterparty', 'Items Count', 'Total Amount (RWF)', 'Status'];
        const rows = allTransactions.map(tx => [
            formatDate(tx.timestamp),
            tx.type === 'purchase' ? 'Purchase' : 'Sale',
            tx.invoiceId || 'N/A',
            tx.type === 'purchase' ? (tx.sellerName || 'N/A') : (tx.buyerName || 'Customer'),
            tx.items?.length || 0,
            tx.totalAmount || 0,
            'Approved'
        ]);
        
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        showMessage('CSV exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showMessage('Failed to export CSV', 'error');
    }
}

// Utility functions
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp.seconds) {
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }
        
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        
        return date.toLocaleDateString('en-RW', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Date Error';
    }
}

function getDateFromTimestamp(timestamp) {
    if (!timestamp) return null;
    
    try {
        if (timestamp.toDate) {
            return timestamp.toDate();
        } else if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000);
        } else {
            return new Date(timestamp);
        }
    } catch (error) {
        console.error('Error getting date from timestamp:', error);
        return null;
    }
}

function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-RW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(num);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) {
        console.warn('Message element not found');
        return;
    }
    
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}
