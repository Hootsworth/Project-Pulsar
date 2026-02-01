/**
 * Intents Browser - Preload Script (Main UI)
 * Exposes browser APIs to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Loading...');

// Wrapper to add logging and error handling
function ipcSend(channel, ...args) {
    console.log(`[Preload] Send: ${channel}`, args.length > 0 ? args : '');
    try {
        ipcRenderer.send(channel, ...args);
    } catch (err) {
        console.error(`[Preload] Error sending ${channel}:`, err);
    }
}

async function ipcInvoke(channel, ...args) {
    console.log(`[Preload] Invoke: ${channel}`, args.length > 0 ? args : '');
    try {
        const result = await ipcRenderer.invoke(channel, ...args);
        console.log(`[Preload] Invoke result for ${channel}:`, result ? 'received' : 'null');
        return result;
    } catch (err) {
        console.error(`[Preload] Error invoking ${channel}:`, err);
        throw err;
    }
}

function ipcOn(channel, callback) {
    console.log(`[Preload] Registering listener: ${channel}`);
    ipcRenderer.on(channel, (event, value) => {
        console.log(`[Preload] Received: ${channel}`);
        try {
            callback(value);
        } catch (err) {
            console.error(`[Preload] Error in ${channel} callback:`, err);
        }
    });
}

// Expose APIs to renderer
try {
    contextBridge.exposeInMainWorld('browser', {
        // Window Controls
        minimize: () => ipcSend('window-min'),
        maximize: () => ipcSend('window-max'),
        close: () => ipcSend('window-close'),

        // Navigation
        navigate: (url) => ipcSend('navigate', url),
        goBack: () => ipcSend('go-back'),
        goForward: () => ipcSend('go-forward'),
        reload: () => ipcSend('reload'),

        // Tabs
        createTab: (url) => ipcSend('tab-create', url),
        createIncognitoTab: (url) => ipcSend('tab-create-incognito', url),
        setUrlFocus: (focused) => ipcSend('set-url-focus', focused),
        switchTab: (id) => ipcSend('tab-switch', id),
        closeTab: (id) => ipcSend('tab-close', id),
        pinTab: (id, pinned) => ipcSend('tab-pin', { tabId: id, pinned }),
        moveToFolder: (tabId, folderId) => ipcSend('tab-move-to-folder', { tabId, folderId }),

        // Folders
        createFolder: (title) => ipcSend('folder-create', title),
        updateFolder: (id, updates) => ipcSend('folder-update-meta', { id, ...updates }),
        deleteFolder: (id) => ipcSend('folder-delete', id),
        minimizeFolder: (id, minimized) => ipcSend('folder-minimize', { folderId: id, minimized }),

        // AI
        aiSearch: (query, settings) => ipcInvoke('ai-search', { query, settings }),
        setAIOverlayVisible: (visible) => ipcSend('set-ai-overlay-visible', visible),
        setSettingsVisibility: (visible) => ipcSend('set-settings-visibility', visible),
        setActionBarVisibility: (visible) => ipcSend('set-action-bar-visible', visible),
        setAutoHide: (enabled) => ipcSend('set-autohide', enabled),
        setSidebarHover: (hovered) => ipcSend('set-sidebar-hover', hovered),

        triggerGoSearch: (query) => ipcSend('go-search-trigger', { query }),
        toggleIntentMode: () => ipcSend('toggle-intent-mode'),
        triggerIsolate: (text) => ipcSend('trigger-isolate', text),
        getSelection: () => ipcInvoke('get-selection'),
        toggleSplitView: () => ipcSend('toggle-split-view'),
        splitWithTab: (tabId) => ipcSend('split-with-tab', tabId),
        setSplitRatio: (ratio) => ipcSend('set-split-ratio', ratio),
        panic: () => ipcSend('panic-close-incognito'),

        // Storage
        storageGet: (keys) => ipcInvoke('storage-get', keys),
        storageSet: (items) => ipcInvoke('storage-set', items),

        // generic Invoke
        invoke: (channel, ...args) => ipcInvoke(channel, ...args),
        checkUpdates: () => ipcSend('check-updates'),
        downloadUpdate: () => ipcSend('download-update'),
        installUpdate: () => ipcSend('install-update'),

        // Auth
        startGoogleLogin: () => ipcSend('start-google-login'),
        clearAuth: () => ipcSend('clear-auth'),

        // Menu Actions
        makeDefaultBrowser: () => ipcSend('make-default-browser'),
        createNewWindow: () => ipcSend('new-window'),
        printPage: () => ipcSend('print-page'),
        closeApp: () => ipcSend('close-app'),
        showLogoMenu: (pos) => ipcSend('show-logo-menu', pos),

        // Listeners
        onUpdateStatus: (callback) => ipcOn('update-status', callback),
        onUpdateUrl: (callback) => ipcOn('update-url', callback),
        onTabsUpdate: (callback) => ipcOn('tabs-update', callback),
        onSaveThought: (callback) => ipcOn('save-thought', callback),
        onStorageChanged: (callback) => ipcOn('storage-changed', callback),
        onFocusAddressBar: (callback) => ipcOn('focus-address-bar', callback),
        onOpenSettings: (callback) => ipcOn('open-settings', callback),
        onSidebarVisibility: (callback) => ipcOn('sidebar-visibility', callback),
        onGoSearchTrigger: (callback) => ipcOn('go-search-trigger', callback),
        onSplitViewChanged: (callback) => ipcOn('split-view-changed', callback),
        onOpenSplitPicker: (callback) => ipcOn('open-split-picker', callback),
        onSplitRatioUpdate: (callback) => ipcOn('split-ratio-update', callback),
        onToggleActionBar: (callback) => ipcOn('toggle-action-bar', callback),
        onAuthCallback: (callback) => ipcOn('auth-callback', callback),
        onAuthStatusChanged: (callback) => ipcOn('auth-status-changed', callback),
        onUpdateBlurSnapshot: (callback) => ipcOn('update-blur-snapshot', callback),
        updateSuggestionsData: (data) => ipcSend('update-suggestions-data', data),
        onBlurTopBar: (callback) => ipcOn('blur-top-bar', callback),
        setTorEnabled: (enabled) => ipcSend('set-tor-enabled', enabled),
        panicIncognito: () => ipcSend('panic-incognito'),
        onTorSetupProgress: (callback) => ipcOn('tor-setup-progress', callback),
        onTorSetupError: (callback) => ipcOn('tor-setup-error', callback)
    });

    console.log('[Preload] window.browser exposed successfully');

} catch (err) {
    console.error('[Preload] Failed to expose browser API:', err);
}

// Also expose as electronAPI for shim compatibility
try {
    contextBridge.exposeInMainWorld('electronAPI', {
        aiSearch: (query, settings) => ipcInvoke('ai-search', { query, settings }),
        storageGet: (keys) => ipcInvoke('storage-get', keys),
        storageSet: (items) => ipcInvoke('storage-set', items),
        onStorageChanged: (callback) => ipcOn('storage-changed', callback),
        createTab: () => ipcSend('tab-create'),
        navigate: (url) => ipcSend('navigate', url),
        invoke: (channel, ...args) => ipcInvoke(channel, ...args)
    });

    console.log('[Preload] window.electronAPI exposed successfully');

} catch (err) {
    console.error('[Preload] Error exposing window.electronAPI:', err);
}

console.log('[Preload] Initialization complete');
