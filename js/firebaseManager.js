/**
 * FIREBASE MANAGER
 * Handles Firebase connections, data fetching, and real-time updates
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let firebaseInstances = {};
let allDevices = [];
let deviceListeners = {};
let isInitialized = false;

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

/**
 * Initialize all Firebase connections from stored configs
 */
async function initFirebaseConnections() {
    try {
        const configs = loadFirebaseConfigs();
        console.log('📢 Firebase configs loaded:', configs);
        
        if (!configs || !configs.sources || configs.sources.length === 0) {
            console.log('📢 No Firebase sources configured');
            return false;
        }

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

/**
 * Connect to a single Firebase source
 */
async function connectToFirebase(source) {
    try {
        const { id, url, key } = source;
        
        // Check if already connected
        if (firebaseInstances[id] && firebaseInstances[id].connected) {
            return true;
        }

        console.log(`📢 Connecting to Firebase source: ${id}`);
        console.log(`📢 URL: ${url}`);

        // Initialize Firebase app
        const firebaseConfig = {
            apiKey: key,
            authDomain: url.replace('https://', '').replace('.firebaseio.com', '.firebaseapp.com'),
            databaseURL: url,
            projectId: url.replace('https://', '').replace('.firebaseio.com', ''),
            storageBucket: url.replace('https://', '').replace('.firebaseio.com', '.appspot.com'),
        };

        // Check if app already exists
        let app;
        try {
            app = firebase.app(id);
            console.log('📢 Using existing Firebase app');
        } catch (e) {
            app = firebase.initializeApp(firebaseConfig, id);
            console.log('📢 Created new Firebase app');
        }

        // Get Firestore instance
        const db = firebase.firestore(app);
        
        // Test connection by fetching a single document
        console.log('📢 Testing Firebase connection...');
        const testSnapshot = await db.collection('devices').limit(1).get();
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
        console.error('❌ Error details:', error.message);
        // Store as disconnected
        firebaseInstances[source.id] = {
            config: source,
            connected: false,
            error: error.message
        };
        return false;
    }
}

/**
 * Disconnect from a Firebase source
 */
function disconnectFromFirebase(sourceId) {
    try {
        if (firebaseInstances[sourceId]) {
            // Remove listeners
            if (deviceListeners[sourceId]) {
                deviceListeners[sourceId].forEach(unsubscribe => unsubscribe());
                delete deviceListeners[sourceId];
            }
            // Delete app
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
// DEVICE MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Fetch all devices from all connected Firebase sources
 */
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

/**
 * Fetch devices from a specific source
 */
async function fetchDevicesFromSource(sourceId) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        console.log(`📢 Querying devices collection...`);
        const snapshot = await instance.db.collection('devices').get();
        const devices = [];

        console.log(`📢 Snapshot size: ${snapshot.size} documents`);

        if (snapshot.empty) {
            console.log('⚠️ No devices found in collection');
            return [];
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`📢 Device document: ${doc.id}`, data);
            
            const device = {
                id: doc.id,
                sourceId: sourceId,
                name: data.name || data.deviceName || data.device_name || 'Unknown Device',
                number: data.number || data.phoneNumber || data.phone || data.phone_number || 'N/A',
                status: data.status || data.isOnline ? 'online' : 'offline',
                battery: data.battery || data.batteryLevel || data.battery_level || 0,
                signal: data.signal || data.signalStrength || data.signal_strength || 'N/A',
                model: data.model || data.deviceModel || data.device_model || 'N/A',
                lastSeen: data.lastSeen || data.lastUpdated || data.last_updated || data.timestamp || new Date().toISOString(),
                sims: data.sims || data.simNumbers || data.sim_numbers || [data.number || 'N/A'],
                unread: data.unreadCount || data.unreadSms || data.unread_sms || 0,
                raw: data
            };
            
            devices.push(device);
            console.log(`✅ Parsed device: ${device.name} (${device.status})`);
        });

        return devices;
    } catch (error) {
        console.error(`❌ Error fetching devices from ${sourceId}:`, error);
        console.error('❌ Error details:', error.message);
        throw error;
    }
}

/**
 * Listen for real-time device updates from all sources
 */
function listenToDevices(callback) {
    // Clear existing listeners
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
        const unsubscribe = instance.db.collection('devices')
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
// SMS MANAGEMENT
// ────────────────────────────────────────────────

/**
 * Fetch SMS messages for a specific device and SIM
 */
async function fetchSmsForDevice(deviceId, sourceId, simNumber, limit = 100) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        console.log(`📢 Fetching SMS for device: ${deviceId}, SIM: ${simNumber}`);
        let query = instance.db.collection('sms_messages')
            .where('deviceId', '==', deviceId)
            .orderBy('timestamp', 'desc')
            .limit(limit);

        if (simNumber && simNumber !== 'all') {
            query = query.where('simNumber', '==', simNumber);
        }

        const snapshot = await query.get();
        const messages = [];

        console.log(`📢 Found ${snapshot.size} SMS messages`);

        snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
                id: doc.id,
                sender: data.sender || data.from || 'Unknown',
                body: data.body || data.message || data.text || '',
                time: data.timestamp || data.time || data.createdAt || new Date().toISOString(),
                simNumber: data.simNumber || data.sim || 'N/A',
                type: data.type || 'incoming',
                raw: data
            });
        });

        return messages;
    } catch (error) {
        console.error(`❌ Error fetching SMS for device ${deviceId}:`, error);
        try {
            console.log('📢 Trying fallback query without orderBy...');
            let query = instance.db.collection('sms_messages')
                .where('deviceId', '==', deviceId)
                .limit(limit);

            if (simNumber && simNumber !== 'all') {
                query = query.where('simNumber', '==', simNumber);
            }

            const snapshot = await query.get();
            const messages = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                messages.push({
                    id: doc.id,
                    sender: data.sender || data.from || 'Unknown',
                    body: data.body || data.message || data.text || '',
                    time: data.timestamp || data.time || data.createdAt || new Date().toISOString(),
                    simNumber: data.simNumber || data.sim || 'N/A',
                    type: data.type || 'incoming',
                    raw: data
                });
            });
            messages.sort((a, b) => new Date(b.time) - new Date(a.time));
            console.log(`📢 Fallback query returned ${messages.length} messages`);
            return messages;
        } catch (fallbackError) {
            console.error('❌ Fallback SMS fetch failed:', fallbackError);
            return [];
        }
    }
}

