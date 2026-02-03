/**
 * Pulsar - Main Process
 * Handles window management, tabs, navigation, AI search, and storage
 */

const { app, BrowserWindow, BrowserView, ipcMain, screen, session, Menu, MenuItem, nativeImage, safeStorage, globalShortcut, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const {
    handleAISearch: handleAISearchHelper,
    GENERIC_SYSTEM_PROMPT: HELPER_SYSTEM_PROMPT,
    REWRITE_SYSTEM_PROMPTS,
    SUMMARIZE_SYSTEM_PROMPT,
    EXPLAIN_SYSTEM_PROMPT
} = require('./ai_helper');

console.log('[Main] Starting Pulsar...');

// Set app name for consistent userData path
app.name = 'Pulsar';

// Handle custom protocol for deep linking
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('pulsar', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('pulsar');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }

        // Protocol handler for Windows/Linux
        const url = commandLine.pop();
        if (url && url.startsWith('pulsar://')) {
            handleDeepLink(url);
        }
    });
}

function handleDeepLink(urlStr) {
    console.log('[Main] Handling deep link:', urlStr);
    try {
        const url = new URL(urlStr);
        if (url.hostname === 'auth') {
            const params = Object.fromEntries(url.searchParams.entries());
            sendToRenderer('auth-callback', params);
        }
    } catch (e) {
        console.error('[Main] Failed to parse deep link:', e.message);
    }
}

// ============================================
// AUTO-UPDATER CONFIG
// ============================================

autoUpdater.autoDownload = true; // Automatically download updates

autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    sendToRenderer('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info);
    sendToRenderer('update-status', { status: 'available', info });
});

autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Update not available.');
    sendToRenderer('update-status', { status: 'not-available', info });
});

autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
    sendToRenderer('update-status', { status: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    sendToRenderer('update-status', { status: 'downloading', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded');
    sendToRenderer('update-status', { status: 'downloaded', info });
});

ipcMain.on('check-updates', () => {
    autoUpdater.checkForUpdates();
});

ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

// ============================================
// CONFIGURATION
// ============================================

// ============================================
// CONFIGURATION
// ============================================

const STORAGE_PATH = path.join(app.getPath('userData'), 'intents-storage.json');
console.log('[Main] Storage path:', STORAGE_PATH);
const NEW_TAB_URL = path.join(__dirname, 'extension', 'index.html');
const INCOGNITO_TAB_URL = path.join(__dirname, 'incognito.html');

// Google OAuth Credentials (Replace with yours or set env vars)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '144962418419-ak7hh1vmkao282tpbpetu02mpv2pql1s.apps.googleusercontent.com';


// ============================================
// STATE
// ============================================

const { exec, spawn } = require('child_process');

let windows = []; // Array of BrowserWindow objects with extra properties
let tabs = [];
let tabIdCounter = 1;
let folders = [];
let stateTimer = null;
let splitRatio = 0.5;

// Helper to get state for a window
function getWindowState(win) {
    if (!win) return null;
    return {
        id: win.id,
        sidebarView: win._sidebarView,
        activeTabId: win._activeTabId,
        isIncognito: win._isIncognito
    };
}

// Compatibility helpers for existing code
let isSettingsOpen = false; // Globally shared for now (modal)
let isAIOverlayOpen = false;
let isActionBarOpen = false;
let isFindActive = false;
let isDownloadsActive = false;
let isAutoHideEnabled = false;
let torProcess = null; // Managed Tor daemon
let incognitoSecret = Math.random().toString(36).substring(2); // Seed for deterministic noise

// Global view references are now deprecated in favor of per-window views,
// but kept as stubs to prevent immediate errors during migration.
let mainWindow = null;
let sidebarView = null;
let suggestionsView = null;

// ============================================
// PRIVACY & PERFORMANCE CONSTANTS
// ============================================

const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', '_ga', '_gl', 'mc_eid', 'msclkid', 'twclid', 'igshid'
];

const GHOST_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function throttle(fn, limit) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            return fn.apply(this, args);
        }
    };
}

function getRandomUserAgent() {
    return GHOST_USER_AGENTS[Math.floor(Math.random() * GHOST_USER_AGENTS.length)];
}

function stripTrackingParams(urlString) {
    try {
        const url = new URL(urlString);
        let changed = false;
        TRACKING_PARAMS.forEach(param => {
            if (url.searchParams.has(param)) {
                url.searchParams.delete(param);
                changed = true;
            }
        });
        return changed ? url.toString() : urlString;
    } catch (e) {
        return urlString;
    }
}

// ============================================
// STORAGE HELPERS
// ============================================

function loadStorage() {
    try {
        if (fs.existsSync(STORAGE_PATH)) {
            const data = fs.readFileSync(STORAGE_PATH, 'utf8');
            const storage = JSON.parse(data);

            // Decrypt sensitive keys if safeStorage is available
            if (safeStorage.isEncryptionAvailable()) {
                for (let key in storage) {
                    if (key.toLowerCase().endsWith('key') && typeof storage[key] === 'string' && storage[key].startsWith('enc:')) {
                        try {
                            const encryptedBuffer = Buffer.from(storage[key].substring(4), 'base64');
                            storage[key] = safeStorage.decryptString(encryptedBuffer);
                        } catch (decryptErr) {
                            console.error(`[Main] Failed to decrypt ${key}:`, decryptErr.message);
                        }
                    }
                }
            }
            return storage;
        }
    } catch (err) {
        console.error('[Main] Error loading storage:', err.message);
    }
    return {};
}

function saveStorage(data) {
    try {
        const storageToSave = { ...data };

        // Encrypt sensitive keys if safeStorage is available
        if (safeStorage.isEncryptionAvailable()) {
            for (let key in storageToSave) {
                if (key.toLowerCase().endsWith('key') && typeof storageToSave[key] === 'string' && !storageToSave[key].startsWith('enc:')) {
                    try {
                        const encrypted = safeStorage.encryptString(storageToSave[key]);
                        storageToSave[key] = 'enc:' + encrypted.toString('base64');
                    } catch (encryptErr) {
                        console.error(`[Main] Failed to encrypt ${key}:`, encryptErr.message);
                    }
                }
            }
        }

        fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageToSave, null, 2), 'utf8');
        console.log('[Main] Storage saved successfully');
    } catch (err) {
        console.error('[Main] Error saving storage:', err.message);
    }
}

// ============================================
// CONTENT SCRIPT INJECTION
// ============================================

// Cache the content scripts after first read
let cachedContentCSS = null;
let cachedIntentModeCSS = null;

// Load CSS files once
function loadContentStyles() {
    try {
        if (!cachedContentCSS) {
            const cssPath = path.join(__dirname, 'content-styles.css');
            if (fs.existsSync(cssPath)) {
                cachedContentCSS = fs.readFileSync(cssPath, 'utf8');
                console.log('[Main] Loaded content-styles.css');
            } else {
                console.warn('[Main] content-styles.css not found');
                cachedContentCSS = '';
            }
        }
        if (!cachedIntentModeCSS) {
            const cssPath = path.join(__dirname, 'intent-mode-styles.css');
            if (fs.existsSync(cssPath)) {
                cachedIntentModeCSS = fs.readFileSync(cssPath, 'utf8');
                console.log('[Main] Loaded intent-mode-styles.css');
            } else {
                console.warn('[Main] intent-mode-styles.css not found');
                cachedIntentModeCSS = '';
            }
        }
    } catch (err) {
        console.error('[Main] Error loading content styles:', err.message);
    }
}

// Inject content scripts into all pages for extension features
function injectContentScripts(webContents, tabId) {
    try {
        // Don't inject into extension pages (they have their own scripts)
        const currentUrl = webContents.getURL();
        if (currentUrl.startsWith('file://') && currentUrl.includes('extension')) {
            console.log(`[Main] Skipping script injection for extension page`);
            return;
        }

        console.log(`[Main] Injecting content scripts into tab ${tabId}`);

        // Load cached styles if not already loaded
        loadContentStyles();

        // Combine CSS
        const combinedCSS = (cachedContentCSS || '') + '\n' + (cachedIntentModeCSS || '');

        // Inject CSS
        if (combinedCSS) {
            webContents.insertCSS(combinedCSS).catch(err => {
                console.error('[Main] Error injecting CSS:', err.message);
            });
        }

        // Create adapter JS for Electron (since Chrome extension APIs don't exist)
        const adapterJS = `
            (function () {
                // More aggressive check for multiple injections
                if (window.__intentsAdapterLoaded) {
                    console.log('[IntentsContent] Adapter already loaded, skipping...');
                    return;
                }
                window.__intentsAdapterLoaded = true;

                console.log('[IntentsContent] Loading Improved Electron adapter (v2)...');

                // Track message listeners
                const listeners = [];

                // Create chrome shim with defensive approach
                const chromeShim = {
                    runtime: {
                        sendMessage: function (msg, callback) {
                            console.log('[IntentsContent] chrome.runtime.sendMessage:', msg.action);
                            if (window.browser) {
                                if (msg.action === 'saveThought' || msg.action === 'createPing') {
                                    window.browser.storageGet(['thoughts']).then(result => {
                                        const thoughts = result.thoughts || [];
                                        const newThought = {
                                            ...msg.thought,
                                            id: Date.now(),
                                            timestamp: new Date().toISOString()
                                        };
                                        thoughts.unshift(newThought);
                                        window.browser.storageSet({ thoughts: thoughts.slice(0, 200) }).then(() => {
                                            if (callback) callback({ success: true, thought: newThought });
                                        });
                                    });
                                } else if (msg.action === 'getFootsteps') {
                                    window.browser.storageGet(['footsteps']).then(result => {
                                        if (callback) callback({ footsteps: result.footsteps || [] });
                                    });
                                } else if (msg.action === 'clearFootsteps') {
                                    window.browser.storageSet({ footsteps: [] }).then(() => {
                                        if (callback) callback({ success: true });
                                    });
                                } else if (msg.action === 'navigateToFootstep') {
                                    window.browser.navigate(msg.url);
                                    if (callback) callback({ success: true });
                                } else if (msg.action === 'checkAIKey') {
                                    window.browser.storageGet(['openaiKey', 'intentsSearchKey', 'geminiKey', 'grokKey']).then(res => {
                                        if (callback) callback({ hasKey: !!(res.openaiKey || res.intentsSearchKey || res.geminiKey || res.grokKey) });
                                    });
                                } else if (msg.action === 'saveAIKey') {
                                    window.browser.storageSet({ openaiKey: msg.key }).then(() => {
                                        if (callback) callback({ success: true });
                                    });
                                } else if (msg.action === 'askAI') {
                                    // Map askAI to browser's AI search
                                    window.browser.storageGet(['aiProvider', 'openaiKey', 'intentsSearchKey', 'geminiKey', 'grokKey']).then(settings => {
                                        window.browser.askAI(msg.prompt, settings, msg.context).then(res => {
                                            if (res.error) {
                                                if (callback) callback({ error: res.error });
                                            } else {
                                                if (callback) callback({ answer: res.summary });
                                            }
                                        });
                                    });
                                } else {
                                    console.log('[IntentsContent] Unhandled action:', msg.action);
                                    if (callback) callback({ error: 'Action not implemented' });
                                }
                            } else {
                                if (callback) callback({ error: 'Browser bridge missing' });
                            }
                        },
                        onMessage: {
                            addListener: function (fn) {
                                console.log('[IntentsContent] Adding onMessage listener');
                                listeners.push(fn);
                            },
                            removeListener: function (fn) {
                                const idx = listeners.indexOf(fn);
                                if (idx !== -1) listeners.splice(idx, 1);
                            }
                        },
                        getURL: function (path) { return path; }
                    },
                    storage: {
                        local: {
                            get: function (keys, callback) {
                                if (window.browser) {
                                    window.browser.storageGet(keys).then(result => {
                                        if (callback) callback(result || {});
                                    });
                                } else {
                                    if (callback) callback({});
                                }
                            },
                            set: function (items, callback) {
                                if (window.browser) {
                                    window.browser.storageSet(items).then(() => {
                                        if (callback) callback();
                                    });
                                } else {
                                    if (callback) callback();
                                }
                            }
                        },
                        onChanged: { addListener: function () { } }
                    }
                };

                // Merge or assign the shim
                window.chrome = Object.assign(window.chrome || {}, chromeShim);

                // Ensure window.browser exists and listen for main process actions
                if (window.browser && window.browser.onExtensionAction) {
                    window.browser.onExtensionAction((data) => {
                        console.log('[IntentsContent] Extension action received:', data.action);
                        if (listeners.length === 0) {
                            console.warn('[IntentsContent] No listeners registered for action');
                        }
                        listeners.forEach(fn => {
                            try {
                                fn(data, {}, (response) => {
                                    // Handle optional response
                                });
                            } catch (e) {
                                console.error('[IntentsContent] Error in listener:', e);
                            }
                        });
                    });
                } else {
                    console.error('[IntentsContent] Bridge (window.browser) not found!');
                }

                console.log('[IntentsContent] Improved Electron adapter ready!');
            })();
        `;

        // Inject the adapter first
        webContents.executeJavaScript(adapterJS).then(() => {
            console.log('[Main] Adapter injected, now loading content scripts');

            // Now inject the actual content.js
            const contentJsPath = path.join(__dirname, 'content-script.js');
            if (fs.existsSync(contentJsPath)) {
                const contentJS = fs.readFileSync(contentJsPath, 'utf8');
                webContents.executeJavaScript(contentJS).catch(err => {
                    console.error('[Main] Error injecting content.js:', err.message);
                });
            }

            // And intent-mode.js
            const intentJsPath = path.join(__dirname, 'intent-mode-script.js');
            if (fs.existsSync(intentJsPath)) {
                const intentJS = fs.readFileSync(intentJsPath, 'utf8');
                webContents.executeJavaScript(intentJS).catch(err => {
                    console.error('[Main] Error injecting intent-mode.js:', err.message);
                });
            }
        }).catch(err => {
            console.error('[Main] Error injecting adapter:', err.message);
        });

    } catch (err) {
        console.error('[Main] Error in content script injection:', err.message);
    }
}

