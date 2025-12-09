import firebaseConfig from './firebase-config.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Disable offline persistence
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
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

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
    
    // Reset forms when switching tabs
    if (tab === 'register') {
      resetRegisterForms();
    } else if (tab === 'login') {
      document.getElementById('reset-password-container').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    }
  });
});

// Reset register forms
function resetRegisterForms() {
  document.getElementById('business-fields').classList.add('hidden');
  document.getElementById('buyer-fields').classList.add('hidden');
  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
}

// Role selection for registration
document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.role;
    
    // Update active button
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Show appropriate form
    if (role === 'buyer') {
      document.getElementById('business-fields').classList.add('hidden');
      document.getElementById('buyer-fields').classList.remove('hidden');
    } else {
      // Business roles
      document.getElementById('buyer-fields').classList.add('hidden');
      document.getElementById('business-fields').classList.remove('hidden');
      
      // Update business form title and hidden field
      const roleText = role.charAt(0).toUpperCase() + role.slice(1);
      document.getElementById('business-role-title').textContent = `${roleText} Registration`;
      document.getElementById('business-role-text').textContent = roleText;
      document.getElementById('business-role').value = role;
    }
  });
});

// ✅ PASSWORD RESET FUNCTIONALITY
document.getElementById('forgot-password-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('reset-password-container').classList.remove('hidden');
});

document.getElementById('cancel-reset').addEventListener('click', () => {
  document.getElementById('reset-password-container').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
});

document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('reset-email').value;
  
  try {
    await auth.sendPasswordResetEmail(email);
    showMessage('Password reset email sent! Check your inbox.', 'success');
    
    // Switch back to login form after 3 seconds
    setTimeout(() => {
      document.getElementById('reset-password-container').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('reset-email').value = '';
    }, 3000);
    
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// ✅ BUSINESS REGISTRATION (Manufacturer/Distributor/Retailer)
document.getElementById('register-business-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('business-email').value;
  const password = document.getElementById('business-password').value;
  const confirmPassword = document.getElementById('business-confirm-password').value;
  const businessName = document.getElementById('business-name').value;
  const tin = document.getElementById('business-tin').value;
  const role = document.getElementById('business-role').value;

  // Validation
  if (!role) {
    showMessage('Please select a role first', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showMessage('Passwords do not match', 'error');
    return;
  }

  if (tin.length !== 9) {
    showMessage('TIN must be exactly 9 digits', 'error');
    return;
  }

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);

    // Store user data in Firestore
    await db.collection('users').doc(userCredential.user.uid).set({
      uid: userCredential.user.uid,
      email: email,
      businessName: businessName,
      tin: tin,
      role: role,
      isBusiness: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showMessage(`Registration successful as ${role}! Redirecting...`, 'success');

    setTimeout(() => {
      window.location.href = `${role}.html`;
    }, 1500);

  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// ✅ BUYER REGISTRATION
document.getElementById('register-buyer-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('buyer-email').value;
  const password = document.getElementById('buyer-password').value;
  const confirmPassword = document.getElementById('buyer-confirm-password').value;
  const phone = document.getElementById('buyer-phone').value;

  // Validation
  if (password !== confirmPassword) {
    showMessage('Passwords do not match', 'error');
    return;
  }

  if (!phone.match(/^07[0-9]{8}$/)) {
    showMessage('Phone must be 10 digits starting with 07', 'error');
    return;
  }

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);

    // Store user data in Firestore
    await db.collection('users').doc(userCredential.user.uid).set({
      uid: userCredential.user.uid,
      email: email,
      phone: phone,
      role: 'buyer',
      isBusiness: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showMessage('Registration successful as buyer! Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = 'buyer.html';
    }, 1500);

  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// ✅ LOGIN FORM (FIXED - Better error handling)
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  showMessage('Logging in...', 'info');

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Try to get user document
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      // Create user document if it doesn't exist (for backward compatibility)
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        role: 'buyer', // Default role for backward compatibility
        isBusiness: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      showMessage('Login successful! Default profile created.', 'success');
      setTimeout(() => {
        window.location.href = 'buyer.html';
      }, 1500);
      return;
    }

    const userData = userDoc.data();
    const role = userData.role || 'buyer'; // Default to buyer if role missing

    showMessage('Login successful!', 'success');

    setTimeout(() => {
      if (role === "manufacturer") {
        window.location.href = "manufacturer.html";
      }
      else if (role === "distributor") {
        window.location.href = "distributor.html";
      }
      else if (role === "retailer") {
        window.location.href = "retailer.html";
      }
      else if (role === "buyer") {
        window.location.href = "buyer.html";
      }
      else {
        showMessage("Invalid role detected. Redirecting to home.", 'error');
        setTimeout(() => {
          window.location.href = "index.html";
        }, 2000);
      }
    }, 1000);

  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = error.message;
    
    // User-friendly error messages
    if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email. Please register first.';
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many failed attempts. Please try again later.';
    }
    
    showMessage(errorMessage, 'error');
  }
});

// ✅ AUTO LOGIN CHECK (FIXED)
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Check if we're already on an auth page
    const currentPath = window.location.pathname;
    if (currentPath.includes('auth.html') || currentPath.includes('index.html')) {
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
          const role = userDoc.data().role || 'buyer';
          
          // Don't redirect if we're in the middle of registration
          if (!document.getElementById('register-tab').classList.contains('active')) {
            setTimeout(() => {
              if (role === "manufacturer") {
                window.location.href = "manufacturer.html";
              }
              else if (role === "distributor") {
                window.location.href = "distributor.html";
              }
              else if (role === "retailer") {
                window.location.href = "retailer.html";
              }
              else if (role === "buyer") {
                window.location.href = "buyer.html";
              }
            }, 500);
          }
        }
      } catch (error) {
        console.error('Auto-login check error:', error);
      }
    }
  }
});

// ✅ Original registration form (kept for compatibility)
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const businessName = document.getElementById('register-business-name').value;
  const tinOrPhone = document.getElementById('register-tin').value;
  const role = document.getElementById('register-role').value;

  // ✅ VALIDATION
  if (role !== "buyer" && tinOrPhone.length !== 9) {
    showMessage('Business TIN must be exactly 9 digits', 'error');
    return;
  }

  if (role === "buyer" && tinOrPhone.length < 10) {
    showMessage('Buyer phone number is invalid', 'error');
    return;
  }

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection('users').doc(userCredential.user.uid).set({
      uid: userCredential.user.uid,
      email: email,
      businessName: role === "buyer" ? null : businessName,
      [role === "buyer" ? "phone" : "tin"]: tinOrPhone,
      role: role,
      isBusiness: role !== "buyer",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showMessage('Registration successful! Redirecting...', 'success');

    setTimeout(() => {
      if (role === "manufacturer") {
        window.location.href = "manufacturer.html";
      }
      else if (role === "distributor") {
        window.location.href = "distributor.html";
      }
      else if (role === "retailer") {
        window.location.href = "retailer.html";
      }
      else if (role === "buyer") {
        window.location.href = "buyer.html";
      }
    }, 1500);

  } catch (error) {
    showMessage(error.message, 'error');
  }
});