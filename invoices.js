import firebaseConfig from './firebase-config.js';

// Initialize Firebase with error handling
try {
    const app = firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
    if (error.code === 'app/duplicate-app') {
        // Use existing app if already initialized
        console.log('Using existing Firebase app');
    }
}

const auth = firebase.auth();
const db = firebase.firestore();

// Set Firestore settings
const firestoreSettings = {
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
};

db.settings(firestoreSettings);

// Enable persistence with better error handling
db.enablePersistence()
    .then(() => console.log('Firestore persistence enabled'))
    .catch((err) => {
        console.warn('Firestore persistence error:', err.code);
        if (err.code === 'failed-precondition') {
            console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
            console.log('The current browser does not support persistence.');
        }
    });

// Global state
let currentUser = null;
let userRole = null;
let purchaseInvoices = [];
let salesInvoices = [];
let allTransactions = [];

// Enhanced auth state handler
auth.onAuthStateChanged(async (user) => {
    console.log('Auth state changed, user:', user ? user.uid : 'No user');
    
    if (!user) {
        console.log('No authenticated user, redirecting to login...');
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = user;
    console.log('User authenticated:', user.uid, 'Email:', user.email);
    
    try {
        await loadUserInfo();
        setupUI();
        setupEventListeners();
        await loadAllData();
    } catch (error) {
        console.error('Error in auth state handler:', error);
        showMessage('Error loading application data', 'error');
    }
});

// Enhanced user info loader
async function loadUserInfo() {
    try {
        console.log('Loading user info for:', currentUser.uid);
        
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log('User data found:', userData);
            
            userRole = userData.role || 'buyer';
            console.log('User role set to:', userRole);
            
            const displayName = userData.businessName || userData.fullName || userData.email || currentUser.email || 'User';
            
            // Update UI elements
            const userInfoEl = document.getElementById('user-info');
            const roleBadgeEl = document.getElementById('role-badge');
            
            if (userInfoEl) userInfoEl.textContent = displayName;
            if (roleBadgeEl) roleBadgeEl.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        } else {
            console.log('User document does not exist, creating default...');
            
            // Create default user document
            await userRef.set({
                email: currentUser.email,
                uid: currentUser.uid,
                role: 'buyer',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            userRole = 'buyer';
            console.log('Default user document created with role: buyer');
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        console.error('Error details:', error.message, error.code);
        
        // Set default role
        userRole = 'buyer';
        
        // Update UI with default values
        const userInfoEl = document.getElementById('user-info');
        const roleBadgeEl = document.getElementById('role-badge');
        
        if (userInfoEl) userInfoEl.textContent = currentUser.email || 'User';
        if (roleBadgeEl) roleBadgeEl.textContent = 'Buyer';
        
        showMessage('Using default user settings', 'warning');
    }
}

// Setup UI based on role
function setupUI() {
    console.log('Setting up UI for role:', userRole);
    
    const tabsContainer = document.getElementById('invoice-tabs');
    if (!tabsContainer) {
        console.error('Tabs container not found!');
        return;
    }
    
    tabsContainer.innerHTML = '';
    
    // Create tabs based on user role
    if (userRole !== 'manufacturer') {
        console.log('Adding purchase tab');
        const purchaseTab = createTabButton('purchase-tab', '📥 Purchase Invoices');
        tabsContainer.appendChild(purchaseTab);
    }
    
    if (userRole !== 'buyer') {
        console.log('Adding sales tab');
        const salesTab = createTabButton('sales-tab', '📤 Sales Invoices');
        tabsContainer.appendChild(salesTab);
    }
    
    console.log('Adding history tab');
    const historyTab = createTabButton('history-tab', '📊 Transaction History');
    tabsContainer.appendChild(historyTab);
    
    // Activate first tab
    const firstTab = tabsContainer.querySelector('.tab-btn');
    if (firstTab) {
        console.log('Activating first tab:', firstTab.textContent);
        firstTab.classList.add('active');
        const tabId = firstTab.dataset.tab;
        const tabContent = document.getElementById(tabId);
        if (tabContent) {
            tabContent.classList.add('active');
        }
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
    btn.addEventListener('click', () => {
        console.log('Switching to tab:', tabId);
        switchTab(tabId);
    });
    return btn;
}

// Switch tab
function switchTab(tabId) {
    console.log('Switching to tab:', tabId);
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    } else {
        console.error(`Tab content not found for id: ${tabId}`);
    }
}

// Setup back link
function setupBackLink() {
    const backLink = document.getElementById('back-link');
    if (!backLink) {
        console.warn('Back link not found');
        return;
    }
    
    const dashboards = {
        manufacturer: 'manufacturer.html',
        distributor: 'distributor.html',
        retailer: 'retailer.html',
        buyer: 'buyer.html'
    };
    
    const dashboardPage = dashboards[userRole] || 'index.html';
    backLink.href = dashboardPage;
    console.log('Back link set to:', dashboardPage);
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Purchase filters
    const purchaseFilterBtn = document.getElementById('purchase-filter-btn');
    const purchaseClearBtn = document.getElementById('purchase-clear-btn');
    
    if (purchaseFilterBtn) {
        purchaseFilterBtn.addEventListener('click', () => {
            console.log('Applying purchase filters');
            renderPurchaseInvoices(true);
        });
    }
    
    if (purchaseClearBtn) {
        purchaseClearBtn.addEventListener('click', () => {
            console.log('Clearing purchase filters');
            clearPurchaseFilters();
        });
    }
    
    // Sales filters
    const salesFilterBtn = document.getElementById('sales-filter-btn');
    const salesClearBtn = document.getElementById('sales-clear-btn');
    
    if (salesFilterBtn) {
        salesFilterBtn.addEventListener('click', () => {
            console.log('Applying sales filters');
            renderSalesInvoices(true);
        });
    }
    
    if (salesClearBtn) {
        salesClearBtn.addEventListener('click', () => {
            console.log('Clearing sales filters');
            clearSalesFilters();
        });
    }
    
    // History filters
    const historyFilterBtn = document.getElementById('history-filter-btn');
    const historyClearBtn = document.getElementById('history-clear-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    
    if (historyFilterBtn) {
        historyFilterBtn.addEventListener('click', () => {
            console.log('Applying history filters');
            renderTransactionHistory(true);
        });
    }
    
    if (historyClearBtn) {
        historyClearBtn.addEventListener('click', () => {
            console.log('Clearing history filters');
            clearHistoryFilters();
        });
    }
    
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            console.log('Exporting to CSV');
            exportToCSV();
        });
    }
    
    // Modal close button
    const closeModalBtn = document.getElementById('close-invoice-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeInvoiceModal);
    }
}

// Load all data
async function loadAllData() {
    console.log('Loading all data for user:', currentUser.uid);
    
    try {
        showMessage('Loading invoices...', 'info');
        
        // Clear existing data
        purchaseInvoices = [];
        salesInvoices = [];
        allTransactions = [];
        
        // Load data based on user role
        const loadPromises = [];
        
        if (userRole !== 'manufacturer') {
            console.log('Loading purchase invoices...');
            loadPromises.push(loadPurchaseInvoices());
        }
        
        if (userRole !== 'buyer') {
            console.log('Loading sales invoices...');
            loadPromises.push(loadSalesInvoices());
        }
        
        if (loadPromises.length > 0) {
            await Promise.all(loadPromises);
        }
        
        // Load transaction history
        loadTransactionHistory();
        
        // Render summary
        renderSummaryCards();
        
        console.log('Data loaded successfully');
        showMessage('Data loaded successfully', 'success');
        
    } catch (error) {
        console.error('Error loading all data:', error);
        showMessage('Failed to load data: ' + error.message, 'error');
    }
}

// Enhanced purchase invoice loader
async function loadPurchaseInvoices() {
    if (userRole === 'manufacturer') {
        console.log('Skipping purchase invoices for manufacturer');
        return;
    }
    
    console.log('Loading purchase invoices for buyer:', currentUser.uid);
    
    try {
        // Query sales_invoices where this user is the buyer
        const querySnapshot = await db.collection('sales_invoices')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get();
        
        console.log(`Found ${querySnapshot.size} purchase invoices`);
        
        purchaseInvoices = [];
        
        querySnapshot.forEach((doc) => {
            try {
                const data = doc.data();
                console.log('Processing purchase invoice:', doc.id, data);
                
                // Validate and normalize data
                const invoice = {
                    invoiceId: doc.id,
                    ...data,
                    type: 'purchase',
                    // Ensure required fields exist
                    sellerName: data.sellerName || 'Unknown Seller',
                    sellerTIN: data.sellerTIN || 'N/A',
                    sellerAddress: data.sellerAddress || 'N/A',
                    sellerPhone: data.sellerPhone || 'N/A',
                    buyerName: data.buyerName || 'Unknown Buyer',
                    buyerTIN: data.buyerTIN || 'N/A',
                    buyerRole: data.buyerRole || 'Customer',
                    totalAmount: parseFloat(data.totalAmount) || 0,
                    items: Array.isArray(data.items) ? data.items : [],
                    timestamp: data.timestamp || new Date(),
                    ebmSerial: data.ebmSerial || 'N/A',
                    orderId: data.orderId || null
                };
                
                purchaseInvoices.push(invoice);
                
            } catch (docError) {
                console.error('Error processing document:', doc.id, docError);
            }
        });
        
        console.log('Successfully loaded', purchaseInvoices.length, 'purchase invoices');
        renderPurchaseInvoices();
        
    } catch (error) {
        console.error('Firestore error loading purchase invoices:', error);
        console.error('Error code:', error.code, 'Message:', error.message);
        
        // Show user-friendly error
        const tableBody = document.getElementById('purchase-table-body');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                        <div style="font-size: 48px;">⚠️</div>
                        <p>Error loading purchase invoices</p>
                        <p style="font-size: 12px; color: #999;">
                            ${error.code === 'permission-denied' ? 
                              'Permission denied. Please check Firestore rules.' : 
                              error.message}
                        </p>
                        <button onclick="loadPurchaseInvoices()" style="margin-top: 15px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Retry
                        </button>
                    </td>
                </tr>
            `;
        }
        
        showMessage('Failed to load purchase invoices', 'error');
    }
}

// Enhanced sales invoice loader
async function loadSalesInvoices() {
    if (userRole === 'buyer') {
        console.log('Skipping sales invoices for buyer');
        return;
    }
    
    console.log('Loading sales invoices for seller:', currentUser.uid);
    
    try {
        // Query sales_invoices where this user is the seller
        const querySnapshot = await db.collection('sales_invoices')
            .where('sellerId', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get();
        
        console.log(`Found ${querySnapshot.size} sales invoices`);
        
        salesInvoices = [];
        
        querySnapshot.forEach((doc) => {
            try {
                const data = doc.data();
                console.log('Processing sales invoice:', doc.id, data);
                
                // Validate and normalize data
                const invoice = {
                    invoiceId: doc.id,
                    ...data,
                    type: 'sale',
                    // Ensure required fields exist
                    sellerName: data.sellerName || 'Unknown Seller',
                    sellerTIN: data.sellerTIN || 'N/A',
                    sellerAddress: data.sellerAddress || 'N/A',
                    sellerPhone: data.sellerPhone || 'N/A',
                    buyerName: data.buyerName || 'Unknown Buyer',
                    buyerTIN: data.buyerTIN || 'N/A',
                    buyerRole: data.buyerRole || 'Customer',
                    totalAmount: parseFloat(data.totalAmount) || 0,
                    items: Array.isArray(data.items) ? data.items : [],
                    timestamp: data.timestamp || new Date(),
                    ebmSerial: data.ebmSerial || 'N/A',
                    orderId: data.orderId || null
                };
                
                salesInvoices.push(invoice);
                
            } catch (docError) {
                console.error('Error processing document:', doc.id, docError);
            }
        });
        
        console.log('Successfully loaded', salesInvoices.length, 'sales invoices');
        renderSalesInvoices();
        
    } catch (error) {
        console.error('Firestore error loading sales invoices:', error);
        console.error('Error code:', error.code, 'Message:', error.message);
        
        // Show user-friendly error
        const tableBody = document.getElementById('sales-table-body');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                        <div style="font-size: 48px;">⚠️</div>
                        <p>Error loading sales invoices</p>
                        <p style="font-size: 12px; color: #999;">
                            ${error.code === 'permission-denied' ? 
                              'Permission denied. Please check Firestore rules.' : 
                              error.message}
                        </p>
                        <button onclick="loadSalesInvoices()" style="margin-top: 15px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Retry
                        </button>
                    </td>
                </tr>
            `;
        }
        
        showMessage('Failed to load sales invoices', 'error');
    }
}