// ============================================
// TAB MANAGEMENT
// ============================================

function setupTabView(tab) {
    if (tab.view) return; // Already has a view

    const sessionPartition = tab.isIncognito ? 'memory:incognito_session' : 'persist:main';

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'content-preload.js'),
            sandbox: false,
            partition: sessionPartition,
            webrtcIPHandlingPolicy: tab.isIncognito ? 'private_remote_address' : 'default',
        },
        backgroundColor: '#ffffff'
    });

    const storage = loadStorage();
    const useGhostUA = storage.ghostMode === true;
    const ua = tab.isIncognito ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' : (useGhostUA ? getRandomUserAgent() : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    view.webContents.setUserAgent(ua);

    // Apply Advanced Anti-Fingerprinting measures
    if (tab.isIncognito) {
        const antiFingerprintJS = `
            (function() {
                const secret = "${incognitoSecret}";
                const hash = (str) => {
                    let h = 0;
                    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
                    return h;
                };
                const sessionSeed = hash(secret);
                const prng = (seed) => {
                    let s = seed;
                    return () => {
                        s = (s * 16807) % 2147483647;
                        return (s - 1) / 2147483646;
                    };
                };
                const nextRandom = prng(sessionSeed);

                // 1. Hardware & OS normalization (Persona Consistency)
                const persona = {
                    hardwareConcurrency: 8,
                    deviceMemory: 16,
                    platform: 'Win32',
                    languages: ['en-US', 'en'],
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                };

                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => persona.hardwareConcurrency });
                Object.defineProperty(navigator, 'deviceMemory', { get: () => persona.deviceMemory });
                Object.defineProperty(navigator, 'platform', { get: () => persona.platform });
                Object.defineProperty(navigator, 'languages', { get: () => persona.languages });
                Object.defineProperty(navigator, 'language', { get: () => persona.languages[0] });
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
                
                // 2. Screen & Viewport Consistency (1080p Standard)
                const screenProps = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 };
                Object.entries(screenProps).forEach(([prop, val]) => {
                    Object.defineProperty(screen, prop, { get: () => val });
                    Object.defineProperty(window.screen, prop, { get: () => val });
                });
                window.name = '';

                // 3. Timing Attack Defense (Quantization)
                const originalNow = performance.now.bind(performance);
                performance.now = () => Math.floor(originalNow() / 100) * 100;
                if (window.SharedArrayBuffer) delete window.SharedArrayBuffer; 

                // 4. WebGL Normalization (Align with Persona)
                const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return 'Google Inc. (Intel)'; // UNMASKED_VENDOR_WEBGL
                    if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics (0x00009BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
                    if (parameter === 7936) return 'WebKit'; // VENDOR
                    if (parameter === 7937) return 'WebKit WebGL'; // RENDERER
                    return originalGetParameter.apply(this, arguments);
                };

                // 5. Deterministic Canvas Noise
                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                    const data = originalGetImageData.apply(this, arguments);
                    const pixelSeed = sessionSeed + x + y;
                    for (let i = 0; i < data.data.length; i += 4096) {
                        data.data[i] = data.data[i] ^ (pixelSeed % 2);
                    }
                    return data;
                };

                // 6. Font Enumeration Defense
                if (navigator.queryLocalFonts) {
                   navigator.queryLocalFonts = () => Promise.resolve([]);
                }
                
                const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
                CanvasRenderingContext2D.prototype.measureText = function(text) {
                    const metrics = originalMeasureText.apply(this, arguments);
                    // Add tiny deterministic jitter (0.01% of width) based on string hash
                    const textHash = hash(text + secret);
                    const jitter = (textHash % 100) / 1000; 
                    
                    // Proxied object to return jittered values
                    return new Proxy(metrics, {
                        get(target, prop) {
                            const val = target[prop];
                            if (typeof val === 'number') {
                                return val + jitter;
                            }
                            return val;
                        }
                    });
                };

                // 7. Audio Context Fingerprinting Protection
                const jitterAudio = (buffer) => {
                    for (let i = 0; i < buffer.length; i += 128) {
                        const noise = (nextRandom() - 0.5) * 1e-7; // Tiny inaudible noise
                        buffer[i] += noise;
                    }
                };

                const originalGetChannelData = AudioBuffer.prototype.getChannelData;
                AudioBuffer.prototype.getChannelData = function() {
                    const data = originalGetChannelData.apply(this, arguments);
                    jitterAudio(data);
                    return data;
                };

                const originalStartRendering = OfflineAudioContext.prototype.startRendering;
                OfflineAudioContext.prototype.startRendering = function() {
                    return originalStartRendering.apply(this, arguments).then(buffer => {
                        for (let i = 0; i < buffer.numberOfChannels; i++) {
                            jitterAudio(buffer.getChannelData(i));
                        }
                        return buffer;
                    });
                };

                // 8. Battery & Network
                if (navigator.getBattery) navigator.getBattery = () => Promise.reject();
                if (navigator.connection) {
                    Object.defineProperty(navigator, 'connection', { get: () => ({ 
                        effectiveType: '4g', rtt: 50, downlink: 10, saveData: false 
                    })});
                }
            })();
        `;
        view.webContents.on('dom-ready', () => {
            view.webContents.executeJavaScript(antiFingerprintJS).catch(console.error);
        });
    }
    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setAutoResize({ width: false, height: false });

    // Find in Page Match Listener
    view.webContents.on('found-in-page', (event, result) => {
        sendToRenderer('find-match-results', {
            requestId: result.requestId,
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches,
            selectionRange: result.selectionRange,
            finalUpdate: result.finalUpdate
        }, 'main', tab.windowId);
    });

    // Expanded Context Menu
    view.webContents.on('context-menu', (event, params) => {
        const menuTemplate = [];
        const storage = loadStorage();
        const win = BrowserWindow.fromId(tab.windowId);
        if (!win) return;

        // 1. TEXT SELECTION
        if (params.selectionText) {
            const trimmedSelection = params.selectionText.trim();
            if (trimmedSelection.length > 0) {
                menuTemplate.push({
                    label: 'Ask Pulsar AI',
                    click: () => {
                        // Trigger AI Search overlay with this query
                        sendToRenderer('go-search-trigger', { query: trimmedSelection }, 'main', win.id);
                    }
                });
                menuTemplate.push({
                    label: 'Deconstruct with AI',
                    click: () => {
                        // Specialized "Explain this" prompt
                        sendToRenderer('go-search-trigger', { query: `Explain this in simple terms: ${trimmedSelection}` }, 'main', win.id);
                    }
                });
                menuTemplate.push({ type: 'separator' });

                menuTemplate.push({
                    label: 'Hold That Thought',
                    click: () => {
                        view.webContents.send('extension-action', {
                            action: 'showThoughtPopup',
                            selectedText: trimmedSelection,
                            pageTitle: view.webContents.getTitle(),
                            pageUrl: view.webContents.getURL()
                        });
                    }
                });
                menuTemplate.push({
                    label: 'Isolate Section',
                    click: () => {
                        view.webContents.send('extension-action', {
                            action: 'triggerIsolate',
                            selectedText: trimmedSelection
                        });
                    }
                });
                menuTemplate.push({ type: 'separator' });

                // AI Rewrite Submenu
                menuTemplate.push({
                    label: 'AI Refinement',
                    submenu: [
                        { label: 'Condense / Shorter', click: () => triggerRewrite(view, trimmedSelection, 'shorter') },
                        { label: 'Professional Polish', click: () => triggerRewrite(view, trimmedSelection, 'professional') },
                        { label: 'Clarify / Simplify', click: () => triggerRewrite(view, trimmedSelection, 'simplify') },
                        { label: 'Elaborate / Expand', click: () => triggerRewrite(view, trimmedSelection, 'lengthen') },
                        { label: 'Creative Variant', click: () => triggerRewrite(view, trimmedSelection, 'creative') }
                    ]
                });

                menuTemplate.push({ type: 'separator' });
                menuTemplate.push({ role: 'copy' });
                menuTemplate.push({
                    label: 'Translate Selection',
                    click: () => {
                        sendToRenderer('go-search-trigger', { query: `Translate this to English: ${trimmedSelection}` }, 'main', win.id);
                    }
                });
                menuTemplate.push({
                    label: `Search Google for "${trimmedSelection.substring(0, 20)}${trimmedSelection.length > 20 ? '...' : ''}"`,
                    click: () => {
                        createTab(`https://www.google.com/search?q=${encodeURIComponent(trimmedSelection)}`, false, { windowId: win.id });
                    }
                });
                menuTemplate.push({ type: 'separator' });
            }
        }

        // 2. LINKS
        if (params.linkURL) {
            menuTemplate.push({
                label: 'Open Link in New Tab',
                click: () => createTab(params.linkURL, false, { windowId: win.id })
            });
            menuTemplate.push({
                label: 'Open Link in Incognito Window',
                click: () => createTab(params.linkURL, true, { windowId: win.id })
            });
            menuTemplate.push({ type: 'separator' });
            menuTemplate.push({
                label: 'Copy Link Address',
                click: () => {
                    const { clipboard } = require('electron');
                    clipboard.writeText(params.linkURL);
                }
            });
            menuTemplate.push({
                label: 'Save Link As...',
                click: () => {
                    view.webContents.downloadURL(params.linkURL);
                }
            });
            menuTemplate.push({ type: 'separator' });
        }

        // 3. IMAGES / MEDIA
        if (params.mediaType === 'image') {
            menuTemplate.push({
                label: 'Open Image in New Tab',
                click: () => createTab(params.srcURL, false, { windowId: win.id })
            });
            menuTemplate.push({
                label: 'Copy Image',
                click: () => view.webContents.copyImageAt(params.x, params.y)
            });
            menuTemplate.push({
                label: 'Copy Image Address',
                click: () => {
                    const { clipboard } = require('electron');
                    clipboard.writeText(params.srcURL);
                }
            });
            menuTemplate.push({
                label: 'Save Image As...',
                click: () => {
                    view.webContents.downloadURL(params.srcURL);
                }
            });
            menuTemplate.push({ type: 'separator' });
        }

        // 4. EDITABLE
        if (params.isEditable) {
            menuTemplate.push({ role: 'undo' });
            menuTemplate.push({ role: 'redo' });
            menuTemplate.push({ type: 'separator' });
            menuTemplate.push({ role: 'cut' });
            menuTemplate.push({ role: 'copy' });
            menuTemplate.push({ role: 'paste' });
            menuTemplate.push({ type: 'separator' });
            menuTemplate.push({ role: 'selectAll' });
            menuTemplate.push({ type: 'separator' });
        }

        // 5. NAVIGATION & PAGE (Only if nothing specific selected)
        if (!params.selectionText && !params.linkURL && params.mediaType === 'none') {
            menuTemplate.push({
                label: 'Back',
                enabled: view.webContents.canGoBack(),
                click: () => view.webContents.goBack()
            });
            menuTemplate.push({
                label: 'Forward',
                enabled: view.webContents.canGoForward(),
                click: () => view.webContents.goForward()
            });
            menuTemplate.push({
                label: 'Reload',
                click: () => view.webContents.reload()
            });
            menuTemplate.push({ type: 'separator' });

            menuTemplate.push({
                label: 'Summarize This Page',
                click: () => {
                    sendToRenderer('go-search-trigger', { query: '/summarize' }, 'main', win.id);
                }
            });

            if (storage.aiTranslationEnabled) {
                menuTemplate.push({
                    label: 'Translate Page with AI',
                    click: () => {
                        sendToRenderer('go-search-trigger', { query: 'Translate this page to English' }, 'main', win.id);
                    }
                });
            }

            menuTemplate.push({ type: 'separator' });
            menuTemplate.push({
                label: 'Save Page As...',
                click: () => {
                    view.webContents.savePage('', 'HTMLComplete').catch(console.error);
                }
            });
            menuTemplate.push({
                label: 'Print...',
                click: () => view.webContents.print()
            });
            menuTemplate.push({
                label: 'View Page Source',
                click: () => {
                    const sourceUrl = 'view-source:' + view.webContents.getURL();
                    createTab(sourceUrl, false, { windowId: win.id });
                }
            });
        }

        // 6. DEVELOPER TOOLS
        menuTemplate.push({ type: 'separator' });
        if (storage.ratatouilleMode) {
            menuTemplate.push({
                label: '🧀 Inspect Component',
                click: () => {
                    view.webContents.inspectElement(params.x, params.y);
                }
            });
        }
        menuTemplate.push({
            label: 'Inspect Element',
            click: () => {
                view.webContents.inspectElement(params.x, params.y);
            }
        });

        const menu = Menu.buildFromTemplate(menuTemplate);
        menu.popup({ window: win });
    });

    // Track navigation events
    view.webContents.on('did-start-loading', () => {
        sendToRenderer('update-status', { loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
        sendToRenderer('update-status', { loading: false });
        injectContentScripts(view.webContents, tab.id);
    });

    view.webContents.on('did-navigate', (event, navUrl) => {
        const storage = loadStorage();
        let targetUrl = navUrl;

        // Ghost Mode: Strip tracking params
        if (storage.ghostMode === true) {
            const stripped = stripTrackingParams(navUrl);
            if (stripped !== navUrl) {
                console.log(`[GhostMode] Stripped tracking params from: ${navUrl}`);
                targetUrl = stripped;
                // Redirect if params were removed
                view.webContents.loadURL(stripped).catch(() => { });
                return; // loadURL will trigger another did-navigate
            }
        }

        tab.url = targetUrl;
        const win = BrowserWindow.fromId(tab.windowId);
        if (tab.id === win?._activeTabId) {
            sendToRenderer('update-url', navUrl, 'main', tab.windowId);
        }

        // Track footsteps (browsing history)
        const hostname = (() => { try { return new URL(navUrl).hostname; } catch { return navUrl; } })();
        if (!navUrl.startsWith('file://') && !tab.isIncognito) {
            const storage = loadStorage();
            const footsteps = storage.footsteps || [];
            footsteps.unshift({
                url: navUrl,
                title: tab.title || hostname,
                domain: hostname,
                timestamp: new Date().toISOString()
            });
            storage.footsteps = footsteps.slice(0, 50);
            saveStorage(storage);
        }
        if (win) updateTabsList(win);

        // Smart Tab Grouping (Async)
        handleSmartTabGrouping(tab).then(() => {
            if (win) updateTabsList(win);
        }).catch(err => console.error('[Main] smartGrouping failed:', err));
    });

    view.webContents.on('did-navigate-in-page', (event, navUrl) => {
        tab.url = navUrl;
        const win = BrowserWindow.fromId(tab.windowId);
        if (tab.id === win?._activeTabId) {
            sendToRenderer('update-url', navUrl, 'main', tab.windowId);
        }
    });

    view.webContents.on('page-title-updated', (event, title) => {
        tab.title = title;
        const win = BrowserWindow.fromId(tab.windowId);
        if (win) updateTabsList(win);
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
        if (favicons.length > 0) {
            tab.favicon = favicons[0];
            const win = BrowserWindow.fromId(tab.windowId);
            if (win) updateTabsList(win);
        }
    });

    tab.view = view;

    // Load URL if it was previously set
    if (tab.url) {
        view.webContents.loadURL(tab.url).catch(err => {
            console.error(`[Main] Tab ${tab.id} failed to load:`, err.message);
        });
    }
}

function createTab(url = null, isIncognito = false, options = {}) {
    try {
        const tabId = tabIdCounter++;
        let tabUrl = url;

        // Associate with a window
        let windowId = options.windowId;
        if (!windowId) {
            const win = BrowserWindow.getFocusedWindow() || windows[0];
            windowId = win ? win.id : null;
        }

        const win = BrowserWindow.fromId(windowId);
        const winIsIncognito = win ? win._isIncognito : false;
        const effectiveIncognito = isIncognito || winIsIncognito;

        if (!tabUrl) {
            tabUrl = effectiveIncognito ? `file://${INCOGNITO_TAB_URL}` : `file://${NEW_TAB_URL}`;
        }

        console.log(`[Main] Creating ${effectiveIncognito ? 'incognito ' : ''}tab ${tabId} in window ${windowId} with URL: ${tabUrl}`);

        const tab = {
            id: tabId,
            view: null,
            url: tabUrl,
            title: options.title || 'New Tab',
            loading: true,
            favicon: options.favicon || null,
            active: false,
            isIncognito: effectiveIncognito,
            windowId: windowId,
            folderId: options.folderId || null,
            lastUsed: Date.now(),
            isDead: false,
            isPinned: options.isPinned || false
        };

        tabs.push(tab);

        // Support lazy-loading (e.g. for pinned tabs on startup)
        if (!options.lazy) {
            setupTabView(tab);
            switchTab(tabId);
        } else {
            tab.isDead = true;
        }

        console.log(`[Main] Tab ${tabId} created successfully. Total tabs: ${tabs.length}`);
        return tabId;

    } catch (err) {
        console.error('[Main] Error creating tab:', err.message);
        return null;
    }
}

function switchTab(tabId) {
    try {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        const win = BrowserWindow.fromId(tab.windowId) || windows[0];
        if (!win) return;

        console.log(`[Main] Switching to tab ${tabId} in window ${win.id}`);

        // Deactivate only tabs in this same window
        tabs.forEach(t => {
            if (t.windowId === win.id) {
                t.active = false;
                if (t.view) {
                    win.removeBrowserView(t.view);
                }
            }
        });

        tab.active = true;
        tab.lastUsed = Date.now();
        tab.isDead = false;
        win._activeTabId = tabId;

        // Revive tab if it was dead
        if (!tab.view) {
            console.log(`[Main] Reviving dead tab ${tabId}`);
            setupTabView(tab);
            tab.isDead = false;
        }

        // Only show the view if no overlays are active
        if (!isSettingsOpen && !isAIOverlayOpen) {
            win.addBrowserView(tab.view);

            // If tab is part of a split, handle partner too
            if (tab.splitWith) {
                const partner = tabs.find(p => p.id === tab.splitWith);
                if (partner && partner.view) {
                    win.addBrowserView(partner.view);
                }
            }
        }

        updateWindowLayout(win);
        updateTabsList(win);

    } catch (err) {
        console.error('[Main] Error switching tab:', err.message);
    }
}

function closeTab(tabId) {
    try {
        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const tab = tabs[tabIndex];
        const win = BrowserWindow.fromId(tab.windowId) || windows[0];

        if (tab.view) {
            if (win) win.removeBrowserView(tab.view);
            // Destroy view to free memory
            tab.view.webContents.destroy();
        }

        // Handle unsplitting
        if (tab.splitWith) {
            const partner = tabs.find(p => p.id === tab.splitWith);
            if (partner) partner.splitWith = null;
        }

        tabs.splice(tabIndex, 1);

        // If it was active, switch to another tab in same window
        if (win && win._activeTabId === tabId) {
            const remaining = tabs.filter(t => t.windowId === win.id);
            if (remaining.length > 0) {
                switchTab(remaining[remaining.length - 1].id);
            } else {
                win._activeTabId = null;
                updateTabsList(win);
            }
        } else if (win) {
            updateTabsList(win);
        }

        console.log(`[Main] Tab ${tabId} closed. Total tabs: ${tabs.length}`);

    } catch (err) {
        console.error('[Main] Error closing tab:', err.message);
    }
}

function getActiveTab(winId) {
    if (winId) {
        const win = BrowserWindow.fromId(winId);
        return tabs.find(t => t.id === win?._activeTabId);
    }
    // Fallback to currently focused window's active tab
    const focusedWin = BrowserWindow.getFocusedWindow();
    if (focusedWin) return tabs.find(t => t.id === focusedWin._activeTabId);
    return tabs.find(t => t.active);
}

function updateTabsList(win) {
    if (!win) {
        // Update all windows
        windows.forEach(w => updateTabsList(w));
        return;
    }

    const tabsData = [];
    const processedIds = new Set();
    const windowTabs = tabs.filter(t => t.windowId === win.id);

    windowTabs.forEach(t => {
        if (processedIds.has(t.id)) return;

        if (t.splitWith) {
            const partner = tabs.find(p => p.id === t.splitWith);
            if (partner) {
                const title = t.isIncognito ? 'Incognito' : `${t.title || 'New Tab'} | ${partner.title || 'New Tab'}`;
                tabsData.push({
                    id: t.id,
                    splitId: partner.id,
                    title: title,
                    url: t.url || '',
                    favicon: t.isIncognito ? '' : (t.favicon || partner.favicon || ''),
                    active: t.id === win._activeTabId || partner.id === win._activeTabId,
                    isIncognito: t.isIncognito,
                    folderId: t.folderId,
                    lastUsed: Math.max(t.lastUsed, partner.lastUsed),
                    isDead: t.isDead && partner.isDead,
                    isPinned: t.isPinned,
                    isSplit: true
                });
                processedIds.add(t.id);
                processedIds.add(partner.id);
            } else {
                tabsData.push({
                    id: t.id,
                    title: t.isIncognito ? 'Incognito' : (t.title || 'New Tab'),
                    url: t.url || '',
                    favicon: t.isIncognito ? '' : (t.favicon || ''),
                    active: t.id === win._activeTabId,
                    isIncognito: t.isIncognito,
                    folderId: t.folderId,
                    lastUsed: t.lastUsed,
                    isDead: t.isDead,
                    isPinned: t.isPinned
                });
                processedIds.add(t.id);
            }
        } else {
            tabsData.push({
                id: t.id,
                title: t.isIncognito ? 'Incognito' : (t.title || 'New Tab'),
                url: t.url || '',
                favicon: t.isIncognito ? '' : (t.favicon || ''),
                active: t.id === win._activeTabId,
                isIncognito: t.isIncognito,
                folderId: t.folderId,
                lastUsed: t.lastUsed,
                isDead: t.isDead,
                isPinned: t.isPinned
            });
            processedIds.add(t.id);
        }
    });

    const foldersList = folders.map(f => ({ ...f }));

    sendToRenderer('tabs-update', { tabs: tabsData, folders: foldersList, activeId: win._activeTabId }, 'sidebar', win.id);
}

const saveSessionThrottled = throttle(saveSession, 5000);

function saveSession() {
    // Only save persistent tabs (not incognito)
    const persistentTabs = tabs.filter(t => !t.isIncognito).map(t => ({
        url: t.url,
        title: t.title,
        favicon: t.favicon,
        isPinned: t.isPinned,
        folderId: t.folderId
    }));

    // We need to read existing settings first to not overwrite other keys
    // optimization: maybe cache settings in memory? but for safety read/write
    try {
        const settings = loadStorage();
        settings.savedTabs = persistentTabs;
        saveStorage(settings);
    } catch (e) {
        console.error('[Main] Error saving session:', e);
    }
}

// ============================================
// FOLDER MANAGEMENT
// ============================================

const FOLDER_COLORS = [
    '#FF6B6B', // Vibrant Red
    '#4ECDC4', // Teal/Turquoise
    '#FFE66D', // Bright Yellow
    '#FF9F43', // Orange
    '#5f27cd', // Deep Purple
    '#54a0ff', // Vivid Blue
    '#1dd1a1', // Green
    '#ff6b81'  // Pink
];

function getRandomFolderColor() {
    return FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
}

function createFolder(title = 'New Group', color = null) {
    const folder = {
        id: 'folder_' + Date.now(),
        title: title,
        color: color || getRandomFolderColor(),
        isMinimized: false,
        state: 'used',
        lastUsed: Date.now()
    };
    folders.push(folder);
    updateTabsList(); // Updates all windows
    return folder;
}

function updateFolderStates() {
    const now = Date.now();
    const WARM_THRESHOLD = 3 * 60 * 1000;  // 3 mins
    const COLD_THRESHOLD = 8 * 60 * 1000;  // 8 mins
    const DEAD_THRESHOLD = 15 * 60 * 1000; // 15 mins

    folders.forEach(folder => {
        const folderTabs = tabs.filter(t => t.folderId === folder.id);
        const folderLastUsed = folderTabs.length > 0 ? Math.max(...folderTabs.map(t => t.lastUsed)) : folder.lastUsed;
        const diff = now - folderLastUsed;

        if (windows.some(win => folderTabs.some(t => t.id === win._activeTabId))) {
            folder.state = 'used';
        } else if (diff < WARM_THRESHOLD) {
            folder.state = 'warm';
        } else if (diff < COLD_THRESHOLD) {
            folder.state = 'cold';
        } else {
            folder.state = 'dead';
        }
    });

    // Enforce dead state (Hibernation)
    tabs.forEach(tab => {
        if (tab.active) return; // Never hibernate active tab

        const diff = now - tab.lastUsed;
        let shouldBeDead = diff > DEAD_THRESHOLD;

        // If tab is in a folder, folder state overrides
        if (tab.folderId) {
            const folder = folders.find(f => f.id === tab.folderId);
            if (folder && folder.state === 'dead') shouldBeDead = true;
        }

        if (shouldBeDead && tab.view) {
            console.log(`[Main] Hibernating tab ${tab.id} (Dead state)`);
            const win = BrowserWindow.fromId(tab.windowId);
            if (win) win.removeBrowserView(tab.view);
            tab.view.webContents.destroy();
            tab.view = null;
            tab.isDead = true;
        }
    });

    updateTabsList();
}

// Start state timer
stateTimer = setInterval(updateFolderStates, 30000); // Check every 30s

// ============================================
// NAVIGATION
// ============================================

function navigate(urlInput) {
    try {
        const tab = getActiveTab();
        if (!tab) {
            console.error('[Main] No active tab for navigation');
            return;
        }

        let url = urlInput.trim();
        console.log(`[Main] Navigating to: ${url}`);

        // Add protocol if missing
        if (!url.match(/^https?:\/\//i) && !url.startsWith('file://')) {
            // Check if it looks like a domain
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                // Treat as search query
                const storage = loadStorage();
                const isIncognito = tab.isIncognito;
                const engine = (isIncognito && (storage.incognitoSearchEngine || 'duckduckgo')) || 'google';

                if (engine === 'duckduckgo') {
                    url = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
                } else {
                    url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                }
            }
        }

        tab.view.webContents.loadURL(url).catch(err => {
            console.error('[Main] Navigation failed:', err.message);
        });

    } catch (err) {
        console.error('[Main] Error in navigate:', err.message);
    }
}

function goBack() {
    try {
        const tab = getActiveTab();
        if (tab && tab.view.webContents.canGoBack()) {
            console.log('[Main] Going back');
            tab.view.webContents.goBack();
        } else {
            console.log('[Main] Cannot go back');
        }
    } catch (err) {
        console.error('[Main] Error going back:', err.message);
    }
}

function goForward() {
    try {
        const tab = getActiveTab();
        if (tab && tab.view.webContents.canGoForward()) {
            console.log('[Main] Going forward');
            tab.view.webContents.goForward();
        } else {
            console.log('[Main] Cannot go forward');
        }
    } catch (err) {
        console.error('[Main] Error going forward:', err.message);
    }
}

function reload() {
    try {
        const tab = getActiveTab();
        if (tab) {
            console.log('[Main] Reloading');
            tab.view.webContents.reload();
        }
    } catch (err) {
        console.error('[Main] Error reloading:', err.message);
    }
}

// ============================================
// AI SEARCH
// ============================================

const RESEARCH_SYSTEM_PROMPT = `You are a high-level research assistant.
1. Provide a comprehensive yet concise synthesis (max 250 words).
2. USE RICH MARKDOWN: Use bolding, headers, and bullet points for readability.
3. Suggest 3-4 distinct, high-quality resources.
4. Format response STRICTLY as JSON: {"summary": "...", "links": [{"title": "...", "url": "..."}, ...]}
5. IF the user is specifically asking for song lyrics, ADD "song_info": {"artist": "Exact Artist", "title": "Exact Title"} to the JSON.`;

const GENERIC_SYSTEM_PROMPT = `You are a helpful, precise assistant. Follow the user's instructions exactly. If they ask for a specific format, use it.`;

async function handleAISearch(query, settings, systemPrompt = RESEARCH_SYSTEM_PROMPT) {
    try {
        console.log('[Main] AI Search query:', query);

        const provider = settings.aiProvider || 'openai';
        let apiKey = null;

        // Get appropriate API key
        if (provider === 'openai') {
            apiKey = settings.intentsSearchKey || settings.openaiKey;
        } else if (provider === 'gemini') {
            apiKey = settings.geminiKey;
        } else if (provider === 'grok') {
            apiKey = settings.grokKey;
        } else if (provider === 'llama') {
            apiKey = settings.llamaKey;
        }

        if (!apiKey) {
            console.error('[Main] No API key found for provider:', provider);
            return { error: `No API key configured for ${provider}. Please set your API key in settings.` };
        }

        console.log(`[Main] Using ${provider} for AI search`);

        if (provider === 'openai') {
            return await callOpenAI(query, apiKey, systemPrompt);
        } else if (provider === 'gemini') {
            return await callGemini(query, apiKey, systemPrompt);
        } else if (provider === 'grok') {
            return await callGrok(query, apiKey, systemPrompt);
        } else if (provider === 'llama') {
            return await callLlama(query, apiKey, systemPrompt);
        } else {
            return { error: `Unsupported provider: ${provider}` };
        }

    } catch (err) {
        console.error('[Main] AI Search error:', err.message);
        return { error: err.message };
    }
}

async function processAIResponse(content) {
    let finalSummary = content;
    let finalLinks = [];

    try {
        // Robust extraction: Find the first '{' and the last '}'
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.summary) finalSummary = parsed.summary;
            if (Array.isArray(parsed.links)) finalLinks = parsed.links;
        }
    } catch (e) {
        console.warn('[Main] JSON parse failed, utilizing raw output', e.message);
        finalSummary = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    }

    return {
        summary: finalSummary,
        links: finalLinks
    };
}

