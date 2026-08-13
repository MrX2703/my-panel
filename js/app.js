/**
 * MAIN APPLICATION
 * Initializes the app, handles navigation, and sets up event listeners
 */

// ────────────────────────────────────────────────
// LOAD FIREBASE CONFIGS FROM JSON FILE
// ────────────────────────────────────────────────

/**
 * Load Firebase configs from JSON file
 * This function must be defined BEFORE initApp()
 */
async function loadFirebaseConfigsFromFile() {
    console.log('📢 Loading Firebase configs from JSON file...');
    try {
        const response = await fetch('data/firebase-configs.json');
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('firebase_configs', JSON.stringify(data));
            console.log('✅ Firebase configs loaded from JSON file:', data.sources ? data.sources.length : 0, 'sources');
            return data;
        } else {
            console.log('⚠️ Could not load firebase-configs.json, status:', response.status);
        }
    } catch (e) {
        console.log('⚠️ Error loading firebase-configs.json:', e.message);
    }
    
    // Try localStorage fallback
    try {
        const data = localStorage.getItem('firebase_configs');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.sources && parsed.sources.length > 0) {
                console.log('✅ Firebase configs loaded from localStorage fallback');
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
    
    console.log('📢 No Firebase configs found');
    return { sources: [] };
}

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

/**
 * Initialize the application
 */
async function initApp() {
    console.log('🚀 Initializing SMS Dashboard...');

    try {
        // Load Firebase configs from JSON file on startup
        await loadFirebaseConfigsFromFile();
    } catch (e) {
        console.log('⚠️ Error in loadFirebaseConfigsFromFile:', e.message);
    }

    // Set up Telegram WebApp
    setupTelegramApp();

    // Check for existing session
    const loggedIn = await isUserLoggedIn();
    if (loggedIn) {
        // User is already logged in
        showDashboard();
    } else {
        // Show login screen
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
            
            // Set up main button (optional)
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

/**
 * Show login screen
 */
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    
    // Clear login error
    clearLoginError();
    
    // Focus on input
    const input = document.getElementById('accessKeyInput');
    if (input) {
        setTimeout(() => input.focus(), 300);
    }
}

/**
 * Show dashboard
 */
async function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    
    // Update admin button visibility
    await updateAdminButtonVisibility();
    
    // Load dashboard data
    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

// ────────────────────────────────────────────────
// EVENT LISTENERS
// ────────────────────────────────────────────────

/**
 * Set up all event listeners
 */
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
    document.getElementById('saveFirebaseBtn')?.addEventListener('click', saveFirebaseSource);

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
                // Close the specific modal
                if (this.id === 'adminModal') closeAdminPanel();
                else if (this.id === 'generateKeyModal') closeGenerateKeyModal();
                else if (this.id === 'addFirebaseModal') closeAddFirebaseModal();
                else if (this.id === 'confirmModal') closeConfirmModal();
                else if (this.id === 'loadingOverlay') {
                    // Don't close loading overlay on click
                }
            }
        });
    });

    console.log('✅ Event listeners set up');
}

// ────────────────────────────────────────────────
// LOGIN HANDLER
// ────────────────────────────────────────────────

/**
 * Handle login
 */
async function handleLogin() {
    const input = document.getElementById('accessKeyInput');
    if (!input) return;

    const key = input.value.trim();
    clearLoginError();

    if (!key) {
        showLoginError('Please enter an access key');
        return;
    }

    // Attempt login
    const success = await loginWithKey(key);
    
    if (success) {
        // Login successful
        input.value = '';
        showDashboard();
        hapticFeedback('light');
        showTelegramAlert('✅ Login successful! Welcome to SMS Dashboard.');
    } else {
        // Login failed
        showLoginError('Invalid access key. Please try again.');
        input.value = '';
        input.focus();
        hapticFeedback('error');
    }
}

// ────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ────────────────────────────────────────────────

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Escape key to close modals
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

/**
 * Global error handler
 */
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', { message, source, lineno, colno, error });
    
    // Don't show errors to users in production, but log them
    if (error && error.message) {
        console.error('Error details:', error.message);
    }
};

/**
 * Handle unhandled promise rejections
 */
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
window.loadFirebaseConfigsFromFile = loadFirebaseConfigsFromFile;

// ────────────────────────────────────────────────
// START APP
// ────────────────────────────────────────────────

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize the app
    initApp();
});

// Also handle if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Already handled above
    });
} else {
    // DOM is already loaded
    setupKeyboardShortcuts();
    initApp();
}
