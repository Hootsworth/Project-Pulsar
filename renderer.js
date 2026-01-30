const ACCENTS = {
    'default': '#007aff',
    'ocean': '#0ea5e9',
    'forest': '#22c55e',
    'sunset': '#f97316',
    'midnight': '#8b5cf6',
    'lavender': '#ec4899'
};

console.log('[Renderer] Starting...');

const urlParams = new URLSearchParams(window.location.search);
const isSidebarMode = urlParams.get('mode') === 'sidebar';
if (isSidebarMode) {
    document.body.classList.add('mode-sidebar');
} else {
    document.body.classList.add('mode-main');
}

async function loadSettings() {
    try {
        if (window.browser?.storageGet) {
            const settings = await window.browser.storageGet([
                'themeAccent', 'theme', 'showQuickLinks',
                'showTimeWatermark', 'newTabResults', 'aiProvider',
                'openaiKey', 'geminiKey', 'grokKey', 'llamaKey'
            ]);

            if (settings.themeAccent && ACCENTS[settings.themeAccent]) {
                const color = ACCENTS[settings.themeAccent];
                document.documentElement.style.setProperty('--accent-primary', color);
                document.body.style.setProperty('--accent-primary', color);

                // Handle RGB for transparency
                const hex = color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                document.documentElement.style.setProperty('--accent-primary-rgb', `${r}, ${g}, ${b}`);

                setTimeout(() => {
                    document.querySelectorAll('.accent-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.accent === settings.themeAccent);
                    });
                }, 500);
            }

            if (settings.theme) {
                document.documentElement.setAttribute('data-theme', settings.theme);
                setTimeout(() => {
                    document.querySelectorAll('.theme-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
                    });
                }, 500);
            }

            // Restore Toggles
            ['showQuickLinks', 'showTimeWatermark', 'newTabResults'].forEach(id => {
                const el = $(id);
                if (el && settings[id] !== undefined) el.checked = settings[id];
            });

            // Restore AI Provider
            const aiProviderSelect = $('aiProviderSelect');
            if (settings.aiProvider && aiProviderSelect) {
                aiProviderSelect.value = settings.aiProvider;
                document.querySelectorAll('.ai-key-group').forEach(group => {
                    group.classList.toggle('hidden', group.id !== `keyGroup_${settings.aiProvider}`);
                });
            }

            // Restore Keys
            ['openai', 'gemini', 'grok', 'llama'].forEach(provider => {
                const input = $(`${provider}KeyInput`);
                const keyName = provider === 'openai' ? 'openaiKey' : `${provider}Key`;
                if (input && settings[keyName]) input.value = settings[keyName];
            });
        }
    } catch (err) {
        console.error('[Renderer] Error loading settings:', err);
    }
}

document.addEventListener('DOMContentLoaded', loadSettings);

// ============================================
// SAFE DOM HELPERS
// ============================================

function $(id) {
    return document.getElementById(id);
}

function safeAddListener(elementId, event, handler) {
    const el = $(elementId);
    if (el) {
        el.addEventListener(event, (e) => handler(e));
    }
}

// ============================================
// WINDOW CONTROLS
// ============================================

safeAddListener('btn-min', 'click', () => window.browser?.minimize());
safeAddListener('btn-max', 'click', () => window.browser?.maximize());
safeAddListener('btn-close', 'click', () => window.browser?.close());

// ============================================
// NAVIGATION (Top Bar)
// ============================================

safeAddListener('btn-back-top', 'click', () => window.browser?.goBack());
safeAddListener('btn-forward-top', 'click', () => window.browser?.goForward());
safeAddListener('btn-reload-top', 'click', () => window.browser?.reload());
function toggleModal(id, show) {
    const modal = $(id);
    if (!modal) return;

    if (show) {
        modal.classList.add('active');
        if (id === 'settings-overlay') window.browser?.setSettingsVisibility(true);
    } else {
        modal.classList.remove('active');
        if (id === 'settings-overlay') window.browser?.setSettingsVisibility(false);
    }
}

safeAddListener('btn-settings-top', 'click', () => toggleModal('settings-overlay', true));
safeAddListener('settings-close', 'click', () => toggleModal('settings-overlay', false));

safeAddListener('btn-split-top', 'click', () => {
    window.browser?.toggleSplitView();
});

