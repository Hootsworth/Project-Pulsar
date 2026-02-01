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
                'openaiKey', 'geminiKey', 'grokKey', 'llamaKey',
                'wallpaper', 'forceDarkMode', 'privacyDisclosureEnabled',
                'incognitoSearchEngine'
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
            ['showQuickLinks', 'showTimeWatermark', 'newTabResults', 'forceDarkMode', 'privacyDisclosureEnabled'].forEach(id => {
                const el = $(id);
                if (el && settings[id] !== undefined) el.checked = settings[id];
            });

            // Restore Wallpaper
            if (settings.wallpaper) {
                applyWallpaper(settings.wallpaper, false);
            }

            // Restore AI Provider
            const aiProviderSelect = $('aiProviderSelect');
            if (settings.aiProvider && aiProviderSelect) {
                aiProviderSelect.value = settings.aiProvider;
                document.querySelectorAll('.ai-key-group').forEach(group => {
                    group.classList.toggle('hidden', group.id !== `keyGroup_${settings.aiProvider}`);
                });
            }

            // Restore Selects
            ['aiProviderSelect', 'incognitoSearchSelect'].forEach(id => {
                const el = $(id);
                const settingsKey = id === 'aiProviderSelect' ? 'aiProvider' : 'incognitoSearchEngine';
                if (el && settings[settingsKey]) el.value = settings[settingsKey];
            });

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

