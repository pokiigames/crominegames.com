// Initialize Firebase app
if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "REPLACE_ME") {
  console.error("Firebase config not set!");
  document.getElementById("not-configured").classList.remove("hidden");
} else {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
  } catch (e) {
    console.error("Error initializing Firebase:", e);
    document.getElementById("not-configured").classList.remove("hidden");
  }
}

const auth = firebase.apps.length ? firebase.auth() : null;
const db = firebase.apps.length ? firebase.firestore() : null;

if (!auth || !db) {
  console.error("Firebase Auth or Firestore not available!");
}

const googleBtn = document.getElementById("google-sign-in-btn");
const loginCard = document.getElementById("login-card");
const notAdminCard = document.getElementById("not-admin-card");
const notAdminSignOutBtn = document.getElementById("not-admin-sign-out-btn");
const adminSection = document.getElementById("admin-section");
const userInfo = document.getElementById("user-info");
const userEmailSpan = document.getElementById("user-email");
const signOutBtn = document.getElementById("sign-out-btn");

const usersLoading = document.getElementById("users-loading");
const usersTable = document.getElementById("users-table");
const usersTbody = usersTable.querySelector("tbody");
const usersEmpty = document.getElementById("users-empty");
const userSearchInput = document.getElementById("user-search-input");
const refreshUsersBtn = document.getElementById("refresh-users-btn");

const adminsLoading = document.getElementById("admins-loading");
const adminsTable = document.getElementById("admins-table");
const adminsTbody = adminsTable.querySelector("tbody");
const adminsEmpty = document.getElementById("admins-empty");
const newAdminEmailInput = document.getElementById("new-admin-email-input");
const addAdminEmailBtn = document.getElementById("add-admin-email-btn");

let allUsersCache = [];
let adminEmailsCache = [];

function setLoggedOutUI() {
  loginCard.classList.remove("hidden");
  notAdminCard.classList.add("hidden");
  adminSection.classList.add("hidden");
  userInfo.classList.add("hidden");
  userEmailSpan.textContent = "";
}

function setNotAdminUI(email) {
  loginCard.classList.add("hidden");
  notAdminCard.classList.remove("hidden");
  adminSection.classList.add("hidden");
  userInfo.classList.remove("hidden");
  userEmailSpan.textContent = email || "";
}

function setAdminUI(email) {
  loginCard.classList.add("hidden");
  notAdminCard.classList.add("hidden");
  adminSection.classList.remove("hidden");
  userInfo.classList.remove("hidden");
  userEmailSpan.textContent = email || "";
}

async function checkIsAdmin(user) {
  if (!db) {
    console.error("Firestore not initialized");
    return false;
  }
  if (!user || !user.email) {
    console.error("No user or email found");
    return false;
  }

  try {
    console.log("Checking admin status for:", user.email);
    const docRef = db.collection("admins").doc("admin_emails");
    const snap = await docRef.get();
    if (!snap.exists) {
      console.warn("Admin document does not exist. Create it in Firestore: collection 'admins', document 'admin_emails', field 'emails' (array of email strings).");
      return false;
    }
    const data = snap.data() || {};
    const emails = Array.isArray(data.emails) ? data.emails : [];
    console.log("Admin emails from Firestore:", emails);
    adminEmailsCache = emails;
    const isAdmin = emails.includes(user.email);
    console.log(`User ${user.email} is admin:`, isAdmin);
    return isAdmin;
  } catch (e) {
    console.error("Error checking admin status:", e);
    if (e.code === 'permission-denied') {
      console.error("Permission denied. Check Firestore security rules allow reading admins/admin_emails.");
    }
    return false;
  }
}

async function loadUsers() {
  if (!db) return;

  usersLoading.classList.remove("hidden");
  usersTable.classList.add("hidden");
  usersEmpty.classList.add("hidden");
  usersTbody.innerHTML = "";

  try {
    const snap = await db
      .collection("users")
      .orderBy("score", "desc")
      .limit(200)
      .get();

    const users = [];
    snap.forEach((doc) => {
      users.push({ id: doc.id, ...(doc.data() || {}) });
    });
    allUsersCache = users;
    renderUsersTable(users);
  } catch (e) {
    console.error("Error loading users:", e);
    usersLoading.textContent = "Error loading users (check console).";
  } finally {
    usersLoading.classList.add("hidden");
  }
}

function renderUsersTable(users) {
  usersTbody.innerHTML = "";
  if (!users.length) {
    usersTable.classList.add("hidden");
    usersEmpty.classList.remove("hidden");
    return;
  }

  usersEmpty.classList.add("hidden");
  usersTable.classList.remove("hidden");

  users.forEach((u) => {
    const tr = document.createElement("tr");

    const name = u.name || "—";
    const email = u.email || "—";
    const score = typeof u.score === "number" || typeof u.score === "bigint" ? u.score : 0;
    const rank = typeof u.rank === "number" ? u.rank : "";

    tr.innerHTML = `
      <td>${name}</td>
      <td>${email}</td>
      <td>${score}</td>
      <td>${rank}</td>
      <td>
        <button class="btn btn-secondary btn-sm" data-action="edit-score">Edit Score</button>
        <button class="btn btn-secondary btn-sm" data-action="delete-user">Delete</button>
      </td>
    `;

    tr.querySelector('[data-action="edit-score"]').addEventListener("click", () => {
      const newScoreStr = prompt(
        `Enter new score for ${name} (${email}):`,
        String(score)
      );
      if (newScoreStr == null) return;
      const newScore = Number(newScoreStr);
      if (!Number.isFinite(newScore) || newScore < 0) {
        alert("Invalid score");
        return;
      }
      updateUserScore(u.id, newScore);
    });

    tr.querySelector('[data-action="delete-user"]').addEventListener("click", () => {
      const yes = confirm(
        `Delete user "${name}" (${email})? This will remove their document from Firestore.`
      );
      if (!yes) return;
      deleteUser(u.id);
    });

    usersTbody.appendChild(tr);
  });
}

