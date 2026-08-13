/**
 * FIREBASE MANAGER
 * Handles Firebase connections, data fetching, and real-time updates
 */

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────

let firebaseInstances = {};
let allDevices = [];
let deviceListeners = [];
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
        if (!configs || !configs.sources || configs.sources.length === 0) {
            console.log('No Firebase sources configured');
            return false;
        }

        let successCount = 0;
        for (const source of configs.sources) {
            const connected = await connectToFirebase(source);
            if (connected) successCount++;
        }

        isInitialized = true;
        console.log(`Connected to ${successCount}/${configs.sources.length} Firebase sources`);
        return successCount > 0;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
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
        if (firebaseInstances[id]) {
            return true;
        }

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
        } catch (e) {
            app = firebase.initializeApp(firebaseConfig, id);
        }

        // Get Firestore instance
        const db = firebase.firestore(app);
        
        // Test connection by fetching a single document
        await db.collection('devices').limit(1).get();

        firebaseInstances[id] = {
            app: app,
            db: db,
            config: source,
            connected: true
        };

        console.log(`✅ Connected to Firebase: ${source.id}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to connect to Firebase ${source.id}:`, error);
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
            console.log(`Disconnected from Firebase: ${sourceId}`);
        }
    } catch (error) {
        console.error(`Error disconnecting from Firebase ${sourceId}:`, error);
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

    for (const sourceId of sources) {
        const instance = firebaseInstances[sourceId];
        if (!instance.connected) continue;

        try {
            const devices = await fetchDevicesFromSource(sourceId);
            allDevices = allDevices.concat(devices);
        } catch (error) {
            console.error(`Error fetching devices from ${sourceId}:`, error);
        }
    }

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
        const snapshot = await instance.db.collection('devices').get();
        const devices = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            devices.push({
                id: doc.id,
                sourceId: sourceId,
                name: data.name || data.deviceName || 'Unknown Device',
                number: data.number || data.phoneNumber || data.phone || 'N/A',
                status: data.status || data.isOnline ? 'online' : 'offline',
                battery: data.battery || data.batteryLevel || 0,
                signal: data.signal || data.signalStrength || 'N/A',
                model: data.model || data.deviceModel || 'N/A',
                lastSeen: data.lastSeen || data.lastUpdated || data.timestamp || new Date().toISOString(),
                sims: data.sims || data.simNumbers || [data.number || 'N/A'],
                unread: data.unreadCount || data.unreadSms || 0,
                // Store all data for flexibility
                raw: data
            });
        });

        return devices;
    } catch (error) {
        console.error(`Error fetching devices from ${sourceId}:`, error);
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

    for (const sourceId of sources) {
        const instance = firebaseInstances[sourceId];
        if (!instance.connected) continue;

        const unsubscribe = instance.db.collection('devices')
            .onSnapshot((snapshot) => {
                // Device data changed, refetch all
                fetchAllDevices().then(() => {
                    if (callback) callback(allDevices);
                });
            }, (error) => {
                console.error(`Error listening to devices from ${sourceId}:`, error);
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
        let query = instance.db.collection('sms_messages')
            .where('deviceId', '==', deviceId)
            .orderBy('timestamp', 'desc')
            .limit(limit);

        // If SIM number is specified, filter by it
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

        return messages;
    } catch (error) {
        console.error(`Error fetching SMS for device ${deviceId}:`, error);
        // Try fallback query without orderBy if index doesn't exist
        try {
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
            // Sort manually by time
            messages.sort((a, b) => new Date(b.time) - new Date(a.time));
            return messages;
        } catch (fallbackError) {
            console.error('Fallback SMS fetch failed:', fallbackError);
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
        console.error('Firebase not connected');
        return null;
    }

    let query = instance.db.collection('sms_messages')
        .where('deviceId', '==', deviceId)
        .orderBy('timestamp', 'desc')
        .limit(APP_CONFIG.maxSmsDisplay);

    if (simNumber && simNumber !== 'all') {
        query = query.where('simNumber', '==', simNumber);
    }

    const unsubscribe = query.onSnapshot((snapshot) => {
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
        console.error('Error listening to SMS:', error);
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

        // Save to Firestore
        const docRef = await instance.db.collection('sms_messages').add(smsData);
        
        // Also update the device's last activity
        await instance.db.collection('devices').doc(deviceId).update({
            lastActivity: new Date().toISOString(),
            lastSms: new Date().toISOString()
        }).catch(() => {
            // Ignore if device doesn't exist or can't update
        });

        return {
            success: true,
            id: docRef.id,
            message: 'SMS sent successfully'
        };
    } catch (error) {
        console.error('Error sending SMS:', error);
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
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error loading Firebase configs:', e);
    }
    return DEFAULT_FIREBASE_CONFIGS;
}

/**
 * Save Firebase configs to localStorage
 */
function saveFirebaseConfigs(configs) {
    try {
        localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIGS, JSON.stringify(configs));
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
    return newSource;
}

/**
 * Remove a Firebase source
 */
function removeFirebaseSource(sourceId) {
    const configs = loadFirebaseConfigs();
    configs.sources = configs.sources.filter(s => s.id !== sourceId);
    saveFirebaseConfigs(configs);
    // Disconnect from Firebase
    disconnectFromFirebase(sourceId);
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