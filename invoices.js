import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence (optional but recommended)
db.enablePersistence().catch((err) => {
    console.warn('Firebase persistence failed:', err.code);
});

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
            userRole = userData.role || 'buyer'; // Default to buyer if role not set
            
            const displayName = userData.businessName || userData.fullName || user.email || 'User';
            document.getElementById('user-info').textContent = displayName;
            document.getElementById('role-badge').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        } else {
            // Create user document if doesn't exist
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
        showMessage('Error loading user information', 'error');
        userRole = 'buyer'; // Default role
    }
}

// Setup UI based on role
function setupUI() {
    const tabsContainer = document.getElementById('invoice-tabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    // Define accessible tabs based on role
    const tabs = [];
    
    if (userRole !== 'manufacturer') {
        tabs.push({ id: 'purchase-tab', label: '📥 Purchase Invoices' });
    }
    
    if (userRole !== 'buyer') {
        tabs.push({ id: 'sales-tab', label: '📤 Sales Invoices' });
    }
    
    tabs.push({ id: 'history-tab', label: '📊 Transaction History' });
    
    // Create tab buttons
    tabs.forEach(tab => {
        const btn = createTabButton(tab.id, tab.label);
        tabsContainer.appendChild(btn);
    });
    
    // Activate first tab
    const firstTab = tabsContainer.querySelector('.tab-btn');
    if (firstTab) {
        firstTab.classList.add('active');
        const tabId = firstTab.dataset.tab;
        document.getElementById(tabId).classList.add('active');
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
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    } else {
        console.error(`Tab with id ${tabId} not found`);
    }
}

// Setup back link
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

// Setup event listeners
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

// Load all data
async function loadAllData() {
    try {
        showMessage('Loading invoices...', 'info');
        
        await Promise.all([
            loadPurchaseInvoices(),
            loadSalesInvoices()
        ]);
        
        // Load transaction history after purchase/sales are loaded
        loadTransactionHistory();
        renderSummaryCards();
        
        showMessage('Data loaded successfully', 'success');
    } catch (error) {
        console.error('Error loading all data:', error);
        showMessage('Failed to load data', 'error');
    }
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
            const data = doc.data();
            purchaseInvoices.push({
                invoiceId: doc.id,
                ...data,
                type: 'purchase',
                // Ensure all required fields exist
                sellerName: data.sellerName || 'Unknown Seller',
                buyerName: data.buyerName || 'Unknown Buyer',
                totalAmount: data.totalAmount || 0,
                items: data.items || [],
                timestamp: data.timestamp || new Date()
            });
        });
        
        renderPurchaseInvoices();
        console.log(`Loaded ${purchaseInvoices.length} purchase invoices`);
    } catch (error) {
        console.error('Error loading purchase invoices:', error);
        document.getElementById('purchase-table-body').innerHTML = 
            '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #dc3545;">' +
            '<div style="font-size: 48px;">📭</div>' +
            '<p>Error loading purchase invoices</p>' +
            '<p style="font-size: 12px; color: #999;">' + error.message + '</p>' +
            '</td></tr>';
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
            const data = doc.data();
            salesInvoices.push({
                invoiceId: doc.id,
                ...data,
                type: 'sale',
                // Ensure all required fields exist
                sellerName: data.sellerName || 'Unknown Seller',
                buyerName: data.buyerName || 'Unknown Buyer',
                totalAmount: data.totalAmount || 0,
                items: data.items || [],
                timestamp: data.timestamp || new Date()
            });
        });
        
        renderSalesInvoices();
        console.log(`Loaded ${salesInvoices.length} sales invoices`);
    } catch (error) {
        console.error('Error loading sales invoices:', error);
        document.getElementById('sales-table-body').innerHTML = 
            '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">' +
            '<div style="font-size: 48px;">📭</div>' +
            '<p>Error loading sales invoices</p>' +
            '<p style="font-size: 12px; color: #999;">' + error.message + '</p>' +
            '</td></tr>';
    }
}

// Load transaction history
function loadTransactionHistory() {
    try {
        allTransactions = [...purchaseInvoices, ...salesInvoices];
        
        // Sort by date descending
        allTransactions.sort((a, b) => {
            const dateA = getTimestampValue(a.timestamp);
            const dateB = getTimestampValue(b.timestamp);
            return dateB - dateA;
        });
        
        renderTransactionHistory();
        console.log(`Loaded ${allTransactions.length} total transactions`);
    } catch (error) {
        console.error('Error loading transaction history:', error);
        showMessage('Failed to load transaction history', 'error');
    }
}