function callOpenAI(query, apiKey, systemPrompt = GENERIC_SYSTEM_PROMPT) {
    return new Promise((resolve) => {
        const requestData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            max_tokens: 800,
            temperature: 0.7
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ error: parsed.error.message });
                    } else if (parsed.choices && parsed.choices[0]) {
                        resolve(await processAIResponse(parsed.choices[0].message.content));
                    } else {
                        resolve({ error: 'Invalid response from OpenAI' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse OpenAI response' });
                }
            });
        });

        req.on('error', (err) => resolve({ error: err.message }));
        req.write(requestData);
        req.end();
    });
}

function callGemini(query, apiKey, systemPrompt = GENERIC_SYSTEM_PROMPT) {
    return new Promise((resolve) => {
        const url = `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const requestData = JSON.stringify({
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\nUser Message: ${query}`
                }]
            }]
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ error: parsed.error.message });
                    } else if (parsed.candidates && parsed.candidates[0]) {
                        resolve(await processAIResponse(parsed.candidates[0].content.parts[0].text));
                    } else {
                        resolve({ error: 'Invalid response from Gemini' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse Gemini response' });
                }
            });
        });

        req.on('error', (err) => resolve({ error: err.message }));
        req.write(requestData);
        req.end();
    });
}

function callGrok(query, apiKey, systemPrompt = GENERIC_SYSTEM_PROMPT) {
    return new Promise((resolve) => {
        const requestData = JSON.stringify({
            model: 'grok-beta',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            max_tokens: 800,
            temperature: 0.7
        });

        const options = {
            hostname: 'api.x.ai',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ error: parsed.error.message });
                    } else if (parsed.choices && parsed.choices[0]) {
                        resolve(await processAIResponse(parsed.choices[0].message.content));
                    } else {
                        resolve({ error: 'Invalid response from Grok' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse Grok response' });
                }
            });
        });

        req.on('error', (err) => resolve({ error: err.message }));
        req.write(requestData);
        req.end();
    });
}