safeAddListener('btn-action-bar-top', 'click', () => {
    console.log('[Renderer] Navbar button clicked');
    const overlay = $('action-bar-overlay');
    const isActive = overlay ? overlay.classList.contains('active') : false;
    toggleActionBar(!isActive);
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

safeAddListener('incognitoSearchSelect', 'change', (e) => {
    window.browser?.storageSet({ incognitoSearchEngine: e.target.value });
});

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
const topUrlInput = $('url-bar-top');
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
                // Keep input empty after navigation (per user request)
                // addressInput.value = ''; 
                addressInput.blur();
            }
        }
    });

    // Add logic for Top URL Bar & Autocomplete
    if (topUrlInput) {
        const urlDropdown = $('url-dropdown');
        let selectedSuggestionIndex = -1;
        let suggestionItems = [];

        async function updateSuggestions(query) {
            if (!query) {
                window.browser.updateSuggestionsData({ matches: [] });
                return;
            }

            try {
                const result = await window.browser.storageGet(['footsteps']);
                const history = result.footsteps || [];
                const q = query.toLowerCase();
                const matches = history.filter(item => {
                    return (item.title && item.title.toLowerCase().includes(q)) ||
                        (item.domain && item.domain.toLowerCase().includes(q)) ||
                        (item.url && item.url.toLowerCase().includes(q));
                }).slice(0, 5);

                suggestionItems = matches;
                window.browser.updateSuggestionsData({ matches, query, selectedIndex: selectedSuggestionIndex });

            } catch (e) {
                console.error('Autocomplete error:', e);
            }
        }

        topUrlInput.addEventListener('input', (e) => {
            updateSuggestions(e.target.value.trim());
        });

        topUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (suggestionItems.length > 0) {
                    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestionItems.length;
                    window.browser.updateSuggestionsData({ selectedIndex: selectedSuggestionIndex });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (suggestionItems.length > 0) {
                    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
                    window.browser.updateSuggestionsData({ selectedIndex: selectedSuggestionIndex });
                }
            } else if (e.key === 'Enter') {
                if (selectedSuggestionIndex >= 0 && suggestionItems[selectedSuggestionIndex]) {
                    e.preventDefault();
                    window.browser?.navigate(suggestionItems[selectedSuggestionIndex].url);
                    topUrlInput.blur();
                } else {
                    const query = topUrlInput.value.trim();
                    if (query) {
                        window.browser?.navigate(query);
                        topUrlInput.blur();
                    }
                }
            } else if (e.key === 'Escape') {
                topUrlInput.blur();
            }
        });

        // Auto-select text on focus
        topUrlInput.addEventListener('focus', () => {
            topUrlInput.select();
            selectedSuggestionIndex = -1;
            window.browser?.setUrlFocus(true);
        });

        // Hide on blur
        topUrlInput.addEventListener('blur', () => {
            window.browser?.setUrlFocus(false);
        });

        if (window.browser?.onBlurTopBar) {
            window.browser.onBlurTopBar(() => {
                topUrlInput.blur();
            });
        }
    }

    if (window.browser?.onUpdateUrl) {
        window.browser.onUpdateUrl((url) => {
            if (url && !url.startsWith('file://')) {
                // Update Top URL Bar always
                if (topUrlInput && document.activeElement !== topUrlInput) {
                    // Try to format it nicely? For now just raw URL
                    // Maybe handle chrome/file protocol hiding
                    if (url.startsWith('pulsar://') || url.includes('extension/index.html')) {
                        topUrlInput.value = '';
                        topUrlInput.placeholder = 'Search or type URL';
                    } else {
                        topUrlInput.value = url;
                    }
                }

                // Sidebar Logic: KEEP EMPTY unless focused?
                // Actually the user wants it to be empty "in specific websites" so you can search.
                // Interpreting as "Don't auto-fill sidebar input with current URL".
                if (document.activeElement !== addressInput) {
                    addressInput.value = '';
                    addressInput.placeholder = 'Search with AI...';
                }
            } else {
                if (addressInput) addressInput.value = '';
                if (topUrlInput) topUrlInput.value = '';
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

    const displayQuery = query.includes('User Question:') ?
        query.split('User Question:').pop().trim() : query;

    // Reset UI
    overlay.classList.add('active');
    window.browser?.setAIOverlayVisible(true);
    bodyEl.innerHTML = '<div class="intents-ai-summary"><span class="intents-ai-label">INTENTS AI</span><div class="go-search-status"><span class="loading-spinner"></span> Synthesizing knowledge for: <strong>' + escapeHtml(displayQuery) + '</strong>...</div></div>';
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
                    <div id="ai-synthesis-content" class="ai-synthesis-content"></div>
                </div>
            `;
            const target = $('ai-synthesis-content');

            // Check for GOTO direct navigation
            if (response.summary.trim().startsWith('GOTO:')) {
                const url = response.summary.replace('GOTO:', '').trim();
                target.innerHTML = `<div class="ai-direct-nav">Navigating to matched history: <strong>${url}</strong>...</div>`;
                setTimeout(() => {
                    window.browser?.navigate(url);
                    overlay.classList.remove('active');
                    window.browser?.setAIOverlayVisible(false);
                }, 1200);
                return;
            }

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

function formatAIResponse(text) {
    if (!text) return '';
    // Bold, lists, code blocks
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
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
        folderEl.className = `folder-container ${folder.isMinimized ? 'minimized' : ''} folder-state-${folder.state}`;
        folderEl.id = folder.id;

        // Dynamic coloring on container for inheritance
        const baseColor = folder.color || '#5f27cd';
        folderEl.style.setProperty('--group-color', baseColor);

        const header = document.createElement('div');
        header.className = `folder-header`;
        // Styling matches container color
        header.style.borderColor = baseColor;
        header.style.background = `${baseColor}15`;

        header.innerHTML = `
            <div class="folder-color-pill" style="background-color: ${baseColor}"></div>
            <span class="folder-title" style="color: ${baseColor}">${folder.title}</span>
            <div class="folder-actions">
                <div class="folder-chevron" style="color: ${baseColor}">
                     <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
        `;

        header.title = `Group: ${folder.title}`;
        header.onclick = (e) => {
            // Toggle minimize
            if (window.browser?.minimizeFolder) {
                window.browser.minimizeFolder(folder.id, !folder.isMinimized);
            }
        };

        // Rename on double click
        header.ondblclick = (e) => {
            e.stopPropagation();
            const newTitle = prompt('Rename Group:', folder.title);
            if (newTitle) {
                window.browser?.updateFolder(folder.id, { title: newTitle });
            }
        };

        // Context menu for color / delete
        header.oncontextmenu = (e) => {
            e.preventDefault();
            // Simple approach: Delete or specific color change?
            // Let's offer a "Change Color" prompt or cycle? 
            // For a premium feel, let's just use confirm for delete for now, 
            // maybe add a small custom menu later if requested.
            // Right now user asked "give names" (done via dblclick or prompt) and "separated by colours".

            // Hacky context menu replacement:
            const action = confirm(`Manage Group "${folder.title}"?\n\nOK to Delete.\nCancel to Change Color.`);
            if (action) {
                if (confirm(`Are you sure you want to Ungroup tabs and delete "${folder.title}"?`)) {
                    window.browser?.deleteFolder(folder.id);
                }
            } else {
                // Change Color
                const newColor = prompt('Enter new color (Hex or Name):', folder.color);
                if (newColor) {
                    window.browser?.updateFolder(folder.id, { color: newColor });
                }
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
const btnAutohide = $('btn-autohide-top');
const sidebar = $('sidebar');
const sidebarTrigger = $('sidebar-trigger');

// Autohide logic and state management handled in initAutohide() below

// ============================================
// AUTOHIDE SIDEBAR LOGIC
// ============================================

function updateAutohideState(enabled) {
    autohideEnabled = enabled;
    if (enabled) {
        btnAutohide?.classList.add('active');
        sidebar?.classList.add('autohide');
        sidebar?.classList.remove('persistent');
        document.body.classList.add('sidebar-autohide');
    } else {
        btnAutohide?.classList.remove('active');
        sidebar?.classList.remove('autohide');
        sidebar?.classList.add('persistent');
        document.body.classList.remove('sidebar-autohide');
    }

    // CRITICAL: Re-sync split resizer position when mode changes
    updateSplitResizer();
}

function initAutohide() {
    // 1. Initial State from Storage
    if (window.browser?.storageGet) {
        window.browser.storageGet(['sidebarAutohide']).then(settings => {
            updateAutohideState(settings.sidebarAutohide || false);
        });
    }

    // 2. State Sync from Main Process
    if (window.browser?.onSidebarVisibility) {
        window.browser.onSidebarVisibility((data) => {
            updateAutohideState(data.autohide);
            if (data.visible) {
                sidebar?.classList.add('visible');
            } else {
                sidebar?.classList.remove('visible');
            }
        });
    }

    // 3. Hover Trigger logic
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

        // Ensure sidebar stays visible while mouse is over it
        sidebar.addEventListener('mouseenter', () => {
            if (autohideEnabled && window.browser?.setSidebarHover) {
                window.browser.setSidebarHover(true);
            }
        });
    }

    // 4. Toggle Button
    if (btnAutohide) {
        btnAutohide.addEventListener('click', () => {
            const newState = !autohideEnabled;
            updateAutohideState(newState);
            if (window.browser?.setAutoHide) {
                window.browser.setAutoHide(newState);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initAutohide);

// ============================================
// FOLDER CREATION BUTTON
// ============================================

const btnAddFolder = $('btn-add-folder');
if (btnAddFolder) {
    btnAddFolder.addEventListener('click', () => {
        const title = prompt('Group Name:', 'New Group');
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
let currentSplitRatio = 0.5;

function updateSplitResizer() {
    const resizer = $('split-resizer');
    if (!resizer || resizer.classList.contains('hidden')) return;

    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 240;
    const isAutoHide = document.body.classList.contains('sidebar-autohide');
    const xOffset = isAutoHide ? 0 : sidebarWidth;

    // In autohide mode, the sidebar overlays the content, so the content area still starts at 0.
    const availableWidth = window.innerWidth - xOffset;

    const GAP_WIDTH = 4;
    const totalContentArea = availableWidth - GAP_WIDTH;
    const leftWidth = Math.floor(totalContentArea * currentSplitRatio);

    resizer.style.left = `${(xOffset + leftWidth)}px`;
    resizer.style.width = `4px`; // Match exactly the gap
    resizer.style.padding = `0 4px`; // Add invisible hit area padding
    resizer.style.marginLeft = `-4px`; // Center the hit area on the gap
}

if (window.browser?.onSplitViewChanged) {
    window.browser.onSplitViewChanged((isSplit) => {
        const btn = $('btn-split-top');
        if (btn) btn.classList.toggle('active', isSplit);

        const resizer = $('split-resizer');
        if (resizer) {
            if (isSplit) {
                resizer.classList.remove('hidden');
                updateSplitResizer();
            } else {
                resizer.classList.add('hidden');
            }
        }
    });
}

if (window.browser?.onSplitRatioUpdate) {
    window.browser.onSplitRatioUpdate((ratio) => {
        console.log('[Renderer] Split ratio sync:', ratio);
        currentSplitRatio = ratio;
        updateSplitResizer();
    });
}

// Keep resizer in sync with window resizing
window.addEventListener('resize', updateSplitResizer);

// ============================================
// SPLIT RESIZER DRAG LOGIC
// ============================================

const splitResizer = $('split-resizer');
let isDraggingSplit = false;

if (splitResizer) {
    splitResizer.addEventListener('mousedown', (e) => {
        isDraggingSplit = true;
        splitResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        // Add an overlay to prevent webview from eating events
        const overlay = document.createElement('div');
        overlay.id = 'drag-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9998';
        overlay.style.background = 'transparent';
        document.body.appendChild(overlay);
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingSplit) return;

        const sidebar = document.querySelector('.sidebar');
        const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 240;
        const isAutoHide = document.body.classList.contains('sidebar-autohide');
        const xOffset = isAutoHide ? 0 : sidebarWidth;
        const availableWidth = window.innerWidth - xOffset;

        const GAP_WIDTH = 4;
        const totalContentArea = availableWidth - GAP_WIDTH;

        let relativeX = e.clientX - xOffset;
        let ratio = relativeX / totalContentArea;

        // Constrain ratio
        ratio = Math.max(0.1, Math.min(0.9, ratio));
        currentSplitRatio = ratio;

        // Update resizer position
        updateSplitResizer();

        // Throttle IPC
        window.browser?.setSplitRatio(ratio);
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingSplit) {
            isDraggingSplit = false;
            splitResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.getElementById('drag-overlay')?.remove();
        }
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

// Listener for external storage changes (Theme/Accent Sync)
if (window.browser?.onStorageChanged) {
    window.browser.onStorageChanged((changes) => {
        if (changes.theme || changes.themeAccent) {
            console.log('[Renderer] Theme/Accent changed externally, updating UI...');
            loadSettings();
        }
    });
}

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

// ============================================
// CONTEXTUAL ACTION BAR LOGIC
// ============================================

let selectedActionIndex = -1;

function getActionBarElements() {
    return {
        overlay: $('action-bar-overlay'),
        input: $('action-bar-input'),
        ghost: $('action-bar-ghost'),
        results: $('action-bar-results'),
        status: $('action-bar-status'),
        mentions: $('action-bar-mentions'),
        aiResult: $('action-bar-ai-result')
    };
}

function toggleActionBar(show, mode = 'ai') {
    const { overlay, input } = getActionBarElements();

    if (!overlay) return;

    if (show) {
        overlay.classList.add('active');
        if (mode === 'palette') {
            overlay.classList.add('palette-mode');
        } else {
            overlay.classList.remove('palette-mode');
        }

        window.browser?.setActionBarVisibility(true);
        input?.focus();
        if (input) {
            input.value = '';
            input.placeholder = mode === 'palette' ? 'Type a command...' : 'Search or ask AI';
            input.style.color = '';
            input.style.caretColor = '';
            input.readOnly = false;
        }

        const { status, aiResult, results } = getActionBarElements();
        if (status) status.classList.add('hidden');
        if (aiResult) {
            aiResult.classList.add('hidden');
            aiResult.innerHTML = '';
        }
        const bar = $('action-bar-main');
        if (bar) bar.classList.remove('expanded');

        updateActionBarResults('', mode);
    } else {
        overlay.classList.remove('active');
        overlay.classList.remove('palette-mode');
        window.browser?.setActionBarVisibility(false);
    }
}

const COMMANDS = [
    { title: 'New Tab', desc: 'Open a fresh page', icon: 'plus', shortcut: 'Ctrl+T', action: () => window.browser?.createTab() },
    { title: 'Split Screen', desc: 'Divide view with another tab', icon: 'split', shortcut: 'Ctrl+S', action: () => window.browser?.toggleSplitView() },
    { title: 'New Incognito Tab', desc: 'Browse privately', icon: 'shield', action: () => window.browser?.createIncognitoTab() },
    { title: 'Settings', desc: 'Pulsar preferences', icon: 'settings', shortcut: 'Alt+,', action: () => toggleModal('settings-overlay', true) },
    { title: 'Clear History', desc: 'Wipe your local trail', icon: 'trash', action: () => { if (confirm('Clear history?')) window.browser?.storageSet({ footsteps: [] }); } },
    { title: 'Check for Updates', desc: 'See if Pulsar is ready', icon: 'download', action: () => { toggleModal('settings-overlay', true); initSettingsTabs('updates'); } }
];

const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
};

let selectedMentionIndex = -1;
let openTabsForMentions = [];

function renderMarkdown(text) {
    if (!text) return '';

    // Escape HTML to prevent XSS
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Tables (Simple markdown table support)
    html = html.replace(/\|(.+)\|/g, (match, content) => {
        const cells = content.split('|').map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr class="ai-table-row">${cells}</tr>`;
    });
    html = html.replace(/(<tr class="ai-table-row">.+<\/tr>)+/g, match => `<table class="ai-comparison-table">${match}</table>`);

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h5 class="ai-h">${1}</h5>');
    html = html.replace(/^## (.*$)/gim, '<h4 class="ai-h">${1}</h4>');
    html = html.replace(/^# (.*$)/gim, '<h3 class="ai-h">${1}</h3>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');

    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)+/gim, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n/gim, '<br>');

    return html;
}

async function renderMentions(filter = '') {
    const { mentions } = getActionBarElements();
    if (!mentions) return;

    try {
        if (!openTabsForMentions.length || filter === '') {
            if (window.browser?.getOpenTabs) {
                openTabsForMentions = await window.browser.getOpenTabs();
            } else {
                openTabsForMentions = await window.browser?.invoke('get-open-tabs') || [];
            }
        }
    } catch (e) {
        console.error('Failed to get tabs for mentions:', e);
        openTabsForMentions = [];
    }

    const filtered = openTabsForMentions.filter(t =>
        t.title.toLowerCase().includes(filter.toLowerCase()) ||
        t.url.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        mentions.classList.add('hidden');
        return;
    }

    // Clamp selection
    if (selectedMentionIndex >= filtered.length) selectedMentionIndex = 0;

    mentions.innerHTML = filtered.map((tab, i) => `
        <div class="mention-item ${i === selectedMentionIndex ? 'active' : ''}" data-id="${tab.id}">
            <img src="${tab.favicon || 'icons/globe.svg'}" class="mention-favicon" onerror="this.src='icons/globe.svg'">
            <div class="mention-info">
                <div class="mention-title">${tab.title}</div>
                <div class="mention-url">${tab.url}</div>
            </div>
        </div>
    `).join('');

    mentions.classList.remove('hidden');
}

async function updateActionBarResults(query, mode = 'ai') {
    const { results, ghost, status, aiResult, overlay } = getActionBarElements();
    if (!results) return;

    const isPalette = overlay?.classList.contains('palette-mode');

    // Show thinking if searching in AI mode
    if (query.length > 0 && !isPalette) {
        if (status) {
            status.textContent = 'Thinking...';
            status.classList.remove('hidden');
        }
        if (ghost) ghost.classList.add('hidden');
    } else {
        if (status && !overlay?.classList.contains('ai-loading')) {
            status.classList.add('hidden');
        }
        if (ghost) ghost.classList.toggle('hidden', !!query);
    }

    if (aiResult) aiResult.classList.add('hidden');

    // Ensure results are strictly display: none unless in palette-mode or expanded
    if (isPalette) {
        results.style.display = 'block';
    } else {
        results.style.display = 'none';
    }

    const q = query.toLowerCase().trim();

    let history = [];
    try {
        const stats = await window.browser?.storageGet(['footsteps']);
        history = stats.footsteps || [];
    } catch (e) { }

    let sections = [];

    if (!q) {
        // Default View: Commands + Recent Tabs
        sections.push({ label: 'Quick Actions', items: COMMANDS.slice(0, 4) });
        if (history.length > 0) {
            sections.push({
                label: 'Recently Visited',
                items: history.slice(0, 8).map(h => ({
                    title: h.title || 'Untitled Page',
                    desc: h.url,
                    icon: 'history',
                    action: () => window.browser?.navigate(h.url)
                }))
            });
        }
        // FIXED: Clear ghost text when empty to avoid double placeholder with input's own placeholder
        if (ghost) ghost.textContent = '';
    } else {
        // Filtered View
        const filteredCommands = COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
        if (filteredCommands.length > 0) {
            sections.push({ label: 'Commands', items: filteredCommands });
        }

        const filteredHistory = history.filter(h =>
            (h.title && h.title.toLowerCase().includes(q)) ||
            (h.url && h.url.toLowerCase().includes(q))
        );
        if (filteredHistory.length > 0) {
            sections.push({
                label: 'History Matches',
                items: filteredHistory.slice(0, 10).map(h => ({
                    title: h.title || 'Untitled Page',
                    desc: h.url,
                    icon: 'globe',
                    action: () => window.browser?.navigate(h.url)
                }))
            });
        }

        // AI Option
        sections.push({
            label: 'Intelligence',
            items: [{
                title: `Ask Pulsar: "${query}"`,
                desc: 'Use recent context to solve your query',
                icon: 'ai',
                action: async () => {
                    const { status, aiResult, results, input } = getActionBarElements();
                    const userQuery = query; // Keep the original query for display

                    if (status) {
                        status.textContent = 'Asking AI...';
                        status.classList.remove('hidden');
                    }
                    if (results) results.classList.add('hidden');

                    try {
                        // Get settings for AI provider
                        const settings = await window.browser?.storageGet(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey', 'intentsSearchKey']);

                        // Get recent context
                        let history = [];
                        try {
                            const stats = await window.browser?.storageGet(['footsteps']);
                            history = stats.footsteps || [];
                        } catch (e) { }

                        const lastTabs = history.slice(0, 15).map(t => `${t.title} (${t.url})`).join('\n');
                        const contextPrompt = `You are the Pulsar Browser Assistant. Use the following browsing history as context to answer.
Context (Last 15 visited pages):
${lastTabs}

If the user is asking specifically about a page in their history (e.g. "what was the last wikipedia page?"), find it and if clear, respond ONLY with: GOTO: [URL].
Otherwise, answer concisely.

User Question: ${userQuery}`;

                        // Call AI Search
                        const response = await window.browser?.aiSearch(contextPrompt, settings);

                        if (status) status.classList.add('hidden');

                        if (response.error) {
                            alert('AI Error: ' + response.error);
                            toggleActionBar(false);
                            return;
                        }

                        // Check for GOTO
                        if (response.summary && response.summary.startsWith('GOTO:')) {
                            const url = response.summary.replace('GOTO:', '').trim();
                            window.browser?.navigate(url);
                            toggleActionBar(false);
                            return;
                        }

                        // Expand bar and show result
                        if (aiResult) {
                            const bar = $('action-bar-main');
                            if (bar) bar.classList.add('expanded');
                            aiResult.innerHTML = `<div class="ai-answer-content">${response.summary}</div>`;
                            aiResult.classList.remove('hidden');
                        }
                    } catch (err) {
                        console.error('[Renderer] Action Bar AI Error:', err);
                        if (status) status.classList.add('hidden');
                        toggleActionBar(false);
                    }
                }
            }]
        });

        if (ghost) {
            const firstItem = sections[0]?.items[0];
            ghost.textContent = (firstItem && firstItem.title.toLowerCase().startsWith(q)) ? firstItem.title : '';
        }
    }

    // Flatten for indexing
    const allItems = sections.flatMap(s => s.items);
    if (selectedActionIndex >= allItems.length) selectedActionIndex = 0;
    if (selectedActionIndex < 0 && allItems.length > 0) selectedActionIndex = 0;

    results.innerHTML = sections.map(section => `
        <div class="section-label">${section.label}</div>
        ${section.items.map(item => {
        const itemIndex = allItems.indexOf(item);
        return `
                <div class="action-bar-item ${itemIndex === selectedActionIndex ? 'selected' : ''}" data-index="${itemIndex}">
                    <div class="action-icon-box">${ICONS[item.icon] || ICONS.history}</div>
                    <div class="action-content">
                        <div class="action-title">${item.title}</div>
                        <div class="action-desc">${item.desc}</div>
                    </div>
                    ${item.shortcut ? `<div class="action-shortcut">${item.shortcut}</div>` : ''}
                </div>
            `;
    }).join('')}
    `).join('');

    const items = results.querySelectorAll('.action-bar-item');
    items.forEach((item, i) => {
        item.onclick = (e) => {
            e.stopPropagation();
            allItems[i].action();
            toggleActionBar(false);
        };
        // Auto scroll selected into view
        if (i === selectedActionIndex) {
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    });

    results.allItems = allItems;
}

const { input: paletteInput, overlay: paletteOverlay, ghost: paletteGhost } = getActionBarElements();

paletteInput?.addEventListener('input', async (e) => {
    selectedActionIndex = 0;
    const value = e.target.value;

    // Detect @ for mentions
    // Check if the character before the cursor is @ or if we are typing a mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const isAtActive = lastAt !== -1 && (lastAt === 0 || textBeforeCursor[lastAt - 1] === ' ');

    if (isAtActive) {
        const query = textBeforeCursor.substring(lastAt + 1);
        if (selectedMentionIndex === -1) selectedMentionIndex = 0;
        await renderMentions(query);
    } else {
        const { mentions } = getActionBarElements();
        if (mentions) mentions.classList.add('hidden');
        selectedMentionIndex = -1;
    }

    updateActionBarResults(value);
});

paletteInput?.addEventListener('keydown', async (e) => {
    const { results, overlay, status, aiResult, mentions } = getActionBarElements();
    const isPalette = overlay?.classList.contains('palette-mode');
    const allItems = results?.allItems || [];
    const isMentionsVisible = !mentions?.classList.contains('hidden');

    if (e.key === 'Escape') {
        toggleActionBar(false);
    } else if (e.key === 'ArrowDown') {
        if (isMentionsVisible) {
            e.preventDefault();
            const filtered = mentions.querySelectorAll('.mention-item');
            selectedMentionIndex = (selectedMentionIndex + 1) % filtered.length;
            const value = paletteInput.value;
            const lastAt = value.lastIndexOf('@');
            renderMentions(value.substring(lastAt + 1));
        } else if (isPalette && allItems.length > 0) {
            e.preventDefault();
            selectedActionIndex = (selectedActionIndex + 1) % allItems.length;
            updateActionBarResults(paletteInput.value, 'palette');
        }
    } else if (e.key === 'ArrowUp') {
        if (isMentionsVisible) {
            e.preventDefault();
            const filtered = mentions.querySelectorAll('.mention-item');
            selectedMentionIndex = (selectedMentionIndex - 1 + filtered.length) % filtered.length;
            const value = paletteInput.value;
            const lastAt = value.lastIndexOf('@');
            renderMentions(value.substring(lastAt + 1));
        } else if (isPalette && allItems.length > 0) {
            e.preventDefault();
            selectedActionIndex = (selectedActionIndex - 1 + allItems.length) % allItems.length;
            updateActionBarResults(paletteInput.value, 'palette');
        }
    } else if ((e.key === 'Tab' || e.key === 'Enter') && isMentionsVisible) {
        e.preventDefault();
        const active = mentions.querySelector('.mention-item.active');
        if (active) {
            const title = active.querySelector('.mention-title').textContent;
            const tabId = active.getAttribute('data-id');
            const value = paletteInput.value;
            const lastAt = value.lastIndexOf('@');

            // Replace the @mention token with the title and store the mapping for extraction
            const newValue = value.substring(0, lastAt) + `@${title} `;
            paletteInput.value = newValue;

            // Internal mapping for tab extraction
            if (!window._mentions) window._mentions = {};
            window._mentions[`@${title}`] = tabId;

            mentions.classList.add('hidden');
            selectedMentionIndex = -1;
        }
    } else if (e.key === 'Enter') {
        const query = paletteInput.value.trim();
        if (!query) return;

        if (isPalette && selectedActionIndex >= 0 && allItems[selectedActionIndex]) {
            allItems[selectedActionIndex].action();
            toggleActionBar(false);
        } else {
            // Trigger AI Search Directly
            console.log('[Renderer] Starting AI Search for query:', query);
            overlay?.classList.add('ai-loading');
            paletteInput.readOnly = true;

            if (status) {
                status.textContent = 'Asking AI...';
                status.classList.remove('hidden');
                // Hide input text during loading as requested
                paletteInput.style.color = 'transparent';
                paletteInput.style.caretColor = 'transparent';
            }
            if (results) results.classList.add('hidden');
            if (paletteGhost) paletteGhost.classList.add('hidden');
            if (aiResult) aiResult.classList.add('hidden');

            try {
                // Get settings for AI provider
                console.log('[Renderer] Fetching settings...');
                const settings = await window.browser?.storageGet(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey', 'intentsSearchKey']);

                // 1. Resolve Mentions & Extract Data
                const mentionTokens = query.match(/@[\w\s.-]+/g) || [];
                let extractedContext = "";

                if (mentionTokens.length > 0 && window._mentions) {
                    status.textContent = `Extracting data from ${mentionTokens.length} sites...`;
                    for (const token of mentionTokens) {
                        const cleanToken = token.trim();
                        const tabId = window._mentions[cleanToken];
                        if (tabId) {
                            try {
                                const data = await window.browser?.invoke('extract-tab-data', parseInt(tabId));
                                if (data && !data.error) {
                                    extractedContext += `\n--- SOURCE: ${cleanToken} ---\n`;
                                    extractedContext += `Title: ${data.title}\n`;
                                    extractedContext += `Description: ${data.metaDescription || data.ogDescription || 'N/A'}\n`;
                                    extractedContext += `Key Heading: ${data.h1}\n`;
                                    extractedContext += `Content Snippet: ${data.bodySnippet}\n`;
                                }
                            } catch (e) { console.warn(`Failed to extract from ${cleanToken}`, e); }
                        }
                    }
                }

                status.textContent = 'Asking AI...';

                // 2. Build final prompt
                let systemPrompt = "You are a helpful assistant.";
                let userPrompt = query;

                if (extractedContext) {
                    systemPrompt = `You are Pulsar Research AI, a specialized agent for comparative web analysis.

GOAL: Provide a high-density, visually structured comparison between the mentioned websites.

FORMATTING REQUIREMENTS:
1. USE MARKDOWN: Use # for headers, - for bullets, and tables for data.
2. COMPARISON TABLE: If comparing 2+ items, ALWAYS start with a markdown table of key metrics (e.g., Price, Features, Rating).
3. PROS & CONS: Use separate sections for "Strengths" and "Weaknesses" for each site.
4. VERDICT: End with a "Pulsar Recommendation" based on the user's intent.
5. CLEANLINESS: Avoid "fluff" (no "I found this...", "Here is...", "I hope this helps"). Start immediately with the content.

TONE: Objective, technical, and efficient.`;

                    userPrompt = `User Query: ${query}\n\nEXTRACTED DATA FROM MENTIONED SITES:\n${extractedContext}`;
                } else {
                    // Get recent context if no mentions
                    let history = [];
                    try {
                        const stats = await window.browser?.storageGet(['footsteps']);
                        history = stats.footsteps || [];
                    } catch (e) { }
                    const lastTabs = history.slice(0, 5).map(t => `${t.title} (${t.url})`).join('\n');
                    userPrompt = `Context (History):\n${lastTabs}\n\nQuery: ${query}`;
                }

                const response = await window.browser?.aiSearch(userPrompt, settings, systemPrompt);

                if (status) {
                    status.classList.add('hidden');
                    paletteInput.style.color = '';
                    paletteInput.style.caretColor = '';
                }
                overlay?.classList.remove('ai-loading');

                console.log('[Renderer] AI Response received:', response);

                if (response.error) {
                    if (aiResult) {
                        const bar = $('action-bar-main');
                        if (bar) bar.classList.add('expanded');
                        aiResult.innerHTML = `<div class="ai-answer-content" style="color: #ff5f6d;">AI Error: ${response.error}</div>`;
                        aiResult.classList.remove('hidden');
                    } else {
                        alert('AI Error: ' + response.error);
                        toggleActionBar(false);
                    }
                    return;
                }

                if (response.summary && response.summary.startsWith('GOTO:')) {
                    const url = response.summary.replace('GOTO:', '').trim();
                    window.browser?.navigate(url);
                    toggleActionBar(false);
                    return;
                }

                if (aiResult) {
                    const bar = $('action-bar-main');
                    if (bar) bar.classList.add('expanded');
                    aiResult.innerHTML = `<div class="ai-answer-content">${renderMarkdown(response.summary)}</div>`;
                    aiResult.classList.remove('hidden');
                    console.log('[Renderer] AI Result displayed');
                }
            } catch (err) {
                console.error('[Renderer] Action Bar AI Error:', err);
                if (status) status.classList.add('hidden');
                if (paletteInput) {
                    paletteInput.style.color = '';
                    paletteInput.style.caretColor = '';
                    paletteInput.readOnly = false;
                }
                overlay?.classList.remove('ai-loading');
                if (aiResult) {
                    const bar = $('action-bar-main');
                    if (bar) bar.classList.add('expanded');
                    aiResult.innerHTML = `<div class="ai-answer-content" style="color: #ff5f6d;">Execution Error: ${err.message}</div>`;
                    aiResult.classList.remove('hidden');
                } else {
                    toggleActionBar(false);
                }
            }
        }
    } else if (e.key === 'Tab' && paletteGhost?.textContent && !paletteGhost.classList.contains('hidden')) {
        e.preventDefault();
        paletteInput.value = paletteGhost.textContent;
        updateActionBarResults(paletteInput.value, isPalette ? 'palette' : 'ai');
    }
});

paletteOverlay?.addEventListener('click', (e) => {
    if (e.target === paletteOverlay) toggleActionBar(false);
});

// Capture & Blur Listener
if (window.browser?.onUpdateBlurSnapshot) {
    window.browser.onUpdateBlurSnapshot((dataUrl) => {
        const backdrop = $('blur-backdrop');
        const topUrl = $('url-bar-top');
        if (backdrop) {
            if (dataUrl) {
                backdrop.style.backgroundImage = `url(${dataUrl})`;

                // If Top URL is focused, don't blur (Clean Mode)
                if (topUrl && document.activeElement === topUrl) {
                    backdrop.classList.add('clean');
                } else {
                    backdrop.classList.remove('clean');
                }

                backdrop.classList.add('active');
            } else {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    backdrop.style.backgroundImage = 'none';
                }, 300);
            }
        }
    });
}

// Global IPC Listeners for Action Bar and Settings
if (window.browser?.onOpenSettings) {
    window.browser.onOpenSettings(() => {
        // Prevent sidebar from opening the main settings modal
        if (isSidebarMode) return;
        toggleModal('settings-overlay', true);
    });
}

if (window.browser?.onToggleActionBar) {
    window.browser.onToggleActionBar((data) => {
        console.log('[Renderer] IPC: Received toggle-action-bar', data);
        if (isSidebarMode) return;

        const overlay = $('action-bar-overlay');
        const isActive = overlay?.classList.contains('active');
        const currentMode = overlay?.classList.contains('palette-mode') ? 'palette' : 'ai';
        const requestedMode = data?.mode || 'ai';

        if (isActive && currentMode === requestedMode) {
            toggleActionBar(false);
        } else {
            toggleActionBar(true, requestedMode);
        }
    });
}

// We need to add toggle-action-bar to preload.js or use generic onInvoke
// Wait, I didn't add toggle-action-bar to preload.js. Let me check preload.js.

function initSettingsTabs() {
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const panes = document.querySelectorAll('.settings-pane');
    const titleEl = $('settings-title');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.toggle('active', b === btn));

            // Update panes
            panes.forEach(pane => {
                pane.classList.toggle('active', pane.id === `pane-${tabId}`);
            });

            // Update title
            if (titleEl) {
                titleEl.textContent = btn.querySelector('span').textContent;
            }

            console.log(`[Renderer] Switched to settings tab: ${tabId}`);
        });
    });
}

