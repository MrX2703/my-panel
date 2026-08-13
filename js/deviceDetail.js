/**
 * DEVICE DETAIL MODULE
 * Handles device detail view with Info, SMS, and Send tabs
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
    setupSendSms(device);
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
    const selectors = ['smsSimSelector', 'sendSimSelector'];

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
// SMS TAB - WITH TIME DISPLAY FIX
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
        // timeAgo() now handles "06-08-2026 | 10:19 pm" format via parseDate()
        let timeDisplay = 'N/A';
        if (msg.time) {
            timeDisplay = timeAgo(msg.time);
        }
        
        // Check if message is new (less than 1 hour old)
        const isNew = msg.time && (() => {
            const date = parseDate(msg.time);
            if (!date) return false;
            const diffMs = Date.now() - date.getTime();
            return diffMs < 3600000; // less than 1 hour
        })();
        
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

// ────────────────────────────────────────────────
// SEND TAB
// ────────────────────────────────────────────────

function setupSendSms(device) {
    const sendBtn = document.getElementById('sendSmsBtn');
    const messageInput = document.getElementById('sendMessage');
    const charCount = document.getElementById('charCount');

    if (!sendBtn || !messageInput) return;

    messageInput.addEventListener('input', function() {
        const count = this.value.length;
        if (charCount) {
            charCount.textContent = count;
        }
    });

    sendBtn.addEventListener('click', function() {
        sendSmsMessage(device);
    });

    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendSmsMessage(device);
        }
    });
}

async function sendSmsMessage(device) {
    const simSelector = document.getElementById('sendSimSelector');
    const toInput = document.getElementById('sendToNumber');
    const messageInput = document.getElementById('sendMessage');

    const selectedSim = simSelector ? simSelector.value : (device.sims ? device.sims[0] : null);
    const toNumber = toInput ? toInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    if (!toNumber) {
        showTelegramAlert('Please enter a receiver number');
        return;
    }

    if (!message) {
        showTelegramAlert('Please enter a message');
        return;
    }

    if (message.length > 160) {
        showTelegramAlert('Message exceeds 160 characters');
        return;
    }

    showTelegramConfirm(`Send SMS to ${toNumber}?\n\nFrom: ${selectedSim}\nMessage: ${message}`, async (confirmed) => {
        if (!confirmed) return;

        showLoading('Sending SMS...');

        try {
            const result = await sendSms(
                device.id,
                currentSourceId,
                selectedSim,
                toNumber,
                message
            );

            if (result.success) {
                if (toInput) toInput.value = '';
                if (messageInput) messageInput.value = '';
                if (document.getElementById('charCount')) {
                    document.getElementById('charCount').textContent = '0';
                }

                showTelegramAlert('✅ SMS sent successfully!');
                hapticFeedback('light');
                switchTab('sms');
            }
        } catch (error) {
            console.error('Error sending SMS:', error);
            showTelegramAlert(`❌ Failed to send SMS: ${error.message || 'Unknown error'}`);
        } finally {
            hideLoading();
        }
    });
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
window.setupSendSms = setupSendSms;
window.sendSmsMessage = sendSmsMessage;
window.goBackToDashboard = goBackToDashboard;