function callLlama(query, apiKey, systemPrompt = GENERIC_SYSTEM_PROMPT) {
    return new Promise((resolve) => {
        const requestData = JSON.stringify({
            model: 'llama-3.1-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            max_tokens: 800,
            temperature: 0.7
        });

        const options = {
            hostname: 'api.groq.com',
            port: 443,
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        resolve({ error: parsed.error.message });
                    } else if (parsed.choices && parsed.choices[0]) {
                        resolve(await processAIResponse(parsed.choices[0].message.content));
                    } else {
                        resolve({ error: 'Invalid response from Llama' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse Llama response' });
                }
            });
        });

        req.on('error', (err) => resolve({ error: err.message }));
        req.write(requestData);
        req.end();
    });
}

// ============================================
// IPC HELPER
// ============================================

function sendToRenderer(channel, data, target = 'all', winId = null) {
    try {
        const targetWindows = winId ? [BrowserWindow.fromId(winId)].filter(Boolean) : windows;

        targetWindows.forEach(win => {
            if ((target === 'all' || target === 'main') && win && win.webContents) {
                win.webContents.send(channel, data);
            }
            if ((target === 'all' || target === 'sidebar') && win && win._sidebarView && win._sidebarView.webContents) {
                win._sidebarView.webContents.send(channel, data);
            }
        });

        // Also broadcast to active tab views if target is all or tabs
        if (target === 'all' || target === 'tabs') {
            tabs.forEach(tab => {
                if (!winId || tab.windowId === winId) {
                    if (tab.view && tab.view.webContents) {
                        tab.view.webContents.send(channel, data);
                    }
                }
            });
        }
    } catch (err) {
        console.error(`[Main] Error sending to renderer (${channel}):`, err.message);
    }
}

// ============================================
// TOR SERVICE MANAGEMENT
// ============================================

const TOR_URL = 'https://dist.torproject.org/torbrowser/15.0.5/tor-expert-bundle-windows-x86_64-15.0.5.tar.gz';
const TOR_DIR = path.join(app.getPath('userData'), 'tor');
const TOR_EXE = path.join(TOR_DIR, 'tor', 'tor.exe');
const TOR_DATA = path.join(TOR_DIR, 'data');

async function ensureTorBinary() {
    if (fs.existsSync(TOR_EXE)) return true;

    console.log('[Tor] Binary not found, starting download...');
    if (!fs.existsSync(TOR_DIR)) fs.mkdirSync(TOR_DIR, { recursive: true });
    if (!fs.existsSync(TOR_DATA)) fs.mkdirSync(TOR_DATA, { recursive: true });

    const tarPath = path.join(TOR_DIR, 'tor.tar.gz');

    return new Promise((resolve, reject) => {
        let redirectCount = 0;
        const download = (url) => {
            if (redirectCount > 5) {
                return reject(new Error('Too many redirects'));
            }

            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                timeout: 15000 // 15s timeout
            };

            https.get(url, options, (response) => {
                // Handle Redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    redirectCount++;
                    console.log('[Tor] Redirecting to:', response.headers.location);
                    return download(response.headers.location);
                }

                if (response.statusCode !== 200) {
                    console.error('[Tor] Download failed with status:', response.statusCode);
                    return reject(new Error(`Failed to download Tor: ${response.statusCode}`));
                }

                const totalSize = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;

                const file = fs.createWriteStream(tarPath);
                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalSize > 0) {
                        const progress = Math.min(99, Math.round((downloaded / totalSize) * 100));
                        sendToRenderer('tor-setup-progress', { status: 'Downloading', progress });
                    } else {
                        // Unknown size, update text but keep spinner moving
                        sendToRenderer('tor-setup-progress', { status: `Downloading (${Math.round(downloaded / 1024 / 1024)}MB)`, progress: 0 });
                    }
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('[Tor] Download complete');
                    const stats = fs.statSync(tarPath);
                    if (stats.size < 1000000) {
                        console.error('[Tor] File too small:', stats.size);
                        sendToRenderer('tor-setup-error', 'Download corrupted');
                        return reject(new Error('File too small'));
                    }

                    console.log('[Tor] Extraction starting...');
                    sendToRenderer('tor-setup-progress', { status: 'Extracting', progress: 100 });

                    // Use built-in Windows tar for .tar.gz
                    const extractCmd = `tar -xzf "${tarPath}" -C "${TOR_DIR}"`;
                    exec(extractCmd, (err, stdout, stderr) => {
                        if (err) {
                            console.error('[Tor] Extraction failed:', err, stderr);
                            sendToRenderer('tor-setup-error', 'Extraction failed');
                            return reject(err);
                        }
                        console.log('[Tor] Extraction complete');
                        if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
                        resolve(true);
                    });
                });
            }).on('error', (err) => {
                console.error('[Tor] Network error:', err.message);
                if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
                sendToRenderer('tor-setup-error', 'Connection failed');
                reject(err);
            }).on('timeout', () => {
                console.error('[Tor] Connection timed out');
                sendToRenderer('tor-setup-error', 'Download timed out');
                reject(new Error('Timeout'));
            });
        };

        download(TOR_URL);
    });
}

