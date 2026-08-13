/**
 * DEVICE DETAIL MODULE
 * Handles device detail view with Info and SMS tabs (Send removed)
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let currentDevice = null;
let currentSourceId = null;
let currentSim = null;
let smsUnsubscribe = null;
let currentTab = 'info';

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

function initDeviceDetail(device, sourceId) {
    currentDevice = device;
    currentSourceId = sourceId;
    currentSim = device.sims && device.sims.length > 0 ? device.sims[0] : null;

    updateDetailHeader(device);
    populateSimSelectors(device);
    loadInfoTab(device);
    loadSmsTab(device);
    setupDetailTabs();
}

function updateDetailHeader(device) {
    document.getElementById('detailDeviceName').textContent = `📱 ${device.name}`;

    const statusEl = document.getElementById('detailDeviceStatus');
    statusEl.textContent = device.status === 'online' ? '🟢 Online' : '🔴 Offline';
    statusEl.className = `device-status ${device.status === 'online' ? 'status-online' : 'status-offline'}`;

    document.getElementById('detailDeviceBattery').textContent = `🔋 ${device.battery}%`;
    document.getElementById('detailDeviceSignal').textContent = `📶 ${device.signal || 'N/A'}`;
    document.getElementById('detailDeviceLastSeen').textContent = `🕐 ${timeAgo(device.lastSeen)}`;
}

function populateSimSelectors(device) {
    const sims = device.sims || [device.number || 'N/A'];
    const selectors = ['smsSimSelector'];

    selectors.forEach(selectorId => {
        const select = document.getElementById(selectorId);
        if (!select) return;

        select.innerHTML = sims.map((sim, index) => `
            <option value="${sim}" ${index === 0 ? 'selected' : ''}>
                SIM ${index + 1}: ${sim}
            </option>
        `).join('');
    });

    const smsSelector = document.getElementById('smsSimSelector');
    if (smsSelector) {
        currentSim = smsSelector.value;
        smsSelector.addEventListener('change', function() {
            currentSim = this.value;
            loadSmsTab(currentDevice);
        });
    }
}

// ────────────────────────────────────────────────
// TAB MANAGEMENT
// ────────────────────────────────────────────────

function setupDetailTabs() {
    const tabs = document.querySelectorAll('.detail-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;

    document.querySelectorAll('.detail-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    document.querySelectorAll('.detail-content').forEach(c => {
        c.classList.toggle('active', c.id === tabName + 'Tab');
    });

    if (tabName === 'sms') {
        loadSmsTab(currentDevice);
    } else if (tabName === 'info') {
        loadInfoTab(currentDevice);
    }

    hapticFeedback('light');
}

// ────────────────────────────────────────────────
// INFO TAB
// ────────────────────────────────────────────────

function loadInfoTab(device) {
    const container = document.getElementById('detailInfoContent');
    if (!container) return;

    const sims = device.sims || [device.number || 'N/A'];

    let simHtml = sims.map((sim, index) => `
        <div class="info-item">
            <div class="info-item-label">📞 SIM ${index + 1}</div>
            <div class="info-item-value">${sim}</div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="info-grid">
            ${simHtml}
            <hr class="info-divider" style="grid-column: 1 / -1;">
            <div class="info-item">
                <div class="info-item-label">Device ID</div>
                <div class="info-item-value">${device.id}</div>
            </div>
            <div class="info-item">
                <div class="info-item-label">Device Model</div>
                <div class="info-item-value">${device.model || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-item-label">Status</div>
                <div class="info-item-value" style="color: ${device.status === 'online' ? '#34c759' : '#ff3b30'}">
                    ${device.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-item-label">Battery</div>
                <div class="info-item-value">${device.battery}%</div>
            </div>
            <div class="info-item">
                <div class="info-item-label">Signal</div>
                <div class="info-item-value">${device.signal || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-item-label">Last Seen</div>
                <div class="info-item-value">${formatDate(device.lastSeen)}</div>
            </div>
        </div>
    `;
}

// ────────────────────────────────────────────────
// SMS TAB
// ────────────────────────────────────────────────

async function loadSmsTab(device) {
    const feed = document.getElementById('smsFeed');
    if (!feed) return;

    feed.innerHTML = '<div class="sms-empty">Loading messages...</div>';

    try {
        if (smsUnsubscribe) {
            smsUnsubscribe();
            smsUnsubscribe = null;
        }

        const simSelector = document.getElementById('smsSimSelector');
        const selectedSim = simSelector ? simSelector.value : (device.sims ? device.sims[0] : null);

        smsUnsubscribe = listenToSms(
            device.id,
            currentSourceId,
            selectedSim,
            (messages) => {
                renderSmsMessages(messages);
            }
        );

        const messages = await fetchSmsForDevice(device.id, currentSourceId, selectedSim, APP_CONFIG.maxSmsDisplay);
        renderSmsMessages(messages);

        const countEl = document.getElementById('smsCount');
        if (countEl) {
            countEl.textContent = `📊 Showing ${Math.min(messages.length, APP_CONFIG.maxSmsDisplay)} message(s)`;
        }

    } catch (error) {
        console.error('Error loading SMS:', error);
        feed.innerHTML = `
            <div class="sms-empty">
                ❌ Failed to load messages<br>
                <span style="font-size:12px;">${error.message || 'Unknown error'}</span>
            </div>
        `;
    }
}

/**
 * Render SMS messages with proper time display
 */