// Helper function to get timestamp value
function getTimestampValue(timestamp) {
    if (!timestamp) return 0;
    if (timestamp.toMillis) return timestamp.toMillis();
    if (timestamp.seconds) return timestamp.seconds * 1000;
    if (timestamp instanceof Date) return timestamp.getTime();
    return new Date(timestamp).getTime();
}

// Render purchase invoices
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
                    <p>No purchase invoices found</p>
                    ${applyFilters ? '<p style="font-size: 12px; color: #999;">Try adjusting your filters</p>' : ''}
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

// Render sales invoices
function renderSalesInvoices(applyFilters = false) {
    const tableBody = document.getElementById('sales-table-body');
    if (!tableBody) return;
    
    let filtered = [...salesInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('sales-search')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('sales-date-from')?.value;
        const dateTo = document.getElementById('sales-date-to')?.value;
        const statusFilter = document.getElementById('sales-status-filter')?.value || '';
        
        filtered = filtered.filter(invoice => {
            const buyerName = invoice.buyerName || 'N/A';
            const matchSearch = !search || 
                (buyerName.toLowerCase().includes(search) || 
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
                    <p>No sales invoices found</p>
                    ${applyFilters ? '<p style="font-size: 12px; color: #999;">Try adjusting your filters</p>' : ''}
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

// Render transaction history
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
                (transaction.sellerName || 'N/A') : 
                (transaction.buyerName || 'Customer');
            
            const matchSearch = !search || counterparty.toLowerCase().includes(search);
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
                    <p>No transactions found</p>
                    ${applyFilters ? '<p style="font-size: 12px; color: #999;">Try adjusting your filters</p>' : ''}
                </td>
            </tr>
        `;
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
    if (!container) return;
    
    container.innerHTML = '';
    
    // Calculate totals
    const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalTransactions = allTransactions.length;
    
    // Cards based on role
    if (userRole !== 'manufacturer' && purchaseInvoices.length > 0) {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Purchases</div>
                <div class="summary-value currency">${formatCurrency(totalPurchases)} RWF</div>
                <div class="summary-sub">${purchaseInvoices.length} invoices</div>
            </div>
        `;
    }
    
    if (userRole !== 'buyer' && salesInvoices.length > 0) {
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
    
    if ((userRole === 'distributor' || userRole === 'retailer') && (salesInvoices.length > 0 || purchaseInvoices.length > 0)) {
        const netProfit = totalSales - totalPurchases;
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Net Profit/Loss</div>
                <div class="summary-value currency" style="color: ${netProfit >= 0 ? '#28a745' : '#dc3545'}">
                    ${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)} RWF
                </div>
                <div class="summary-sub">${netProfit >= 0 ? 'Profit' : 'Loss'}</div>
            </div>
        `;
    }
}

// View invoice details - FIXED VERSION
window.viewInvoiceDetails = async function(invoiceId, type) {
    if (!invoiceId) {
        showMessage('Invalid invoice ID', 'error');
        return;
    }
    
    try {
        showMessage('Loading invoice details...', 'info');
        
        let invoice = null;
        
        // First check if invoice exists in cached arrays
        if (type === 'purchase') {
            invoice = purchaseInvoices.find(t => t.invoiceId === invoiceId);
        } else {
            invoice = salesInvoices.find(t => t.invoiceId === invoiceId);
        }
        
        // If not in cache, fetch from Firestore
        if (!invoice) {
            console.log(`Invoice ${invoiceId} not in cache, fetching from Firestore...`);
            const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
            
            if (!invoiceDoc.exists) {
                showMessage('Invoice not found in database', 'error');
                return;
            }
            
            invoice = {
                invoiceId: invoiceDoc.id,
                ...invoiceDoc.data(),
                type: type
            };
            
            // Add to appropriate cache
            if (type === 'purchase' && userRole !== 'manufacturer') {
                purchaseInvoices.push(invoice);
            } else if (type === 'sale' && userRole !== 'buyer') {
                salesInvoices.push(invoice);
            }
        }
        
        // Validate required fields
        invoice = {
            invoiceId: invoice.invoiceId || 'N/A',
            sellerName: invoice.sellerName || 'Unknown Seller',
            sellerTIN: invoice.sellerTIN || 'N/A',
            sellerAddress: invoice.sellerAddress || 'N/A',
            sellerPhone: invoice.sellerPhone || 'N/A',
            buyerName: invoice.buyerName || 'Unknown Buyer',
            buyerTIN: invoice.buyerTIN || 'N/A',
            buyerRole: invoice.buyerRole || 'Customer',
            totalAmount: invoice.totalAmount || 0,
            items: invoice.items || [],
            timestamp: invoice.timestamp || new Date(),
            type: type,
            ebmSerial: invoice.ebmSerial || 'N/A',
            orderId: invoice.orderId || null
        };
        
        // Display the invoice
        displayInvoiceDetails(invoice);
        
    } catch (error) {
        console.error('Error loading invoice details:', error);
        showMessage(`Failed to load invoice: ${error.message}`, 'error');
    }
};

// Display invoice details in modal
function displayInvoiceDetails(invoice) {
    const modalBody = document.getElementById('invoice-modal-body');
    const modalFooter = document.getElementById('invoice-modal-footer');
    
    if (!modalBody || !modalFooter) {
        showMessage('Invoice modal elements not found', 'error');
        return;
    }
    
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
                    <div class="detail-value">${invoice.ebmSerial}</div>
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
            <div class="invoice-detail-title">${invoice.type === 'purchase' ? 'Your' : 'Buyer'} Information</div>
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
                    <div class="detail-value">${invoice.buyerRole}</div>
                </div>
            </div>
        </div>

        <div class="invoice-detail-section">
            <div class="invoice-detail-title">Items (${invoice.items.length} items)</div>
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
                    ${invoice.items.map((item, index) => `
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
    showMessage('Invoice loaded successfully', 'success');
}

// Print invoice function
window.printInvoice = async function(invoiceId) {
    if (!invoiceId) {
        showMessage('Invalid invoice ID', 'error');
        return;
    }
    
    try {
        showMessage('Preparing invoice for printing...', 'info');
        
        const invoiceDoc = await db.collection('sales_invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
            showMessage('Invoice not found', 'error');
            return;
        }
        
        const invoice = invoiceDoc.data();
        
        // Open print window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showMessage('Popup blocked. Please allow popups to print.', 'warning');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice ${invoiceId}</title>
                <style>
                    body { 
                        font-family: 'Arial', sans-serif; 
                        padding: 30px; 
                        max-width: 800px; 
                        margin: 0 auto; 
                        color: #333; 
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 40px; 
                        padding-bottom: 20px; 
                        border-bottom: 3px double #333; 
                    }
                    .company-name { 
                        font-size: 28px; 
                        font-weight: bold; 
                        color: #667eea; 
                        margin-bottom: 10px; 
                    }
                    .invoice-title { 
                        font-size: 24px; 
                        margin: 15px 0; 
                        color: #333; 
                    }
                    .invoice-info { 
                        display: flex; 
                        justify-content: space-between; 
                        margin-bottom: 30px; 
                        flex-wrap: wrap; 
                    }
                    .info-box { 
                        flex: 1; 
                        min-width: 250px; 
                        margin: 10px; 
                        padding: 15px; 
                        border: 1px solid #ddd; 
                        border-radius: 8px; 
                    }
                    .info-box h3 { 
                        margin-top: 0; 
                        color: #555; 
                        border-bottom: 1px solid #eee; 
                        padding-bottom: 8px; 
                    }
                    .table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin: 20px 0; 
                    }
                    .table th { 
                        background: #f5f5f5; 
                        padding: 12px; 
                        text-align: left; 
                        font-weight: bold; 
                        border-bottom: 2px solid #ddd; 
                    }
                    .table td { 
                        padding: 12px; 
                        border-bottom: 1px solid #eee; 
                    }
                    .total-row { 
                        font-size: 18px; 
                        font-weight: bold; 
                        background: #f8f9fa; 
                    }
                    .footer { 
                        margin-top: 50px; 
                        text-align: center; 
                        color: #666; 
                        font-size: 12px; 
                        padding-top: 20px; 
                        border-top: 1px solid #ddd; 
                    }
                    .signature { 
                        margin-top: 50px; 
                        display: flex; 
                        justify-content: space-between; 
                    }
                    .signature-box { 
                        text-align: center; 
                        width: 45%; 
                    }
                    .signature-line { 
                        border-top: 1px solid #333; 
                        margin-top: 60px; 
                        padding-top: 5px; 
                    }
                    @media print { 
                        body { padding: 20px; } 
                        .no-print { display: none; } 
                        .table th { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; } 
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${invoice.sellerName || 'Company Name'}</div>
                    <div class="invoice-title">TAX INVOICE</div>
                    <div>EBM Serial: ${invoice.ebmSerial || 'N/A'}</div>
                </div>
                
                <div class="invoice-info">
                    <div class="info-box">
                        <h3>Invoice Details</h3>
                        <div><strong>Invoice No:</strong> ${invoiceId}</div>
                        <div><strong>Date:</strong> ${formatDate(invoice.timestamp)}</div>
                        <div><strong>Order ID:</strong> ${invoice.orderId || 'N/A'}</div>
                    </div>
                    
                    <div class="info-box">
                        <h3>Buyer Information</h3>
                        <div><strong>Name:</strong> ${invoice.buyerName || 'Customer'}</div>
                        <div><strong>TIN:</strong> ${invoice.buyerTIN || 'N/A'}</div>
                        <div><strong>Role:</strong> ${invoice.buyerRole || 'Customer'}</div>
                    </div>
                </div>
                
                <table class="table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Unit Price (RWF)</th>
                            <th>Qty</th>
                            <th>Total (RWF)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(invoice.items || []).map(item => `
                            <tr>
                                <td>${item.productName || 'Item'}</td>
                                <td>${formatCurrency(item.unitPrice || 0)}</td>
                                <td>${item.quantity || 0}</td>
                                <td>${formatCurrency(item.total || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="3" style="text-align: right;">TOTAL AMOUNT:</td>
                            <td>${formatCurrency(invoice.totalAmount || 0)} RWF</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div class="signature">
                    <div class="signature-box">
                        <div>_________________________</div>
                        <div>Seller's Signature</div>
                    </div>
                    <div class="signature-box">
                        <div>_________________________</div>
                        <div>Buyer's Signature</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>This is a computer-generated EBM invoice. No physical signature is required.</p>
                    <p>Thank you for your business!</p>
                </div>
                
                <div class="no-print" style="text-align: center; margin-top: 30px;">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Print Invoice</button>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; margin-left: 10px; cursor: pointer;">Close</button>
                </div>
                
                <script>
                    window.onload = function() {
                        // Auto-print after a short delay
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        
        showMessage('Invoice ready for printing', 'success');
        
    } catch (error) {
        console.error('Error printing invoice:', error);
        showMessage(`Failed to print: ${error.message}`, 'error');
    }
};

// Close invoice modal
function closeInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Clear filters
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
    const statusFilter = document.getElementById('sales-status-filter');
    
    if (search) search.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (statusFilter) statusFilter.value = '';
    
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

// Export to CSV
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
        
        const csv = [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
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
        } else if (timestamp instanceof Date) {
            date = timestamp;
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
        console.error('Error formatting date:', error, timestamp);
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
        } else if (timestamp instanceof Date) {
            return timestamp;
        } else {
            return new Date(timestamp);
        }
    } catch (error) {
        console.error('Error converting timestamp:', error);
        return null;
    }
}

function formatCurrency(amount) {
    try {
        const num = Number(amount);
        if (isNaN(num)) return '0';
        
        return new Intl.NumberFormat('en-RW', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    } catch (error) {
        console.error('Error formatting currency:', error);
        return '0';
    }
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) {
        // Create message element if it doesn't exist
        const newMessageEl = document.createElement('div');
        newMessageEl.id = 'message';
        newMessageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 1000;
            display: none;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(newMessageEl);
    }
    
    const finalMessageEl = document.getElementById('message');
    finalMessageEl.textContent = text;
    finalMessageEl.className = '';
    
    // Set colors based on type
    switch(type) {
        case 'success':
            finalMessageEl.style.backgroundColor = '#28a745';
            break;
        case 'error':
            finalMessageEl.style.backgroundColor = '#dc3545';
            break;
        case 'warning':
            finalMessageEl.style.backgroundColor = '#ffc107';
            finalMessageEl.style.color = '#000';
            break;
        case 'info':
            finalMessageEl.style.backgroundColor = '#17a2b8';
            break;
        default:
            finalMessageEl.style.backgroundColor = '#6c757d';
    }
    
    finalMessageEl.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        finalMessageEl.style.display = 'none';
    }, 3000);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Reload data when page becomes visible again
        loadAllData();
    }
});

// Add refresh button handler if it exists
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAllData();
            showMessage('Refreshing data...', 'info');
        });
    }
});