function startTorService() {
    return new Promise(async (resolve, reject) => {
        if (torProcess) return resolve(true);

        try {
            await ensureTorBinary();
            console.log('[Tor] Starting process...');
            sendToRenderer('tor-setup-progress', { status: 'Bootstrapping', progress: 0 });

            torProcess = spawn(TOR_EXE, [
                '--ignore-missing-torrc',
                '--DataDirectory', TOR_DATA,
                '--GeoIPFile', path.join(TOR_DIR, 'tor', 'geoip'),
                '--GeoIPv6File', path.join(TOR_DIR, 'tor', 'geoip6'),
                '--SocksPort', '9050'
            ], {
                detached: false,
                windowsHide: true,
                cwd: path.dirname(TOR_EXE)
            });

            // Capture both stdout and stderr as Tor logs to both
            const handleLog = (data) => {
                const output = data.toString();
                if (output.includes('Bootstrapped')) {
                    const match = output.match(/Bootstrapped (\d+)%/);
                    if (match) {
                        const progress = parseInt(match[1], 10);
                        sendToRenderer('tor-setup-progress', { status: 'Bootstrapping', progress });
                        if (progress === 100) {
                            console.log('[Tor] Service is ready.');
                            resolve(true);
                        }
                    }
                }
                if (output.includes('[err]')) {
                    console.error('[Tor] Service reported error:', output.trim());
                }
            };

            torProcess.stdout.on('data', handleLog);
            torProcess.stderr.on('data', handleLog);

            torProcess.on('error', (err) => {
                console.error('[Tor] Process failed to spawn:', err);
                sendToRenderer('tor-setup-error', 'Tor process failed');
                torProcess = null;
                reject(err);
            });

            torProcess.on('exit', () => {
                console.log('[Tor] Process exited');
                torProcess = null;
            });

        } catch (e) {
            reject(e);
        }
    });
}

function stopTorService() {
    if (torProcess) {
        console.log('[Tor] Stopping service...');
        torProcess.kill();
        torProcess = null;
    }
}

// Ensure cleanup on quit
app.on('will-quit', stopTorService);

// ============================================
// PRIVACY ENGINE
// ============================================

function initializePrivacyEngine() {
    console.log('[Privacy] Initializing privacy engine...');

    // Configure Incognito Session
    const incognitoSession = session.fromPartition('memory:incognito_session');
    configurePrivacySession(incognitoSession, true);

    // Configure Default Session
    configurePrivacySession(session.defaultSession, false);
}

function configurePrivacySession(sess, isIncognito) {
    const storage = loadStorage();
    const isTurbo = storage.performanceTurbo === true;
    const isGhost = storage.ghostMode === true;
    const isDisclosureEnabled = storage.privacyDisclosureEnabled === true; // Default false

    // Initialize stats for this session if needed
    if (!sess.trackerStats) {
        sess.trackerStats = new Map(); // tabId -> { total: 0, advertising: 0, analytics: 0, social: 0, other: 0 }
    }

    // Tracker Categorization
    const getTrackerCategory = (url) => {
        if (url.includes('facebook') || url.includes('twitter') || url.includes('linkedin') || url.includes('pinterest') || url.includes('instagram') || url.includes('tiktok')) return 'social';
        if (url.includes('google-analytics') || url.includes('hotjar') || url.includes('crazyegg') || url.includes('mixpanel') || url.includes('segment') || url.includes('optimizely') || url.includes('scorecardresearch')) return 'analytics';
        if (url.includes('doubleclick') || url.includes('googlesyndication') || url.includes('adnxs') || url.includes('amazon-adsystem') || url.includes('pubmatic') || url.includes('criteo') || url.includes('taboola') || url.includes('outbrain')) return 'advertising';
        return 'other';
    };

    // Tracker Blocking
    const TRACKER_DOMAINS = [
        'google-analytics.com', 'doubleclick.net', 'googlesyndication.com',
        'facebook.net', 'facebook.com/tr', 'adnxs.com', 'quantserve.com',
        'scorecardresearch.com', 'amazon-adsystem.com', 'hotjar.com',
        'pixel.facebook.com', 'analytics.twitter.com', 'googleadservices.com',
        'crazyegg.com', 'mixpanel.com', 'optimizely.com'
    ];

    // Additional Performance Turbo blocks
    const TURBO_BLOCKS = [
        'adsystem.com', 'adservice.google', 'taboola.com', 'outbrain.com',
        'chartbeat.com', 'intercom.io', 'newrelic.com', 'sentry.io'
    ];

    sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
        const url = details.url.toLowerCase();
        const isTracker = TRACKER_DOMAINS.some(domain => url.includes(domain));
        const isTurboBlock = isTurbo && TURBO_BLOCKS.some(domain => url.includes(domain));

        if (isTracker || isTurboBlock) {
            // Count it
            if (details.webContentsId) { // webContentsId usually maps to tabId in simple cases, but we need reliable mapping.
                // For now, attaching to the request's webContents.
                const stats = sess.trackerStats.get(details.webContentsId) || { total: 0, advertising: 0, analytics: 0, social: 0, other: 0 };
                stats.total++;
                const cat = getTrackerCategory(url);
                stats[cat]++;
                sess.trackerStats.set(details.webContentsId, stats);
            }
            return callback({ cancel: true });
        }

        // HTTPS Enforcement in Incognito or Ghost Mode
        if ((isIncognito || isGhost) && url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
            const secureUrl = url.replace('http://', 'https://');
            return callback({ redirectURL: secureUrl });
        }

        callback({});
    });

    // Strict Permissions & Anti-Fingerprinting Headers
    sess.setPermissionRequestHandler((webContents, permission, callback) => {
        if (isIncognito) return callback(false); // Auto-deny all sensors/notifs in Incognito

        const sensitive = ['geolocation', 'notifications', 'midi', 'media'];
        if (sensitive.includes(permission)) {
            return callback(false); // Default block for sensitive permissions
        }
        callback(true);
    });

    sess.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        const requestHeaders = details.requestHeaders;

        if (isIncognito || isGhost) {
            // Referrer scrubbing (Cross-domain)
            if (requestHeaders['Referer']) {
                try {
                    const ref = new URL(requestHeaders['Referer']);
                    const target = new URL(details.url);
                    if (ref.hostname !== target.hostname) {
                        delete requestHeaders['Referer'];
                    }
                } catch (e) { }
            }
            requestHeaders['DNT'] = '1';

            // User-Agent Client Hints stripping (Strict Privacy)
            const uaCHHeaders = [
                'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
                'sec-ch-ua-arch', 'sec-ch-ua-model', 'sec-ch-ua-platform-version',
                'sec-ch-ua-full-version', 'sec-ch-ua-full-version-list'
            ];
            uaCHHeaders.forEach(h => delete requestHeaders[h]);
            requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
        }
        callback({ requestHeaders });
    });

    // Download Management
    sess.on('will-download', (event, item, webContents) => {
        const filename = item.getFilename();
        const totalBytes = item.getTotalBytes();
        const downloadId = Date.now().toString();

        sendToRenderer('download-started', {
            id: downloadId,
            filename: filename,
            totalBytes: totalBytes
        });

        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                sendToRenderer('download-updated', { id: downloadId, status: 'interrupted' });
            } else if (state === 'progressing') {
                if (item.isPaused()) {
                    sendToRenderer('download-updated', { id: downloadId, status: 'paused' });
                } else {
                    sendToRenderer('download-updated', {
                        id: downloadId,
                        status: 'progressing',
                        receivedBytes: item.getReceivedBytes()
                    });
                }
            }
        });

        item.once('done', (event, state) => {
            if (state === 'completed') {
                sendToRenderer('download-done', { id: downloadId, status: 'completed' });
            } else {
                sendToRenderer('download-done', { id: downloadId, status: 'failed', error: state });
            }
        });
    });
}

// ============================================
// SMART TAB GROUPING (Opt-in)
// ============================================

function getRandomAccentColor() {
    const colors = ['#007aff', '#0ea5e9', '#22c55e', '#f97316', '#8b5cf6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
}

async function handleSmartTabGrouping(tab) {
    const storage = loadStorage();
    if (storage.smartGroupingEnabled !== true) return;

    const url = tab.url;
    if (!url || url.startsWith('file://') || url.startsWith('about:') || url === 'pulsar://newtab' || tab.isIncognito) return;

    try {
        const hostname = new URL(url).hostname;
        let category = 'General';

        // Enhanced categorization
        if (hostname.includes('github') || hostname.includes('stackoverflow') || hostname.includes('npm') || hostname.includes('docs')) {
            category = 'Development';
        } else if (hostname.includes('netflix') || hostname.includes('youtube') || hostname.includes('twitch') || hostname.includes('spotify')) {
            category = 'Entertainment';
        } else if (hostname.includes('google') || hostname.includes('bing') || hostname.includes('wikipedia')) {
            category = 'Research';
        } else if (hostname.includes('amazon') || hostname.includes('ebay') || hostname.includes('etsy')) {
            category = 'Shopping';
        } else if (hostname.includes('twitter') || hostname.includes('facebook') || hostname.includes('instagram') || hostname.includes('reddit')) {
            category = 'Social';
        } else if (hostname.includes('gmail') || hostname.includes('protons') || hostname.includes('slack')) {
            category = 'Communication';
        }

        if (category === 'General') return; // Don't group general stuff automatically

        // Find or create folder
        let folder = folders.find(f => f.title === category);
        if (!folder) {
            folder = {
                id: Date.now(),
                title: category,
                color: getRandomAccentColor(),
                isMinimized: false,
                state: 'open'
            };
            folders.push(folder);
        }

        // Move tab to folder if it's not already in one
        if (!tab.folderId) {
            tab.folderId = folder.id;
            console.log(`[SmartGrouping] Auto-grouped tab ${tab.id} into ${category}`);
        }
    } catch (e) {
        console.error('[SmartGrouping] Error:', e.message);
    }
}

function getRandomUserAgent() {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}

// ============================================
// WINDOW CREATION
// ============================================

function createWindow(options = {}) {
    try {
        const isIncognito = !!options.isIncognito;
        console.log(`[Main] Creating ${isIncognito ? 'incognito ' : ''}window...`);

        const win = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            frame: false,
            icon: path.join(__dirname, 'icon.png'),
            backgroundColor: isIncognito ? '#000000' : '#050505',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        win._isIncognito = isIncognito;
        win._activeTabId = null;
        win._isSidebarHovered = false;
        win._sidebarHideTimeout = null;
        windows.push(win);

        // Map to global mainWindow for non-incognito for legacy support
        if (!isIncognito && !mainWindow) {
            mainWindow = win;
        }

        win.loadFile('index.html');

        win.webContents.on('did-finish-load', () => {
            console.log(`[Main] Window ${win.id} loaded (Incognito: ${isIncognito})`);

            // Create a first tab if it's a new window and not restoring
            if (!isIncognito && tabs.length === 0) {
                createTab(null, false, { windowId: win.id });
            } else if (isIncognito) {
                createTab(null, true, { windowId: win.id });
            }
        });

        // Handle window resize - throttled for performance
        win.on('resize', throttle(() => {
            updateWindowLayout(win);
        }, 16));

        win.on('maximize', () => updateWindowLayout(win));
        win.on('unmaximize', () => updateWindowLayout(win));

        win.on('enter-full-screen', () => {
            console.log(`[Main] Window ${win.id} entered full-screen`);
            updateWindowLayout(win);
        });

        win.on('leave-full-screen', () => {
            console.log(`[Main] Window ${win.id} left full-screen`);
            updateWindowLayout(win);
        });

        win.on('focus', () => {
            // Keep track of which window was last focused for IPC routing
            // (but most IPC should use event.sender)
        });

        win.on('closed', () => {
            windows = windows.filter(w => w !== win);
            if (win === mainWindow) mainWindow = windows.find(w => !w._isIncognito) || null;
        });

        createSidebarView(win);

        console.log(`[Main] Window ${win.id} created successfully`);
        return win;

    } catch (err) {
        console.error('[Main] Error creating window:', err.message);
    }
}

function updateWindowLayout(win) {
    if (!win) return;
    updateSidebarBounds(win);
    updateAllTabBounds(win);
}

// ============================================
// IPC HANDLERS
// ============================================

// Window Controls
ipcMain.on('window-min', () => {
    console.log('[Main] IPC: window-min');
    try {
        if (mainWindow) mainWindow.minimize();
    } catch (err) {
        console.error('[Main] Error minimizing:', err.message);
    }
});

ipcMain.on('window-max', () => {
    console.log('[Main] IPC: window-max');
    try {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.restore();
            } else {
                mainWindow.maximize();
            }
        }
    } catch (err) {
        console.error('[Main] Error maximizing:', err.message);
    }
});

ipcMain.on('window-close', () => {
    console.log('[Main] IPC: window-close');
    try {
        if (mainWindow) mainWindow.close();
    } catch (err) {
        console.error('[Main] Error closing:', err.message);
    }
});

// Settings
ipcMain.on('open-settings', () => {
    console.log('[Main] IPC: open-settings');
    sendToRenderer('open-settings');
});

// Navigation
ipcMain.on('navigate', (event, url) => {
    console.log('[Main] IPC: navigate', url);
    navigate(url);
});

ipcMain.on('go-back', () => {
    console.log('[Main] IPC: go-back');
    goBack();
});

ipcMain.on('go-forward', () => {
    console.log('[Main] IPC: go-forward');
    goForward();
});

ipcMain.on('reload', () => {
    console.log('[Main] IPC: reload');
    reload();
});

