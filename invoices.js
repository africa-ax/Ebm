import firebaseConfig from './firebase-config.js';

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
            userRole = userData.role;
            
            const displayName = userData.businessName || userData.fullName || 'User';
            document.getElementById('user-info').textContent = displayName;
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Setup UI based on role
function setupUI() {
    const tabsContainer = document.getElementById('invoice-tabs');
    tabsContainer.innerHTML = '';
    
    // Manufacturer: Only sales and history
    // Distributor/Retailer: All three tabs
    // Buyer: Only purchases and history
    
    if (userRole !== 'manufacturer') {
        const purchaseTab = createTabButton('purchase-tab', '📥 Purchase Invoices');
        tabsContainer.appendChild(purchaseTab);
    }
    
    if (userRole !== 'buyer') {
        const salesTab = createTabButton('sales-tab', '📤 Sales Invoices');
        tabsContainer.appendChild(salesTab);
    }
    
    const historyTab = createTabButton('history-tab', '📊 Transaction History');
    tabsContainer.appendChild(historyTab);
    
    // Activate first tab
    const firstTab = tabsContainer.querySelector('.tab-btn');
    if (firstTab) {
        firstTab.click();
    }
    
    // Setup back link
    setupBackLink();
}

// Create tab button
function createTabButton(tabId, label) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = label;
    btn.dataset.tab = tabId;
    btn.addEventListener('click', () => switchTab(tabId));
    return btn;
}

// Switch tab
function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
}

// Setup back link
function setupBackLink() {
    const backLink = document.getElementById('back-link');
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html',
        buyer: 'buyer.html'
    };
    backLink.href = dashboards[userRole] || 'index.html';
}

// Setup event listeners
function setupEventListeners() {
    // Purchase filters
    document.getElementById('purchase-filter-btn')?.addEventListener('click', () => renderPurchaseInvoices(true));
    document.getElementById('purchase-clear-btn')?.addEventListener('click', clearPurchaseFilters);
    
    // Sales filters
    document.getElementById('sales-filter-btn')?.addEventListener('click', () => renderSalesInvoices(true));
    document.getElementById('sales-clear-btn')?.addEventListener('click', clearSalesFilters);
    
    // History filters
    document.getElementById('history-filter-btn')?.addEventListener('click', () => renderTransactionHistory(true));
    document.getElementById('history-clear-btn')?.addEventListener('click', clearHistoryFilters);
    document.getElementById('export-csv-btn')?.addEventListener('click', exportToCSV);
    
    // Modal
    document.getElementById('close-invoice-modal').addEventListener('click', closeInvoiceModal);
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadPurchaseInvoices(),
        loadSalesInvoices(),
        loadTransactionHistory()
    ]);
    
    renderSummaryCards();
}

// Load purchase invoices - from sales_invoices where user is the buyer
async function loadPurchaseInvoices() {
    if (userRole === 'manufacturer') return;
    
    try {
        // Load from sales_invoices where user is the buyer
        const snapshot = await db.collection('sales_invoices')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get();
        
        purchaseInvoices = [];
        snapshot.forEach(doc => {
            purchaseInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'purchase'
            });
        });
        
        renderPurchaseInvoices();
    } catch (error) {
        console.error('Error loading purchase invoices:', error);
        document.getElementById('purchase-table-body').innerHTML = 
            '<tr><td colspan="6" style="text-align: center; color: red;">Error loading purchase invoices</td></tr>';
    }
}