/**
 * Listen for real-time SMS updates for a device
 */
function listenToSms(deviceId, sourceId, simNumber, callback) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        console.error('❌ Firebase not connected');
        return null;
    }

    console.log(`📢 Setting up SMS listener for device: ${deviceId}, SIM: ${simNumber}`);

    let query = instance.db.collection('sms_messages')
        .where('deviceId', '==', deviceId)
        .orderBy('timestamp', 'desc')
        .limit(APP_CONFIG.maxSmsDisplay);

    if (simNumber && simNumber !== 'all') {
        query = query.where('simNumber', '==', simNumber);
    }

    const unsubscribe = query.onSnapshot((snapshot) => {
        console.log(`📢 SMS update detected for device: ${deviceId}`);
        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
                id: doc.id,
                sender: data.sender || data.from || 'Unknown',
                body: data.body || data.message || data.text || '',
                time: data.timestamp || data.time || data.createdAt || new Date().toISOString(),
                simNumber: data.simNumber || data.sim || 'N/A',
                type: data.type || 'incoming',
                raw: data
            });
        });
        if (callback) callback(messages);
    }, (error) => {
        console.error('❌ Error listening to SMS:', error);
    });

    return unsubscribe;
}

// ────────────────────────────────────────────────
// SEND SMS
// ────────────────────────────────────────────────

/**
 * Send SMS from a device
 */
async function sendSms(deviceId, sourceId, simNumber, toNumber, message) {
    const instance = firebaseInstances[sourceId];
    if (!instance || !instance.connected) {
        throw new Error('Firebase not connected');
    }

    try {
        console.log(`📢 Sending SMS from ${simNumber} to ${toNumber}`);
        
        const smsData = {
            deviceId: deviceId,
            simNumber: simNumber,
            to: toNumber,
            from: simNumber,
            body: message,
            type: 'outgoing',
            status: 'sent',
            timestamp: new Date().toISOString(),
            sentAt: new Date().toISOString()
        };

        const docRef = await instance.db.collection('sms_messages').add(smsData);
        console.log(`✅ SMS sent successfully: ${docRef.id}`);
        
        await instance.db.collection('devices').doc(deviceId).update({
            lastActivity: new Date().toISOString(),
            lastSms: new Date().toISOString()
        }).catch(() => {
            console.log('⚠️ Could not update device lastActivity');
        });

        return {
            success: true,
            id: docRef.id,
            message: 'SMS sent successfully'
        };
    } catch (error) {
        console.error('❌ Error sending SMS:', error);
        throw error;
    }
}

// ────────────────────────────────────────────────
// STORAGE HELPERS
// ────────────────────────────────────────────────

/**
 * Load Firebase configs from localStorage
 */
function loadFirebaseConfigs() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIGS);
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.sources && parsed.sources.length > 0) {
                console.log('📢 Firebase configs loaded from localStorage:', parsed.sources.length);
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading Firebase configs from localStorage:', e);
    }
    
    console.log('📢 No Firebase configs found in localStorage');
    return DEFAULT_FIREBASE_CONFIGS;
}

/**
 * Save Firebase configs to localStorage
 */
function saveFirebaseConfigs(configs) {
    try {
        localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIGS, JSON.stringify(configs));
        console.log('📢 Firebase configs saved to localStorage');
    } catch (e) {
        console.error('Error saving Firebase configs:', e);
    }
}

/**
 * Add a new Firebase source
 */
function addFirebaseSource(url, key) {
    const configs = loadFirebaseConfigs();
    const newSource = {
        id: generateId(),
        url: url,
        key: key,
        addedAt: getCurrentISO()
    };
    configs.sources.push(newSource);
    saveFirebaseConfigs(configs);
    console.log('📢 Firebase source added:', newSource.id);
    return newSource;
}

/**
 * Remove a Firebase source
 */
function removeFirebaseSource(sourceId) {
    const configs = loadFirebaseConfigs();
    configs.sources = configs.sources.filter(s => s.id !== sourceId);
    saveFirebaseConfigs(configs);
    disconnectFromFirebase(sourceId);
    console.log('📢 Firebase source removed:', sourceId);
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.initFirebaseConnections = initFirebaseConnections;
window.connectToFirebase = connectToFirebase;
window.disconnectFromFirebase = disconnectFromFirebase;
window.fetchAllDevices = fetchAllDevices;
window.fetchDevicesFromSource = fetchDevicesFromSource;
window.listenToDevices = listenToDevices;
window.fetchSmsForDevice = fetchSmsForDevice;
window.listenToSms = listenToSms;
window.sendSms = sendSms;
window.loadFirebaseConfigs = loadFirebaseConfigs;
window.saveFirebaseConfigs = saveFirebaseConfigs;
window.addFirebaseSource = addFirebaseSource;
window.removeFirebaseSource = removeFirebaseSource;
window.firebaseInstances = firebaseInstances;
window.allDevices = allDevices;
