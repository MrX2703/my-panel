/**
 * CONFIGURATION FILE
 * Contains all constants, default values, and helper functions
 */

// ────────────────────────────────────────────────
// APP CONFIGURATION
// ────────────────────────────────────────────────

const APP_CONFIG = {
    name: 'SMS Dashboard',
    version: '1.0.0',
    maxSmsDisplay: 100, // Maximum SMS messages to show
    keyFormat: 'XXXX-XXXX-XXXX-XXXX', // Key format pattern
    defaultExpiryDays: 30, // Default expiry if not set
};

// ────────────────────────────────────────────────
// STORAGE KEYS (for localStorage)
// ────────────────────────────────────────────────

const STORAGE_KEYS = {
    ACCESS_KEYS: 'access_keys',
    FIREBASE_CONFIGS: 'firebase_configs',
    ADMIN_IDS: 'admin_ids',
    SESSION_KEY: 'session_access_key',
    SESSION_EXPIRY: 'session_expiry',
};

// ────────────────────────────────────────────────
// DEFAULT DATA STRUCTURES
// ────────────────────────────────────────────────

const DEFAULT_ACCESS_KEYS = {
    keys: []
};

const DEFAULT_FIREBASE_CONFIGS = {
    sources: []
};

const DEFAULT_ADMIN_IDS = {
    adminIds: []
};

// ────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────

/**
 * Get current date/time in ISO format
 */
function getCurrentISO() {
    return new Date().toISOString();
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format time ago (e.g., "2 minutes ago")
 */
function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return formatDate(dateString);
}

/**
 * Generate a random ID
 */
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

/**
 * Validate access key format (XXXX-XXXX-XXXX-XXXX)
 */
function isValidKeyFormat(key) {
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key);
}

/**
 * Check if a key is expired
 */
function isKeyExpired(expiresAt) {
    if (!expiresAt) return false;
    const now = new Date();
    const expiry = new Date(expiresAt);
    return now > expiry;
}

/**
 * Check if a key is active (not expired)
 */
function isKeyActive(expiresAt) {
    return !isKeyExpired(expiresAt);
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return fallback;
    }
}

/**
 * Get Telegram User ID from WebApp
 */
function getTelegramUserId() {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            return tg.initDataUnsafe.user.id;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Get Telegram User Name from WebApp
 */
function getTelegramUserName() {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            return user.username || user.first_name || 'User';
        }
        return 'User';
    } catch (e) {
        return 'User';
    }
}

/**
 * Show haptic feedback (if available)
 */
function hapticFeedback(style = 'light') {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred(style);
        }
    } catch (e) {
        // Silently fail
    }
}

/**
 * Show Telegram popup
 */
function showTelegramPopup(title, message, buttons = [{ type: 'ok' }]) {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.showPopup) {
            tg.showPopup({ title, message, buttons });
        } else {
            alert(message);
        }
    } catch (e) {
        alert(message);
    }
}

/**
 * Show Telegram alert (simple)
 */
function showTelegramAlert(message) {
    showTelegramPopup('', message);
}

/**
 * Show confirmation dialog
 */
function showTelegramConfirm(message, callback) {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.showPopup) {
            tg.showPopup({
                title: 'Confirm',
                message: message,
                buttons: [
                    { id: 'confirm', type: 'ok' },
                    { id: 'cancel', type: 'cancel' }
                ]
            }, (buttonId) => {
                if (buttonId === 'confirm') {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } else {
            const result = confirm(message);
            callback(result);
        }
    } catch (e) {
        const result = confirm(message);
        callback(result);
    }
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.APP_CONFIG = APP_CONFIG;
window.STORAGE_KEYS = STORAGE_KEYS;
window.DEFAULT_ACCESS_KEYS = DEFAULT_ACCESS_KEYS;
window.DEFAULT_FIREBASE_CONFIGS = DEFAULT_FIREBASE_CONFIGS;
window.DEFAULT_ADMIN_IDS = DEFAULT_ADMIN_IDS;

// Helper functions
window.getCurrentISO = getCurrentISO;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.generateId = generateId;
window.isValidKeyFormat = isValidKeyFormat;
window.isKeyExpired = isKeyExpired;
window.isKeyActive = isKeyActive;
window.truncateText = truncateText;
window.safeJsonParse = safeJsonParse;
window.getTelegramUserId = getTelegramUserId;
window.getTelegramUserName = getTelegramUserName;
window.hapticFeedback = hapticFeedback;
window.showTelegramPopup = showTelegramPopup;
window.showTelegramAlert = showTelegramAlert;
window.showTelegramConfirm = showTelegramConfirm;