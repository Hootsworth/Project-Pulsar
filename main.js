/**
 * Pulsar - Main Process
 * Handles window management, tabs, navigation, AI search, and storage
 */

const { app, BrowserWindow, BrowserView, ipcMain, screen, session, Menu, MenuItem, nativeImage, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');

console.log('[Main] Starting Pulsar...');

// Set app name for consistent userData path
app.name = 'Pulsar';

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

// Google OAuth Credentials (Replace with yours or set env vars)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '144962418419-ak7hh1vmkao282tpbpetu02mpv2pql1s.apps.googleusercontent.com';


// ============================================
// STATE
// ============================================

let mainWindow = null;
let tabs = [];
let activeTabId = null;
let previousActiveTabId = null;
let tabIdCounter = 1;
let isSettingsOpen = false;
let isAIOverlayOpen = false;
let isAutoHideEnabled = false;
let isSidebarHovered = false;
let sidebarView = null; // Dedicated view for sidebar overlay
let folders = []; // Folder storage: { id: string, title: string, isMinimized: boolean, state: 'used'|'warm'|'cold'|'dead' }
let stateTimer = null;

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
            partition: sessionPartition
        }
    });

    view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setAutoResize({ width: false, height: false });

    // Add Context Menu
    view.webContents.on('context-menu', (event, params) => {
        const menuTemplate = [];

        if (params.selectionText) {
            const trimmedSelection = params.selectionText.trim();
            if (trimmedSelection.length > 0) {
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
                    label: 'Isolate This Section',
                    click: () => {
                        view.webContents.send('extension-action', {
                            action: 'triggerIsolate',
                            selectedText: trimmedSelection
                        });
                    }
                });
                menuTemplate.push({ type: 'separator' });
                menuTemplate.push({ role: 'copy' });
            }
        }

        if (!params.selectionText) {
            menuTemplate.push({ role: 'back' });
            menuTemplate.push({ role: 'forward' });
            menuTemplate.push({ role: 'reload' });
        }

        menuTemplate.push({ type: 'separator' });
        menuTemplate.push({ role: 'cut' });
        menuTemplate.push({ role: 'copy' });
        menuTemplate.push({ role: 'paste' });
        menuTemplate.push({ type: 'separator' });
        menuTemplate.push({ role: 'inspectElement' });

        const menu = Menu.buildFromTemplate(menuTemplate);
        menu.popup({ window: BrowserWindow.fromWebContents(view.webContents) });
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
        tab.url = navUrl;
        if (tab.id === activeTabId) {
            sendToRenderer('update-url', navUrl);
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
        updateTabsList();
    });

    view.webContents.on('did-navigate-in-page', (event, navUrl) => {
        tab.url = navUrl;
        if (tab.id === activeTabId) {
            sendToRenderer('update-url', navUrl);
        }
    });

    view.webContents.on('page-title-updated', (event, title) => {
        tab.title = title;
        updateTabsList();
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
        if (favicons.length > 0) {
            tab.favicon = favicons[0];
            updateTabsList();
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
        const tabUrl = url || `file://${NEW_TAB_URL}`;

        console.log(`[Main] Creating ${isIncognito ? 'incognito ' : ''}tab ${tabId} with URL: ${tabUrl}`);

        const tab = {
            id: tabId,
            view: null,
            url: tabUrl,
            title: options.title || 'New Tab',
            loading: true,
            favicon: options.favicon || null,
            active: false,
            isIncognito: isIncognito,
            folderId: options.folderId || null,
            lastUsed: Date.now(),
            isDead: false,
            isPinned: options.isPinned || false
        };

        setupTabView(tab);
        tabs.push(tab);
        switchTab(tabId);

        console.log(`[Main] Tab ${tabId} created successfully. Total tabs: ${tabs.length}`);
        return tabId;

    } catch (err) {
        console.error('[Main] Error creating tab:', err.message);
        return null;
    }
}

function switchTab(tabId) {
    try {
        console.log(`[Main] Switching to tab ${tabId}`);
        if (activeTabId && activeTabId !== tabId) {
            previousActiveTabId = activeTabId;
        }

        // Deactivate current tab
        tabs.forEach(tab => {
            tab.active = false;
            if (tab.view && mainWindow) {
                mainWindow.removeBrowserView(tab.view);
            }
        });

        // Activate new tab
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.active = true;
            tab.lastUsed = Date.now();
            tab.isDead = false;
            activeTabId = tabId;

            // Revive tab if it was dead
            if (!tab.view) {
                console.log(`[Main] Reviving dead tab ${tabId}`);
                setupTabView(tab);
                tab.isDead = false;
            }

            // Only show the view if no overlays are active
            if (!isSettingsOpen && !isAIOverlayOpen) {
                mainWindow.addBrowserView(tab.view);

                // If this tab is part of a split, add its partner too
                if (tab.splitWith) {
                    const partner = tabs.find(t => t.id === tab.splitWith);
                    if (partner && partner.view) {
                        mainWindow.addBrowserView(partner.view);
                    }
                }
            } else {
                console.log(`[Main] Tab switched to ${tabId} but view hidden due to active overlay`);
            }

            // Update bounds
            updateAllTabBounds();

            sendToRenderer('update-url', tab.url || '');
            updateTabsList();
            console.log(`[Main] Switched to tab ${tabId}`);
        } else {
            console.error(`[Main] Tab ${tabId} not found`);
        }

    } catch (err) {
        console.error('[Main] Error switching tab:', err.message);
    }
}

