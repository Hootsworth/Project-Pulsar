/**
 * Chrome API Shim for Electron
 * Replaces all Chrome extension APIs with Electron/localStorage equivalents
 * This file should be loaded BEFORE any other scripts
 */

(function () {
    'use strict';

    console.log('[ChromeShim] Loading...');

    // Prevent double initialization
    if (window.__ELECTRON_SHIM_LOADED__) {
        console.log('[ChromeShim] Already loaded, skipping');
        return;
    }
    window.__ELECTRON_SHIM_LOADED__ = true;

    // Helper: Get from shared store if available, otherwise localStorage
    async function storageGet(keys) {
        console.log('[ChromeShim] storageGet:', keys);
        try {
            if (window.electronAPI?.storageGet) {
                const result = await window.electronAPI.storageGet(keys);
                console.log('[ChromeShim] storageGet via electronAPI:', Object.keys(result || {}));
                return result;
            }

            return new Promise(resolve => {
                const result = {};
                const keyArray = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));

                keyArray.forEach(key => {
                    try {
                        const val = localStorage.getItem(key);
                        if (val !== null) {
                            try { result[key] = JSON.parse(val); }
                            catch { result[key] = val; }
                        } else if (keys && typeof keys === 'object' && keys[key] !== undefined) {
                            result[key] = keys[key]; // Default value
                        }
                    } catch (e) {
                        console.warn('[ChromeShim] Storage get error for key', key, ':', e.message);
                    }
                });

                console.log('[ChromeShim] storageGet via localStorage:', Object.keys(result));
                resolve(result);
            });
        } catch (err) {
            console.error('[ChromeShim] storageGet error:', err);
            return {};
        }
    }

    // Helper: Set to shared store if available, otherwise localStorage
    async function storageSet(items) {
        console.log('[ChromeShim] storageSet:', Object.keys(items));
        try {
            if (window.electronAPI?.storageSet) {
                await window.electronAPI.storageSet(items);
                console.log('[ChromeShim] storageSet via electronAPI: success');
                return;
            }

            return new Promise(resolve => {
                Object.entries(items).forEach(([key, value]) => {
                    try {
                        localStorage.setItem(key, JSON.stringify(value));
                        // Trigger storage change listeners
                        storageChangeListeners.forEach(fn => {
                            try {
                                fn({ [key]: { newValue: value } }, 'local');
                            } catch (e) {
                                console.error('[ChromeShim] Storage change listener error:', e);
                            }
                        });
                    } catch (e) {
                        console.warn('[ChromeShim] Storage set error for key', key, ':', e.message);
                    }
                });
                console.log('[ChromeShim] storageSet via localStorage: success');
                resolve();
            });
        } catch (err) {
            console.error('[ChromeShim] storageSet error:', err);
        }
    }

    // Helper: Remove from shared store or localStorage
    async function storageRemove(keys) {
        console.log('[ChromeShim] storageRemove:', keys);
        try {
            if (window.electronAPI) {
                const store = await window.electronAPI.storageGet();
                const keyArray = Array.isArray(keys) ? keys : [keys];
                keyArray.forEach(key => delete store[key]);
                return await window.electronAPI.storageSet(store);
            }

            return new Promise(resolve => {
                const keyArray = Array.isArray(keys) ? keys : [keys];
                keyArray.forEach(key => localStorage.removeItem(key));
                console.log('[ChromeShim] storageRemove via localStorage: success');
                resolve();
            });
        } catch (err) {
            console.error('[ChromeShim] storageRemove error:', err);
        }
    }

    // Storage change listeners
    const storageChangeListeners = [];
    const messageListeners = [];
    const alarmListeners = [];

    // ============================================
    // CHROME API SHIM
    // ============================================

    window.chrome = {
        // --- Storage API ---
        storage: {
            local: {
                get: (keys, callback) => {
                    console.log('[ChromeShim] chrome.storage.local.get:', keys);
                    const promise = storageGet(keys);
                    if (callback) promise.then(callback).catch(err => {
                        console.error('[ChromeShim] storage.get callback error:', err);
                        callback({});
                    });
                    return promise;
                },
                set: (items, callback) => {
                    console.log('[ChromeShim] chrome.storage.local.set:', Object.keys(items));
                    const promise = storageSet(items);
                    if (callback) promise.then(callback).catch(err => {
                        console.error('[ChromeShim] storage.set callback error:', err);
                        callback();
                    });
                    return promise;
                },
                remove: (keys, callback) => {
                    console.log('[ChromeShim] chrome.storage.local.remove:', keys);
                    const promise = storageRemove(keys);
                    if (callback) promise.then(callback).catch(err => {
                        console.error('[ChromeShim] storage.remove callback error:', err);
                        callback();
                    });
                    return promise;
                },
                clear: (callback) => {
                    console.log('[ChromeShim] chrome.storage.local.clear');
                    try {
                        localStorage.clear();
                    } catch (err) {
                        console.error('[ChromeShim] storage.clear error:', err);
                    }
                    if (callback) callback();
                }
            },
            onChanged: {
                addListener: (fn) => {
                    console.log('[ChromeShim] storage.onChanged.addListener');
                    storageChangeListeners.push(fn);
                },
                removeListener: (fn) => {
                    const idx = storageChangeListeners.indexOf(fn);
                    if (idx > -1) storageChangeListeners.splice(idx, 1);
                }
            }
        },

        // --- Runtime API ---
        runtime: {
            sendMessage: async (message, callback) => {
                console.log('[ChromeShim] runtime.sendMessage:', message.action);

                // Handle different message types locally
                let response = { success: false };

                try {
                    switch (message.action) {
                        // --- Thought Management ---
                        case 'saveThought':
                            try {
                                const data = await storageGet(['thoughts']);
                                let thoughts = data.thoughts || [];
                                const thought = {
                                    id: Date.now().toString(),
                                    timestamp: Date.now(),
                                    ...message.thought
                                };
                                thoughts.unshift(thought);
                                await storageSet({ thoughts });
                                response = { success: true, thought };
                                console.log('[ChromeShim] saveThought: success');
                            } catch (e) {
                                console.error('[ChromeShim] saveThought error:', e);
                                response = { success: false, error: e.message };
                            }
                            break;

                        case 'getThoughts':
                            try {
                                const data = await storageGet(['thoughts']);
                                response = { success: true, thoughts: data.thoughts || [] };
                                console.log('[ChromeShim] getThoughts: found', (data.thoughts || []).length, 'thoughts');
                            } catch (e) {
                                console.error('[ChromeShim] getThoughts error:', e);
                                response = { success: true, thoughts: [] };
                            }
                            break;

                        case 'deleteThought':
                            try {
                                const data = await storageGet(['thoughts']);
                                let thoughts = data.thoughts || [];
                                thoughts = thoughts.filter(t => t.id !== message.thoughtId);
                                await storageSet({ thoughts });
                                response = { success: true };
                                console.log('[ChromeShim] deleteThought: success');
                            } catch (e) {
                                console.error('[ChromeShim] deleteThought error:', e);
                                response = { success: false };
                            }
                            break;

                        case 'updateThought':
                            try {
                                const data = await storageGet(['thoughts']);
                                let thoughts = data.thoughts || [];
                                const idx = thoughts.findIndex(t => t.id === message.thoughtId);
                                if (idx > -1) {
                                    thoughts[idx] = { ...thoughts[idx], ...message.updates };
                                    await storageSet({ thoughts });
                                    console.log('[ChromeShim] updateThought: success');
                                }
                                response = { success: true };
                            } catch (e) {
                                console.error('[ChromeShim] updateThought error:', e);
                                response = { success: false };
                            }
                            break;

                        // --- AI Search ---
                        case 'intentsSearchAI':
                            try {
                                if (window.electronAPI?.aiSearch) {
                                    const settings = await storageGet(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey', 'intentsSearchKey']);
                                    response = await window.electronAPI.aiSearch(message.query, settings);
                                    console.log('[ChromeShim] intentsSearchAI: response received');
                                } else {
                                    console.error('[ChromeShim] intentsSearchAI: electronAPI.aiSearch not available');
                                    response = { error: 'AI Search not available in this context' };
                                }
                            } catch (e) {
                                console.error('[ChromeShim] intentsSearchAI error:', e);
                                response = { error: e.message };
                            }
                            break;

                        // --- AI Key Management ---
                        case 'checkAIKey':
                            try {
                                const data = await storageGet(['openaiKey']);
                                response = { hasKey: !!data.openaiKey };
                                console.log('[ChromeShim] checkAIKey:', response.hasKey);
                            } catch (e) {
                                console.error('[ChromeShim] checkAIKey error:', e);
                                response = { hasKey: false };
                            }
                            break;

                        case 'saveAIKey':
                            try {
                                await storageSet({ openaiKey: message.key });
                                response = { success: true };
                                console.log('[ChromeShim] saveAIKey: success');
                            } catch (e) {
                                console.error('[ChromeShim] saveAIKey error:', e);
                                response = { success: false };
                            }
                            break;

                        case 'saveAIProviderKey':
                            try {
                                const keyField = `${message.provider}Key`;
                                await storageSet({ [keyField]: message.key });
                                response = { success: true };
                                console.log(`[ChromeShim] saveAIProviderKey (${message.provider}): success`);
                            } catch (e) {
                                console.error('[ChromeShim] saveAIProviderKey error:', e);
                                response = { success: false };
                            }
                            break;

                        // --- Ask AI (Quick AI) ---
                        case 'askAI':
                            try {
                                if (window.electronAPI?.aiSearch) {
                                    const settings = await storageGet(['aiProvider', 'openaiKey', 'geminiKey']);
                                    const prompt = message.context
                                        ? `Context: "${message.context}"\n\nQuestion: ${message.prompt}`
                                        : message.prompt;

                                    const result = await window.electronAPI.aiSearch(prompt, settings);
                                    response = result.error
                                        ? { error: result.error }
                                        : { answer: result.summary };
                                    console.log('[ChromeShim] askAI: response received');
                                } else {
                                    console.error('[ChromeShim] askAI: electronAPI.aiSearch not available');
                                    response = { error: 'AI not available' };
                                }
                            } catch (e) {
                                console.error('[ChromeShim] askAI error:', e);
                                response = { error: e.message };
                            }
                            break;

                        // --- Footsteps (Browsing History) ---
                        case 'getFootsteps':
                            try {
                                const data = await storageGet(['footsteps']);
                                response = { footsteps: data.footsteps || [] };
                                console.log('[ChromeShim] getFootsteps: found', response.footsteps.length, 'footsteps');
                            } catch (e) {
                                console.error('[ChromeShim] getFootsteps error:', e);
                                response = { footsteps: [] };
                            }
                            break;

                        case 'clearFootsteps':
                            try {
                                await storageSet({ footsteps: [] });
                                response = { success: true };
                                console.log('[ChromeShim] clearFootsteps: success');
                            } catch (e) {
                                console.error('[ChromeShim] clearFootsteps error:', e);
                                response = { success: false };
                            }
                            break;

                        // --- Ping/Reminders ---
                        case 'createPing':
                            try {
                                const data = await storageGet(['thoughts']);
                                let thoughts = data.thoughts || [];
                                const thought = {
                                    id: Date.now().toString(),
                                    timestamp: Date.now(),
                                    ...message.thought
                                };
                                thoughts.unshift(thought);
                                await storageSet({ thoughts });

                                // Schedule notification if minutes provided
                                if (message.minutes) {
                                    console.log('[ChromeShim] Scheduling ping for', message.minutes, 'minutes');
                                    setTimeout(() => {
                                        try {
                                            if (Notification.permission === 'granted') {
                                                new Notification('⏰ Reminder', { body: message.thought.text });
                                            }
                                        } catch (notifErr) {
                                            console.error('[ChromeShim] Notification error:', notifErr);
                                        }
                                    }, message.minutes * 60 * 1000);
                                }
                                response = { success: true };
                                console.log('[ChromeShim] createPing: success');
                            } catch (e) {
                                console.error('[ChromeShim] createPing error:', e);
                                response = { success: false };
                            }
                            break;

                        // --- Intent Mode ---
                        case 'getIntentSettings':
                            try {
                                const settings = await storageGet([
                                    'intentFontFamily', 'intentFontSize', 'intentLineHeight',
                                    'intentTheme', 'intentBionic', 'intentDyslexic'
                                ]);
                                response = {
                                    fontFamily: settings.intentFontFamily || "System",
                                    fontSize: settings.intentFontSize || 18,
                                    lineHeight: settings.intentLineHeight || 1.8,
                                    theme: settings.intentTheme || "dark",
                                    bionic: settings.intentBionic || false,
                                    dyslexic: settings.intentDyslexic || false,
                                };
                                console.log('[ChromeShim] getIntentSettings: success');
                            } catch (e) {
                                console.error('[ChromeShim] getIntentSettings error:', e);
                                response = {};
                            }
                            break;

                        case 'saveIntentSettings':
                            try {
                                const items = {};
                                Object.entries(message.settings).forEach(([k, v]) => {
                                    items['intent' + k.charAt(0).toUpperCase() + k.slice(1)] = v;
                                });
                                await storageSet(items);
                                response = { success: true };
                                console.log('[ChromeShim] saveIntentSettings: success');
                            } catch (e) {
                                console.error('[ChromeShim] saveIntentSettings error:', e);
                                response = { success: false };
                            }
                            break;

                        // --- Default ---
                        default:
                            console.warn('[ChromeShim] Unhandled action:', message.action);
                            response = { success: true };
                    }
                } catch (err) {
                    console.error('[ChromeShim] runtime.sendMessage error:', err);
                    response = { success: false, error: err.message };
                }

                if (callback) {
                    try {
                        callback(response);
                    } catch (cbErr) {
                        console.error('[ChromeShim] Callback error:', cbErr);
                    }
                }
                return response;
            },

            onMessage: {
                addListener: (fn) => {
                    console.log('[ChromeShim] runtime.onMessage.addListener');
                    messageListeners.push(fn);
                },
                removeListener: (fn) => {
                    const idx = messageListeners.indexOf(fn);
                    if (idx > -1) messageListeners.splice(idx, 1);
                }
            },

            getURL: (path) => {
                // Return relative path for Electron
                return path;
            },

            id: 'electron-intents-browser'
        },

        // --- Tabs API (simplified) ---
        tabs: {
            query: async (queryInfo, callback) => {
                console.log('[ChromeShim] tabs.query');
                const tabs = [{
                    id: 1,
                    url: window.location.href,
                    title: document.title,
                    active: true
                }];
                if (callback) callback(tabs);
                return tabs;
            },
            create: (options, callback) => {
                console.log('[ChromeShim] tabs.create:', options?.url);
                try {
                    if (options.url) {
                        if (window.electronAPI?.createTab) {
                            window.electronAPI.createTab();
                            if (options.url) {
                                // Navigate after a short delay
                                setTimeout(() => {
                                    window.electronAPI.navigate(options.url);
                                }, 100);
                            }
                        } else {
                            window.open(options.url, '_blank');
                        }
                    }
                } catch (err) {
                    console.error('[ChromeShim] tabs.create error:', err);
                }
                if (callback) callback({ id: Date.now() });
            },
            update: (tabId, options, callback) => {
                console.log('[ChromeShim] tabs.update:', options?.url);
                try {
                    if (options.url) {
                        if (window.electronAPI?.navigate) {
                            window.electronAPI.navigate(options.url);
                        } else {
                            window.location.href = options.url;
                        }
                    }
                } catch (err) {
                    console.error('[ChromeShim] tabs.update error:', err);
                }
                if (callback) callback();
            },
            sendMessage: (tabId, message, callback) => {
                console.log('[ChromeShim] tabs.sendMessage:', message?.action);
                // Dispatch to message listeners directly
                messageListeners.forEach(fn => {
                    try {
                        fn(message, {}, callback || (() => { }));
                    } catch (err) {
                        console.error('[ChromeShim] tabs.sendMessage listener error:', err);
                    }
                });
            },
            onUpdated: {
                addListener: () => { },
                removeListener: () => { }
            },
            onRemoved: {
                addListener: () => { },
                removeListener: () => { }
            }
        },

        // --- Context Menus (no-op for now) ---
        contextMenus: {
            create: () => { console.log('[ChromeShim] contextMenus.create (no-op)'); },
            update: () => { },
            remove: () => { },
            removeAll: () => { },
            onClicked: { addListener: () => { }, removeListener: () => { } }
        },

        // --- Commands (keyboard shortcuts - no-op) ---
        commands: {
            onCommand: { addListener: () => { }, removeListener: () => { } }
        },

        // --- Side Panel (no-op) ---
        sidePanel: {
            open: () => {
                console.log('[ChromeShim] sidePanel.open (no-op)');
                return Promise.resolve();
            },
            setOptions: () => Promise.resolve()
        },

        // --- Omnibox (no-op) ---
        omnibox: {
            onInputEntered: { addListener: () => { }, removeListener: () => { } },
            onInputStarted: { addListener: () => { }, removeListener: () => { } },
            onInputChanged: { addListener: () => { }, removeListener: () => { } },
            setDefaultSuggestion: () => { }
        },

        // --- Alarms ---
        alarms: {
            create: (name, options) => {
                console.log('[ChromeShim] alarms.create:', name, options);
                try {
                    const delay = options.delayInMinutes ? options.delayInMinutes * 60 * 1000 : 0;
                    setTimeout(() => {
                        alarmListeners.forEach(fn => {
                            try {
                                fn({ name });
                            } catch (err) {
                                console.error('[ChromeShim] Alarm listener error:', err);
                            }
                        });
                    }, delay);
                } catch (err) {
                    console.error('[ChromeShim] alarms.create error:', err);
                }
            },
            clear: () => { },
            onAlarm: {
                addListener: (fn) => alarmListeners.push(fn),
                removeListener: () => { }
            }
        },

        // --- Notifications ---
        notifications: {
            create: (id, options, callback) => {
                console.log('[ChromeShim] notifications.create:', options?.title);
                try {
                    if (Notification.permission === 'granted') {
                        new Notification(options.title, { body: options.message, icon: options.iconUrl });
                    } else if (Notification.permission !== 'denied') {
                        Notification.requestPermission().then(perm => {
                            if (perm === 'granted') {
                                new Notification(options.title, { body: options.message });
                            }
                        });
                    }
                } catch (err) {
                    console.error('[ChromeShim] notifications.create error:', err);
                }
                if (callback) callback(id);
            }
        }
    };

    console.log('[ChromeShim] Chrome API Shim loaded for Electron');

    // Listen for storage changes from main process
    if (window.electronAPI?.onStorageChanged) {
        window.electronAPI.onStorageChanged((changes) => {
            console.log('[ChromeShim] Storage changed:', Object.keys(changes));
            try {
                const formattedChanges = {};
                Object.entries(changes).forEach(([k, v]) => {
                    formattedChanges[k] = { newValue: v };
                });
                storageChangeListeners.forEach(fn => {
                    try {
                        fn(formattedChanges, 'local');
                    } catch (err) {
                        console.error('[ChromeShim] Storage change listener error:', err);
                    }
                });
            } catch (err) {
                console.error('[ChromeShim] onStorageChanged error:', err);
            }
        });
    }

    console.log('[ChromeShim] Initialization complete');
})();
