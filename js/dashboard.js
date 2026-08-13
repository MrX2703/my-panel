/**
 * DASHBOARD MODULE
 * Handles dashboard rendering, device cards, filters, and stats
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let currentFilter = 'all';
let displayedDevices = [];
let dashboardListeners = [];

// ────────────────────────────────────────────────
// RENDER DASHBOARD
// ────────────────────────────────────────────────

/**
 * Render the dashboard with devices
 */
function renderDashboard(devices) {
    if (!devices) {
        devices = allDevices || [];
    }

    displayedDevices = devices;
    updateStats(devices);
    applyFilter(currentFilter);
}

/**
 * Update statistics
 */
function updateStats(devices) {
    const onlineCount = devices.filter(d => d.status === 'online').length;
    const totalCount = devices.length;
    const sourceCount = Object.keys(firebaseInstances).filter(id => firebaseInstances[id].connected).length;

    document.getElementById('onlineCount').textContent = onlineCount;
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('sourceCount').textContent = sourceCount;
}

/**
 * Apply filter to devices
 */
function applyFilter(filter) {
    currentFilter = filter || currentFilter;

    let filtered = [...displayedDevices];

    if (currentFilter === 'online') {
        filtered = filtered.filter(d => d.status === 'online');
    } else if (currentFilter === 'offline') {
        filtered = filtered.filter(d => d.status === 'offline');
    }

    renderDeviceCards(filtered);
}

/**
 * Render device cards
 */
function renderDeviceCards(devices) {
    const grid = document.getElementById('devicesGrid');
    
    if (!grid) return;

    if (devices.length === 0) {
        grid.innerHTML = `
            <div class="card" style="text-align:center; padding:40px 20px;">
                <div style="font-size:48px; margin-bottom:12px;">📭</div>
                <div style="font-size:16px; font-weight:500; color:var(--tg-theme-text-color,#000);">
                    No devices found
                </div>
                <div style="font-size:14px; color:var(--tg-theme-hint-color,#999); margin-top:4px;">
                    ${currentFilter === 'all' ? 'No devices connected yet' : `No ${currentFilter} devices`}
                </div>
            </div>
        `;
        return;
    }

    grid.innerHTML = devices.map(device => `
        <div class="device-card" onclick="openDeviceDetail('${device.id}', '${device.sourceId}')">
            <div class="device-header">
                <div class="device-name">📱 ${device.name}</div>
                <span class="device-status ${device.status === 'online' ? 'status-online' : 'status-offline'}">
                    ${device.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                </span>
            </div>
            <div class="device-details">
                <div class="device-detail-item">
                    <span class="label">📞</span>
                    ${device.sims && device.sims.length > 0 ? device.sims[0] : device.number}
                </div>
                <div class="device-detail-item">
                    <span class="label">📶</span> ${device.signal || 'N/A'}
                </div>
                <div class="device-detail-item">
                    <span class="label">🔋</span>
                    <div class="device-battery-wrap">
                        ${device.battery}%
                        <div class="battery-icon">
                            <div class="battery-level ${device.battery < 20 ? 'critical' : device.battery < 50 ? 'low' : ''}" 
                                 style="width: ${Math.min(device.battery, 100)}%"></div>
                        </div>
                    </div>
                </div>
                <div class="device-detail-item">
                    <span class="label">🕐</span> ${timeAgo(device.lastSeen)}
                </div>
                <div class="device-detail-item" style="grid-column: 1 / -1;">
                    <span class="label">📱</span> ${device.model || 'N/A'}
                </div>
                ${device.unread > 0 ? `
                <div class="device-detail-item" style="grid-column: 1 / -1; color: var(--tg-theme-button-color, #0088cc);">
                    💬 ${device.unread} new message${device.unread > 1 ? 's' : ''}
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ────────────────────────────────────────────────
// FILTER HANDLING
// ────────────────────────────────────────────────

/**
 * Set up filter tabs
 */
function setupFilters() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.dataset.filter;
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            // Apply filter
            applyFilter(filter);
            hapticFeedback('light');
        });
    });
}

// ────────────────────────────────────────────────
// REFRESH
// ────────────────────────────────────────────────

/**
 * Refresh dashboard data
 */
async function refreshDashboard() {
    showLoading('Refreshing devices...');
    try {
        await fetchAllDevices();
        renderDashboard(allDevices);
        showTelegramAlert('✅ Dashboard refreshed successfully');
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showTelegramAlert('❌ Failed to refresh dashboard');
    } finally {
        hideLoading();
    }
}

// ────────────────────────────────────────────────
// LOADING INDICATOR
// ────────────────────────────────────────────────

/**
 * Show loading overlay
 */
function showLoading(text) {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (overlay) {
        overlay.classList.remove('hidden');
        if (loadingText) {
            loadingText.textContent = text || 'Loading...';
        }
    }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// ────────────────────────────────────────────────
// NAVIGATION
// ────────────────────────────────────────────────

/**
 * Show dashboard view
 */
function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    
    // Update admin button visibility
    updateAdminButtonVisibility();
    
    // Load dashboard data
    loadDashboardData();
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    showLoading('Loading dashboard...');
    try {
        // Initialize Firebase connections
        await initFirebaseConnections();
        
        // Fetch devices
        await fetchAllDevices();
        
        // Render dashboard
        renderDashboard(allDevices);
        
        // Set up real-time listeners
        listenToDevices((devices) => {
            renderDashboard(devices);
        });
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showTelegramAlert('❌ Failed to load dashboard data');
    } finally {
        hideLoading();
    }
}

// ────────────────────────────────────────────────
// DEVICE DETAIL NAVIGATION
// ────────────────────────────────────────────────

/**
 * Open device detail view
 */
function openDeviceDetail(deviceId, sourceId) {
    const device = allDevices.find(d => d.id === deviceId && d.sourceId === sourceId);
    if (!device) {
        showTelegramAlert('Device not found');
        return;
    }
    
    // Store current device in global for detail view
    window.currentDeviceDetail = device;
    window.currentDeviceSourceId = sourceId;
    
    // Switch to detail view
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('deviceDetailView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.add('active');
    
    // Initialize detail view
    if (window.initDeviceDetail) {
        window.initDeviceDetail(device, sourceId);
    }
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.renderDashboard = renderDashboard;
window.updateStats = updateStats;
window.applyFilter = applyFilter;
window.renderDeviceCards = renderDeviceCards;
window.setupFilters = setupFilters;
window.refreshDashboard = refreshDashboard;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showDashboard = showDashboard;
window.loadDashboardData = loadDashboardData;
window.openDeviceDetail = openDeviceDetail;