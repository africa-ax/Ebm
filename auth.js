import firebaseConfig from '../firebase-config.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Disable offline persistence
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
  });
});

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

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
    
    if (!userDoc.exists) {
      showMessage('User profile not found', 'error');
      await auth.signOut();
      return;
    }
    
    const userData = userDoc.data();
    showMessage('Login successful!', 'success');
    
    // Redirect based on role
    setTimeout(() => {
      switch(userData.role) {
        case 'manufacturer':
          window.location.href = 'manufacturer.html';
          break;
        case 'distributor':
          window.location.href = 'seller.html';
          break;
        case 'retailer':
          window.location.href = 'retailer.html';
          break;
        default:
          window.location.href = 'buyer.html';
      }
    }, 1000);
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Register form
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const businessName = document.getElementById('register-business-name').value;
  const businessTIN = document.getElementById('register-tin').value;
  const role = document.getElementById('register-role').value;
  
  if (businessTIN.length !== 9) {
    showMessage('TIN must be exactly 9 digits', 'error');
    return;
  }
  
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    
    await db.collection('users').doc(userCredential.user.uid).set({
      uid: userCredential.user.uid,
      businessName: businessName,
      businessTIN: businessTIN,
      role: role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showMessage('Registration successful! Redirecting...', 'success');
    
    setTimeout(() => {
      switch(role) {
        case 'manufacturer':
          window.location.href = 'manufacturer.html';
          break;
        case 'distributor':
          window.location.href = 'seller.html';
          break;
        case 'retailer':
          window.location.href = 'retailer.html';
          break;
        default:
          window.location.href = 'buyer.html';}
    }, 1000);
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Check if already logged in
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Redirect to appropriate dashboard
      switch(userData.role) {
        case 'manufacturer':
          window.location.href = 'manufacturer.html';
          break;
        case 'distributor':
          window.location.href = 'seller.html';
          break;
        case 'retailer':
          window.location.href = 'retailer.html';
          break;
        default:
          window.location.href = 'buyer.html';
      }
    }
  }
});