// Load transaction history
function loadTransactionHistory() {
    console.log('Loading transaction history');
    
    try {
        // Combine purchase and sales invoices
        allTransactions = [...purchaseInvoices, ...salesInvoices];
        
        console.log('Total transactions:', allTransactions.length);
        
        // Sort by date (newest first)
        allTransactions.sort((a, b) => {
            const dateA = getTimestampValue(a.timestamp);
            const dateB = getTimestampValue(b.timestamp);
            return dateB - dateA; // Descending
        });
        
        renderTransactionHistory();
        
    } catch (error) {
        console.error('Error loading transaction history:', error);
        showMessage('Failed to load transaction history', 'error');
    }
}

// Get timestamp value from various formats
function getTimestampValue(timestamp) {
    if (!timestamp) return 0;
    
    try {
        if (typeof timestamp === 'object') {
            if (timestamp.toDate && typeof timestamp.toDate === 'function') {
                return timestamp.toDate().getTime();
            }
            if (timestamp.seconds) {
                return timestamp.seconds * 1000;
            }
            if (timestamp instanceof Date) {
                return timestamp.getTime();
            }
        }
        
        // Try to parse as Date
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? 0 : date.getTime();
        
    } catch (error) {
        console.error('Error getting timestamp value:', error, timestamp);
        return 0;
    }
}

