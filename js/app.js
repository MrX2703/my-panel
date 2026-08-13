/**
 * MAIN APPLICATION
 * Initializes the app, handles navigation, and sets up event listeners
 */

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

async function initApp() {
    console.log('🚀 Initializing SMS Dashboard...');

    // Load Firebase configs from JSON file
    await loadFirebaseConfigs();

    // Set up Telegram WebApp
    setupTelegramApp();

    // Check for existing session
    const loggedIn = await isUserLoggedIn();
    if (loggedIn) {
        showDashboard();
    } else {
        showLoginScreen();
    }

    // Set up event listeners
    setupEventListeners();

    // Update admin button visibility
    await updateAdminButtonVisibility();

    console.log('✅ App initialized');
}

/**
 * Set up Telegram WebApp
 */
function setupTelegramApp() {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.expand();
            tg.enableClosingConfirmation();
            tg.MainButton.text = 'Refresh';
            tg.MainButton.onClick(() => {
                if (isUserLoggedIn() && typeof refreshDashboard === 'function') {
                    refreshDashboard();
                }
            });
            tg.MainButton.show();
            console.log('✅ Telegram WebApp initialized');
        }
    } catch (error) {
        console.warn('Telegram WebApp not available:', error);
    }
}

// ────────────────────────────────────────────────
// SCREEN MANAGEMENT
// ────────────────────────────────────────────────

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    clearLoginError();
    const input = document.getElementById('accessKeyInput');
    if (input) {
        setTimeout(() => input.focus(), 300);
    }
}

async function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    await updateAdminButtonVisibility();
    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

// ────────────────────────────────────────────────
// EVENT LISTENERS
// ────────────────────────────────────────────────

function setupEventListeners() {
    // ── Login ──
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    const keyInput = document.getElementById('accessKeyInput');
    if (keyInput) {
        keyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }

    // ── Admin Panel ──
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', async function() {
            const isUserAdmin = await isAdmin();
            if (isUserAdmin) {
                openAdminPanel();
            } else {
                showTelegramAlert('⛔ Access denied. Admin only.');
            }
        });
    }

    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener('click', async function() {
            const isUserAdmin = await isAdmin();
            if (isUserAdmin) {
                openAdminPanel();
            } else {
                showTelegramAlert('⛔ Access denied. Admin only.');
            }
        });
    }

    // ── Admin Modal ──
    document.getElementById('closeAdminModal')?.addEventListener('click', closeAdminPanel);
    document.getElementById('closeAdminModalBtn')?.addEventListener('click', closeAdminPanel);

    // ── Generate Key Modal ──
    document.getElementById('generateKeyBtn')?.addEventListener('click', showGenerateKeyModal);
    document.getElementById('cancelKeyBtn')?.addEventListener('click', closeGenerateKeyModal);
    document.getElementById('saveKeyBtn')?.addEventListener('click', saveNewKey);

    // ── Add Firebase Modal ──
    document.getElementById('addFirebaseBtn')?.addEventListener('click', showAddFirebaseModal);
    document.getElementById('cancelFirebaseBtn')?.addEventListener('click', closeAddFirebaseModal);

    // ── Confirm Modal ──
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', executeDelete);
    document.getElementById('cancelConfirmBtn')?.addEventListener('click', closeConfirmModal);

    // ── Refresh ──
    document.getElementById('refreshBtn')?.addEventListener('click', function() {
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        }
    });

    // ── Back to Dashboard ──
    document.getElementById('detailBackBtn')?.addEventListener('click', function() {
        if (typeof goBackToDashboard === 'function') {
            goBackToDashboard();
        }
    });

    // ── Filters ──
    if (typeof setupFilters === 'function') {
        setupFilters();
    }

    // ── Close modals on overlay click ──
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                if (this.id === 'adminModal') closeAdminPanel();
                else if (this.id === 'generateKeyModal') closeGenerateKeyModal();
                else if (this.id === 'addFirebaseModal') closeAddFirebaseModal();
                else if (this.id === 'confirmModal') closeConfirmModal();
            }
        });
    });

    console.log('✅ Event listeners set up');
}

// ────────────────────────────────────────────────
// LOGIN HANDLER
// ────────────────────────────────────────────────

async function handleLogin() {
    const input = document.getElementById('accessKeyInput');
    if (!input) return;

    const key = input.value.trim();
    clearLoginError();

    if (!key) {
        showLoginError('Please enter an access key');
        return;
    }

    const success = await loginWithKey(key);

    if (success) {
        input.value = '';
        showDashboard();
        hapticFeedback('light');
        showTelegramAlert('✅ Login successful! Welcome to SMS Dashboard.');
    } else {
        showLoginError('Invalid access key. Please try again.');
        input.value = '';
        input.focus();
        hapticFeedback('error');
    }
}

// ────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ────────────────────────────────────────────────

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (!document.getElementById('adminModal')?.classList.contains('hidden')) {
                closeAdminPanel();
            }
            if (!document.getElementById('generateKeyModal')?.classList.contains('hidden')) {
                closeGenerateKeyModal();
            }
            if (!document.getElementById('addFirebaseModal')?.classList.contains('hidden')) {
                closeAddFirebaseModal();
            }
            if (!document.getElementById('confirmModal')?.classList.contains('hidden')) {
                closeConfirmModal();
            }
        }
    });
}

// ────────────────────────────────────────────────
// ERROR HANDLING
// ────────────────────────────────────────────────

window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', { message, source, lineno, colno, error });
    if (error && error.message) {
        console.error('Error details:', error.message);
    }
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled rejection:', event.reason);
};

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.initApp = initApp;
window.setupTelegramApp = setupTelegramApp;
window.showLoginScreen = showLoginScreen;
window.showDashboard = showDashboard;
window.setupEventListeners = setupEventListeners;
window.handleLogin = handleLogin;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;

// ────────────────────────────────────────────────
// START APP
// ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    setupKeyboardShortcuts();
    initApp();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {});
} else {
    setupKeyboardShortcuts();
    initApp();
}