function closeTab(tabId) {
    try {
        console.log(`[Main] Closing tab ${tabId}`);

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) {
            console.error(`[Main] Tab ${tabId} not found`);
            return;
        }

        const tab = tabs[tabIndex];

        // If this tab was split, unsplit the partner
        if (tab.splitWith) {
            const partner = tabs.find(p => p.id === tab.splitWith);
            if (partner) partner.splitWith = null;
        }

        // Remove view from window
        if (tab.view && mainWindow) {
            mainWindow.removeBrowserView(tab.view);
            tab.view.webContents.destroy();
        }

        // Remove from array
        tabs.splice(tabIndex, 1);

        // If we closed the active tab, switch to another
        if (tabId === activeTabId) {
            if (tabs.length > 0) {
                // Switch to the tab at same index or previous
                const newIndex = Math.min(tabIndex, tabs.length - 1);
                switchTab(tabs[newIndex].id);
            } else {
                // No tabs left, create new one
                createTab();
            }
        } else {
            updateTabsList();
        }

        console.log(`[Main] Tab ${tabId} closed. Remaining tabs: ${tabs.length}`);

    } catch (err) {
        console.error('[Main] Error closing tab:', err.message);
    }
}

function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

function updateTabsList() {
    const tabsData = [];
    const processedIds = new Set();

    tabs.forEach(t => {
        if (processedIds.has(t.id)) return;

        if (t.splitWith) {
            const partner = tabs.find(p => p.id === t.splitWith);
            if (partner) {
                tabsData.push({
                    id: t.id,
                    splitId: partner.id,
                    title: `${t.title || 'New Tab'} | ${partner.title || 'New Tab'}`,
                    url: t.url || '',
                    favicon: t.favicon || partner.favicon || '',
                    active: t.active || partner.active,
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
                // Partner not found (shouldn't happen but be safe)
                tabsData.push({
                    id: t.id,
                    title: t.title || 'New Tab',
                    url: t.url || '',
                    favicon: t.favicon || '',
                    active: t.active,
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
                title: t.title || 'New Tab',
                url: t.url || '',
                favicon: t.favicon || '',
                active: t.active,
                isIncognito: t.isIncognito,
                folderId: t.folderId,
                lastUsed: t.lastUsed,
                isDead: t.isDead,
                isPinned: t.isPinned
            });
            processedIds.add(t.id);
        }
    });

    const allTabs = tabs.map(t => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon }));
    sendToRenderer('tabs-update', { tabs: tabsData, allTabs, folders: folders });

    // Save session
    saveSession();
}

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
    updateTabsList();
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

        if (folderTabs.some(t => t.id === activeTabId)) {
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
            if (mainWindow) mainWindow.removeBrowserView(tab.view);
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
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
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
1. Provide a comprehensive yet concise synthesis (max 180 words).
2. Use professional, clear language.
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

function sendToRenderer(channel, data) {
    try {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send(channel, data);
        }
        if (sidebarView && sidebarView.webContents) {
            sidebarView.webContents.send(channel, data);
        }
        // Also broadcast to all active tab views
        tabs.forEach(tab => {
            if (tab.view && tab.view.webContents) {
                tab.view.webContents.send(channel, data);
            }
        });
    } catch (err) {
        console.error(`[Main] Error sending to renderer (${channel}):`, err.message);
    }
}

// ============================================
// PRIVACY ENGINE
// ============================================

function initializePrivacyEngine() {
    console.log('[Privacy] Initializing privacy engine...');

    // Configure Incognito Session
    const incognitoSession = session.fromPartition('memory:incognito_session');
    configurePrivacySession(incognitoSession, true);
}

function configurePrivacySession(sess, isIncognito) {
    if (isIncognito) {
        // Tracker Blocking
        const TRACKER_DOMAINS = [
            'google-analytics.com', 'doubleclick.net', 'googlesyndication.com',
            'facebook.net', 'facebook.com/tr', 'adnxs.com', 'quantserve.com',
            'scorecardresearch.com', 'amazon-adsystem.com', 'hotjar.com',
            'pixel.facebook.com', 'analytics.twitter.com', 'googleadservices.com',
            'crazyegg.com', 'mixpanel.com', 'optimizely.com'
        ];

        sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
            const url = details.url.toLowerCase();
            const isTracker = TRACKER_DOMAINS.some(domain => url.includes(domain));

            if (isTracker) {
                return callback({ cancel: true });
            }

            // HTTPS Enforcement in Incognito
            if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
                const secureUrl = url.replace('http://', 'https://');
                return callback({ redirectURL: secureUrl });
            }

            callback({});
        });

        // Referrer Scrubbing
        sess.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
            const requestHeaders = details.requestHeaders;

            if (requestHeaders['Referer']) {
                try {
                    const ref = new URL(requestHeaders['Referer']);
                    const target = new URL(details.url);
                    // Scrub referrer for cross-origin requests
                    if (ref.hostname !== target.hostname) {
                        delete requestHeaders['Referer'];
                    }
                } catch (e) { }
            }

            requestHeaders['DNT'] = '1'; // Do Not Track

            callback({ requestHeaders });
        });

        // Strict Permissions
        sess.setPermissionRequestHandler((webContents, permission, callback) => {
            const sensitive = ['geolocation', 'notifications', 'midi', 'media'];
            if (sensitive.includes(permission)) {
                return callback(false); // Default block in private mode
            }
            callback(true);
        });
    }
}

