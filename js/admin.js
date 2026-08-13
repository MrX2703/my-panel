/**
 * ADMIN MODULE
 * Handles admin panel: Access Keys and Firebase management
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let pendingDeleteId = null;
let pendingDeleteType = null; // 'key' or 'firebase'

// ────────────────────────────────────────────────
// ADMIN PANEL
// ────────────────────────────────────────────────

/**
 * Open admin panel
 */
async function openAdminPanel() {
    // Check if user is admin
    const isUserAdmin = await isAdmin();
    if (!isUserAdmin) {
        showTelegramAlert('⛔ Access denied. Admin only.');
        return;
    }

    // Show admin modal
    document.getElementById('adminModal').classList.remove('hidden');
    
    // Load data
    await loadAccessKeysList();
    await loadFirebaseSourcesList();
    updateAdminUserInfo();
    
    hapticFeedback('light');
}

/**
 * Close admin panel
 */
function closeAdminPanel() {
    document.getElementById('adminModal').classList.add('hidden');
}

/**
 * Update admin user info
 */
function updateAdminUserInfo() {
    const userId = getTelegramUserId();
    const userName = getTelegramUserName();
    const el = document.getElementById('adminUserInfo');
    if (el) {
        el.textContent = `👤 ${userName} (ID: ${userId || 'Unknown'})`;
    }
}

// ────────────────────────────────────────────────
// ACCESS KEYS MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Load and render access keys list
 */