function initAuth() {
    // Accounts are currently "Coming Soon"
    console.log('[Renderer] Accounts system: Coming Soon');
}

function initUpdaterUI() {
    const btnCheck = $('btn-check-updates');
    const btnDownload = $('btn-download-update');
    const btnInstall = $('btn-install-update');
    const statusContainer = $('update-status-container');
    const statusText = $('update-status-text');
    const progressContainer = $('update-progress-container');
    const progressBar = $('update-progress-bar');
    const currentVersion = $('current-version');

    // Get current version from main
    window.browser?.invoke('get-app-version').then(version => {
        if (currentVersion) currentVersion.textContent = `v${version}`;
    });

    if (btnCheck) {
        btnCheck.onclick = () => {
            statusContainer.classList.remove('hidden');
            statusText.textContent = 'Checking for updates...';
            btnCheck.disabled = true;
            window.browser?.checkUpdates();
        };
    }

    if (btnDownload) {
        btnDownload.onclick = () => {
            btnDownload.classList.add('hidden');
            window.browser?.downloadUpdate();
        };
    }

    if (btnInstall) {
        btnInstall.onclick = () => {
            window.browser?.installUpdate();
        };
    }

    if (window.browser?.onUpdateStatus) {
        window.browser.onUpdateStatus((data) => {
            console.log('[Renderer] Update status event:', data);

            if (!statusContainer || !statusText) return;

            statusContainer.classList.remove('hidden');

            switch (data.status) {
                case 'checking':
                    statusText.textContent = 'Checking for updates...';
                    break;
                case 'available':
                    statusText.textContent = `Update available: v${data.info.version}`;
                    btnCheck.classList.add('hidden');
                    break;
                case 'not-available':
                    statusText.textContent = 'You are up to date!';
                    btnCheck.disabled = false;
                    setTimeout(() => {
                        statusContainer.classList.add('hidden');
                    }, 3000);
                    break;
                case 'downloading':
                    progressContainer.classList.remove('hidden');
                    const percent = Math.round(data.progress.percent);
                    progressBar.style.width = `${percent}%`;
                    statusText.textContent = `Downloading update... ${percent}%`;
                    break;
                case 'downloaded':
                    progressContainer.classList.add('hidden');
                    statusText.textContent = 'Update downloaded and ready to install.';
                    btnInstall.classList.remove('hidden');
                    btnCheck.classList.add('hidden');
                    break;
                case 'error':
                    statusText.textContent = `Error: ${data.error}`;
                    btnCheck.disabled = false;
                    break;
            }
        });
    }
}