// ============================================
// SIDEBAR CONTROLS & GO SEARCH
// ============================================

// Smart Intent Button (Dual Mode)
async function handleSmartIntent() {
    if (!window.browser) return;
    try {
        const selection = await window.browser.getSelection();
        if (selection && selection.length > 0) {
            console.log('[Renderer] Smart Button: Isolating selection');
            window.browser.triggerIsolate(selection);
        } else {
            console.log('[Renderer] Smart Button: Toggling intent mode');
            window.browser.toggleIntentMode();
        }
    } catch (e) {
        console.error('[Renderer] Error in smart button:', e);
        window.browser.toggleIntentMode();
    }
}

safeAddListener('btn-intent', 'click', handleSmartIntent);
safeAddListener('btn-intent-top', 'click', handleSmartIntent);

safeAddListener('btn-new-tab', 'click', () => window.browser?.createTab());
safeAddListener('btn-incognito-tab', 'click', () => window.browser?.createIncognitoTab());
safeAddListener('btn-panic', 'click', () => {
    if (confirm('Panic Mode: This will instantly close all private tabs and clear their session data. Continue?')) {
        window.browser?.panic();
    }
});

// Fix Archive logic
safeAddListener('btn-archive', 'click', () => {
    const container = $('archives-container');
    if (container) {
        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            renderArchives();
            $('btn-archive').classList.add('active');
        } else {
            container.classList.add('hidden');
            $('btn-archive').classList.remove('active');
        }
    }
});

safeAddListener('btn-close-archive', 'click', () => {
    $('archives-container')?.classList.add('hidden');
    $('btn-archive')?.classList.remove('active');
});

safeAddListener('go-search-close', 'click', () => toggleModal('go-search-overlay', false));
safeAddListener('close-lyrics', 'click', () => toggleModal('lyrics-overlay', false));
safeAddListener('split-picker-close', 'click', () => toggleModal('split-picker-overlay', false));

async function renderArchives() {
    const list = $('archives-list');
    if (!list) return;

    list.innerHTML = '<div class="archives-loading">Loading your trail...</div>';

    try {
        const result = await window.browser.storageGet(['footsteps']);
        const footsteps = result.footsteps || [];

        if (footsteps.length === 0) {
            list.innerHTML = '<div class="archives-empty">No footsteps yet. Explore the web to leave a trail!</div>';
            return;
        }

        list.innerHTML = footsteps.map((s, i) => `
            <div class="archive-item" data-url="${s.url}" style="animation-delay: ${i * 0.05}s">
                <div class="archive-favicon-wrapper">
                    <img src="${s.favicon || `https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}" class="archive-favicon" onerror="this.src='https://www.google.com/s2/favicons?domain=google.com&sz=32'">
                </div>
                <div class="archive-info">
                    <div class="archive-title">${escapeHtml(s.title || s.domain)}</div>
                    <div class="archive-url">${escapeHtml(s.domain)}</div>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.archive-item').forEach(item => {
            item.onclick = () => {
                window.browser?.navigate(item.dataset.url);
                $('archives-container')?.classList.add('hidden');
                $('btn-archive')?.classList.remove('active');
            };
        });
    } catch (err) {
        console.error('[Renderer] Error rendering archives:', err);
        list.innerHTML = '<div class="archives-empty">Error loading history</div>';
    }
}

// Go Search Logic (Omnibox Interceptor)
const addressInput = $('address-input');
const goSearchOverlay = $('go-search-overlay'); // Ensure this element exists in HTML
let isGoSearchActive = false;

if (addressInput) {
    addressInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const query = addressInput.value.trim();

            // Check for "Go Search" trigger
            if (query.toLowerCase().startsWith('go ')) {
                e.preventDefault();
                const actualQuery = query.substring(3).trim();

                if (isSidebarMode) {
                    console.log('[Renderer] Sending Go Search trigger from sidebar');
                    window.browser?.triggerGoSearch(actualQuery);
                } else {
                    activateGoSearch(actualQuery);
                }
            } else if (query) {
                window.browser?.navigate(query);
                addressInput.blur();
            }
        }
    });

    if (window.browser?.onUpdateUrl) {
        window.browser.onUpdateUrl((url) => {
            if (url && !url.startsWith('file://')) {
                addressInput.value = url;
            } else {
                addressInput.value = '';
            }

            // Handle button visibility based on context
            const settingsBtn = $('btn-settings-top');
            const intentBtn = $('btn-intent');
            const intentBtnTop = $('btn-intent-top');

            if (url && (url.includes('extension/index.html') || url === 'about:blank')) {
                // Home/New Tab Page
                if (settingsBtn) settingsBtn.style.display = 'none';
                document.body.classList.add('home-mode');
                if (intentBtnTop) intentBtnTop.style.display = 'none';
            } else {
                // Web Page
                if (settingsBtn) settingsBtn.style.display = 'flex';
                document.body.classList.remove('home-mode');
                if (intentBtnTop) intentBtnTop.style.display = 'flex';
            }
        });
    }
}