async function loadAccessKeysList() {
    const container = document.getElementById('accessKeysList');
    if (!container) return;

    const keys = await getAllAccessKeys();

    if (!keys || keys.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:12px; color:var(--tg-theme-hint-color,#999); font-size:14px;">
                No access keys generated yet
            </div>
        `;
        return;
    }

    // Sort: active first, then expired
    const sorted = [...keys].sort((a, b) => {
        const aActive = isKeyActive(a.expiresAt);
        const bActive = isKeyActive(b.expiresAt);
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    container.innerHTML = sorted.map(key => {
        const active = isKeyActive(key.expiresAt);
        const statusText = active ? '🟢 Active' : '🔴 Expired';
        const statusClass = active ? 'key-status-active' : 'key-status-expired';
        
        return `
            <div class="key-item">
                <div class="key-item-info">
                    <div class="key-item-key">🔐 ${key.key}</div>
                    <div class="key-item-expiry">
                        Expires: ${formatDate(key.expiresAt)} &bull; Used: ${key.usedCount || 0} times
                    </div>
                    <div style="margin-top:2px;">
                        <span class="${statusClass}" style="font-size:12px; font-weight:500;">${statusText}</span>
                    </div>
                </div>
                <div class="key-item-actions">
                    <button class="btn btn-danger btn-sm" onclick="confirmDeleteKey('${key.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show generate key modal
 */
function showGenerateKeyModal() {
    document.getElementById('generateKeyModal').classList.remove('hidden');
    
    // Set default expiry (30 days from now)
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    
    const dateInput = document.getElementById('keyExpiryDate');
    const timeInput = document.getElementById('keyExpiryTime');
    
    if (dateInput) {
        dateInput.value = defaultDate.toISOString().split('T')[0];
        dateInput.min = new Date().toISOString().split('T')[0];
    }
    
    if (timeInput) {
        timeInput.value = '23:59';
    }
    
    // Clear previous input
    document.getElementById('newKeyInput').value = '';
    
    hapticFeedback('light');
}

/**
 * Close generate key modal
 */
function closeGenerateKeyModal() {
    document.getElementById('generateKeyModal').classList.add('hidden');
}

/**
 * Save new access key
 */
function saveNewKey() {
    const keyInput = document.getElementById('newKeyInput');
    const dateInput = document.getElementById('keyExpiryDate');
    const timeInput = document.getElementById('keyExpiryTime');
    
    const key = keyInput ? keyInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const time = timeInput ? timeInput.value : '';
    
    // Validate
    if (!key) {
        showTelegramAlert('Please enter an access key');
        return;
    }
    
    if (!isValidKeyFormat(key)) {
        showTelegramAlert('Invalid key format. Use: XXXX-XXXX-XXXX-XXXX');
        return;
    }
    
    if (!date) {
        showTelegramAlert('Please select an expiry date');
        return;
    }
    
    // Build expiry datetime
    const expiryDateTime = new Date(`${date}T${time || '23:59'}:00`);
    if (isNaN(expiryDateTime.getTime())) {
        showTelegramAlert('Invalid expiry date/time');
        return;
    }
    
    if (expiryDateTime <= new Date()) {
        showTelegramAlert('Expiry date must be in the future');
        return;
    }
    
    try {
        const newKey = generateAccessKey(key, expiryDateTime.toISOString());
        showTelegramAlert(`✅ Access key generated successfully!\n\nKey: ${newKey.key}\nExpires: ${formatDate(newKey.expiresAt)}`);
        
        closeGenerateKeyModal();
        loadAccessKeysList();
        hapticFeedback('light');
    } catch (error) {
        showTelegramAlert(`❌ ${error.message || 'Failed to generate key'}`);
    }
}

/**
 * Confirm delete access key
 */
function confirmDeleteKey(keyId) {
    pendingDeleteId = keyId;
    pendingDeleteType = 'key';
    
    const keys = getAllAccessKeys();
    const key = keys.find(k => k.id === keyId);
    
    if (!key) {
        showTelegramAlert('Key not found');
        return;
    }
    
    document.getElementById('confirmMessage').textContent = 
        `Are you sure you want to permanently delete this access key?\n\n🔐 ${key.key}\n\n⚠️ This action cannot be undone!`;
    
    document.getElementById('confirmModal').classList.remove('hidden');
    hapticFeedback('light');
}

/**
 * Execute delete
 */
function executeDelete() {
    if (pendingDeleteType === 'key') {
        deleteAccessKey(pendingDeleteId);
        showTelegramAlert('✅ Access key deleted successfully');
        loadAccessKeysList();
    } else if (pendingDeleteType === 'firebase') {
        removeFirebaseSource(pendingDeleteId);
        showTelegramAlert('✅ Firebase source removed successfully');
        loadFirebaseSourcesList();
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        }
    }
    
    closeConfirmModal();
    hapticFeedback('light');
}

/**
 * Close confirm modal
 */
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    pendingDeleteId = null;
    pendingDeleteType = null;
}

// ────────────────────────────────────────────────
// FIREBASE MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Load and render Firebase sources list
 */
async function loadFirebaseSourcesList() {
    const container = document.getElementById('firebaseSourcesList');
    if (!container) return;

    const configs = loadFirebaseConfigs();
    const sources = configs.sources || [];

    if (sources.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:12px; color:var(--tg-theme-hint-color,#999); font-size:14px;">
                No Firebase sources added yet
            </div>
        `;
        return;
    }

    container.innerHTML = sources.map(source => {
        const isConnected = firebaseInstances[source.id] && firebaseInstances[source.id].connected;
        const statusText = isConnected ? '🟢 Connected' : '🔴 Disconnected';
        const statusClass = isConnected ? 'status-connected' : 'status-disconnected';
        
        return `
            <div class="firebase-item">
                <div class="firebase-item-info">
                    <div class="firebase-item-name">🔥 ${source.id}</div>
                    <div class="firebase-item-url">${source.url}</div>
                    <div style="margin-top:2px;">
                        <span class="${statusClass}" style="font-size:12px; font-weight:500;">${statusText}</span>
                        <span style="font-size:11px; color:var(--tg-theme-hint-color,#999); margin-left:8px;">
                            Added: ${formatDate(source.addedAt)}
                        </span>
                    </div>
                </div>
                <div class="firebase-item-actions">
                    <button class="btn btn-danger btn-sm" onclick="confirmDeleteFirebase('${source.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show add Firebase modal
 */
function showAddFirebaseModal() {
    document.getElementById('addFirebaseModal').classList.remove('hidden');
    
    // Clear previous inputs
    document.getElementById('firebaseUrlInput').value = '';
    document.getElementById('firebaseKeyInput').value = '';
    document.getElementById('firebaseConnectionStatus').textContent = '';
    
    hapticFeedback('light');
}

/**
 * Close add Firebase modal
 */
function closeAddFirebaseModal() {
    document.getElementById('addFirebaseModal').classList.add('hidden');
}

/**
 * Save new Firebase source
 */
async function saveFirebaseSource() {
    const urlInput = document.getElementById('firebaseUrlInput');
    const keyInput = document.getElementById('firebaseKeyInput');
    const statusEl = document.getElementById('firebaseConnectionStatus');
    
    const url = urlInput ? urlInput.value.trim() : '';
    const key = keyInput ? keyInput.value.trim() : '';
    
    // Validate
    if (!url) {
        showTelegramAlert('Please enter Firebase URL');
        return;
    }
    
    if (!key) {
        showTelegramAlert('Please enter Firebase Key');
        return;
    }
    
    // Test connection
    if (statusEl) {
        statusEl.textContent = '⏳ Testing connection...';
        statusEl.style.color = 'var(--tg-theme-text-color, #000)';
    }
    
    try {
        // Add source (this saves to config)
        const newSource = addFirebaseSource(url, key);
        
        // Try to connect
        const connected = await connectToFirebase(newSource);
        
        if (connected) {
            if (statusEl) {
                statusEl.textContent = '✅ Connection successful!';
                statusEl.style.color = '#34c759';
            }
            showTelegramAlert('✅ Firebase added and connected successfully!');
            closeAddFirebaseModal();
            loadFirebaseSourcesList();
            
            if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            }
        } else {
            if (statusEl) {
                statusEl.textContent = '⚠️ Source added but connection failed. Check credentials.';
                statusEl.style.color = '#ff9500';
            }
            showTelegramAlert('⚠️ Firebase added but connection failed. Check credentials.');
            loadFirebaseSourcesList();
        }
        
        hapticFeedback('light');
    } catch (error) {
        console.error('Error adding Firebase:', error);
        if (statusEl) {
            statusEl.textContent = '❌ Failed to add Firebase';
            statusEl.style.color = '#ff3b30';
        }
        showTelegramAlert(`❌ Failed to add Firebase: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Confirm delete Firebase source
 */
function confirmDeleteFirebase(sourceId) {
    pendingDeleteId = sourceId;
    pendingDeleteType = 'firebase';
    
    const configs = loadFirebaseConfigs();
    const source = configs.sources.find(s => s.id === sourceId);
    
    if (!source) {
        showTelegramAlert('Source not found');
        return;
    }
    
    document.getElementById('confirmMessage').textContent = 
        `Are you sure you want to remove this Firebase source?\n\n🔥 ${source.id}\nURL: ${source.url}\n\n⚠️ This will remove all devices from this source from the dashboard.`;
    
    document.getElementById('confirmModal').classList.remove('hidden');
    hapticFeedback('light');
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

// Admin panel
window.openAdminPanel = openAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.updateAdminUserInfo = updateAdminUserInfo;

// Access keys
window.loadAccessKeysList = loadAccessKeysList;
window.showGenerateKeyModal = showGenerateKeyModal;
window.closeGenerateKeyModal = closeGenerateKeyModal;
window.saveNewKey = saveNewKey;
window.confirmDeleteKey = confirmDeleteKey;

// Firebase
window.loadFirebaseSourcesList = loadFirebaseSourcesList;
window.showAddFirebaseModal = showAddFirebaseModal;
window.closeAddFirebaseModal = closeAddFirebaseModal;
window.saveFirebaseSource = saveFirebaseSource;
window.confirmDeleteFirebase = confirmDeleteFirebase;

// Confirm modal
window.executeDelete = executeDelete;
window.closeConfirmModal = closeConfirmModal;
