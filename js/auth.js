/**
 * AUTHENTICATION MODULE
 * Handles login, access key management, and session management
 */

let currentAccessKey = null;
let isLoggedIn = false;
let currentUser = null;

// ────────────────────────────────────────────────
// ACCESS KEY MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Load access keys from JSON file
 */
async function loadAccessKeys() {
    try {
        // Load from JSON file
        const response = await fetch('data/access-keys.json');
        if (response.ok) {
            const data = await response.json();
            // Save to localStorage for faster access
            localStorage.setItem(STORAGE_KEYS.ACCESS_KEYS, JSON.stringify(data));
            console.log('✅ Access keys loaded from JSON file');
            return data;
        } else {
            console.log('⚠️ Could not load access-keys.json, checking localStorage...');
        }
    } catch (e) {
        console.log('❌ Error loading access-keys.json:', e.message);
    }
    
    // Fallback: try localStorage
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ACCESS_KEYS);
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.keys && parsed.keys.length > 0) {
                console.log('✅ Access keys loaded from localStorage');
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading access keys from localStorage:', e);
    }
    
    // Return empty if nothing found
    console.log('⚠️ No access keys found');
    return DEFAULT_ACCESS_KEYS;
}

/**
 * Save access keys to localStorage
 */
function saveAccessKeys(keys) {
    try {
        localStorage.setItem(STORAGE_KEYS.ACCESS_KEYS, JSON.stringify(keys));
    } catch (e) {
        console.error('Error saving access keys:', e);
    }
}

/**
 * Validate an access key
 */
async function validateAccessKey(key) {
    if (!key || key.trim() === '') {
        return { valid: false, message: 'Please enter an access key' };
    }

    const keysData = await loadAccessKeys();
    const foundKey = keysData.keys.find(k => k.key === key.trim());

    if (!foundKey) {
        return { valid: false, message: 'Invalid access key' };
    }

    if (isKeyExpired(foundKey.expiresAt)) {
        return { valid: false, message: 'Access key has expired' };
    }

    // Key is valid - update usage
    foundKey.usedCount = (foundKey.usedCount || 0) + 1;
    foundKey.lastUsed = getCurrentISO();
    saveAccessKeys(keysData);

    return { valid: true, keyData: foundKey };
}

/**
 * Generate a new access key (admin only)
 */
function generateAccessKey(key, expiresAt) {
    if (!isValidKeyFormat(key)) {
        throw new Error('Invalid key format. Use format: XXXX-XXXX-XXXX-XXXX');
    }

    const keysData = loadAccessKeys();
    const existing = keysData.keys.find(k => k.key === key);
    if (existing) {
        throw new Error('Access key already exists');
    }

    const newKey = {
        id: generateId(),
        key: key.trim(),
        createdAt: getCurrentISO(),
        expiresAt: expiresAt || getDefaultExpiry(),
        status: 'active',
        usedCount: 0,
        lastUsed: null
    };

    keysData.keys.push(newKey);
    saveAccessKeys(keysData);

    return newKey;
}

/**
 * Delete an access key (admin only)
 */
function deleteAccessKey(keyId) {
    const keysData = loadAccessKeys();
    keysData.keys = keysData.keys.filter(k => k.id !== keyId);
    saveAccessKeys(keysData);
}

/**
 * Get default expiry date (30 days from now)
 */
function getDefaultExpiry() {
    const date = new Date();
    date.setDate(date.getDate() + APP_CONFIG.defaultExpiryDays);
    return date.toISOString();
}

/**
 * Get all access keys
 */
function getAllAccessKeys() {
    const keysData = loadAccessKeys();
    return keysData.keys;
}

// ────────────────────────────────────────────────
// SESSION MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Login with access key
 */
async function loginWithKey(key) {
    const result = await validateAccessKey(key);
    if (result.valid) {
        currentAccessKey = key;
        isLoggedIn = true;
        currentUser = {
            key: key,
            keyData: result.keyData,
            loginTime: getCurrentISO()
        };
        localStorage.setItem(STORAGE_KEYS.SESSION_KEY, key);
        localStorage.setItem(STORAGE_KEYS.SESSION_EXPIRY, getCurrentISO());
        return true;
    }
    return false;
}

/**
 * Check if user is logged in
 */
