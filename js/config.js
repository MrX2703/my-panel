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
    maxSmsDisplay: 100,
    keyFormat: 'XXXX-XXXX-XXXX-XXXX',
    defaultExpiryDays: 30,
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
// DATE PARSING HELPERS
// ────────────────────────────────────────────────

/**
 * Parse various date formats
 */
function parseDate(input) {
    if (!input) return null;
    
    // If it's already a Date object
    if (input instanceof Date) return input;
    
    // If it's a number (timestamp)
    if (typeof input === 'number') {
        const date = new Date(input);
        if (!isNaN(date.getTime())) return date;
    }
    
    // If it's a string
    if (typeof input === 'string') {
        // Try format: "06-08-2026 | 10:19 pm"
        const match = input.match(/(\d{2})-(\d{2})-(\d{4}) \| (\d{1,2}):(\d{2}) (am|pm)/i);
        if (match) {
            let hours = parseInt(match[4]);
            const minutes = parseInt(match[5]);
            const ampm = match[6].toLowerCase();
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = parseInt(match[3]);
            
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            
            const date = new Date(year, month, day, hours, minutes);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Try format: "06-08-2026 | 10:19" (without am/pm)
        const match2 = input.match(/(\d{2})-(\d{2})-(\d{4}) \| (\d{1,2}):(\d{2})/);
        if (match2) {
            const hours = parseInt(match2[4]);
            const minutes = parseInt(match2[5]);
            const day = parseInt(match2[1]);
            const month = parseInt(match2[2]) - 1;
            const year = parseInt(match2[3]);
            
            const date = new Date(year, month, day, hours, minutes);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Try standard ISO format
        const date = new Date(input);
        if (!isNaN(date.getTime())) return date;
    }
    
    return null;
}

function getCurrentISO() {
    return new Date().toISOString();
}

function formatDate(dateInput) {
    if (!dateInput) return 'N/A';
    const date = parseDate(dateInput);
    if (!date) return 'N/A';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function timeAgo(dateInput) {
    if (!dateInput) return 'N/A';
    const date = parseDate(dateInput);
    if (!date) return 'N/A';
    
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
    return formatDate(date.toISOString());
}

function timestampToISO(timestamp) {
    if (!timestamp) return new Date().toISOString();
    if (typeof timestamp === 'string' && timestamp.includes('-')) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) return timestamp;
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function timeAgoFromTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';
    return timeAgo(date.toISOString());
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function isValidKeyFormat(key) {
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key);
}

function isKeyExpired(expiresAt) {
    if (!expiresAt) return false;
    const now = new Date();
    const expiry = new Date(expiresAt);
    return now > expiry;
}

function isKeyActive(expiresAt) {
    return !isKeyExpired(expiresAt);
}

function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function safeJsonParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return fallback;
    }
}

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

function showTelegramAlert(message) {
    showTelegramPopup('', message);
}

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

window.getCurrentISO = getCurrentISO;
window.parseDate = parseDate;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.timestampToISO = timestampToISO;
window.formatTimestamp = formatTimestamp;
window.timeAgoFromTimestamp = timeAgoFromTimestamp;
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
