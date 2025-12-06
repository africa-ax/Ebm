import firebaseConfig from './firebase-config.js';

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

// ✅ LOGIN FORM
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
    const role = userData.role;

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
        alert("Invalid role detected.");
        auth.signOut();
      }
    }, 1000);

  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// ✅ REGISTER FORM (WITH PHONE FOR BUYER)
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
      businessName: role === "buyer" ? null : businessName,
      tinOrPhone: tinOrPhone,
      role: role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
    }, 1000);

  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// ✅ AUTO LOGIN CHECK
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (userDoc.exists) {
      const role = userDoc.data().role;

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
        auth.signOut();
      }
    }
  }
});