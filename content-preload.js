/**
 * Intents Browser - Content Preload Script  
 * Exposes Electron APIs to extension pages loaded in tabs
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('[ContentPreload] Loading...');

// Wrapper to add logging and error handling
function ipcSend(channel, ...args) {
    console.log(`[ContentPreload] Send: ${channel}`, args.length > 0 ? args : '');
    try {
        ipcRenderer.send(channel, ...args);
    } catch (err) {
        console.error(`[ContentPreload] Error sending ${channel}:`, err);
    }
}

async function ipcInvoke(channel, ...args) {
    console.log(`[ContentPreload] Invoke: ${channel}`, args.length > 0 ? args : '');
    try {
        const result = await ipcRenderer.invoke(channel, ...args);
        console.log(`[ContentPreload] Invoke result for ${channel}:`, result ? 'received' : 'null');
        return result;
    } catch (err) {
        console.error(`[ContentPreload] Error invoking ${channel}:`, err);
        throw err;
    }
}

function ipcOn(channel, callback) {
    console.log(`[ContentPreload] Registering listener: ${channel}`);
    ipcRenderer.on(channel, (event, value) => {
        console.log(`[ContentPreload] Received: ${channel}`);
        try {
            callback(value);
        } catch (err) {
            console.error(`[ContentPreload] Error in ${channel} callback:`, err);
        }
    });
}

// Expose electronAPI for chrome-shim compatibility
try {
    contextBridge.exposeInMainWorld('electronAPI', {
        // AI Search
        aiSearch: (query, settings) => ipcInvoke('ai-search', { query, settings }),

        // Navigation
        navigate: (url) => ipcSend('navigate', url),

        // Tab management
        createTab: () => ipcSend('tab-create'),
        closeTab: (id) => ipcSend('tab-close', id),
        switchTab: (id) => ipcSend('tab-switch', id),

        // Storage
        storageGet: (keys) => ipcInvoke('storage-get', keys),
        storageSet: (items) => ipcInvoke('storage-set', items),
        onStorageChanged: (callback) => ipcOn('storage-changed', callback),
        askAI: (prompt, settings, context) => ipcInvoke('ask-ai', prompt, settings, context),
        openSettings: () => ipcSend('open-settings')
    });

    console.log('[ContentPreload] window.electronAPI exposed successfully');

} catch (err) {
    console.error('[ContentPreload] Error exposing window.electronAPI:', err);
}

// Also expose as window.browser for compatibility
// Store callbacks for extension actions since we can't dispatch events across context boundary
let extensionActionCallback = null;

// Shared message handler
function handleRuntimeMessage(msg, callback) {
    console.log('[ContentPreload] handleRuntimeMessage:', msg.action);

    if (msg.action === 'saveThought' || msg.action === 'createPing') {
        ipcInvoke('storage-get', ['thoughts']).then(result => {
            const thoughts = result.thoughts || [];
            const newThought = {
                ...msg.thought,
                id: Date.now(),
                timestamp: new Date().toISOString()
            };
            thoughts.unshift(newThought);
            const trimmed = thoughts.slice(0, 200);
            ipcInvoke('storage-set', { thoughts: trimmed }).then(() => {
                if (callback) callback({ success: true, thought: newThought });
            });
        });
    } else if (msg.action === 'getFootsteps') {
        ipcInvoke('storage-get', ['footsteps']).then(result => {
            if (callback) callback({ footsteps: result.footsteps || [] });
        });
    } else if (msg.action === 'clearFootsteps') {
        ipcInvoke('storage-set', { footsteps: [] }).then(() => {
            if (callback) callback({ success: true });
        });
    } else if (msg.action === 'navigateToFootstep') {
        ipcSend('navigate', msg.url);
        if (callback) callback({ success: true });
    } else if (msg.action === 'checkAIKey') {
        ipcInvoke('storage-get', ['openaiKey', 'intentsSearchKey', 'geminiKey', 'grokKey']).then(res => {
            if (callback) callback({ hasKey: !!(res.openaiKey || res.intentsSearchKey || res.geminiKey || res.grokKey) });
        });
    } else if (msg.action === 'saveAIKey') {
        ipcInvoke('storage-set', { openaiKey: msg.key }).then(() => {
            if (callback) callback({ success: true });
        });
    } else if (msg.action === 'askAI') {
        ipcInvoke('storage-get', ['aiProvider', 'openaiKey', 'intentsSearchKey', 'geminiKey', 'grokKey']).then(settings => {
            ipcInvoke('ask-ai', msg.prompt, settings, msg.context).then(res => {
                if (res.error) {
                    if (callback) callback({ error: res.error });
                } else {
                    if (callback) callback({ answer: res.summary });
                }
            });
        });
    } else if (msg.action === 'getThoughts') {
        ipcInvoke('storage-get', ['thoughts']).then(result => {
            if (callback) callback({ thoughts: result.thoughts || [] });
        });
    } else if (msg.action === 'deleteThought') {
        ipcInvoke('storage-get', ['thoughts']).then(result => {
            const thoughts = result.thoughts || [];
            const newThoughts = thoughts.filter(t => t.id !== msg.id);
            ipcInvoke('storage-set', { thoughts: newThoughts }).then(() => {
                if (callback) callback({ success: true });
            });
        });
    } else if (msg.action === 'intentsSearchAI') {
        ipcInvoke('storage-get', ['aiProvider', 'openaiKey', 'intentsSearchKey', 'geminiKey', 'grokKey']).then(settings => {
            ipcInvoke('ai-search', { query: msg.query, settings }).then(res => {
                if (res.error) {
                    if (callback) callback({ error: res.error });
                } else {
                    if (callback) callback({
                        summary: res.summary,
                        links: res.links || [],
                        song_info: res.song_info
                    });
                }
            });
        });
    } else if (msg.action === 'getTrackerStats') {
        ipcInvoke('get-tracker-stats').then(stats => {
            if (callback) callback(stats);
        });
    } else if (msg.action === 'openInIntentMode') {
        ipcSend('navigate', msg.url);
        setTimeout(() => {
            ipcSend('extension-action', { action: 'activateIntentMode', intent: 'read', scrollTop: msg.scrollTop });
        }, 1000);
    } else if (msg.action === 'openSettings') {
        ipcSend('open-settings');
        if (callback) callback({ success: true });
    } else {
        console.warn('[ContentPreload] Unhandled action:', msg.action);
        if (callback) callback({ error: 'Action not implemented' });
    }
}

// Update browser exposure
try {
    contextBridge.exposeInMainWorld('browser', {
        aiSearch: (query, settings) => ipcInvoke('ai-search', { query, settings }),
        navigate: (url) => ipcSend('navigate', url),
        createTab: (url) => ipcSend('tab-create', url),
        storageGet: (keys) => ipcInvoke('storage-get', keys),
        storageSet: (items) => ipcInvoke('storage-set', items),
        onStorageChanged: (callback) => ipcOn('storage-changed', callback),
        askAI: (prompt, settings, context) => ipcInvoke('ask-ai', prompt, settings, context),
        openSettings: () => ipcSend('open-settings'),
        onSidebarVisibility: (callback) => ipcOn('sidebar-visibility', callback),
        onExtensionAction: (callback) => {
            extensionActionCallback = callback;
        },
        sendMessage: handleRuntimeMessage, // Backup method

        // Context Menu & Intent Actions
        getSelection: () => ipcInvoke('get-selection'),
        toggleIntentMode: () => ipcSend('toggle-intent-mode'),
        triggerIsolate: (text) => ipcSend('trigger-isolate', text),

        // Tor Control (Exposed to Incognito page)
        setTorEnabled: (enabled) => ipcSend('set-tor-enabled', enabled),
        panicIncognito: () => ipcSend('panic-incognito'),
        onTorSetupProgress: (callback) => ipcOn('tor-setup-progress', callback),
        onTorSetupError: (callback) => ipcOn('tor-setup-error', callback)
    });
} catch (err) {
    console.error('[ContentPreload] Error exposing window.browser:', err);
}

// Listen for extension actions from main process
const extensionListeners = [];

ipcRenderer.on('extension-action', (event, data) => {
    console.log('[ContentPreload] Extension action received:', data.action);

    // Notify browser.onExtensionAction listener (legacy/adapter)
    if (extensionActionCallback) {
        try {
            extensionActionCallback(data);
        } catch (err) {
            console.error('[ContentPreload] Error in extension action callback:', err);
        }
    }

    // Notify chrome.runtime.onMessage listeners
    extensionListeners.forEach(fn => {
        try {
            fn(data, {}, (response) => { });
        } catch (err) {
            console.error('[ContentPreload] Error in chrome listener:', err);
        }
    });
});

// Chrome Shim Implementation
const chromeShim = {
    runtime: {
        sendMessage: handleRuntimeMessage,
        onMessage: {
            addListener: function (fn) {
                extensionListeners.push(fn);
            },
            removeListener: function (fn) {
                const idx = extensionListeners.indexOf(fn);
                if (idx !== -1) extensionListeners.splice(idx, 1);
            }
        },
        getURL: function (path) { return path; }
    },
    storage: {
        local: {
            get: function (keys, callback) {
                ipcInvoke('storage-get', keys).then(result => {
                    if (callback) callback(result || {});
                });
            },
            set: function (items, callback) {
                ipcInvoke('storage-set', items).then(() => {
                    if (callback) callback();
                });
            }
        },
        onChanged: {
            addListener: function (callback) {
                ipcOn('storage-changed', callback);
            }
        }
    }
};

try {
    contextBridge.exposeInMainWorld('chrome', chromeShim);
    console.log('[ContentPreload] chrome API exposed successfully');
} catch (err) {
    console.error('[ContentPreload] Error exposing chrome API:', err);
}

// Mouse edge detection for sidebar autohide
let lastTriggerTime = 0;
window.addEventListener('mousemove', (e) => {
    // Top 50px reserved for window controls roughly
    if (e.clientX < 15 && e.clientY > 50) {
        const now = Date.now();
        // Throttle to avoid spamming IPC
        if (now - lastTriggerTime > 500) {
            console.log('[ContentPreload] Mouse at edge, triggering sidebar');
            ipcSend('sidebar-trigger', true);
            lastTriggerTime = now;
        }
    }
});

// Trackpad Swipe Gestures
let wheelAccumulatorX = 0;
let isSwiping = false;
const swipeThreshold = 180;
let lastWheelTime = 0;

window.addEventListener('wheel', (e) => {
    // Only handle horizontal-heavy events
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const now = Date.now();
        // If there hasn't been a wheel event in a while, it might be a new gesture
        if (now - lastWheelTime > 200) {
            wheelAccumulatorX = 0;
            isSwiping = false;
        }
        lastWheelTime = now;

        wheelAccumulatorX += e.deltaX;

        // Threshold to start showing the swipe indicator
        if (!isSwiping && Math.abs(wheelAccumulatorX) > 40) {
            isSwiping = true;
            ipcSend('swipe-gesture', {
                action: 'start',
                direction: wheelAccumulatorX < 0 ? 'back' : 'forward'
            });
        }

        if (isSwiping) {
            const progress = Math.min(100, (Math.abs(wheelAccumulatorX) / swipeThreshold) * 100);
            ipcSend('swipe-gesture', {
                action: 'update',
                direction: wheelAccumulatorX < 0 ? 'back' : 'forward',
                progress: progress,
                x: wheelAccumulatorX
            });

            // Trigger point reached
            if (Math.abs(wheelAccumulatorX) >= swipeThreshold) {
                console.log('[ContentPreload] Swipe threshold reached, navigating...');
                ipcSend('swipe-gesture', {
                    action: 'complete',
                    direction: wheelAccumulatorX < 0 ? 'back' : 'forward'
                });
                wheelAccumulatorX = 0;
                isSwiping = false;
            }
        }
    } else {
        // Vertical movement cancels horizontal swipe
        if (isSwiping && Math.abs(e.deltaY) > 30) {
            ipcSend('swipe-gesture', { action: 'cancel' });
            wheelAccumulatorX = 0;
            isSwiping = false;
        }
    }
}, { passive: true });

console.log('[ContentPreload] Initialization complete');