// ============================================
// WINDOW CREATION
// ============================================

function createWindow() {
    try {
        console.log('[Main] Creating main window...');

        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            frame: false,
            icon: path.join(__dirname, 'icon.png'),
            backgroundColor: '#050505',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        mainWindow.loadFile('index.html');

        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Main window loaded');
            // Initial tab creation matches moved to app.whenReady to support session restore
        });

        // Handle window resize - update all tab bounds
        mainWindow.on('resize', () => {
            updateAllTabBounds();
            if (sidebarView) {
                updateSidebarBounds();
            }
        });

        mainWindow.on('maximize', () => {
            updateAllTabBounds();
        });

        mainWindow.on('unmaximize', () => {
            updateAllTabBounds();
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        // Open DevTools in development
        // mainWindow.webContents.openDevTools();

        console.log('[Main] Main window created successfully');

    } catch (err) {
        console.error('[Main] Error creating window:', err.message);
    }
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
        updateTabsList();
    }
});

ipcMain.on('folder-delete', (event, folderId) => {
    folders = folders.filter(f => f.id !== folderId);
    tabs.forEach(t => { if (t.folderId === folderId) t.folderId = null; });
    updateTabsList();
});

ipcMain.on('folder-minimize', (event, { folderId, minimized }) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) folder.isMinimized = minimized;
    updateTabsList();
});