function renderSmsMessages(messages) {
    const feed = document.getElementById('smsFeed');
    if (!feed) return;

    if (!messages || messages.length === 0) {
        feed.innerHTML = `
            <div class="sms-empty">
                📭 No messages found<br>
                <span style="font-size:12px;">Messages will appear here when received</span>
            </div>
        `;
        return;
    }

    const displayMessages = messages.slice(0, APP_CONFIG.maxSmsDisplay);

    feed.innerHTML = displayMessages.map((msg, index) => {
        let timeDisplay = 'N/A';
        
        if (msg.time) {
            let dateObj = null;
            
            // Try to parse "06-08-2026 | 10:19 pm" format
            if (typeof msg.time === 'string' && msg.time.includes('|')) {
                const parts = msg.time.split('|');
                if (parts.length === 2) {
                    const datePart = parts[0].trim();
                    const timePart = parts[1].trim();
                    
                    const dateParts = datePart.split('-');
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0]);
                        const month = parseInt(dateParts[1]) - 1;
                        const year = parseInt(dateParts[2]);
                        
                        let hours = 0;
                        let minutes = 0;
                        
                        const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                        if (timeMatch) {
                            hours = parseInt(timeMatch[1]);
                            minutes = parseInt(timeMatch[2]);
                            const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
                            
                            if (ampm === 'pm' && hours < 12) hours += 12;
                            if (ampm === 'am' && hours === 12) hours = 0;
                        }
                        
                        dateObj = new Date(year, month, day, hours, minutes);
                    }
                }
            }
            
            // If above failed, try standard Date parsing
            if (!dateObj || isNaN(dateObj.getTime())) {
                dateObj = new Date(msg.time);
            }
            
            // If still invalid, try as timestamp
            if (!dateObj || isNaN(dateObj.getTime())) {
                const ts = parseInt(msg.time);
                if (!isNaN(ts)) {
                    dateObj = new Date(ts);
                }
            }
            
            // Calculate time ago
            if (dateObj && !isNaN(dateObj.getTime())) {
                const now = new Date();
                const diffMs = now - dateObj;
                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);
                const diffDay = Math.floor(diffHour / 24);

                if (diffSec < 60) {
                    timeDisplay = 'Just now';
                } else if (diffMin < 60) {
                    timeDisplay = `${diffMin}m ago`;
                } else if (diffHour < 24) {
                    timeDisplay = `${diffHour}h ago`;
                } else if (diffDay < 7) {
                    timeDisplay = `${diffDay}d ago`;
                } else {
                    timeDisplay = dateObj.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
        }
        
        // Check if message is new (less than 1 hour old)
        let isNew = false;
        if (msg.time) {
            let dateObj = null;
            if (typeof msg.time === 'string' && msg.time.includes('|')) {
                const parts = msg.time.split('|');
                if (parts.length === 2) {
                    const datePart = parts[0].trim();
                    const timePart = parts[1].trim();
                    const dateParts = datePart.split('-');
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0]);
                        const month = parseInt(dateParts[1]) - 1;
                        const year = parseInt(dateParts[2]);
                        let hours = 0, minutes = 0;
                        const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                        if (timeMatch) {
                            hours = parseInt(timeMatch[1]);
                            minutes = parseInt(timeMatch[2]);
                            const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
                            if (ampm === 'pm' && hours < 12) hours += 12;
                            if (ampm === 'am' && hours === 12) hours = 0;
                        }
                        dateObj = new Date(year, month, day, hours, minutes);
                    }
                }
            }
            if (!dateObj || isNaN(dateObj.getTime())) {
                dateObj = new Date(msg.time);
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
                const diffMs = Date.now() - dateObj.getTime();
                isNew = diffMs < 3600000;
            }
        }
        
        return `
            <div class="sms-item ${isNew ? 'new' : ''}">
                <div class="sms-header">
                    <span class="sms-sender">📨 ${msg.sender}</span>
                    <span class="sms-time">${timeDisplay}</span>
                </div>
                <div class="sms-body">${msg.body}</div>
            </div>
        `;
    }).join('');

    feed.scrollTop = 0;
}

function goBackToDashboard() {
    if (smsUnsubscribe) {
        smsUnsubscribe();
        smsUnsubscribe = null;
    }

    document.getElementById('deviceDetailView').classList.remove('active');
    document.getElementById('deviceDetailView').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');

    currentDevice = null;
    currentSourceId = null;
    currentSim = null;
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.initDeviceDetail = initDeviceDetail;
window.updateDetailHeader = updateDetailHeader;
window.populateSimSelectors = populateSimSelectors;
window.setupDetailTabs = setupDetailTabs;
window.switchTab = switchTab;
window.loadInfoTab = loadInfoTab;
window.loadSmsTab = loadSmsTab;
window.renderSmsMessages = renderSmsMessages;
window.goBackToDashboard = goBackToDashboard;