// Tabs
ipcMain.on('tab-create', (event, url) => {
    console.log('[Main] IPC: tab-create', url);
    createTab(url);
});

ipcMain.on('tab-create-incognito', (event, url) => {
    console.log('[Main] IPC: tab-create-incognito', url);
    createTab(url, true);
});

ipcMain.on('tab-switch', (event, tabId) => {
    console.log('[Main] IPC: tab-switch', tabId);
    switchTab(tabId);
});

ipcMain.on('tab-close', (event, tabId) => {
    console.log('[Main] IPC: tab-close', tabId);
    closeTab(tabId);
});

// Folders
ipcMain.on('folder-create', (event, title) => {
    createFolder(title);
});

ipcMain.on('folder-update-meta', (event, { id, title, color }) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
        if (title) folder.title = title;
        if (color) folder.color = color;
        updateTabsList(); // Updates all windows
    }
});

ipcMain.on('folder-delete', (event, folderId) => {
    folders = folders.filter(f => f.id !== folderId);
    tabs.forEach(t => { if (t.folderId === folderId) t.folderId = null; });
    updateTabsList(); // Updates all windows
});

ipcMain.on('folder-minimize', (event, { folderId, minimized }) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) folder.isMinimized = minimized;
    updateTabsList(); // Updates all windows
});

ipcMain.on('tab-move-to-folder', (event, { tabId, folderId }) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) tab.folderId = folderId;
    updateTabsList(); // Updates all windows
});

ipcMain.on('tab-pin', (event, { tabId, pinned }) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.isPinned = pinned;
        // Pinned tabs shouldn't be in folders
        if (pinned) tab.folderId = null;
    }
    updateTabsList(); // Updates all windows
});

// AI Search (invoke = async response)
ipcMain.handle('ai-search', async (event, { query, settings, systemPrompt }) => {
    let effectivePrompt = systemPrompt || HELPER_SYSTEM_PROMPT;
    let effectiveQuery = query;

    // Handle Slash Commands
    if (query.startsWith('/summarize')) {
        effectivePrompt = SUMMARIZE_SYSTEM_PROMPT;
        // If it's just /summarize, try to get context from the sender webContents
        if (query.trim() === '/summarize') {
            const win = BrowserWindow.fromWebContents(event.sender);
            const tab = getActiveTab(win?.id);
            if (tab && tab.view) {
                try {
                    const data = await tab.view.webContents.executeJavaScript(`
                       (function() {
                           return {
                               title: document.title,
                               text: document.body.innerText.substring(0, 10000)
                           };
                       })()
                   `);
                    effectiveQuery = `Analyze the following page:\nTitle: ${data.title}\n\nContent:\n${data.text}`;
                } catch (e) {
                    console.error('[Main] Failed to extract page context for summarize:', e.message);
                }
            }
        }
    } else if (query.startsWith('/explain')) {
        effectivePrompt = EXPLAIN_SYSTEM_PROMPT;
        // Similar context extraction for /explain if no text follows
        if (query.trim() === '/explain') {
            const win = BrowserWindow.fromWebContents(event.sender);
            const tab = getActiveTab(win?.id);
            if (tab && tab.view) {
                try {
                    const data = await tab.view.webContents.executeJavaScript(`
                       (function() {
                           return {
                               title: document.title,
                               text: document.body.innerText.substring(0, 5000)
                           };
                       })()
                   `);
                    effectiveQuery = `Explain the core concepts of this page:\nTitle: ${data.title}\n\nContent:\n${data.text}`;
                } catch (e) {
                    console.error('[Main] Failed to extract page context for explain:', e.message);
                }
            }
        }
    }

    return await handleAISearchHelper(effectiveQuery, settings, effectivePrompt);
});

async function triggerRewrite(view, text, mode) {
    const storage = loadStorage();
    const settings = {
        aiProvider: storage.aiProvider,
        openaiKey: storage.openaiKey,
        intentsSearchKey: storage.intentsSearchKey,
        geminiKey: storage.geminiKey,
        grokKey: storage.grokKey
    };

    const systemPrompt = REWRITE_SYSTEM_PROMPTS[mode] || REWRITE_SYSTEM_PROMPTS.shorter;

    // Show loading popup in the webContents
    view.webContents.send('extension-action', {
        action: 'showAIRewritePopup',
        selectedText: text,
        mode: mode,
        loading: true
    });

    try {
        const result = await handleAISearchHelper(text, settings, systemPrompt);
        view.webContents.send('extension-action', {
            action: 'showAIRewritePopup',
            selectedText: text,
            mode: mode,
            result: result.summary,
            error: result.error,
            loading: false
        });
    } catch (err) {
        view.webContents.send('extension-action', {
            action: 'showAIRewritePopup',
            selectedText: text,
            mode: mode,
            error: err.message,
            loading: false
        });
    }
}

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('go-search-trigger', (event, { query }) => {
    console.log('[Main] IPC: go-search-trigger', query);
    // Send to main window only
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
        win.webContents.send('go-search-trigger', { query });
    }
});

// Find In Page
ipcMain.on('find-in-page', (event, { text, options }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const tab = getActiveTab(win?.id);
    if (tab && tab.view) {
        tab.view.webContents.findInPage(text, options);
    }
});

ipcMain.on('stop-find', (event, { action }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const tab = getActiveTab(win?.id);
    if (tab && tab.view) {
        tab.view.webContents.stopFindInPage(action || 'clearSelection');
    }
});

// Zoom Controls
ipcMain.on('set-zoom', (event, { factor }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const tab = getActiveTab(win?.id);
    if (tab && tab.view) {
        tab.view.webContents.setZoomFactor(factor);
    }
});

ipcMain.on('set-find-active', (event, active) => {
    isFindActive = active;
    windows.forEach(win => updateAllTabBounds(win));
});

ipcMain.on('set-downloads-active', (event, active) => {
    isDownloadsActive = active;
    windows.forEach(win => updateAllTabBounds(win));
});

ipcMain.on('set-split-ratio', (event, ratio) => {
    splitRatio = Math.max(0.1, Math.min(0.9, ratio));
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) updateAllTabBounds(win);
    else windows.forEach(w => updateAllTabBounds(w));

    // Persist split ratio
    const storage = loadStorage();
    storage.splitRatio = splitRatio;
    saveStorage(storage);
});

ipcMain.on('set-tor-enabled', async (event, enabled) => {
    console.log('[Main] IPC: set-tor-enabled', enabled);
    const incognitoSession = session.fromPartition('memory:incognito_session');

    if (enabled) {
        try {
            await startTorService();
            // Tor SOCKS5 proxy
            await incognitoSession.setProxy({
                proxyRules: 'socks5://127.0.0.1:9050',
                proxyBypassRules: '<local>'
            });
            console.log('[Main] Tor proxy enabled for incognito session');
        } catch (err) {
            console.error('[Main] Failed to start Tor or set proxy:', err);
            sendToRenderer('tor-setup-error', 'Failed to start Tor service');
        }
    } else {
        stopTorService();
        // Clear proxy
        await incognitoSession.setProxy({
            proxyRules: '',
            proxyBypassRules: ''
        });
        console.log('[Main] Tor proxy disabled for incognito session');
    }
});

ipcMain.on('panic-incognito', async () => {
    console.log('[Main] IPC: panic-incognito - Closing all incognito tabs and clearing session');

    // Close all incognito tabs
    const incognitoTabs = tabs.filter(t => t.isIncognito);
    incognitoTabs.forEach(t => closeTab(t.id));

    // Wipe session data
    const incSess = session.fromPartition('memory:incognito_session');
    await incSess.clearStorageData();
    await incSess.clearCache();

    // Regenerate seed for next session
    incognitoSecret = Math.random().toString(36).substring(2);

    console.log('[Main] Panic complete.');
});

ipcMain.on('toggle-split-view', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    console.log(`[Main] IPC: toggle-split-view for window ${win.id}`);
    const activeTab = tabs.find(t => t.id === win._activeTabId);
    if (!activeTab) return;

    if (activeTab.splitWith) {
        // Unsplit
        const partner = tabs.find(t => t.id === activeTab.splitWith);
        if (partner) {
            partner.splitWith = null;
            if (partner.view) win.removeBrowserView(partner.view);
        }
        activeTab.splitWith = null;
        updateWindowLayout(win);
        updateTabsList(win);
        sendToRenderer('split-view-changed', false, 'main', win.id);
    } else {
        // Try to split
        const winTabs = tabs.filter(t => t.windowId === win.id);
        if (winTabs.length === 2) {
            // Auto-split with the only other tab in this window
            const otherTab = winTabs.find(t => t.id !== win._activeTabId);
            if (otherTab) {
                activeTab.splitWith = otherTab.id;
                otherTab.splitWith = activeTab.id;
                if (otherTab.view && !isSettingsOpen && !isAIOverlayOpen) {
                    win.addBrowserView(otherTab.view);
                }
                updateWindowLayout(win);
                updateTabsList(win);
                sendToRenderer('split-view-changed', true, 'main', win.id);
            }
        } else {
            // Ask which tab to split with
            sendToRenderer('open-split-picker', null, 'main', win.id);
        }
    }
});

// Tracker Disclosure IPC
ipcMain.handle('get-tracker-stats', (event) => {
    const storage = loadStorage();
    if (storage.privacyDisclosureEnabled !== true) {
        return { total: 0, advertising: 0, analytics: 0, social: 0, other: 0 };
    }

    const tabId = event.sender.id;
    // Check incognito first
    const incognitoSession = session.fromPartition('memory:incognito_session');
    const incognitoStats = incognitoSession.trackerStats ? incognitoSession.trackerStats.get(tabId) : null;

    // Check default session
    const defaultStats = session.defaultSession.trackerStats ? session.defaultSession.trackerStats.get(tabId) : null;

    return incognitoStats || defaultStats || { total: 0, advertising: 0, analytics: 0, social: 0, other: 0 };
});

ipcMain.on('split-with-tab', (event, targetTabId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const activeTab = tabs.find(t => t.id === win._activeTabId);
    if (!activeTab) return;

    if (targetTabId === 'new') {
        const newId = createTab(null, win._isIncognito, { windowId: win.id });
        const newTab = tabs.find(t => t.id === newId);
        activeTab.splitWith = newId;
        newTab.splitWith = activeTab.id;
    } else {
        const otherTab = tabs.find(t => t.id === targetTabId);
        if (otherTab) {
            // If the other tab was already split, unsplit its old partner
            if (otherTab.splitWith) {
                const oldPartner = tabs.find(t => t.id === otherTab.splitWith);
                if (oldPartner) oldPartner.splitWith = null;
            }
            activeTab.splitWith = otherTab.id;
            otherTab.splitWith = activeTab.id;
            if (otherTab.view && !isSettingsOpen && !isAIOverlayOpen) {
                win.addBrowserView(otherTab.view);
            }
        }
    }
    updateWindowLayout(win);
    updateTabsList(win);
    sendToRenderer('split-view-changed', true, 'main', win.id);
});

// AI Bridge for extension scripts
ipcMain.handle('ask-ai', async (event, prompt, settings, context) => {
    console.log('[Main] IPC: ask-ai');
    // Combine prompt and context if needed
    const fullQuery = context ? `Context: ${context}\n\nTask: ${prompt}` : prompt;
    // Use generic prompt for ask-ai, as it's typically used for specific tasks like vocab/concepts
    return await handleAISearchHelper(fullQuery, settings, HELPER_SYSTEM_PROMPT);
});

// Storage
ipcMain.handle('storage-get', async (event, keys) => {
    console.log('[Main] IPC: storage-get', keys);
    try {
        const storage = loadStorage();
        console.log('[Main] Current storage keys:', Object.keys(storage));

        if (!keys) {
            return storage;
        }

        const result = {};

        // Handle string, array, or object (with default values)
        if (typeof keys === 'string') {
            result[keys] = storage[keys];
        } else if (Array.isArray(keys)) {
            keys.forEach(key => {
                if (storage.hasOwnProperty(key)) {
                    result[key] = storage[key];
                }
            });
        } else if (typeof keys === 'object' && keys !== null) {
            // Chrome API: if object, keys are properties, values are defaults
            Object.entries(keys).forEach(([key, defaultValue]) => {
                result[key] = storage.hasOwnProperty(key) ? storage[key] : defaultValue;
            });
        }

        console.log('[Main] storage-get returning:', Object.keys(result));
        return result;
    } catch (err) {
        console.error('[Main] storage-get error:', err.message);
        return {};
    }
});

