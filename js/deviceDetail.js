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

/**
 * Initialize device detail view
 */
function initDeviceDetail(device, sourceId) {
    currentDevice = device;
    currentSourceId = sourceId;
    currentSim = device.sims && device.sims.length > 0 ? device.sims[0] : null;

    // Update header
    updateDetailHeader(device);

    // Populate SIM selectors
    populateSimSelectors(device);

    // Load info tab
    loadInfoTab(device);

    // Load SMS tab (default)
    loadSmsTab(device);

    // Set up tab switching
    setupDetailTabs();

    // Set up send SMS
    setupSendSms(device);
}

/**
 * Update detail header
 */
function updateDetailHeader(device) {
    document.getElementById('detailDeviceName').textContent = `📱 ${device.name}`;

    const statusEl = document.getElementById('detailDeviceStatus');
    statusEl.textContent = device.status === 'online' ? '🟢 Online' : '🔴 Offline';
    statusEl.className = `device-status ${device.status === 'online' ? 'status-online' : 'status-offline'}`;

    document.getElementById('detailDeviceBattery').textContent = `🔋 ${device.battery}%`;
    document.getElementById('detailDeviceSignal').textContent = `📶 ${device.signal || 'N/A'}`;
    document.getElementById('detailDeviceLastSeen').textContent = `🕐 ${timeAgo(device.lastSeen)}`;
}

/**
 * Populate SIM selectors
 */
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

    // Set current SIM
    const smsSelector = document.getElementById('smsSimSelector');
    if (smsSelector) {
        currentSim = smsSelector.value;
        // Listen for SIM change
        smsSelector.addEventListener('change', function() {
            currentSim = this.value;
            loadSmsTab(currentDevice);
        });
    }
}

// ────────────────────────────────────────────────
// TAB MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Set up detail tabs
 */
function setupDetailTabs() {
    const tabs = document.querySelectorAll('.detail-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });
}

/**
 * Switch to a specific tab
 */
function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.detail-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.detail-content').forEach(c => {
        c.classList.toggle('active', c.id === tabName + 'Tab');
    });

    // Load tab content if needed
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

/**
 * Load info tab
 */
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

/**
 * Load SMS tab
 */
async function loadSmsTab(device) {
    const feed = document.getElementById('smsFeed');
    if (!feed) return;

    // Show loading
    feed.innerHTML = '<div class="sms-empty">Loading messages...</div>';

    try {
        // Unsubscribe from previous listener
        if (smsUnsubscribe) {
            smsUnsubscribe();
            smsUnsubscribe = null;
        }

        // Get current SIM
        const simSelector = document.getElementById('smsSimSelector');
        const selectedSim = simSelector ? simSelector.value : (device.sims ? device.sims[0] : null);

        // Set up real-time listener
        smsUnsubscribe = listenToSms(
            device.id,
            currentSourceId,
            selectedSim,
            (messages) => {
                renderSmsMessages(messages);
            }
        );

        // Also fetch initial messages
        const messages = await fetchSmsForDevice(device.id, currentSourceId, selectedSim, APP_CONFIG.maxSmsDisplay);
        renderSmsMessages(messages);

        // Update count
        const countEl = document.getElementById('smsCount');
        if (countEl) {
            countEl.textContent = `📊 Showing latest ${Math.min(messages.length, APP_CONFIG.maxSmsDisplay)} messages`;
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
 * Render SMS messages
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

    // Take only latest 100
    const displayMessages = messages.slice(0, APP_CONFIG.maxSmsDisplay);

    feed.innerHTML = displayMessages.map((msg, index) => `
        <div class="sms-item ${index === 0 ? 'new' : ''}">
            <div class="sms-header">
                <span class="sms-sender">📨 ${msg.sender}</span>
                <span class="sms-time">${timeAgo(msg.time)}</span>
            </div>
            <div class="sms-body">${msg.body}</div>
        </div>
    `).join('');

    // Auto-scroll to top (newest messages)
    feed.scrollTop = 0;
}

// ────────────────────────────────────────────────
// SEND TAB
// ────────────────────────────────────────────────

/**
 * Set up send SMS
 */
function setupSendSms(device) {
    const sendBtn = document.getElementById('sendSmsBtn');
    const messageInput = document.getElementById('sendMessage');
    const charCount = document.getElementById('charCount');

    if (!sendBtn || !messageInput) return;

    // Character count
    messageInput.addEventListener('input', function() {
        const count = this.value.length;
        if (charCount) {
            charCount.textContent = count;
        }
    });

    // Send button
    sendBtn.addEventListener('click', function() {
        sendSmsMessage(device);
    });

    // Enter key support
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendSmsMessage(device);
        }
    });
}

/**
 * Send SMS message
 */
async function sendSmsMessage(device) {
    const simSelector = document.getElementById('sendSimSelector');
    const toInput = document.getElementById('sendToNumber');
    const messageInput = document.getElementById('sendMessage');

    const selectedSim = simSelector ? simSelector.value : (device.sims ? device.sims[0] : null);
    const toNumber = toInput ? toInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    // Validation
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

    // Confirm before sending
    showTelegramConfirm(`Send SMS to ${toNumber}?\n\nFrom: ${selectedSim}\nMessage: ${message}`, async (confirmed) => {
        if (!confirmed) return;

        // Show loading
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
                // Clear inputs
                if (toInput) toInput.value = '';
                if (messageInput) messageInput.value = '';
                if (document.getElementById('charCount')) {
                    document.getElementById('charCount').textContent = '0';
                }

                showTelegramAlert('✅ SMS sent successfully!');
                hapticFeedback('light');

                // Switch to SMS tab to see the sent message
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

// ────────────────────────────────────────────────
// BACK NAVIGATION
// ────────────────────────────────────────────────

/**
 * Go back to dashboard
 */
function goBackToDashboard() {
    // Unsubscribe from SMS listener
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