// Render purchase invoices
function renderPurchaseInvoices(applyFilters = false) {
    console.log('Rendering purchase invoices, applyFilters:', applyFilters);
    
    const tableBody = document.getElementById('purchase-table-body');
    if (!tableBody) {
        console.error('Purchase table body not found');
        return;
    }
    
    if (purchaseInvoices.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No purchase invoices found</p>
                    <p style="font-size: 12px; color: #999;">When you make purchases, they will appear here</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let filtered = [...purchaseInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('purchase-search')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('purchase-date-from')?.value;
        const dateTo = document.getElementById('purchase-date-to')?.value;
        
        if (search || dateFrom || dateTo) {
            filtered = filtered.filter(invoice => {
                // Search filter
                if (search) {
                    const matchesSearch = 
                        (invoice.sellerName?.toLowerCase() || '').includes(search) ||
                        (invoice.invoiceId?.toLowerCase() || '').includes(search);
                    if (!matchesSearch) return false;
                }
                
                // Date filter
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
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>No invoices match your filters</p>
                    <p style="font-size: 12px; color: #999;">Try adjusting your search or date range</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Build table rows
    tableBody.innerHTML = '';
    filtered.forEach((invoice, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(invoice.timestamp)}</td>
            <td>${invoice.sellerName}</td>
            <td class="invoice-number">${invoice.invoiceId}</td>
            <td>${invoice.items.length} items</td>
            <td class="amount-cell">${formatCurrency(invoice.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'purchase')">View</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    console.log('Rendered', filtered.length, 'purchase invoices');
}

// Render sales invoices
function renderSalesInvoices(applyFilters = false) {
    console.log('Rendering sales invoices, applyFilters:', applyFilters);
    
    const tableBody = document.getElementById('sales-table-body');
    if (!tableBody) {
        console.error('Sales table body not found');
        return;
    }
    
    if (salesInvoices.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No sales invoices found</p>
                    <p style="font-size: 12px; color: #999;">When you make sales, they will appear here</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let filtered = [...salesInvoices];
    
    if (applyFilters) {
        const search = document.getElementById('sales-search')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('sales-date-from')?.value;
        const dateTo = document.getElementById('sales-date-to')?.value;
        
        if (search || dateFrom || dateTo) {
            filtered = filtered.filter(invoice => {
                // Search filter
                if (search) {
                    const matchesSearch = 
                        (invoice.buyerName?.toLowerCase() || '').includes(search) ||
                        (invoice.invoiceId?.toLowerCase() || '').includes(search);
                    if (!matchesSearch) return false;
                }
                
                // Date filter
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
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>No invoices match your filters</p>
                    <p style="font-size: 12px; color: #999;">Try adjusting your search or date range</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Build table rows
    tableBody.innerHTML = '';
    filtered.forEach((invoice, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(invoice.timestamp)}</td>
            <td>${invoice.buyerName}</td>
            <td class="invoice-number">${invoice.invoiceId}</td>
            <td>${invoice.items.length} items</td>
            <td class="amount-cell">${formatCurrency(invoice.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${invoice.invoiceId}', 'sale')">View</button>
                <button class="action-btn btn-print" onclick="printInvoice('${invoice.invoiceId}')">🖨️ Print</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    console.log('Rendered', filtered.length, 'sales invoices');
}

// Render transaction history
function renderTransactionHistory(applyFilters = false) {
    console.log('Rendering transaction history, applyFilters:', applyFilters);
    
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) {
        console.error('History table body not found');
        return;
    }
    
    if (allTransactions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>No transactions found</p>
                    <p style="font-size: 12px; color: #999;">Your transaction history will appear here</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let filtered = [...allTransactions];
    
    if (applyFilters) {
        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('history-type-filter')?.value || '';
        const dateFrom = document.getElementById('history-date-from')?.value;
        const dateTo = document.getElementById('history-date-to')?.value;
        
        if (search || typeFilter || dateFrom || dateTo) {
            filtered = filtered.filter(transaction => {
                // Type filter
                if (typeFilter && transaction.type !== typeFilter) {
                    return false;
                }
                
                // Search filter
                if (search) {
                    const counterparty = transaction.type === 'purchase' 
                        ? transaction.sellerName 
                        : transaction.buyerName;
                    
                    const matchesSearch = 
                        (counterparty?.toLowerCase() || '').includes(search) ||
                        (transaction.invoiceId?.toLowerCase() || '').includes(search);
                    
                    if (!matchesSearch) return false;
                }
                
                // Date filter
                if (dateFrom || dateTo) {
                    const transactionDate = getDateFromTimestamp(transaction.timestamp);
                    if (!transactionDate) return false;
                    
                    const fromDate = dateFrom ? new Date(dateFrom) : null;
                    const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
                    
                    if (fromDate && transactionDate < fromDate) return false;
                    if (toDate && transactionDate > toDate) return false;
                }
                
                return true;
            });
        }
    }
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>No transactions match your filters</p>
                    <p style="font-size: 12px; color: #999;">Try adjusting your search, type, or date range</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Build table rows
    tableBody.innerHTML = '';
    filtered.forEach((transaction, index) => {
        const counterparty = transaction.type === 'purchase' 
            ? transaction.sellerName 
            : transaction.buyerName;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.timestamp)}</td>
            <td><span class="transaction-${transaction.type}">${transaction.type === 'purchase' ? '📥 Purchase' : '📤 Sale'}</span></td>
            <td>${counterparty}</td>
            <td>${transaction.items.length} items</td>
            <td class="amount-cell">${formatCurrency(transaction.totalAmount)} RWF</td>
            <td><span class="status-badge status-approved">✅ Approved</span></td>
            <td style="text-align: center;">
                <button class="action-btn" onclick="viewInvoiceDetails('${transaction.invoiceId}', '${transaction.type}')">Details</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    console.log('Rendered', filtered.length, 'transactions');
}

// Render summary cards
function renderSummaryCards() {
    const container = document.getElementById('summary-cards');
    if (!container) {
        console.warn('Summary cards container not found');
        return;
    }
    
    console.log('Rendering summary cards');
    
    // Calculate totals
    const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalTransactions = allTransactions.length;
    
    container.innerHTML = '';
    
    // Purchase summary (if applicable)
    if (userRole !== 'manufacturer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Purchases</div>
                <div class="summary-value currency">${formatCurrency(totalPurchases)} RWF</div>
                <div class="summary-sub">${purchaseInvoices.length} invoices</div>
            </div>
        `;
    }
    
    // Sales summary (if applicable)
    if (userRole !== 'buyer') {
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Total Sales</div>
                <div class="summary-value currency">${formatCurrency(totalSales)} RWF</div>
                <div class="summary-sub">${salesInvoices.length} invoices</div>
            </div>
        `;
    }
    
    // Transaction count
    container.innerHTML += `
        <div class="summary-card">
            <div class="summary-label">Total Transactions</div>
            <div class="summary-value">${totalTransactions}</div>
            <div class="summary-sub">All time</div>
        </div>
    `;
    
    // Net profit/loss (for distributors and retailers)
    if ((userRole === 'distributor' || userRole === 'retailer') && (salesInvoices.length > 0 || purchaseInvoices.length > 0)) {
        const netProfit = totalSales - totalPurchases;
        const profitClass = netProfit >= 0 ? 'profit' : 'loss';
        
        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-label">Net ${netProfit >= 0 ? 'Profit' : 'Loss'}</div>
                <div class="summary-value currency ${profitClass}">
                    ${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)} RWF
                </div>
                <div class="summary-sub">${netProfit >= 0 ? 'Profit' : 'Loss'}</div>
            </div>
        `;
    }
    
    console.log('Summary cards rendered');
}

// View invoice details - CRITICAL FIX
window.viewInvoiceDetails = async function(invoiceId, type) {
    console.log('View invoice details called:', invoiceId, type);
    
    if (!invoiceId || invoiceId === 'undefined' || invoiceId === 'null') {
        showMessage('Invalid invoice ID', 'error');
        console.error('Invalid invoice ID:', invoiceId);
        return;
    }
    
    // Check if invoiceId looks like base64 encoded data
    if (invoiceId.length > 50 && /[+/=]/.test(invoiceId)) {
        console.warn('Invoice ID appears to be base64 encoded:', invoiceId.substring(0, 50) + '...');
        showMessage('Invalid invoice format', 'error');
        return;
    }
    
    try {
        showMessage('Loading invoice details...', 'info');
        
        let invoice = null;
        
        // First, check local cache
        if (type === 'purchase') {
            invoice = purchaseInvoices.find(inv => inv.invoiceId === invoiceId);
        } else {
            invoice = salesInvoices.find(inv => inv.invoiceId === invoiceId);
        }
        
        // If not in cache, fetch from Firestore
        if (!invoice) {
            console.log('Invoice not in cache, fetching from Firestore...');
            
            const invoiceRef = db.collection('sales_invoices').doc(invoiceId);
            const invoiceDoc = await invoiceRef.get();
            
            if (!invoiceDoc.exists) {
                showMessage('Invoice not found in database', 'error');
                console.error('Invoice not found:', invoiceId);
                return;
            }
            
            const data = invoiceDoc.data();
            console.log('Invoice data from Firestore:', data);
            
            // Normalize invoice data
            invoice = {
                invoiceId: invoiceDoc.id,
                ...data,
                type: type,
                // Ensure all required fields
                sellerName: data.sellerName || 'Unknown Seller',
                sellerTIN: data.sellerTIN || 'N/A',
                sellerAddress: data.sellerAddress || 'N/A',
                sellerPhone: data.sellerPhone || 'N/A',
                buyerName: data.buyerName || 'Unknown Buyer',
                buyerTIN: data.buyerTIN || 'N/A',
                buyerRole: data.buyerRole || 'Customer',
                totalAmount: parseFloat(data.totalAmount) || 0,
                items: Array.isArray(data.items) ? data.items : [],
                timestamp: data.timestamp || new Date(),
                ebmSerial: data.ebmSerial || 'N/A',
                orderId: data.orderId || null
            };
        }
        
        // Display the invoice
        displayInvoiceDetails(invoice);
        
    } catch (error) {
        console.error('Error in viewInvoiceDetails:', error);
        console.error('Error details:', error.message, error.code);
        
        let errorMessage = 'Failed to load invoice details';
        
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission denied. You may not have access to this invoice.';
        } else if (error.code === 'not-found') {
            errorMessage = 'Invoice not found in the database.';
        } else if (error.message.includes('base64')) {
            errorMessage = 'Invalid invoice format. Please contact support.';
        }
        
        showMessage(errorMessage, 'error');
    }
};

// Display invoice details
function displayInvoiceDetails(invoice) {
    console.log('Displaying invoice:', invoice.invoiceId);
    
    const modalBody = document.getElementById('invoice-modal-body');
    const modalFooter = document.getElementById('invoice-modal-footer');
    const modal = document.getElementById('invoice-modal');
    
    if (!modalBody || !modalFooter || !modal) {
        console.error('Modal elements not found');
        showMessage('Modal elements not found', 'error');
        return;
    }
    
    // Build modal content
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
    
    modal.style.display = 'block';
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
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            showMessage('Please allow popups to print invoices', 'warning');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice ${invoiceId}</title>
                <style>
                    /* Print styles */
                </style>
            </head>
            <body>
                <div>Invoice content here...</div>
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
        showMessage('Failed to print invoice: ' + error.message, 'error');
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
        
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
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
    console.log(`${type.toUpperCase()}: ${text}`);
    
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

// Debug function to check Firestore data
window.debugFirestore = async function() {
    console.log('=== FIREBASE DEBUG INFO ===');
    console.log('Current user:', currentUser?.uid);
    console.log('User role:', userRole);
    
    // Check users collection
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        console.log('User document:', userDoc.exists ? userDoc.data() : 'Not found');
    } catch (error) {
        console.error('Error reading user document:', error);
    }
    
    // Check sales_invoices collection
    try {
        const invoicesSnapshot = await db.collection('sales_invoices')
            .where('buyerId', '==', currentUser.uid)
            .limit(5)
            .get();
        
        console.log('Purchase invoices count:', invoicesSnapshot.size);
        invoicesSnapshot.forEach(doc => {
            console.log(`Invoice ${doc.id}:`, doc.data());
        });
    } catch (error) {
        console.error('Error reading invoices:', error);
    }
    
    showMessage('Debug info logged to console', 'info');
};

// Add to global scope for debugging
window.debugInvoices = function() {
    console.log('Purchase invoices:', purchaseInvoices);
    console.log('Sales invoices:', salesInvoices);
    console.log('All transactions:', allTransactions);
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, invoices.js initialized');
    
    // Add debug button if in development
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔧 Debug';
        debugBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; padding: 10px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; z-index: 1000;';
        debugBtn.onclick = window.debugFirestore;
        document.body.appendChild(debugBtn);
    }
});