function applyWallpaper(bgId, save = true) {
    const wp = $('wallpaper');
    if (!wp) return;

    const hasWallpaper = bgId !== 'none' && !!bgId;
    document.body.classList.toggle('has-wallpaper', hasWallpaper);

    // Clear previous special classes
    wp.classList.remove('minimal-gradient', 'minimal-mesh');

    if (!hasWallpaper) {
        wp.classList.remove('active');
        wp.style.backgroundImage = 'none';
        if (save) window.browser?.storageSet({ wallpaper: 'none' });
    } else {
        if (bgId === 'minimal-gradient') {
            wp.style.backgroundImage = 'none';
            wp.classList.add('minimal-gradient');
        } else if (bgId === 'minimal-mesh') {
            wp.style.backgroundImage = 'none';
            wp.classList.add('minimal-mesh');
        } else {
            let imgUrl = bgId;
            if (!bgId.startsWith('http')) {
                imgUrl = `https://images.unsplash.com/${bgId}?auto=format&fit=crop&w=1920&q=80`;
            }
            wp.style.backgroundImage = `url(${imgUrl})`;
        }
        wp.classList.add('active');

        // Logic for Force Dark Mode
        const forceDark = $('forceDarkMode')?.checked;
        if (forceDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            window.browser?.storageSet({ theme: 'dark' });
            // Update UI buttons
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === 'dark');
            });
        }

        if (save) window.browser?.storageSet({ wallpaper: bgId });
    }

    // Update active state on buttons
    document.querySelectorAll('.bg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bg === bgId);
    });
}