ipcMain.on('tab-move-to-folder', (event, { tabId, folderId }) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) tab.folderId = folderId;
    updateTabsList();
});

ipcMain.on('tab-pin', (event, { tabId, pinned }) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.isPinned = pinned;
        // Pinned tabs shouldn't be in folders
        if (pinned) tab.folderId = null;
    }
    updateTabsList();
});

// AI Search (invoke = async response)
ipcMain.handle('ai-search', async (event, { query, settings }) => {
    console.log('[Main] IPC: ai-search');
    return await handleAISearch(query, settings);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('go-search-trigger', (event, { query }) => {
    console.log('[Main] IPC: go-search-trigger', query);
    // Send to main window only
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('go-search-trigger', { query });
    }
});

ipcMain.on('toggle-split-view', () => {
    console.log('[Main] IPC: toggle-split-view');
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    if (activeTab.splitWith) {
        // Unsplit
        const partner = tabs.find(t => t.id === activeTab.splitWith);
        if (partner) {
            partner.splitWith = null;
            if (partner.view && mainWindow) mainWindow.removeBrowserView(partner.view);
        }
        activeTab.splitWith = null;
        updateAllTabBounds();
        updateTabsList();
        sendToRenderer('split-view-changed', false);
    } else {
        // Try to split
        if (tabs.length === 2) {
            // Auto-split with the only other tab
            const otherTab = tabs.find(t => t.id !== activeTabId);
            if (otherTab) {
                activeTab.splitWith = otherTab.id;
                otherTab.splitWith = activeTabId;
                if (otherTab.view && mainWindow && !isSettingsOpen && !isAIOverlayOpen) {
                    mainWindow.addBrowserView(otherTab.view);
                }
                updateAllTabBounds();
                updateTabsList();
                sendToRenderer('split-view-changed', true);
            }
        } else {
            // Ask which tab to split with
            sendToRenderer('open-split-picker');
        }
    }
});

ipcMain.on('split-with-tab', (event, targetTabId) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    if (targetTabId === 'new') {
        const newId = createTab();
        const newTab = tabs.find(t => t.id === newId);
        activeTab.splitWith = newId;
        newTab.splitWith = activeTabId;
    } else {
        const otherTab = tabs.find(t => t.id === targetTabId);
        if (otherTab) {
            // If the other tab was already split, unsplit its old partner
            if (otherTab.splitWith) {
                const oldPartner = tabs.find(t => t.id === otherTab.splitWith);
                if (oldPartner) oldPartner.splitWith = null;
            }
            activeTab.splitWith = otherTab.id;
            otherTab.splitWith = activeTabId;
            if (otherTab.view && mainWindow && !isSettingsOpen && !isAIOverlayOpen) {
                mainWindow.addBrowserView(otherTab.view);
            }
        }
    }
    updateAllTabBounds();
    updateTabsList();
    sendToRenderer('split-view-changed', true);
});