ipcMain.handle('storage-set', async (event, items) => {
    console.log('[Main] IPC: storage-set', Object.keys(items));
    try {
        const storage = loadStorage();
        Object.assign(storage, items);
        saveStorage(storage);

        console.log('[Main] Storage updated and saved to disk');

        // Notify relevant renderers of storage change
        // Optimization: Broadcast to all views so they remain in sync
        sendToRenderer('storage-changed', items, 'all');

        return { success: true };
    } catch (err) {
        console.error('[Main] storage-set error:', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.on('toggle-intent-mode', () => {
    console.log('[Main] IPC: toggle-intent-mode');
    sendToActiveTab('activateIntentMode', { intent: 'read' });
});

ipcMain.on('trigger-isolate', (event, text) => {
    console.log('[Main] IPC: trigger-isolate', text ? 'with text' : 'empty');
    sendToActiveTab('triggerIsolate', { selectedText: text });
});

ipcMain.on('panic-close-incognito', () => {
    console.log('[Main] PANIC: Closing all incognito tabs');
    const incognitoTabs = tabs.filter(t => t.isIncognito);
    incognitoTabs.forEach(t => closeTab(t.id));

    // Clear the incognito session completely
    const incognitoSession = session.fromPartition('memory:incognito_session');
    incognitoSession.clearStorageData();
});

ipcMain.on('open-settings', () => {
    console.log('[Main] IPC: open-settings request');
    sendToRenderer('open-settings', null, 'main');
});

ipcMain.on('set-settings-visibility', async (event, visible) => {
    console.log('[Main] IPC: set-settings-visibility', visible);
    isSettingsOpen = visible;
    const tab = getActiveTab();

    if (tab && tab.view && mainWindow) {
        if (visible) {
            // Capture page first
            try {
                const image = await tab.view.webContents.capturePage();
                const dataUrl = image.toDataURL();
                sendToRenderer('update-blur-snapshot', dataUrl);
            } catch (e) { console.error('Capture failed', e); }

            // Hide view (remove)
            mainWindow.removeBrowserView(tab.view);
        } else {
            // Clear snapshot
            sendToRenderer('update-blur-snapshot', null);
            mainWindow.addBrowserView(tab.view);
            updateAllTabBounds(mainWindow);
        }
    }
});

ipcMain.handle('get-selection', async () => {
    const tab = getActiveTab();
    if (tab && tab.view && tab.view.webContents) {
        try {
            const selection = await tab.view.webContents.executeJavaScript('window.getSelection().toString()');
            return selection.trim();
        } catch (err) {
            console.error('[Main] Error getting selection:', err.message);
            return '';
        }
    }
    return '';
});

ipcMain.on('set-ai-overlay-visible', async (event, visible) => {
    console.log('[Main] IPC: set-ai-overlay-visible', visible);
    isAIOverlayOpen = visible;
    const tab = getActiveTab();
    if (tab && tab.view && mainWindow) {
        if (visible) {
            try {
                const image = await tab.view.webContents.capturePage();
                const dataUrl = image.toDataURL();
                sendToRenderer('update-blur-snapshot', dataUrl);
            } catch (e) { console.error('Capture failed', e); }

            mainWindow.removeBrowserView(tab.view);
        } else {
            sendToRenderer('update-blur-snapshot', null);
            mainWindow.addBrowserView(tab.view);
            updateAllTabBounds(mainWindow);
        }
    }
});

ipcMain.on('set-action-bar-visible', async (event, visible) => {
    console.log('[Main] IPC: set-action-bar-visible', visible);
    isActionBarOpen = visible;
    const tab = getActiveTab();
    if (tab && tab.view && mainWindow) {
        if (visible) {
            try {
                const image = await tab.view.webContents.capturePage();
                const dataUrl = image.toDataURL();
                sendToRenderer('update-blur-snapshot', dataUrl);
            } catch (e) { console.error('Capture failed', e); }

            mainWindow.removeBrowserView(tab.view);
        } else {
            sendToRenderer('update-blur-snapshot', null);
            mainWindow.addBrowserView(tab.view);
            updateAllTabBounds(mainWindow);
        }
    }
});

ipcMain.handle('get-open-tabs', async () => {
    // Return sanitized list of open tabs for the @mention feature
    return tabs.filter(t => !t.isDead).map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        isIncognito: t.isIncognito
    }));
});

ipcMain.handle('get-tab-thumbnail', async (event, tabId) => {
    try {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab || !tab.view) return null;

        const image = await tab.view.webContents.capturePage();
        // Resize to a reasonable thumbnail size (e.g., 200px width)
        const thumbnail = image.resize({ width: 240 });
        return thumbnail.toDataURL();
    } catch (err) {
        console.error('[Main] Error getting tab thumbnail:', err.message);
        return null;
    }
});

ipcMain.handle('extract-tab-data', async (event, tabId) => {
    try {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab || !tab.view) return { error: 'Tab not found' };

        // Focused extraction script to save tokens
        const script = `
            (function() {
                return {
                    title: document.title,
                    h1: document.querySelector('h1')?.innerText || '',
                    metaDescription: document.querySelector('meta[name="description"]')?.content || '',
                    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
                    ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
                    // Extract first 1000 chars of main text if meta is missing
                    bodySnippet: document.body.innerText.substring(0, 1000).replace(/\\s+/g, ' ').trim()
                };
            })()
        `;

        const data = await tab.view.webContents.executeJavaScript(script);
        return data;
    } catch (err) {
        console.error('[Main] Extraction error:', err.message);
    }
});

ipcMain.handle('open-devtools', (event) => {
    const tab = getActiveTab();
    if (tab && tab.view && tab.view.webContents) {
        tab.view.webContents.openDevTools({ mode: 'detach' });
    }
});

ipcMain.handle('clear-cache', async (event) => {
    const tab = getActiveTab();
    if (tab && tab.view && tab.view.webContents) {
        await tab.view.webContents.session.clearCache();
        await tab.view.webContents.session.clearStorageData();
        return { success: true };
    }
    return { error: 'No active view found' };
});

ipcMain.handle('get-performance', () => {
    const usage = process.memoryUsage();
    return {
        heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB'
    };
});

// ============================================
// KEYBOARD SHORTCUTS & MENU
// ============================================

let isUrlFocus = false;
ipcMain.on('set-url-focus', async (event, focused) => {
    console.log('[Main] IPC: set-url-focus', focused);
    isUrlFocus = focused;

    if (focused) {
        if (!suggestionsView) {
            suggestionsView = new BrowserView({
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });
            suggestionsView.webContents.loadFile('suggestions.html');
            suggestionsView.setBackgroundColor('#00000000');
        }

        const bounds = mainWindow.getContentBounds();
        suggestionsView.setBounds({
            x: Math.round((bounds.width - 300) / 2),
            y: 48,
            width: 300,
            height: 400
        });

        mainWindow.addBrowserView(suggestionsView);
        mainWindow.setTopBrowserView(suggestionsView);
    } else {
        if (suggestionsView) {
            mainWindow.removeBrowserView(suggestionsView);
        }
    }
});

ipcMain.on('update-suggestions-data', (event, data) => {
    if (suggestionsView) {
        suggestionsView.webContents.send('suggestions-data', data);
    }
});

ipcMain.on('navigate-from-suggestions', (event, url) => {
    navigate(url);
    if (mainWindow) mainWindow.webContents.send('blur-top-bar');
});

ipcMain.on('swipe-gesture', (event, data) => {
    // Forward gesture tracking/UI events to the main window's renderer
    const webContents = event.sender;
    const tab = tabs.find(t => t.view && t.view.webContents === webContents);
    if (!tab) return;

    const win = BrowserWindow.fromId(tab.windowId);
    if (win) {
        sendToRenderer('swipe-gesture', data, 'main', win.id);
    }

    // Handle the actual navigation if complete
    if (data.action === 'complete') {
        if (data.direction === 'back' && webContents.canGoBack()) {
            webContents.goBack();
        } else if (data.direction === 'forward' && webContents.canGoForward()) {
            webContents.goForward();
        }
    }
});

function setupKeyboardShortcuts() {
    console.log('[Main] Setting up keyboard shortcuts...');

    // Create application menu with accelerators
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => {
                        console.log('[Main] Shortcut: New Tab');
                        createTab();
                    }
                },
                {
                    label: 'New Incognito Tab',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    click: () => {
                        console.log('[Main] Shortcut: New Incognito Tab');
                        createTab(null, true);
                    }
                },
                {
                    label: 'Close Tab',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => {
                        console.log('[Main] Shortcut: Close Tab');
                        const win = BrowserWindow.getFocusedWindow();
                        if (win && win._activeTabId) closeTab(win._activeTabId);
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'Alt+F4',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Find in Page',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => sendToRenderer('show-find', null)
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        console.log('[Main] Shortcut: Reload');
                        reload();
                    }
                },
                {
                    label: 'Force Reload',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => {
                        console.log('[Main] Shortcut: Force Reload');
                        const tab = getActiveTab();
                        if (tab) tab.view.webContents.reloadIgnoringCache();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Toggle DevTools',
                    accelerator: 'F12',
                    click: () => {
                        const tab = getActiveTab();
                        if (tab) {
                            tab.view.webContents.toggleDevTools();
                        }
                    }
                },
                {
                    label: 'Toggle Browser DevTools',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.toggleDevTools();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => sendToRenderer('set-zoom-level', { factor: 1.0 })
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => sendToRenderer('set-zoom-level', { direction: 'in' })
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => sendToRenderer('set-zoom-level', { direction: 'out' })
                },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Navigation',
            submenu: [
                {
                    label: 'Back',
                    accelerator: 'Alt+Left',
                    click: () => {
                        console.log('[Main] Shortcut: Back');
                        goBack();
                    }
                },
                {
                    label: 'Forward',
                    accelerator: 'Alt+Right',
                    click: () => {
                        console.log('[Main] Shortcut: Forward');
                        goForward();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Focus Address Bar',
                    accelerator: 'CmdOrCtrl+L',
                    click: () => {
                        console.log('[Main] Shortcut: Focus Address Bar');
                        sendToRenderer('focus-address-bar', null);
                    }
                },
                { type: 'separator' },
                {
                    label: 'Next Tab',
                    accelerator: 'CmdOrCtrl+Tab',
                    click: () => {
                        console.log('[Main] Shortcut: Next Tab');
                        cycleTab(1);
                    }
                },
                {
                    label: 'Previous Tab',
                    accelerator: 'CmdOrCtrl+Shift+Tab',
                    click: () => {
                        console.log('[Main] Shortcut: Previous Tab');
                        cycleTab(-1);
                    }
                }
            ]
        },
        {
            label: 'Intents',
            submenu: [
                {
                    label: 'Hold That Thought',
                    accelerator: 'Alt+T',
                    click: () => {
                        console.log('[Main] Shortcut: Hold That Thought');
                        sendToActiveTab('triggerHoldThought');
                    }
                },
                {
                    label: 'Ping Me',
                    accelerator: 'Alt+P',
                    click: () => {
                        console.log('[Main] Shortcut: Ping Me');
                        sendToActiveTab('showPingBar');
                    }
                },
                {
                    label: 'Footsteps',
                    accelerator: 'Alt+B',
                    click: () => {
                        console.log('[Main] Shortcut: Footsteps');
                        sendToActiveTab('showFootstepsPanel');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Intent Mode',
                    accelerator: 'Alt+I',
                    click: () => {
                        console.log('[Main] Shortcut: Intent Mode');
                        sendToActiveTab('activateIntentMode', { intent: 'read' });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    console.log('[Main] Keyboard shortcuts and menu set up successfully');
}

// ============================================
// SIDEBAR HELPERS
// ============================================

ipcMain.on('set-autohide', (event, enabled) => {
    console.log(`[Main] IPC: set-autohide ${enabled}`);
    isAutoHideEnabled = enabled;
    saveStorage({ sidebarAutohide: enabled });

    windows.forEach(win => {
        if (enabled) win._isSidebarHovered = false;
        updateAllTabBounds(win);
        updateSidebarBounds(win); // Ensure sidebar bounds are updated for each window
        sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: win._isSidebarHovered }, 'all', win.id);
    });
});

ipcMain.on('set-sidebar-hover', (event, hovered) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    if (isAutoHideEnabled) {
        if (win._isSidebarHovered !== hovered) {
            console.log(`[Main] IPC: set-sidebar-hover ${hovered} for window ${win.id}`);
            win._isSidebarHovered = hovered;
            updateSidebarBounds(win);
            sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: win._isSidebarHovered }, 'all', win.id);
        }
    }
});

ipcMain.on('sidebar-trigger', (event) => {
    if (isAutoHideEnabled) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        if (!win._isSidebarHovered) {
            // SECURITY/UI FIX: Only allow the leftmost view to trigger the sidebar
            const tab = tabs.find(t => t.view && t.view.webContents === event.sender);
            if (tab) {
                const activeTab = tabs.find(t => t.id === win._activeTabId);
                if (activeTab && activeTab.splitWith) {
                    const splitTab = tabs.find(t => t.id === activeTab.splitWith);
                    if (tab === splitTab) return;
                }
            }

            console.log(`[Main] IPC: sidebar-trigger for window ${win.id}`);
            win._isSidebarHovered = true;
            updateSidebarBounds(win);
            sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: win._isSidebarHovered }, 'all', win.id);
        }
    }
});