async function updateUserScore(userId, newScore) {
  try {
    await db.collection("users").doc(userId).update({
      score: newScore,
      lastUpdated: Date.now(),
    });
    alert("Score updated.");
    await loadUsers();
  } catch (e) {
    console.error("Error updating score:", e);
    alert("Failed to update score (check console).");
  }
}

async function deleteUser(userId) {
  try {
    await db.collection("users").doc(userId).delete();
    alert("User deleted.");
    await loadUsers();
  } catch (e) {
    console.error("Error deleting user:", e);
    alert("Failed to delete user (check console).");
  }
}

async function loadAdminEmails() {
  if (!db) return;

  adminsLoading.classList.remove("hidden");
  adminsTable.classList.add("hidden");
  adminsEmpty.classList.add("hidden");
  adminsTbody.innerHTML = "";

  try {
    const docRef = db.collection("admins").doc("admin_emails");
    const snap = await docRef.get();
    if (!snap.exists) {
      adminEmailsCache = [];
      renderAdminEmails([]);
      return;
    }
    const data = snap.data() || {};
    const emails = Array.isArray(data.emails) ? data.emails : [];
    adminEmailsCache = emails;
    renderAdminEmails(emails);
  } catch (e) {
    console.error("Error loading admin emails:", e);
    adminsLoading.textContent = "Error loading admin emails (check console).";
  } finally {
    adminsLoading.classList.add("hidden");
  }
}

function renderAdminEmails(emails) {
  adminsTbody.innerHTML = "";
  if (!emails.length) {
    adminsTable.classList.add("hidden");
    adminsEmpty.classList.remove("hidden");
    return;
  }

  adminsEmpty.classList.add("hidden");
  adminsTable.classList.remove("hidden");

  emails.forEach((email) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${email}</td>
      <td>
        <button class="btn btn-secondary btn-sm" data-action="remove-admin">Remove</button>
      </td>
    `;
    tr.querySelector('[data-action="remove-admin"]').addEventListener("click", () => {
      const yes = confirm(`Remove "${email}" from admin list?`);
      if (!yes) return;
      saveAdminEmails(adminEmailsCache.filter((e) => e !== email));
    });
    adminsTbody.appendChild(tr);
  });
}

async function saveAdminEmails(emails) {
  try {
    await db
      .collection("admins")
      .doc("admin_emails")
      .set({ emails }, { merge: false });
    alert("Admin emails updated.");
    await loadAdminEmails();
  } catch (e) {
    console.error("Error saving admin emails:", e);
    alert("Failed to update admin emails (check console).");
  }
}

// Event handlers
if (auth && db) {
  googleBtn.addEventListener("click", async () => {
    try {
      console.log("Starting Google Sign-In...");
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      const result = await auth.signInWithPopup(provider);
      console.log("Sign-in successful:", result.user.email);
    } catch (e) {
      console.error("Error during sign-in:", e);
      let errorMsg = "Sign-in failed. ";
      if (e.code === 'auth/popup-closed-by-user') {
        errorMsg += "Popup was closed.";
      } else if (e.code === 'auth/popup-blocked') {
        errorMsg += "Popup was blocked. Please allow popups for this site.";
      } else if (e.code === 'auth/unauthorized-domain') {
        errorMsg += "This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.";
      } else {
        errorMsg += `Error: ${e.message || e.code || 'Unknown error'}`;
      }
      alert(errorMsg);
    }
  });

  signOutBtn.addEventListener("click", () => auth.signOut());
  notAdminSignOutBtn.addEventListener("click", () => auth.signOut());

  refreshUsersBtn.addEventListener("click", () => loadUsers());

  userSearchInput.addEventListener("input", () => {
    const q = userSearchInput.value.trim().toLowerCase();
    if (!q) {
      renderUsersTable(allUsersCache);
      return;
    }
    const filtered = allUsersCache.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
    renderUsersTable(filtered);
  });

  addAdminEmailBtn.addEventListener("click", () => {
    const email = newAdminEmailInput.value.trim().toLowerCase();
    if (!email) {
      alert("Enter an email.");
      return;
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      alert("Enter a valid email.");
      return;
    }
    if (adminEmailsCache.includes(email)) {
      alert("That email is already an admin.");
      return;
    }
    saveAdminEmails([...adminEmailsCache, email]);
    newAdminEmailInput.value = "";
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tab}`).classList.add("active");
    });
  });

  // Auth state listener
  auth.onAuthStateChanged(async (user) => {
    console.log("Auth state changed. User:", user ? user.email : "null");
    if (!user) {
      setLoggedOutUI();
      return;
    }

    console.log("Checking if user is admin...");
    const isAdmin = await checkIsAdmin(user);
    if (!isAdmin) {
      console.log("User is not admin. Showing access denied message.");
      setNotAdminUI(user.email || "");
      return;
    }

    console.log("User is admin. Showing admin panel.");
    setAdminUI(user.email || "");

    // Load data once admin confirmed
    await Promise.all([loadUsers(), loadAdminEmails()]);
  });
} else {
  // Firebase not initialized; UI already shows config warning
  setLoggedOutUI();
}

