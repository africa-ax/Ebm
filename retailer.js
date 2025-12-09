import firebaseConfig from './firebase-config.js';

// Initialize Firebase - Same way as manufacturer.js and distributor.js
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Check authentication
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    // Load user business info
    loadUserBusinessInfo(user.uid);
    
    // Initialize dashboard
    initializeDashboard();
});

// Load user business information
async function loadUserBusinessInfo(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Verify retailer role
            if (userData.role !== 'retailer') {
                alert('Access denied. This page is for retailers only.');
                auth.signOut();
                return;
            }
            
            // Display business name
            document.getElementById('user-business-name').textContent = userData.businessName || 'Retailer';
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Initialize Dashboard
function initializeDashboard() {
    setupMenuToggle();
    setupNavigation();
}

// Setup hamburger menu toggle
function setupMenuToggle() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');

    hamburgerBtn.addEventListener('click', () => {
        sideMenu.classList.toggle('active');
        menuOverlay.classList.toggle('active');
    });

    menuOverlay.addEventListener('click', () => {
        sideMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    });
}

// Setup navigation
function setupNavigation() {
    // Logout button
    document.getElementById('menu-logout').addEventListener('click', async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await auth.signOut();
                window.location.href = 'auth.html';
            } catch (error) {
                console.error('Error logging out:', error);
                alert('Error logging out. Please try again.');
            }
        }
    });

    // Buy button - Navigate to buyer.html
    document.getElementById('buy-btn').addEventListener('click', () => {
        window.location.href = 'buyer.html';
    });

    // Sell button - Navigate to seller.html
    document.getElementById('sell-btn').addEventListener('click', () => {
        window.location.href = 'seller.html';
    });

    // Stock button - Navigate to stock.html
    document.getElementById('stock-btn').addEventListener('click', () => {
        window.location.href = 'stock.html';
    });
}