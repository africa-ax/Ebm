import firebaseConfig from './firebase-config.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ========== TAB SWITCHING ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
    
    // Reset register tab to role selection
    if (tab === 'register') {
      showRoleSelection();
    }
  });
});

// ========== ROLE SELECTION ==========
function showRoleSelection() {
  document.getElementById('role-selection-view').classList.remove('hidden');
  document.getElementById('buyer-register-view').classList.add('hidden');
  document.getElementById('business-register-view').classList.add('hidden');
}

// Role card click handlers
document.querySelectorAll('.role-card').forEach(card => {
  card.addEventListener('click', () => {
    const role = card.dataset.role;
    
    if (role === 'buyer') {
      // Show buyer form
      document.getElementById('role-selection-view').classList.add('hidden');
      document.getElementById('buyer-register-view').classList.remove('hidden');
      document.getElementById('business-register-view').classList.add('hidden');
    } else {
      // Show business form
      document.getElementById('role-selection-view').classList.add('hidden');
      document.getElementById('buyer-register-view').classList.add('hidden');
      document.getElementById('business-register-view').classList.remove('hidden');
      
      // Set role and update title
      document.getElementById('business-role').value = role;
      const titles = {
        manufacturer: 'Manufacturer Registration',
        distributor: 'Distributor Registration',
        retailer: 'Retailer Registration'
      };
      document.getElementById('business-form-title').textContent = titles[role];
      document.getElementById('business-submit-btn').textContent = `Register as ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    }
  });
});

// Back buttons
document.getElementById('back-from-buyer').addEventListener('click', showRoleSelection);
document.getElementById('back-from-business').addEventListener('click', showRoleSelection);

// ========== SHOW MESSAGE ==========
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 5000);
}

// ========== LOGIN FORM ==========
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  try {
    showMessage('Logging in...', 'info');
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const userId = userCredential.user.uid;
    
    // Get user profile from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      showMessage('User profile not found. Please contact support.', 'error');
      await auth.signOut();
      return;
    }
    
    const userData = userDoc.data();
    showMessage('Login successful! Redirecting...', 'success');
    
    // Redirect based on role
    setTimeout(() => {
      switch(userData.role) {
        case 'manufacturer':
          window.location.href = 'manufacturer.html';
          break;
        case 'distributor':
          window.location.href = 'distributor.html';
          break;
        case 'retailer':
          window.location.href = 'retailer.html';
          break;
        case 'buyer':
          window.location.href = 'buyer.html';
          break;
        default:
          window.location.href = 'index.html';
      }
    }, 1000);
  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = 'Login failed. ';
    
    switch(error.code) {
      case 'auth/user-not-found':
        errorMessage += 'No account found with this email.';
        break;
      case 'auth/wrong-password':
        errorMessage += 'Incorrect password.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/user-disabled':
        errorMessage += 'This account has been disabled.';
        break;
      default:
        errorMessage += error.message;
    }
    
    showMessage(errorMessage, 'error');
  }
});

// ========== BUYER REGISTRATION ==========
document.getElementById('buyer-register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('buyer-email').value.trim();
  const password = document.getElementById('buyer-password').value;
  const fullName = document.getElementById('buyer-name').value.trim();
  const phone = document.getElementById('buyer-phone').value.trim();
  
  // Validate phone number
  if (!/^[0-9]{10}$/.test(phone)) {
    showMessage('Phone number must be exactly 10 digits', 'error');
    return;
  }
  
  try {
    showMessage('Creating buyer account...', 'info');
    
    // Create Firebase Auth user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const userId = userCredential.user.uid;
    
    // Create Firestore profile
    await db.collection('users').doc(userId).set({
      uid: userId,
      email: email,
      fullName: fullName,
      phone: phone,
      role: 'buyer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showMessage('Buyer account created successfully! Redirecting...', 'success');
    
    setTimeout(() => {
      window.location.href = 'buyer.html';
    }, 1500);
  } catch (error) {
    console.error('Buyer registration error:', error);
    
    let errorMessage = 'Registration failed. ';
    switch(error.code) {
      case 'auth/email-already-in-use':
        errorMessage += 'This email is already registered.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/weak-password':
        errorMessage += 'Password is too weak.';
        break;
      default:
        errorMessage += error.message;
    }
    
    showMessage(errorMessage, 'error');
  }
});

// ========== BUSINESS REGISTRATION ==========
document.getElementById('business-register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const role = document.getElementById('business-role').value;
  const email = document.getElementById('business-email').value.trim();
  const password = document.getElementById('business-password').value;
  const businessName = document.getElementById('business-name').value.trim();
  const businessTIN = document.getElementById('business-tin').value.trim();
  const businessAddress = document.getElementById('business-address').value.trim();
  const businessPhone = document.getElementById('business-phone').value.trim();
  
  // Validate TIN
  if (!/^[0-9]{9}$/.test(businessTIN)) {
    showMessage('TIN must be exactly 9 digits', 'error');
    return;
  }
  
  // Validate phone
  if (!/^[0-9]{10}$/.test(businessPhone)) {
    showMessage('Phone number must be exactly 10 digits', 'error');
    return;
  }
  
  try {
    showMessage(`Creating ${role} account...`, 'info');
    
    // Create Firebase Auth user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const userId = userCredential.user.uid;
    
    // Create Firestore profile
    await db.collection('users').doc(userId).set({
      uid: userId,
      email: email,
      businessName: businessName,
      businessTIN: businessTIN,
      businessAddress: businessAddress,
      businessPhone: businessPhone,
      role: role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showMessage(`${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully! Redirecting...`, 'success');
    
    // Redirect based on role
    setTimeout(() => {
      switch(role) {
        case 'manufacturer':
          window.location.href = 'manufacturer.html';
          break;
        case 'distributor':
          window.location.href = 'distributor.html';
          break;
        case 'retailer':
          window.location.href = 'retailer.html';
          break;
        default:
          window.location.href = 'index.html';
      }
    }, 1500);
  } catch (error) {
    console.error('Business registration error:', error);
    
    let errorMessage = 'Registration failed. ';
    switch(error.code) {
      case 'auth/email-already-in-use':
        errorMessage += 'This email is already registered.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      case 'auth/weak-password':
        errorMessage += 'Password is too weak.';
        break;
      default:
        errorMessage += error.message;
    }
    
    showMessage(errorMessage, 'error');
  }
});

// ========== PASSWORD RESET ==========
document.getElementById('forgot-password-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('reset-password-modal').style.display = 'block';
});

document.getElementById('close-reset-modal').addEventListener('click', () => {
  document.getElementById('reset-password-modal').style.display = 'none';
});

document.getElementById('cancel-reset').addEventListener('click', () => {
  document.getElementById('reset-password-modal').style.display = 'none';
});

document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('reset-email').value.trim();
  
  try {
    await auth.sendPasswordResetEmail(email);
    showMessage('Password reset email sent! Check your inbox.', 'success');
    document.getElementById('reset-password-modal').style.display = 'none';
    document.getElementById('reset-password-form').reset();
  } catch (error) {
    console.error('Password reset error:', error);
    
    let errorMessage = 'Failed to send reset email. ';
    switch(error.code) {
      case 'auth/user-not-found':
        errorMessage += 'No account found with this email.';
        break;
      case 'auth/invalid-email':
        errorMessage += 'Invalid email address.';
        break;
      default:
        errorMessage += error.message;
    }
    
    showMessage(errorMessage, 'error');
  }
});

// ========== CHECK IF ALREADY LOGGED IN ==========
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        
        // Redirect to appropriate dashboard
        switch(userData.role) {
          case 'manufacturer':
            window.location.href = 'manufacturer.html';
            break;
          case 'distributor':
            window.location.href = 'distributor.html';
            break;
          case 'retailer':
            window.location.href = 'retailer.html';
            break;
          case 'buyer':
            window.location.href = 'buyer.html';
            break;
        }
      }
    } catch (error) {
      console.error('Error checking user status:', error);
    }
  }
});