function initWallpaperPicker() {
    const bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach(btn => {
        btn.onclick = () => {
            const bgId = btn.dataset.bg;
            applyWallpaper(bgId);
        };
    });

    const forceDarkToggle = $('forceDarkMode');
    if (forceDarkToggle) {
        forceDarkToggle.onchange = () => {
            window.browser?.storageSet({ forceDarkMode: forceDarkToggle.checked });
            // If turning on, and we have a wallpaper, apply it again to trigger theme change
            if (forceDarkToggle.checked && document.body.classList.contains('has-wallpaper')) {
                const activeBtn = document.querySelector('.bg-btn.active');
                if (activeBtn) applyWallpaper(activeBtn.dataset.bg);
            }
        };
    }
}

function initPrivacyControls() {
    const privacyToggle = $('privacyDisclosureEnabled');
    if (privacyToggle) {
        privacyToggle.onchange = () => {
            window.browser?.storageSet({ privacyDisclosureEnabled: privacyToggle.checked });
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initUpdaterUI();
    initSettingsTabs();
    initWallpaperPicker();
    initPrivacyControls();
    initAuth();
    initPulsarMenu();
});

// ============================================
// PULSAR MENU (LOGO DROPDOWN)
// ============================================

function initPulsarMenu() {
    const toggle = $('logo-dropdown-toggle');
    if (!toggle) return;

    toggle.onclick = (e) => {
        e.stopPropagation();
        const rect = toggle.getBoundingClientRect();
        window.browser?.showLogoMenu({
            x: Math.round(rect.left),
            y: Math.round(rect.bottom)
        });
    };
}