// Load sales invoices - from sales_invoices where user is the seller
async function loadSalesInvoices() {
    if (userRole === 'buyer') return;
    
    try {
        // Load from sales_invoices where user is the seller
        const snapshot = await db.collection('sales_invoices')
            .where('sellerId', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get();
        
        salesInvoices = [];
        snapshot.forEach(doc => {
            salesInvoices.push({
                invoiceId: doc.id,
                ...doc.data(),
                type: 'sale'
            });
        });
        
        renderSalesInvoices();
    } catch (error) {
        console.error('Error loading sales invoices:', error);
        document.getElementById('sales-table-body').innerHTML = 
            '<tr><td colspan="7" style="text-align: center; color: red;">Error loading sales invoices</td></tr>';
    }
}

// Load transaction history
async function loadTransactionHistory() {
    try {
        allTransactions = [...purchaseInvoices, ...salesInvoices];
        
        // Sort by date descending
        allTransactions.sort((a, b) => {
            const dateA = a.timestamp?.toMillis() || 0;
            const dateB = b.timestamp?.toMillis() || 0;
            return dateB - dateA;
        });
        
        renderTransactionHistory();
    } catch (error) {
        console.error('Error loading transaction history:', error);
    }
}

// Render purchase invoices
function renderPurchaseInvoices(applyFilters = false) {
    const tableBody = document.getElementById('purchase-table-body');
    
    if (!tableBody) return;
    
    let filtered = [...purchaseInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('purchase-search').value.toLowerCase();
        const dateFrom = document.getElementById('purchase-date-from').value;
        const dateTo = document.getElementById('purchase-date-to').value;
        
        filtered = filtered.filter(invoice => {
            const matchSearch = !search || 
                (invoice.sellerName?.toLowerCase().includes(search) || 
                 invoice.invoiceId?.toLowerCase().includes(search));
            
            const invoiceDate = invoice.timestamp?.toDate();
            const matchDateFrom = !dateFrom || (invoiceDate && invoiceDate >= new Date(dateFrom));
            const matchDateTo = !dateTo || (invoiceDate && invoiceDate <= new Date(dateTo));
            
            return matchSearch && matchDateFrom && matchDateTo;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No purchase invoices found</p></td></tr>';
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

// Render sales invoices
function renderSalesInvoices(applyFilters = false) {
    const tableBody = document.getElementById('sales-table-body');
    
    if (!tableBody) return;
    
    let filtered = [...salesInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('sales-search').value.toLowerCase();
        const dateFrom = document.getElementById('sales-date-from').value;
        const dateTo = document.getElementById('sales-date-to').value;
        const statusFilter = document.getElementById('sales-status-filter').value;
        
        filtered = filtered.filter(invoice => {
            const buyerName = invoice.buyerName || 'N/A';
            const matchSearch = !search || 
                (buyerName.toLowerCase().includes(search) || 
                 invoice.invoiceId?.toLowerCase().includes(search));
            
            const invoiceDate = invoice.timestamp?.toDate();
            const matchDateFrom = !dateFrom || (invoiceDate && invoiceDate >= new Date(dateFrom));
            const matchDateTo = !dateTo || (invoiceDate && invoiceDate <= new Date(dateTo));
            
            return matchSearch && matchDateFrom && matchDateTo;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">📭</div><p>No sales invoices found</p></td></tr>';
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

// Render transaction history
function renderTransactionHistory(applyFilters = false) {
    const tableBody = document.getElementById('history-table-body');
    
    if (!tableBody) return;
    
    let filtered = [...allTransactions];
    
    if (applyFilters) {
        const search = document.getElementById('history-search').value.toLowerCase();
        const typeFilter = document.getElementById('history-type-filter').value;
        const dateFrom = document.getElementById('history-date-from').value;
        const dateTo = document.getElementById('history-date-to').value;
        
        filtered = filtered.filter(transaction => {
            const counterparty = transaction.type === 'purchase' ? 
                (transaction.sellerName || 'N/A') : 
                (transaction.buyerName || 'Customer');
            
            const matchSearch = !search || counterparty.toLowerCase().includes(search);
            const matchType = !typeFilter || transaction.type === typeFilter;
            
            const txDate = transaction.timestamp?.toDate();
            const matchDateFrom = !dateFrom || (txDate && txDate >= new Date(dateFrom));
            const matchDateTo = !dateTo || (txDate && txDate <= new Date(dateTo));
            
            return matchSearch && matchType && matchDateFrom && matchDateTo;
        });
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📭</div><p>No transactions found</p></td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    filtered.forEach(transaction => {
        const counterparty = transaction.type === 'purchase' ? 
            (transaction.sellerName || 'N/A') : 
            (transaction.buyerName || 'Customer');
        
        const description = `${transaction.items?.length || 0} items`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.timestamp)}</td>
            <td><span class="transaction-${transaction.type}">${transaction.type === 'purchase' ? '📥 Purchase' : '📤 Sale'}</span></td>
            <td>${counterparty}</td>
            <td>${description}</td>
            <td class="amount-cell">${formatCurrency(transaction.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${transaction.invoiceId}', '${transaction.type}')">Details</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Render summary cards
function renderSummaryCards() {
    const container = document.getElementById('summary-cards');
    container.innerHTML = '';
    
    // Calculate totals
    const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalTransactions = allTransactions.length;
    
    // Cards based on role
    if (userRole !== 'manufacturer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Purchases</div>
                <div class="summary-value currency">${formatCurrency(totalPurchases)} RWF</div>
            </div>
        `;
    }
    
    if (userRole !== 'buyer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Sales</div>
                <div class="summary-value currency">${formatCurrency(totalSales)} RWF</div>
            </div>
        `;
    }
    
    container.innerHTML += `
        <div class="summary-card">
            <div class="summary-label">Total Transactions</div>
            <div class="summary-value">${totalTransactions}</div>
        </div>
    `;
    
    if (userRole === 'distributor' || userRole === 'retailer') {
        const netProfit = totalSales - totalPurchases;
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Net Profit/Loss</div>
                <div class="summary-value currency" style="color: ${netProfit >= 0 ? '#28a745' : '#dc3545'}">
                    ${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)} RWF
                </div>
            </div>
        `;
    }
}

// View invoice details
window.viewInvoiceDetails = async function(invoiceId, type) {
    let invoice = null;
    
    // Find invoice in the appropriate collection
    if (type === 'purchase') {
        invoice = purchaseInvoices.find(t => t.invoiceId === invoiceId);
    } else {
        invoice = salesInvoices.find(t => t.invoiceId === invoiceId);
    }
    
    if (!invoice) {
        // Try to fetch from Firestore if not in cache
        try {
            const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
            if (invoiceDoc.exists) {
                invoice = {
                    invoiceId: invoiceDoc.id,
                    ...invoiceDoc.data(),
                    type: type
                };
            } else {
                showMessage('Invoice not found', 'error');
                return;
            }
        } catch (error) {
            console.error('Error loading invoice:', error);
            showMessage('Failed to load invoice', 'error');
            return;
        }
    }
    
    const modalBody = document.getElementById('invoice-modal-body');
    const modalFooter = document.getElementById('invoice-modal-footer');
    
    modalBody.innerHTML = `
        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Invoice Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Invoice ID</div>
                    <div class="detail-value" style="color: #667eea; font-weight: bold;">${invoice.invoiceId}</div>
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
                    <div class="detail-value">${type === 'purchase' ? 'Purchase (Incoming)' : 'Sale (Outgoing)'}</div>
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
            <div class="invoice-detail-title">${type === 'purchase' ? 'Seller' : 'Your'} Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${invoice.sellerName}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">TIN</div>
                    <div class="detail-value">${invoice.sellerTIN}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Address</div>
                    <div class="detail-value">${invoice.sellerAddress}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">Phone</div>
                    <div class="detail-value">${invoice.sellerPhone}</div>
                </div>
            </div>
        </div>

        <div class="invoice-detail-section">
            <div class="invoice-detail-title">${type === 'purchase' ? 'Your' : 'Buyer'} Information</div>
            <div class="invoice-detail-grid">
                <div class="invoice-detail-item">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${invoice.buyerName}</div>
                </div>
                <div class="invoice-detail-item">
                    <div class="detail-label">TIN</div>
                    <div class="detail-value">${invoice.buyerTIN}</div>
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
                    ${invoice.items?.map(item => `
                        <tr>
                            <td>${item.productName}</td>
                            <td>${formatCurrency(item.unitPrice)}</td>
                            <td>${item.quantity}</td>
                            <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total)}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4">No items</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600; padding: 15px; border-top: 2px solid #e0e0e0;">Total Amount:</td>
                        <td style="text-align: right; font-weight: bold; padding: 15px; font-size: 18px; color: #667eea; border-top: 2px solid #e0e0e0;">
                            ${formatCurrency(invoice.totalAmount)} RWF
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <div class="invoice-detail-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
            <h3 style="color: #28a745; margin-bottom: 10px;">✅ EBM Invoice Generated</h3>
            <p style="margin: 0; color: #666;">This invoice has been issued with Electronic Billing Machine (EBM) compliance.</p>
        </div>
    `;
    
    modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="closeInvoiceModal()">Close</button>
        <button class="btn btn-primary" onclick="printInvoice('${invoice.invoiceId}')">🖨️ Print Invoice</button>
    `;
    
    document.getElementById('invoice-modal').style.display = 'block';
};

// Print invoice function
window.printInvoice = async function(invoiceId) {
    try {
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (invoiceDoc.exists) {
            const invoice = invoiceDoc.data();
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invoice ${invoice.invoiceId}</title>
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
                        <div class="company-name">${invoice.sellerName}</div>
                        <div class="invoice-title">TAX INVOICE</div>
                        <div>Invoice No: ${invoice.invoiceId}</div>
                        <div>Date: ${formatDate(invoice.timestamp)}</div>
                        <div>EBM Serial: ${invoice.ebmSerial || 'N/A'}</div>
                    </div>
                    
                    <div class="grid">
                        <div class="section">
                            <div class="section-title">Seller Information</div>
                            <div><strong>Name:</strong> ${invoice.sellerName}</div>
                            <div><strong>TIN:</strong> ${invoice.sellerTIN}</div>
                            <div><strong>Address:</strong> ${invoice.sellerAddress}</div>
                            <div><strong>Phone:</strong> ${invoice.sellerPhone}</div>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">Buyer Information</div>
                            <div><strong>Name:</strong> ${invoice.buyerName}</div>
                            <div><strong>TIN:</strong> ${invoice.buyerTIN}</div>
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
                                ${invoice.items?.map(item => `
                                    <tr>
                                        <td>${item.productName}</td>
                                        <td>${formatCurrency(item.unitPrice)} RWF</td>
                                        <td>${item.quantity}</td>
                                        <td>${formatCurrency(item.total)} RWF</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="total">
                        <strong>TOTAL AMOUNT: ${formatCurrency(invoice.totalAmount)} RWF</strong>
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
        }
    } catch (error) {
        console.error('Error printing invoice:', error);
        showMessage('Failed to print invoice', 'error');
    }
};

// Close invoice modal
function closeInvoiceModal() {
    document.getElementById('invoice-modal').style.display = 'none';
}

// Clear filters
function clearPurchaseFilters() {
    document.getElementById('purchase-search').value = '';
    document.getElementById('purchase-date-from').value = '';
    document.getElementById('purchase-date-to').value = '';
    renderPurchaseInvoices();
}

function clearSalesFilters() {
    document.getElementById('sales-search').value = '';
    document.getElementById('sales-date-from').value = '';
    document.getElementById('sales-date-to').value = '';
    document.getElementById('sales-status-filter').value = '';
    renderSalesInvoices();
}

function clearHistoryFilters() {
    document.getElementById('history-search').value = '';
    document.getElementById('history-type-filter').value = '';
    document.getElementById('history-date-from').value = '';
    document.getElementById('history-date-to').value = '';
    renderTransactionHistory();
}

// Export to CSV
function exportToCSV() {
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
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// Utility functions
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-RW', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-RW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}