// AI Bridge for extension scripts
ipcMain.handle('ask-ai', async (event, prompt, settings, context) => {
    console.log('[Main] IPC: ask-ai');
    // Combine prompt and context if needed
    const fullQuery = context ? `Context: ${context}\n\nTask: ${prompt}` : prompt;
    // Use generic prompt for ask-ai, as it's typically used for specific tasks like vocab/concepts
    return await handleAISearch(fullQuery, settings, GENERIC_SYSTEM_PROMPT);
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

        // Notify all windows of storage change
        sendToRenderer('storage-changed', items);

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

ipcMain.on('set-settings-visibility', (event, visible) => {
    console.log('[Main] IPC: set-settings-visibility', visible);
    isSettingsOpen = visible;
    const tab = getActiveTab();
    if (tab && tab.view && mainWindow) {
        // Same logic as AI overlay: move view off-screen to show settings in main window
        const bounds = mainWindow.getBounds();
        const TOOLBAR_HEIGHT = 90;

        if (visible) {
            mainWindow.removeBrowserView(tab.view);
        } else {
            mainWindow.addBrowserView(tab.view);
            // Re-apply bounds just in case
            const bounds = mainWindow.getBounds();
            const TOOLBAR_HEIGHT = 90;
            updateAllTabBounds();
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

ipcMain.on('set-ai-overlay-visible', (event, visible) => {
    console.log('[Main] IPC: set-ai-overlay-visible', visible);
    isAIOverlayOpen = visible;
    const tab = getActiveTab();
    if (tab && tab.view && mainWindow) {
        if (visible) {
            mainWindow.removeBrowserView(tab.view);
        } else {
            mainWindow.addBrowserView(tab.view);
            // Restore view position
            const bounds = mainWindow.getBounds();
            const TOOLBAR_HEIGHT = 90;
            updateAllTabBounds();
        }
    }
});

// ============================================
// KEYBOARD SHORTCUTS & MENU
// ============================================

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
                        if (activeTabId) closeTab(activeTabId);
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
                { role: 'selectAll' }
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
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
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
                    label: 'Quick AI',
                    accelerator: 'Alt+Q',
                    click: () => {
                        console.log('[Main] Shortcut: Quick AI');
                        sendToActiveTab('showAIBar');
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
    console.log('[Main] IPC: set-autohide', enabled);
    isAutoHideEnabled = enabled;

    // Always ensure sidebar view exists
    if (!sidebarView) {
        createSidebarView();
    }

    if (enabled) {
        isSidebarHovered = false;
    }

    updateAllTabBounds();
    updateSidebarBounds();
    sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: isSidebarHovered });
});

ipcMain.on('set-sidebar-hover', (event, hovered) => {
    if (isAutoHideEnabled) {
        if (isSidebarHovered !== hovered) {
            console.log('[Main] IPC: set-sidebar-hover', hovered);
            isSidebarHovered = hovered;
            updateSidebarBounds();
            sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: isSidebarHovered });
        }
    }
});

ipcMain.on('sidebar-trigger', () => {
    if (isAutoHideEnabled && !isSidebarHovered) {
        console.log('[Main] IPC: sidebar-trigger (from content)');
        isSidebarHovered = true;
        updateSidebarBounds();
        sendToRenderer('sidebar-visibility', { autohide: isAutoHideEnabled, visible: isSidebarHovered });
    }
});

function createSidebarView() {
    if (sidebarView) return;

    sidebarView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    sidebarView.webContents.loadURL(`file://${path.join(__dirname, 'index.html')}?mode=sidebar`);

    sidebarView.webContents.on('did-finish-load', () => {
        console.log('[Main] Sidebar view loaded');
        updateTabsList();
    });

    // We don't add it yet, updateSidebarBounds will handle it
    console.log('[Main] Sidebar view created');
}

function updateSidebarBounds() {
    if (!mainWindow || !sidebarView) return;

    const bounds = mainWindow.getContentBounds();
    const SIDEBAR_WIDTH = 240;
    const TOP_BAR_HEIGHT = 40;

    const shouldShow = !isAutoHideEnabled || isSidebarHovered;

    if (shouldShow) {
        if (!mainWindow.getBrowserViews().includes(sidebarView)) {
            mainWindow.addBrowserView(sidebarView);
        }

        sidebarView.setBounds({
            x: 0,
            y: Math.round(TOP_BAR_HEIGHT),
            width: Math.round(SIDEBAR_WIDTH),
            height: Math.round(bounds.height - TOP_BAR_HEIGHT)
        });

        mainWindow.setTopBrowserView(sidebarView);
    } else {
        mainWindow.removeBrowserView(sidebarView);
    }
}

function updateAllTabBounds() {
    if (!mainWindow) return;
    const bounds = mainWindow.getContentBounds();
    const SIDEBAR_WIDTH = 240;
    const TOP_BAR_HEIGHT = 40;

    let xOffset = 0;
    let contentWidth = bounds.width;

    if (!isAutoHideEnabled) {
        xOffset = SIDEBAR_WIDTH;
        contentWidth = bounds.width - SIDEBAR_WIDTH;
    }

    const contentHeight = bounds.height - TOP_BAR_HEIGHT;

    // Handle Split View layout
    if (activeTabId && !isSettingsOpen && !isAIOverlayOpen) {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.splitWith) {
            const splitTab = tabs.find(t => t.id === activeTab.splitWith);

            if (activeTab.view && splitTab && splitTab.view) {
                const halfWidth = Math.floor(contentWidth / 2);

                activeTab.view.setBounds({
                    x: Math.round(xOffset),
                    y: Math.round(TOP_BAR_HEIGHT),
                    width: halfWidth,
                    height: Math.round(contentHeight)
                });

                splitTab.view.setBounds({
                    x: Math.round(xOffset + halfWidth),
                    y: Math.round(TOP_BAR_HEIGHT),
                    width: Math.round(contentWidth - halfWidth),
                    height: Math.round(contentHeight)
                });

                // Re-order views to ensure they are on top
                const views = mainWindow.getBrowserViews();
                if (views.includes(activeTab.view)) mainWindow.setTopBrowserView(activeTab.view);
                if (views.includes(splitTab.view)) mainWindow.setTopBrowserView(splitTab.view);

                // Always ensure sidebar is on top if it's there
                if (sidebarView && mainWindow.getBrowserViews().includes(sidebarView)) mainWindow.setTopBrowserView(sidebarView);

                console.log(`[Main] Split View: ${activeTabId} | ${activeTab.splitWith}`);
                return;
            }
        }
    }

    // Default layout
    tabs.forEach(tab => {
        if (tab.view) {
            tab.view.setBounds({
                x: Math.round(xOffset),
                y: Math.round(TOP_BAR_HEIGHT),
                width: Math.round(contentWidth),
                height: Math.round(contentHeight)
            });
        }
    });

    // Ensure sidebar bounds are also updated
    updateSidebarBounds();
}