async function activateGoSearch(query) {
    if (isSidebarMode) return; // Main window only

    console.log('[Renderer] Activating Go Search for:', query);

    const overlay = $('go-search-overlay');
    const container = $('go-search-container');
    const bodyEl = $('go-search-body');
    const closeBtn = $('go-search-close');
    const fallback = $('go-search-fallback');
    const googleLink = $('go-google-fallback');

    if (!overlay || !bodyEl) {
        console.error('[Renderer] Go Search UI elements missing');
        return;
    }

    // Reset UI
    overlay.classList.add('active');
    window.browser?.setAIOverlayVisible(true);
    bodyEl.innerHTML = '<div class="intents-ai-summary"><span class="intents-ai-label">INTENTS AI</span><div class="go-search-status"><span class="loading-spinner"></span> Synthesizing knowledge for: <strong>' + escapeHtml(query) + '</strong>...</div></div>';
    fallback.style.display = 'none';

    if (closeBtn) {
        closeBtn.onclick = () => {
            overlay.classList.remove('active');
            window.browser?.setAIOverlayVisible(false);
            if (addressInput) addressInput.value = '';
        };
    }

    try {
        const response = await window.browser.invoke('ai-search', {
            query: query,
            settings: await window.browser.storageGet(null)
        });

        if (response && response.summary) {
            // Success - clear status and start typewriter
            bodyEl.innerHTML = `
                <div class="intents-ai-summary">
                    <span class="intents-ai-label">INTENTS AI</span>
                    <div id="ai-synthesis-content"></div>
                </div>
            `;
            const target = $('ai-synthesis-content');
            typewriterEffect(target, response.summary);

            // Add links if available
            if (response.links && response.links.length > 0) {
                const linksContainer = document.createElement('div');
                linksContainer.className = 'intents-search-results';
                linksContainer.innerHTML = response.links.map(link => `
                    <div class="search-result-item">
                        <a href="${link.url}" target="_blank" class="result-title">${escapeHtml(link.title)}</a>
                        <div class="result-url">${escapeHtml(new URL(link.url).hostname)}</div>
                    </div>
                `).join('');
                bodyEl.appendChild(linksContainer);
            }
        } else {
            bodyEl.innerHTML = `<div class="error-msg">${response?.error || 'No result found.'}</div>`;
            fallback.style.display = 'block';
            if (googleLink) googleLink.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    } catch (err) {
        console.error('Go Search Failed:', err);
        bodyEl.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
        fallback.style.display = 'block';
        if (googleLink) googleLink.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
}

// Global listener for Go Search trigger (from main process)
if (window.browser?.onGoSearchTrigger) {
    window.browser.onGoSearchTrigger((data) => {
        if (data && data.query) {
            activateGoSearch(data.query);
        }
    });
}


function typewriterEffect(element, text) {
    element.innerHTML = '';
    const words = text.split(' ');
    let currentText = '';

    element.style.opacity = '1';

    let i = 0;
    function typeNextWord() {
        if (i < words.length) {
            currentText += (i === 0 ? '' : ' ') + words[i];
            element.innerHTML = formatAIResponse(currentText);
            i++;
            // Rapid but rhythmic typing
            setTimeout(typeNextWord, 15 + Math.random() * 25);
        }
    }

    typeNextWord();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatAIResponse(text) {
    // Simple markdown formatter
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '<br><br>');
}

// ============================================
// TABS & FOLDERS LOGIC
// ============================================

let tabs = [];
let folders = [];
let activeTabId = null;

const tabsContainer = $('tabs-container');
const pinnedTabsList = $('pinned-tabs-list');

// Main Render Loop
function renderAll() {
    renderPinnedTabs();
    renderMainTabs();
}

function renderPinnedTabs() {
    if (!pinnedTabsList) return;
    pinnedTabsList.innerHTML = '';

    const pinnedTabs = tabs.filter(t => t.isPinned);

    // Placeholder if empty
    if (pinnedTabs.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pinned-placeholder';
        placeholder.textContent = 'Drop tabs here';
        pinnedTabsList.appendChild(placeholder);
    }

    pinnedTabs.forEach(tab => {
        const pinEl = document.createElement('div');
        pinEl.className = `pinned-tab ${tab.active ? 'active' : ''}`;
        pinEl.title = tab.title || 'Pinned Tab';

        // Favicon
        const img = document.createElement('img');
        let hostname = 'google.com';
        try { hostname = new URL(tab.url).hostname; } catch (e) { }
        img.src = tab.favicon || `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
        img.onerror = () => { img.src = 'https://www.google.com/s2/favicons?sz=32&domain=google.com'; };

        pinEl.appendChild(img);

        // Click to switch
        pinEl.onclick = () => {
            if (window.browser?.switchTab) {
                window.browser.switchTab(tab.id);
            }
        };

        // Right click to unpin
        pinEl.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm('Unpin this tab?')) {
                window.browser?.pinTab(tab.id, false);
            }
        };

        pinnedTabsList.appendChild(pinEl);
    });
}

function renderMainTabs() {
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    // Filter out pinned tabs from main list
    const mainListTabs = tabs.filter(t => !t.isPinned);

    // Group by folder
    const folderTabsMap = {};
    const independentTabs = [];

    mainListTabs.forEach(tab => {
        if (tab.folderId) {
            if (!folderTabsMap[tab.folderId]) folderTabsMap[tab.folderId] = [];
            folderTabsMap[tab.folderId].push(tab);
        } else {
            independentTabs.push(tab);
        }
    });

    // 1. Render Folders
    folders.forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = `folder-container ${folder.isMinimized ? 'minimized' : ''}`;
        folderEl.id = folder.id;

        const header = document.createElement('div');
        header.className = `folder-header folder-state-${folder.state}`;
        header.innerHTML = `
            <svg class="folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span class="folder-title">${folder.title}</span>
        `;

        header.title = `State: ${folder.state.toUpperCase()}`;
        header.onclick = (e) => {
            console.log('[Renderer] Header clicked for folder:', folder.id);
            if (window.browser?.minimizeFolder) {
                window.browser.minimizeFolder(folder.id, !folder.isMinimized);
            }
        };

        // Context menu for deletion
        header.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm(`Delete folder "${folder.title}"?`)) {
                window.browser?.deleteFolder(folder.id);
            }
        };

        // Folder Drag Logic
        header.ondragover = (e) => {
            e.preventDefault();
            header.classList.add('drag-over');
        };
        header.ondragleave = () => header.classList.remove('drag-over');
        header.ondrop = (e) => {
            e.preventDefault();
            header.classList.remove('drag-over');
            const rawData = e.dataTransfer.getData('tab-id');
            if (rawData) {
                window.browser?.moveToFolder(parseInt(rawData), folder.id);
            }
        };

        const content = document.createElement('div');
        content.className = 'folder-content';

        const folderTabs = folderTabsMap[folder.id] || [];
        folderTabs.forEach(tab => {
            content.appendChild(createTabElement(tab));
        });

        folderEl.appendChild(header);
        folderEl.appendChild(content);
        tabsContainer.appendChild(folderEl);
    });

    // 2. Render Independent Tabs
    independentTabs.forEach(tab => {
        tabsContainer.appendChild(createTabElement(tab));
    });
}

function createTabElement(tab) {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.active ? 'active' : ''} ${tab.isIncognito ? 'incognito' : ''} ${tab.isDead ? 'dead' : ''} ${tab.isSplit ? 'is-split' : ''}`;

    // Switch tab on click
    tabEl.onclick = (e) => {
        if (!e.target.closest('.tab-close')) {
            window.browser?.switchTab(tab.id);
        }
    };

    // Split Indicator / Favicon / Incognito Icon
    if (tab.isSplit) {
        const splitIcon = document.createElement('div');
        splitIcon.className = 'split-indicator';
        splitIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px; height:14px; opacity:0.8;">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
        `;
        tabEl.appendChild(splitIcon);
    } else if (tab.isIncognito) {
        const maskIcon = document.createElement('span');
        maskIcon.className = 'incognito-icon';
        maskIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M8 11h8"/><path d="M8 15h8"/></svg>`;
        tabEl.appendChild(maskIcon);
    } else {
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        let hostname = 'google.com';
        try { hostname = new URL(tab.url).hostname; } catch (e) { }
        favicon.src = tab.favicon || `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
        // Fallback
        favicon.onerror = () => { favicon.src = 'https://www.google.com/s2/favicons?sz=32&domain=google.com'; };
        tabEl.appendChild(favicon);
    }

    // Title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title || 'New Tab';
    tabEl.appendChild(titleSpan);

    // Close Button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        window.browser?.closeTab(tab.id);
    };
    tabEl.appendChild(closeBtn);

    // Draggable Logic
    tabEl.draggable = true;
    tabEl.ondragstart = (e) => {
        e.dataTransfer.setData('tab-id', tab.id);
        // Also allow dragging out as text/url
        e.dataTransfer.setData('text/plain', tab.url);
    };

    if (tab.active) {
        tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return tabEl;
}

// ============================================
// DRAG & DROP SYSTEM (Pinned & Folders)
// ============================================

// Pinned Tabs Drop Zone
if (pinnedTabsList) {
    pinnedTabsList.ondragover = (e) => {
        e.preventDefault();
        pinnedTabsList.classList.add('drag-over');
    };
    pinnedTabsList.ondragleave = () => pinnedTabsList.classList.remove('drag-over');
    pinnedTabsList.ondrop = (e) => {
        e.preventDefault();
        pinnedTabsList.classList.remove('drag-over');
        const tabId = parseInt(e.dataTransfer.getData('tab-id'));
        if (tabId) {
            window.browser?.pinTab(tabId, true);
        }
    };
}

// Main List Drop Zone (for unpinning / moving out of folders)
if (tabsContainer) {
    tabsContainer.ondragover = (e) => e.preventDefault();
    tabsContainer.ondrop = (e) => {
        const tabId = parseInt(e.dataTransfer.getData('tab-id'));
        // If dropped on empty space (not a folder header), unpin or move out of folder
        if (tabId && !e.target.closest('.folder-header')) {
            // Check if it was pinned
            const tab = tabs.find(t => t.id === tabId);
            if (tab && tab.isPinned) {
                window.browser?.pinTab(tabId, false);
            }
            // Move out of folder
            window.browser?.moveToFolder(tabId, null);
        }
    };
}

// ============================================
// IPC LISTENERS
// ============================================

if (window.browser?.onTabsUpdate) {
    window.browser.onTabsUpdate((data) => {
        try {
            // Updated main.js sends { tabs: [], folders: [] }
            const updatedTabs = data.tabs || data; // fallback
            const updatedFolders = data.folders || [];

            console.log('[Renderer] Update:', updatedTabs.length, 'tabs', updatedFolders.length, 'folders');

            tabs = updatedTabs;
            folders = updatedFolders;

            renderAll();

        } catch (err) {
            console.error('[Renderer] Error in tabs update:', err);
        }
    });
}

// ============================================
// AUTO HIDE LOGIC (Restored)
// ============================================

let autohideEnabled = false;
const btnAutohide = $('btn-autohide');
const sidebar = $('sidebar');
const sidebarTrigger = $('sidebar-trigger');

function initAutohide() {
    if (window.browser?.storageGet) {
        window.browser.storageGet(['sidebarAutohide']).then(settings => {
            updateAutohideState(settings.sidebarAutohide || false);
        });
    }

    if (window.browser?.onSidebarVisibility) {
        window.browser.onSidebarVisibility((data) => {
            // data = { autohide: bool, visible: bool }
            updateAutohideState(data.autohide);

            if (data.visible) {
                sidebar?.classList.add('visible');
            } else {
                sidebar?.classList.remove('visible');
            }
        });
    }
}

function updateAutohideState(enabled) {
    autohideEnabled = enabled;
    if (enabled) {
        btnAutohide?.classList.add('active');
        sidebar?.classList.add('autohide');
        sidebar?.classList.remove('persistent');
    } else {
        btnAutohide?.classList.remove('active');
        sidebar?.classList.remove('autohide');
        sidebar?.classList.add('persistent');
    }
}

if (btnAutohide) {
    btnAutohide.addEventListener('click', () => {
        const newState = !autohideEnabled;
        updateAutohideState(newState);
        if (window.browser?.setAutoHide) {
            window.browser.setAutoHide(newState);
        }
    });
}

if (sidebarTrigger) {
    sidebarTrigger.addEventListener('mouseenter', () => {
        if (autohideEnabled && window.browser?.setSidebarHover) {
            window.browser.setSidebarHover(true);
        }
    });
}

if (sidebar) {
    sidebar.addEventListener('mouseleave', () => {
        if (autohideEnabled && window.browser?.setSidebarHover) {
            window.browser.setSidebarHover(false);
        }
    });
}

// ============================================
// AUTOHIDE SIDEBAR LOGIC
// ============================================

function initAutohide() {
    const trigger = $('sidebar-trigger');    // The thin left strip
    const sidebar = $('sidebar');            // The actual sidebar div

    if (trigger && sidebar) {
        // Show when hovering the trigger zone
        trigger.addEventListener('mouseenter', () => {
            // Only trigger if autohide is enabled
            if (sidebar.classList.contains('autohide')) {
                sidebar.classList.add('visible');
                document.body.classList.add('sidebar-open'); // Disable trigger
            }
        });

        // Keep showing when inside the sidebar
        sidebar.addEventListener('mouseenter', () => {
            if (sidebar.classList.contains('autohide')) {
                sidebar.classList.add('visible');
                document.body.classList.add('sidebar-open');
            }
        });

        // Hide when leaving the sidebar
        sidebar.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('autohide')) {
                sidebar.classList.remove('visible');
                document.body.classList.remove('sidebar-open'); // Re-enable trigger
            }
        });

        // Ensure trigger doesn't block clicks when not needed
    }
}

document.addEventListener('DOMContentLoaded', initAutohide);

// ============================================
// FOLDER CREATION BUTTON
// ============================================

const btnAddFolder = $('btn-add-folder');
if (btnAddFolder) {
    btnAddFolder.addEventListener('click', () => {
        const title = prompt('Folder Name:', 'New Folder');
        if (title && window.browser?.createFolder) {
            window.browser.createFolder(title);
        }
    });
}

// ============================================
// SETTINGS OVERLAY LOGIC (Restored)
// ============================================

const settingsOverlay = $('settings-overlay');
const settingsClose = $('settings-close');

if (settingsClose && settingsOverlay) {
    settingsClose.onclick = () => {
        settingsOverlay.classList.remove('active');
        window.browser?.setSettingsVisibility(false);
    };
}
if (window.browser?.onSplitViewChanged) {
    window.browser.onSplitViewChanged((isSplit) => {
        const btn = $('btn-split-top');
        if (btn) btn.classList.toggle('active', isSplit);
    });
}

// ============================================
// SPLIT PICKER LOGIC
// ============================================

const splitPickerOverlay = $('split-picker-overlay');
const splitPickerSearch = $('split-picker-search');
const splitPickerList = $('split-picker-list');
const splitPickerClose = $('split-picker-close');
const splitPickerNewTab = $('split-picker-new-tab');

if (window.browser?.onOpenSplitPicker) {
    window.browser.onOpenSplitPicker(() => {
        splitPickerOverlay?.classList.add('active');
        renderSplitPicker();
        splitPickerSearch?.focus();
    });
}

function renderSplitPicker(filter = '') {
    if (!splitPickerList) return;
    splitPickerList.innerHTML = '';

    // "tabs" here is the global array updated by onTabsUpdate
    // We want to show individual tabs, even if they are already split
    // Actually, the tabs array from main is what we need. 
    // Wait, onTabsUpdate receives the MERGED list. 
    // Let's ask main for the raw tabs or use a different channel.
    // For now, let's use the merged list but filter out the currently active one.

    const otherTabs = (window.__rawTabs || []).filter(t => t.id !== activeTabId);
    const searchFiltered = otherTabs.filter(t =>
        (t.title || '').toLowerCase().includes(filter.toLowerCase()) ||
        (t.url || '').toLowerCase().includes(filter.toLowerCase())
    );

    searchFiltered.forEach(tab => {
        const item = document.createElement('div');
        item.className = 'split-picker-item';

        let hostname = 'google.com';
        try { hostname = new URL(tab.url).hostname; } catch (e) { }
        const iconSrc = tab.favicon || `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;

        item.innerHTML = `
            <img src="${iconSrc}" class="item-favicon" onerror="this.src='https://www.google.com/s2/favicons?sz=32&domain=google.com'">
            <span class="item-title">${escapeHtml(tab.title || 'New Tab')}</span>
        `;

        item.onclick = () => {
            window.browser?.splitWithTab(tab.id);
            splitPickerOverlay?.classList.remove('active');
        };

        splitPickerList.appendChild(item);
    });

    if (searchFiltered.length === 0 && filter) {
        splitPickerList.innerHTML = '<div style="padding: 20px; opacity: 0.5; text-align: center;">No matching tabs found</div>';
    }
}

splitPickerSearch?.addEventListener('input', (e) => {
    renderSplitPicker(e.target.value);
});

splitPickerClose?.addEventListener('click', () => {
    splitPickerOverlay?.classList.remove('active');
});

splitPickerNewTab?.addEventListener('click', () => {
    window.browser?.splitWithTab('new');
    splitPickerOverlay?.classList.remove('active');
});

// Update the global tabs update listener to store raw tabs for picker
if (window.browser?.onTabsUpdate) {
    window.browser.onTabsUpdate((data) => {
        console.log('[Renderer] Received tabs update:', data.tabs.length);
        // data.tabs is the merged/processed list for display
        // We might need raw tabs for the picker
        // For now, let's assume we need to handle the new format
        tabs = data.tabs;
        window.__rawTabs = data.allTabs || [];
        folders = data.folders || [];

        // Find active tab ID
        const active = data.tabs.find(t => t.active);
        if (active) {
            activeTabId = active.id;
            // Update split button state
            const btn = $('btn-split-top');
            if (btn) btn.classList.toggle('active', !!active.isSplit);
        }

        // Update Panic Button visibility
        const hasIncognito = tabs.some(t => t.isIncognito);
        const panicBtn = $('btn-panic');
        if (panicBtn) {
            panicBtn.style.display = hasIncognito ? 'flex' : 'none';
        }

        renderAll();
    });
}

// ============================================
// THEME & ACCENT LOGIC
// ============================================

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => {
        const theme = btn.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (window.browser?.storageSet) {
            window.browser.storageSet({ theme: theme });
        }
    };
});

document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.onclick = () => {
        const accent = btn.dataset.accent;
        const color = btn.style.getPropertyValue('--accent-color') || ACCENTS[accent];
        document.documentElement.style.setProperty('--accent-primary', color);
        document.body.style.setProperty('--accent-primary', color);

        // Handle RGB for transparency
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        document.documentElement.style.setProperty('--accent-primary-rgb', `${r}, ${g}, ${b}`);

        document.querySelectorAll('.accent-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (window.browser?.storageSet) {
            window.browser.storageSet({ themeAccent: accent });
        }
    };
});

// ============================================
// SETTINGS PERSISTENCE LISTENERS
// ============================================

['showQuickLinks', 'showTimeWatermark', 'newTabResults'].forEach(id => {
    const el = $(id);
    if (el) {
        el.onchange = () => {
            window.browser?.storageSet({ [id]: el.checked });
        };
    }
});

const aiProviderSelect = $('aiProviderSelect');
if (aiProviderSelect) {
    aiProviderSelect.onchange = () => {
        const provider = aiProviderSelect.value;
        document.querySelectorAll('.ai-key-group').forEach(group => {
            group.classList.toggle('hidden', group.id !== `keyGroup_${provider}`);
        });
        window.browser?.storageSet({ aiProvider: provider });
    };
}

document.querySelectorAll('.save-key-btn').forEach(btn => {
    btn.onclick = () => {
        const provider = btn.dataset.provider;
        const input = $(`${provider}KeyInput`);
        if (input && window.browser?.storageSet) {
            const keyName = provider === 'openai' ? 'openaiKey' : `${provider}Key`;
            window.browser.storageSet({ [keyName]: input.value });
            btn.textContent = 'Saved!';
            setTimeout(() => btn.textContent = 'Save', 2000);
        }
    };
});