function createSidebarView(win) {
    if (!win) return;
    if (win._sidebarView) return;

    const sidebar = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win._sidebarView = sidebar;
    // Set global sidebarView for compatibility if it's the first main window
    if (!win._isIncognito && !sidebarView) sidebarView = sidebar;

    sidebar.webContents.loadURL(`file://${path.join(__dirname, 'index.html')}?mode=sidebar&windowId=${win.id}`);

    sidebar.webContents.on('did-finish-load', () => {
        console.log(`[Main] Sidebar view for window ${win.id} loaded`);
        updateTabsList(win);
    });

    console.log(`[Main] Sidebar view created for window ${win.id}`);
}

function updateSidebarBounds(win) {
    if (!win || !win._sidebarView) return;

    const bounds = win.getContentBounds();
    const SIDEBAR_WIDTH = 240;
    let TOP_BAR_HEIGHT = 48;

    if (win.isFullScreen()) {
        TOP_BAR_HEIGHT = 0;
    }

    const shouldShow = !isAutoHideEnabled || win._isSidebarHovered;

    if (shouldShow) {
        if (win._sidebarHideTimeout) {
            clearTimeout(win._sidebarHideTimeout);
            win._sidebarHideTimeout = null;
        }

        if (!win.getBrowserViews().includes(win._sidebarView)) {
            win.addBrowserView(win._sidebarView);
        }

        win._sidebarView.setBounds({
            x: 0,
            y: Math.round(TOP_BAR_HEIGHT),
            width: Math.max(1, Math.round(SIDEBAR_WIDTH)),
            height: Math.max(1, Math.round(bounds.height - TOP_BAR_HEIGHT))
        });

        win.setTopBrowserView(win._sidebarView);
    } else {
        // Delay removal to allow CSS animation to finish
        if (win.getBrowserViews().includes(win._sidebarView) && !win._sidebarHideTimeout) {
            win._sidebarHideTimeout = setTimeout(() => {
                if (!win._isSidebarHovered && isAutoHideEnabled) {
                    win.removeBrowserView(win._sidebarView);
                }
                win._sidebarHideTimeout = null;
            }, 300); // Reduced delay to match faster CSS transition
        }
    }
}

function updateAllTabBounds(win) {
    if (!win) return;
    const bounds = win.getContentBounds();
    const SIDEBAR_WIDTH = 240;
    const DEFAULT_TOP_BAR_HEIGHT = 48;

    // Dynamic offsets for overlays
    let topBarOffset = DEFAULT_TOP_BAR_HEIGHT;
    if (win.isFullScreen()) {
        topBarOffset = 0; // Hide top bar space in full-screen if desired
    }
    if (isFindActive) topBarOffset += 60; // Make room for find box

    let bottomBarOffset = 0;
    if (isDownloadsActive) bottomBarOffset = 80;

    let xOffset = 0;
    let contentWidth = Math.max(1, bounds.width);

    if (!isAutoHideEnabled) {
        xOffset = SIDEBAR_WIDTH;
        contentWidth = Math.max(1, bounds.width - SIDEBAR_WIDTH);
    }

    const contentHeight = Math.max(1, bounds.height - topBarOffset - bottomBarOffset);

    // Handle Split View layout
    if (win._activeTabId && !isSettingsOpen && !isAIOverlayOpen && !isActionBarOpen) {
        const activeTab = tabs.find(t => t.id === win._activeTabId);
        if (activeTab && activeTab.splitWith) {
            const splitTab = tabs.find(t => t.id === activeTab.splitWith);

            if (activeTab.view && splitTab && splitTab.view) {
                const GAP_WIDTH = 4;
                const totalContentArea = contentWidth - GAP_WIDTH;
                const leftWidth = Math.floor(totalContentArea * splitRatio);
                const rightWidth = totalContentArea - leftWidth;

                activeTab.view.setBounds({
                    x: Math.round(xOffset),
                    y: Math.round(topBarOffset),
                    width: Math.max(1, Math.round(leftWidth)),
                    height: Math.max(1, Math.round(contentHeight))
                });
                activeTab.view.webContents.executeJavaScript('window.dispatchEvent(new Event("resize"));').catch(() => { });

                splitTab.view.setBounds({
                    x: Math.round(xOffset + leftWidth + GAP_WIDTH),
                    y: Math.round(topBarOffset),
                    width: Math.max(1, Math.round(rightWidth)),
                    height: Math.max(1, Math.round(contentHeight))
                });
                splitTab.view.webContents.executeJavaScript('window.dispatchEvent(new Event("resize"));').catch(() => { });

                // Sync split ratio to renderer for resizer placement
                sendToRenderer('split-ratio-update', splitRatio, 'main', win.id);

                // Re-order views to ensure they are on top
                const views = win.getBrowserViews();
                if (views.includes(activeTab.view)) win.setTopBrowserView(activeTab.view);
                if (views.includes(splitTab.view)) win.setTopBrowserView(splitTab.view);

                // Always ensure sidebar is on top if it's there
                if (win._sidebarView && win.getBrowserViews().includes(win._sidebarView)) win.setTopBrowserView(win._sidebarView);

                console.log(`[Main] Split View in window ${win.id}: ${win._activeTabId} | ${activeTab.splitWith}`);
                return;
            }
        }
    }

    // Default layout
    tabs.filter(t => t.windowId === win.id).forEach(tab => {
        if (tab.view) {
            tab.view.setBounds({
                x: Math.round(xOffset),
                y: Math.round(topBarOffset),
                width: Math.max(1, Math.round(contentWidth)),
                height: Math.max(1, Math.round(contentHeight))
            });
        }
    });

    // Ensure sidebar bounds are also updated
    updateSidebarBounds(win);
}

// Cycle through tabs (1 = next, -1 = previous)
function cycleTab(direction) {
    try {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return;

        const winTabs = tabs.filter(t => t.windowId === win.id);
        if (winTabs.length <= 1) return;

        const currentIndex = winTabs.findIndex(t => t.id === win._activeTabId);
        if (currentIndex === -1) return;

        let newIndex = currentIndex + direction;
        if (newIndex >= winTabs.length) newIndex = 0;
        if (newIndex < 0) newIndex = winTabs.length - 1;

        switchTab(winTabs[newIndex].id);
    } catch (err) {
        console.error('[Main] Error cycling tabs:', err.message);
    }
}


// Send action to the active tab's webContents
function sendToActiveTab(action, data = {}) {
    try {
        const tab = getActiveTab();
        if (tab && tab.view && tab.view.webContents) {
            tab.view.webContents.send('extension-action', { action, ...data });
            console.log(`[Main] Sent ${action} to active tab`);
        } else {
            console.log('[Main] No active tab to send action to');
        }
    } catch (err) {
        console.error('[Main] Error sending to active tab:', err.message);
    }
}

// ============================================
// MEMORY MANAGEMENT (HIBERNATION)
// ============================================

function hibernateInactiveTabs() {
    const storage = loadStorage();
    if (storage.tabHibernation !== true) return;

    const hibernationTimeout = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    tabs.forEach(tab => {
        // Don't hibernate active tabs in any window, pinned tabs, or already hibernated/dead tabs
        const isActiveInAnyWin = windows.some(w => w._activeTabId === tab.id);
        if (isActiveInAnyWin || tab.isPinned || tab.isDead || !tab.view) return;

        const inactiveTime = now - tab.lastUsed;
        if (inactiveTime > hibernationTimeout) {
            console.log(`[Hibernation] Suspending tab ${tab.id} (${tab.title}) - Inactive for ${Math.round(inactiveTime / 1000 / 60)}m`);

            // Destroy the view to free memory
            try {
                const win = BrowserWindow.fromId(tab.windowId);
                if (win) {
                    win.removeBrowserView(tab.view);
                }
                tab.view.webContents.destroy();
                tab.view = null; // Mark as hibernated
                if (win) updateTabsList(win);
            } catch (err) {
                console.error(`[Hibernation] Error suspending tab ${tab.id}:`, err.message);
            }
        }
    });
}

// Start Hibernation Sentry (every minute)
setInterval(hibernateInactiveTabs, 60 * 1000);

// Update app.whenReady to include sidebar initialization
if (app) {
    app.whenReady().then(() => {
        // Apply session configuration at startup
        const mainSess = session.fromPartition('persist:main');
        configurePrivacySession(mainSess, false);

        createWindow();
        console.log('[Main] App ready');

        // Load initial settings
        const storage = loadStorage();
        isAutoHideEnabled = storage.sidebarAutohide || false;
        splitRatio = storage.splitRatio || 0.5;
        console.log('[Main] Initial Autohide State:', isAutoHideEnabled, 'Split Ratio:', splitRatio);

        setupKeyboardShortcuts();
        initializePrivacyEngine();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });

        // Restore Session or Create Initial Tab
        const savedSettings = loadStorage();
        if (savedSettings.savedTabs && savedSettings.savedTabs.length > 0) {
            console.log('[Main] Restoring session...', savedSettings.savedTabs.length, 'tabs');
            let hasActive = false;

            // First, re-create pinned tabs in LAZY mode
            savedSettings.savedTabs.forEach(tData => {
                if (tData.isPinned) {
                    createTab(tData.url, false, { ...tData, lazy: true });
                }
            });

            // Then create one fresh active tab (or restore the last active one if you prefer)
            // The requirement says "open a new tab, only keep those pinned tab with their icon there"
            createTab();
            hasActive = true;

        } else {
            // Create initial tab
            createTab();
        }

        // Check for updates after a short delay to allow window to load
        setTimeout(() => {
            autoUpdater.checkForUpdates();
        }, 3000);

        // Register Action Bar shortcut (AI Search)
        globalShortcut.register('Alt+K', () => {
            console.log('[Main] Shortcut: Alt+K (AI Search)');
            sendToRenderer('toggle-action-bar', { mode: 'ai' }, 'main');
        });

        // Register Command Palette shortcut
        globalShortcut.register('Alt+Shift+K', () => {
            console.log('[Main] Shortcut: Alt+Shift+K (Command Palette)');
            sendToRenderer('toggle-action-bar', { mode: 'palette' }, 'main');
        });

        // AI Rewrite Shortcut
        globalShortcut.register('Alt+R', () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
                const activeTab = getActiveTab(win.id);
                if (activeTab && activeTab.view) {
                    activeTab.view.webContents.send('extension-action', { action: 'triggerAIRewriteShortcut' });
                }
            }
        });
    });

    app.on('will-quit', () => {
        globalShortcut.unregisterAll();
    });

    app.on('window-all-closed', () => {
        console.log('[Main] All windows closed');
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', () => {
        console.log('[Main] App quitting...');
    });

} else {
    console.error('[Main] CRITICAL: Electron app object is undefined!');
}

console.log('[Main] Main process script loaded');
app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('[Main] Protocol URL opened:', url);
});

// Auth IPCs (Planned for future)
ipcMain.on('start-google-login', () => {
    console.log('[Main] Google Login requested (Coming Soon)');
});

// ============================================
// LOGO MENU HANDLERS
// ============================================

ipcMain.on('make-default-browser', () => {
    console.log('[Main] IPC: make-default-browser');
    if (!app.isDefaultProtocolClient('pulsar')) {
        app.setAsDefaultProtocolClient('pulsar');
    }
});

ipcMain.on('new-window', () => {
    console.log('[Main] IPC: new-window');
    createWindow();
});

ipcMain.on('print-page', () => {
    console.log('[Main] IPC: print-page');
    const tab = getActiveTab();
    if (tab && tab.view) {
        tab.view.webContents.print();
    }
});

ipcMain.on('close-app', () => {
    console.log('[Main] IPC: close-app');
    app.quit();
});

ipcMain.on('show-logo-menu', (event, pos) => {
    const template = [
        {
            label: 'Make Pulsar default',
            click: () => {
                if (!app.isDefaultProtocolClient('pulsar')) {
                    app.setAsDefaultProtocolClient('pulsar');
                }
            }
        },
        {
            label: 'Check for Updates',
            click: () => {
                sendToRenderer('open-settings');
                // We'd need to send another signal to switch to updates tab if desired
            }
        },
        { type: 'separator' },
        {
            label: 'New Window',
            accelerator: 'CmdOrCtrl+N',
            click: () => createWindow()
        },
        {
            label: 'New Incognito Window',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => createWindow({ isIncognito: true })
        },
        { type: 'separator' },
        {
            label: 'Print',
            accelerator: 'CmdOrCtrl+P',
            click: () => {
                const tab = getActiveTab();
                if (tab && tab.view) tab.view.webContents.print();
            }
        },
        {
            label: 'GitHub Repository',
            click: () => {
                const tab = getActiveTab();
                if (tab) navigate('https://github.com/Hootsworth/Pulsar');
            }
        },
        { type: 'separator' },
        {
            label: 'Close Pulsar',
            role: 'quit'
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({
        window: BrowserWindow.fromWebContents(event.sender),
        x: pos.x,
        y: pos.y
    });
});