// Cycle through tabs (1 = next, -1 = previous)
function cycleTab(direction) {
    try {
        if (tabs.length <= 1) return;

        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        if (currentIndex === -1) return;

        let newIndex = currentIndex + direction;
        if (newIndex >= tabs.length) newIndex = 0;
        if (newIndex < 0) newIndex = tabs.length - 1;

        switchTab(tabs[newIndex].id);
    } catch (err) {
        console.error('[Main] Error cycling tabs:', err.message);
    }
}

// Helper to get the current active tab object
function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
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

// Update app.whenReady to include sidebar initialization
if (app) {
    app.whenReady().then(() => {
        console.log('[Main] App ready');

        // Load initial settings
        const storage = loadStorage();
        isAutoHideEnabled = storage.sidebarAutohide || false;
        console.log('[Main] Initial Autohide State:', isAutoHideEnabled);

        setupKeyboardShortcuts();
        initializePrivacyEngine();
        createWindow();

        // Create sidebar view immediately
        createSidebarView();

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

            // Re-create each tab
            savedSettings.savedTabs.forEach(tData => {
                // Restore pinned tabs (and others if desired)
                if (tData.isPinned) {
                    createTab(tData.url, false, tData);
                    hasActive = true;
                }
            });

            // Also restore normal tabs if desired:
            /*
            savedSettings.savedTabs.forEach(tData => {
                if (!tData.isPinned) {
                     createTab(tData.url, false, tData);
                     hasActive = true;
                }
            });
            */

            if (!hasActive) {
                createTab(); // Fallback
            }

        } else {
            // Create initial tab
            createTab();
        }

        // Check for updates after a short delay to allow window to load
        setTimeout(() => {
            autoUpdater.checkForUpdates();
        }, 3000);
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