async function isUserLoggedIn() {
    if (isLoggedIn && currentAccessKey) {
        return true;
    }

    const sessionKey = localStorage.getItem(STORAGE_KEYS.SESSION_KEY);
    if (sessionKey) {
        const result = await validateAccessKey(sessionKey);
        if (result.valid) {
            currentAccessKey = sessionKey;
            isLoggedIn = true;
            currentUser = {
                key: sessionKey,
                keyData: result.keyData,
                loginTime: localStorage.getItem(STORAGE_KEYS.SESSION_EXPIRY) || getCurrentISO()
            };
            return true;
        } else {
            logout();
        }
    }

    return false;
}

/**
 * Logout user
 */
function logout() {
    currentAccessKey = null;
    isLoggedIn = false;
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION_KEY);
    localStorage.removeItem(STORAGE_KEYS.SESSION_EXPIRY);
}

/**
 * Get current user info
 */
function getCurrentUser() {
    return currentUser;
}

// ────────────────────────────────────────────────
// ADMIN AUTHENTICATION
// ────────────────────────────────────────────────

/**
 * Load admin IDs from JSON file
 */
async function loadAdminIds() {
    try {
        const response = await fetch('data/admin-config.json');
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(STORAGE_KEYS.ADMIN_IDS, JSON.stringify(data));
            return data;
        }
    } catch (e) {
        console.log('Could not load admin-config.json, checking localStorage...');
    }
    
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ADMIN_IDS);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error loading admin IDs from localStorage:', e);
    }
    
    return DEFAULT_ADMIN_IDS;
}

/**
 * Save admin IDs to localStorage
 */
function saveAdminIds(adminIds) {
    try {
        localStorage.setItem(STORAGE_KEYS.ADMIN_IDS, JSON.stringify(adminIds));
    } catch (e) {
        console.error('Error saving admin IDs:', e);
    }
}

/**
 * Check if current user is admin
 */
async function isAdmin() {
    // Get user ID from Telegram
    const userId = getTelegramUserId();
    if (!userId) return false;
    
    // Load admin IDs from config
    const adminData = await loadAdminIds();
    return adminData.adminIds.includes(userId);
}

/**
 * Add an admin ID
 */
function addAdminId(userId) {
    const adminData = loadAdminIds();
    if (!adminData.adminIds.includes(userId)) {
        adminData.adminIds.push(userId);
        saveAdminIds(adminData);
        return true;
    }
    return false;
}

/**
 * Remove an admin ID
 */
function removeAdminId(userId) {
    const adminData = loadAdminIds();
    adminData.adminIds = adminData.adminIds.filter(id => id !== userId);
    saveAdminIds(adminData);
}

/**
 * Get all admin IDs
 */
function getAllAdminIds() {
    const adminData = loadAdminIds();
    return adminData.adminIds;
}

// ────────────────────────────────────────────────
// UI HELPERS
// ────────────────────────────────────────────────

/**
 * Show login error message
 */
function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
    }
}

/**
 * Clear login error message
 */
function clearLoginError() {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = '';
    }
}

/**
 * Show/hide admin button based on user role
 */
async function updateAdminButtonVisibility() {
    const adminBtn = document.getElementById('adminLoginBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const isUserAdmin = await isAdmin();

    if (adminBtn) {
        if (isUserAdmin && !isLoggedIn) {
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
        }
    }

    if (adminPanelBtn) {
        if (isUserAdmin && isLoggedIn) {
            adminPanelBtn.classList.remove('hidden');
        } else {
            adminPanelBtn.classList.add('hidden');
        }
    }
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.loadAccessKeys = loadAccessKeys;
window.saveAccessKeys = saveAccessKeys;
window.validateAccessKey = validateAccessKey;
window.generateAccessKey = generateAccessKey;
window.deleteAccessKey = deleteAccessKey;
window.getDefaultExpiry = getDefaultExpiry;
window.getAllAccessKeys = getAllAccessKeys;
window.loginWithKey = loginWithKey;
window.isUserLoggedIn = isUserLoggedIn;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.loadAdminIds = loadAdminIds;
window.saveAdminIds = saveAdminIds;
window.isAdmin = isAdmin;
window.addAdminId = addAdminId;
window.removeAdminId = removeAdminId;
window.getAllAdminIds = getAllAdminIds;
window.showLoginError = showLoginError;
window.clearLoginError = clearLoginError;
window.updateAdminButtonVisibility = updateAdminButtonVisibility;
