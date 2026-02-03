/**
 * Hold That Thought - Content Script
 * Shows popup for saving thoughts on any webpage
 */

(function () {
    // Prevent multiple injections
    if (window.HTT_CONTENT_LOADED) return;
    window.HTT_CONTENT_LOADED = true;

    let currentSelection = '';
    let currentPageTitle = '';
    let currentPageUrl = '';
    let currentStyle = 'subtle';

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'showThoughtPopup') {
            showPopup(request.selectedText, request.pageTitle, request.pageUrl);
        }

        if (request.action === 'triggerHoldThought') {
            const selection = window.getSelection().toString().trim();
            if (selection) {
                showPopup(selection, document.title, window.location.href);
            } else {
                showNotification('Select some text first!');
            }
        }

        if (request.action === 'showPingBar') {
            createPingBar();
        }

        if (request.action === 'showFootstepsPanel') {
            createFootstepsPanel();
        }

        if (request.action === 'toggleDarkMode') {
            toggleGlobalDarkMode(request.enabled);
        }

        if (request.action === 'triggerContextualize') {
            // Re-use logic for shortcut
            if (isMinimized && savedContext) {
                restoreContextPopup();
                return;
            }

            const selection = window.getSelection().toString().trim();
            if (selection) {
                showContextualizePopup(selection);
            } else if (savedContext) {
                restoreContextPopup();
            } else {
                showNotification('Select some text first!');
            }
        }

        if (request.action === 'showNotification') {
            showNotification(request.text || request.message);
        }

        if (request.action === 'showAIRewritePopup') {
            showAIRewritePopup(request);
        }

        if (request.action === 'triggerAIRewriteShortcut') {
            const selection = window.getSelection().toString().trim();
            if (selection) {
                chrome.runtime.sendMessage({
                    action: 'askAI',
                    prompt: `Rewrite this: "${selection}"`,
                    context: "Direct rewrite requested via shortcut."
                }, (res) => {
                    if (res && res.answer) {
                        showAIRewritePopup({
                            selectedText: selection,
                            result: res.answer,
                            mode: 'shorter'
                        });
                    }
                });
            } else {
                showNotification('Select some text to rewrite!');
            }
        }
    });

    function toggleGlobalDarkMode(enabled) {
        const existingStyle = document.getElementById('intent-force-dark-mode');

        if (enabled) {
            // Check if page is already dark to avoid double inversion
            if (isPageDark()) {
                console.log('Page is already dark, skipping inversion.');
                return;
            }

            if (!existingStyle) {
                const style = document.createElement('style');
                style.id = 'intent-force-dark-mode';
                style.textContent = `
                    html {
                        background-color: white !important; /* Force base to be white so it inverts to black */
                        filter: invert(1) hue-rotate(180deg) !important;
                    }
                    img, video, canvas, svg, iframe, [style*="background-image"] {
                        filter: invert(1) hue-rotate(180deg) !important;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            if (existingStyle) {
                existingStyle.remove();
            }
        }
    }

    function isPageDark() {
        // Quick check for dark mode media query preference (some sites respect this)
        // logic: if site supports dark mode AND user prefers it, we assume it's dark.
        // But many sites ignore this. So we check computed background color.

        const bgColor = window.getComputedStyle(document.body).backgroundColor;
        const htmlColor = window.getComputedStyle(document.documentElement).backgroundColor;

        const isDark = (color) => {
            const rgb = color.match(/\d+/g);
            if (!rgb) return false; // transparent or invalid
            const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
            return brightness < 128;
        };

        // If body or html has a dark background color, assume page is dark
        if ((bgColor !== 'rgba(0, 0, 0, 0)' && isDark(bgColor)) ||
            (htmlColor !== 'rgba(0, 0, 0, 0)' && isDark(htmlColor))) {
            return true;
        }

        return false;
    }

    // Check initial state
    chrome.storage.local.get(['forceDarkMode', 'style'], (result) => {
        if (result.forceDarkMode) {
            toggleGlobalDarkMode(true);
        }
        if (result.style) {
            currentStyle = result.style;
            applyStyleToDocument();
        }
    });

    // Listen for storage changes to sync style
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.style) {
                currentStyle = changes.style.newValue;
                applyStyleToDocument();
            }
            if (changes.forceDarkMode) {
                toggleGlobalDarkMode(changes.forceDarkMode.newValue);
            }
        }
    });

    function applyStyleToDocument() {
        document.documentElement.setAttribute('data-style', currentStyle);
    }

    // ... (rest of code) ...

    function createPingBar() {
        if (document.getElementById('htt-ping-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'htt-ping-overlay';
        overlay.className = 'htt-ping-overlay';

        overlay.innerHTML = `
            <div class="htt-ping-bar">
                <input type="text" class="htt-ping-input" id="httPingInput" placeholder="Remind me to..." autocomplete="off">
                <div class="htt-ping-actions">
                    <button type="button" class="htt-ping-btn" data-time="15">15m</button>
                    <button type="button" class="htt-ping-btn" data-time="60">1h</button>
                    <button type="button" class="htt-ping-btn" data-time="180">3h</button>
                    <button type="button" class="htt-ping-btn" data-time="tomorrow">Tmrw</button>
                    <label class="htt-ping-toggle">
                        <input type="checkbox" id="httPingLink"> Link page
                    </label>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector('#httPingInput');
        requestAnimationFrame(() => input.focus());

        let selectedMinutes = null;
        const timeBtns = overlay.querySelectorAll('.htt-ping-btn');

        timeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const wasActive = btn.classList.contains('active');
                timeBtns.forEach(b => b.classList.remove('active'));

                if (!wasActive) {
                    btn.classList.add('active');
                    if (btn.dataset.time === 'tomorrow') {
                        selectedMinutes = 24 * 60;
                    } else {
                        selectedMinutes = parseInt(btn.dataset.time);
                    }
                } else {
                    selectedMinutes = null;
                }
                input.focus();
            });
        });

        const close = () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                e.stopPropagation(); // Stop bubbling to prevent double-trigger

                const link = overlay.querySelector('#httPingLink').checked;
                const text = input.value.trim();

                // Immediately disable to prevent double-submit
                input.disabled = true;

                // Smart Time Parsing
                let minutes = selectedMinutes;
                if (!minutes) {
                    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs|d|day|days)\b/i);
                    if (match) {
                        const val = parseFloat(match[1]);
                        const unit = match[2].toLowerCase()[0];
                        if (unit === 'm') minutes = val;
                        else if (unit === 'h') minutes = val * 60;
                        else if (unit === 'd') minutes = val * 1440;
                    }
                }

                chrome.runtime.sendMessage({
                    action: 'createPing',
                    thought: {
                        text: text,
                        context: link ? document.title : '',
                        pageUrl: link ? window.location.href : '',
                        pageTitle: document.title,
                        tag: '⏰ Reminder',
                        importance: 'medium',
                        color: '#7c7cf8'
                    },
                    minutes: minutes
                }, (res) => {
                    close();
                    if (res && res.success) {
                        showNotification(minutes ? 'Ping set for later! ⏰' : 'Note saved! 💭');
                    }
                });
            }
        });
    }
    function showFriendlyPing(thought) {
        if (document.getElementById('htt-friendly-ping')) return;

        const overlay = document.createElement('div');
        overlay.className = 'htt-friendly-overlay';
        overlay.id = 'htt-friendly-ping-overlay';

        const container = document.createElement('div');
        container.className = 'htt-friendly-ping';
        container.id = 'htt-friendly-ping';
        container.innerHTML = `
            <div class="htt-fp-icon">🌥️</div>
            <div class="htt-fp-header">Thinking of you</div>
            <div class="htt-fp-text">"${escapeHtml(thought.text)}"</div>
            <div class="htt-fp-actions">
                <button class="htt-fp-btn secondary" id="httFpSnooze">Snooze (5m)</button>
                <button class="htt-fp-btn primary" id="httFpAck">Got it, thanks!</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(container);

        // Gentle ding sound
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // Soft sine wave
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1); // C6

            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc.start();
            osc.stop(ctx.currentTime + 0.6);
        } catch (e) { }

        const close = () => {
            container.style.transition = 'all 0.3s ease';
            overlay.style.transition = 'all 0.3s ease';

            container.style.opacity = '0';
            container.style.transform = 'translate(-50%, -45%) scale(0.95)';
            overlay.style.opacity = '0';

            setTimeout(() => {
                container.remove();
                overlay.remove();
            }, 300);
        };

        container.querySelector('#httFpAck').addEventListener('click', close);

        container.querySelector('#httFpSnooze').addEventListener('click', () => {
            chrome.runtime.sendMessage({
                action: 'createPing',
                thought: { ...thought },
                minutes: 5 // Snooze time
            }, () => {
                close();
                showNotification('Snoozed for 5m 💤');
            });
        });
    }


    // Color options
    const COLORS = [
        { name: 'Yellow', value: '#fef08a' },
        { name: 'Green', value: '#bbf7d0' },
        { name: 'Blue', value: '#bfdbfe' },
        { name: 'Purple', value: '#ddd6fe' },
        { name: 'Pink', value: '#fbcfe8' },
        { name: 'Orange', value: '#fed7aa' }
    ];

    // Tag presets
    const TAGS = ['📚 Read Later', '💡 Idea', '📝 Note', '⭐ Important', '🔗 Reference', '❓ Question'];

    function showPopup(text, title, url) {
        currentSelection = text;
        currentPageTitle = title;
        currentPageUrl = url;

        // Remove existing popup if any
        const existing = document.getElementById('htt-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'htt-popup';
        popup.innerHTML = `
            <div class="htt-overlay" id="httOverlay"></div>
            <div class="htt-modal">
                <div class="htt-header">
                    <h3>Hold That Thought</h3>
                    <button class="htt-close-red" id="httClose" title="Close"></button>
                </div>
                
                <div class="htt-content">
                    <div class="htt-preview">
                        <p class="htt-selected-text">"${escapeHtml(text.substring(0, 150))}${text.length > 150 ? '...' : ''}"</p>
                        <span class="htt-source">${escapeHtml(title)}</span>
                    </div>
                    
                    <div class="htt-field">
                        <label>Tag</label>
                        <div class="htt-tags" id="httTags">
                            <button class="htt-tag active" data-tag="📝 Note">Note</button>
                            <button class="htt-tag" data-tag="💡 Idea">Idea</button>
                            <button class="htt-tag" data-tag="📚 Read Later">Read Later</button>
                        </div>
                    </div>
                    
                    <div class="htt-field">
                        <label>Note</label>
                        <textarea id="httContext" placeholder="Why save this?"></textarea>
                    </div>
                </div>
                
                <div class="htt-footer">
                    <button class="htt-cancel" id="httCancel">Cancel</button>
                    <button class="htt-save" id="httSave">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // Event listeners
        document.getElementById('httOverlay').addEventListener('click', closePopup);
        document.getElementById('httClose').addEventListener('click', closePopup);
        document.getElementById('httCancel').addEventListener('click', closePopup);
        document.getElementById('httSave').addEventListener('click', saveThought);

        // Tag selection
        document.querySelectorAll('.htt-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.htt-tag').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Keyboard: Escape to close, Cmd/Ctrl+Enter to save
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', keyHandler);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                saveThought();
            }
        };
        document.addEventListener('keydown', keyHandler);

        // Focus
        document.getElementById('httContext').focus();
    }

    function closePopup() {
        const popup = document.getElementById('htt-popup');
        if (popup) {
            popup.classList.add('closing');
            setTimeout(() => popup.remove(), 200);
        }
    }

    function saveThought() {
        const tag = document.querySelector('.htt-tag.active')?.dataset.tag || '📝 Note';
        const context = document.getElementById('httContext')?.value || '';

        const thought = {
            text: currentSelection,
            pageTitle: currentPageTitle,
            pageUrl: currentPageUrl,
            tag,
            color: '#fef08a', // Default yellow
            importance: 'medium',
            context
        };

        chrome.runtime.sendMessage({ action: 'saveThought', thought }, (response) => {
            if (response?.success) {
                closePopup();
                showNotification('Saved');
            } else {
                showNotification('Failed to save');
            }
        });
    }

    function showNotification(message) {
        const existing = document.querySelector('.htt-notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.className = 'htt-notification';
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // FOOTSTEPS - Browsing Trail Panel
    // ============================================

    function createFootstepsPanel() {
        // Toggle if already open
        const existing = document.getElementById('footsteps-panel');
        if (existing) {
            closeFootstepsPanel();
            return;
        }

        // Request footsteps data from background
        chrome.runtime.sendMessage({ action: 'getFootsteps' }, (response) => {
            if (!response) return;
            renderFootstepsPanel(response.footsteps || []);
        });
    }

    function renderFootstepsPanel(footsteps) {
        // Remove existing panel if any (for re-render after clear)
        document.getElementById('footsteps-panel')?.remove();
        document.getElementById('footsteps-overlay')?.remove();

        // Create overlay - very subtle
        const overlay = document.createElement('div');
        overlay.id = 'footsteps-overlay';
        overlay.className = 'footsteps-overlay';

        // Create panel - minimal container
        const panel = document.createElement('div');
        panel.id = 'footsteps-panel';
        panel.className = 'footsteps-panel';

        // Header - ultra minimal
        const header = document.createElement('div');
        header.className = 'footsteps-header';
        header.innerHTML = `
            <span class="footsteps-title">Trail</span>
            <div class="footsteps-header-actions">
                <button class="footsteps-action-btn" id="footstepsClear" title="Clear">
                    Clear
                </button>
                <button class="close-btn-mac" id="footstepsClose" title="Close" style="width: 20px; height: 20px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;

        // Trail container
        const trail = document.createElement('div');
        trail.className = 'footsteps-trail';

        if (footsteps.length === 0) {
            trail.innerHTML = `
                <div class="footsteps-empty">
                    <span class="footsteps-empty-text">No trail yet</span>
                </div>
            `;
        } else {
            footsteps.forEach((step, index) => {
                const item = document.createElement('div');
                item.className = 'footsteps-item';
                item.dataset.url = step.url;

                const isCurrentPage = step.url === window.location.href;
                if (isCurrentPage) {
                    item.classList.add('current');
                }

                // Step number for visual hierarchy
                const stepNum = index + 1;

                item.innerHTML = `
                    <span class="footsteps-item-num">${stepNum}</span>
                    <img class="footsteps-item-favicon" src="${step.favicon}" alt="">
                    <div class="footsteps-item-info">
                        <span class="footsteps-item-title">${escapeHtml(step.title || step.domain)}</span>
                        <span class="footsteps-item-meta">${escapeHtml(step.domain)} · ${formatRelativeTime(step.timestamp)}</span>
                    </div>
                `;

                // Handle favicon errors
                const img = item.querySelector('.footsteps-item-favicon');
                if (img) {
                    img.addEventListener('error', () => {
                        img.style.display = 'none';
                    });
                }

                // Click to navigate
                item.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ action: 'navigateToFootstep', url: step.url });
                    closeFootstepsPanel();
                });

                trail.appendChild(item);
            });
        }

        // Footer with shortcut hint
        const footer = document.createElement('div');
        footer.className = 'footsteps-footer';
        footer.innerHTML = `<span class="footsteps-hint">browsing trail</span>`;

        // Assemble panel
        panel.appendChild(header);
        panel.appendChild(trail);
        panel.appendChild(footer);

        // Add to page
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        // Force reflow for animation
        panel.offsetHeight;
        overlay.classList.add('visible');
        panel.classList.add('visible');

        // Event listeners
        overlay.addEventListener('click', closeFootstepsPanel);
        document.getElementById('footstepsClose').addEventListener('click', closeFootstepsPanel);
        document.getElementById('footstepsClear').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'clearFootsteps' }, () => {
                renderFootstepsPanel([]);
            });
        });

        // Escape to close
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeFootstepsPanel();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    function closeFootstepsPanel() {
        const panel = document.getElementById('footsteps-panel');
        const overlay = document.getElementById('footsteps-overlay');

        if (panel) {
            panel.classList.remove('visible');
            panel.classList.add('closing');
        }
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.classList.add('closing');
        }

        setTimeout(() => {
            panel?.remove();
            overlay?.remove();
        }, 300);
    }

    function formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        return `${days}d ago`;
    }

    // ============================================
    // CONTEXTUALIZE - Wikipedia Definition Popup
    // ============================================

    // State for minimized context
    let savedContext = null;
    let isMinimized = false;

    // Keyboard shortcut moved to manifest (Alt+Q for Smart AI / Contextualize)

    // Fetch from Simple English Wikipedia for ELI5
    async function fetchSimpleWikipedia(searchTerm) {
        try {
            const response = await fetch(`https://simple.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`);
            if (response.ok) {
                const data = await response.json();
                return {
                    extract: data.extract || '',
                    url: data.content_urls?.desktop?.page || `https://simple.wikipedia.org/wiki/${encodeURIComponent(searchTerm)}`
                };
            }
        } catch (e) {
            console.log('Simple Wikipedia fetch error:', e);
        }
        return { extract: '', url: '' };
    }

    function showContextualizePopup(term) {
        // Remove existing popup
        document.getElementById('ctx-popup')?.remove();
        document.getElementById('ctx-overlay')?.remove();
        isMinimized = false;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'ctx-overlay';
        overlay.className = 'ctx-overlay';

        // Create popup with premium styling
        const popup = document.createElement('div');
        popup.id = 'ctx-popup';
        popup.className = 'ctx-popup';


        popup.innerHTML = `
            <style>
                @keyframes ctx-shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes ctx-fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes ctx-pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.8; }
                }
                .ctx-header {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
                    cursor: grab;
                    user-select: none;
                }
                .ctx-header:active { cursor: grabbing; }
                .ctx-controls {
                    display: flex;
                    gap: 8px;
                    margin-right: 16px;
                }
                .ctx-btn {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ctx-btn:hover { 
                    transform: scale(1.25); 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .ctx-btn:active { transform: scale(0.85); }
                .ctx-btn::before {
                    content: '';
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    opacity: 0;
                    transition: opacity 0.15s ease;
                }
                .ctx-btn:hover::before { opacity: 1; }
                .ctx-btn-close {
                    background: linear-gradient(135deg, #ff5f56 0%, #ff3b30 100%);
                    box-shadow: 0 2px 8px rgba(255, 59, 48, 0.4), inset 0 1px 0 rgba(255,255,255,0.3);
                }
                .ctx-btn-close:hover {
                    background: linear-gradient(135deg, #ff6b63 0%, #ff453a 100%);
                    box-shadow: 0 4px 16px rgba(255, 59, 48, 0.5), inset 0 1px 0 rgba(255,255,255,0.3);
                }
                .ctx-btn-close::before {
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 2l6 6M8 2l-6 6' stroke='%23500' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
                }
                .ctx-btn-minimize {
                    background: linear-gradient(135deg, #ffbd2e 0%, #ff9500 100%);
                    box-shadow: 0 2px 8px rgba(255, 149, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.3);
                }
                .ctx-btn-minimize:hover {
                    background: linear-gradient(135deg, #ffc94d 0%, #ffaa33 100%);
                    box-shadow: 0 4px 16px rgba(255, 149, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.3);
                }
                .ctx-btn-minimize::before {
                    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 5h6' stroke='%23604000' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
                }
                .ctx-title {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 52px; /* Offset for centered look */
                }
                .ctx-title-text {
                    font-size: 0.85em;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 300px;
                    letter-spacing: 0.02em;
                }
                .ctx-body {
                    padding: 20px 22px;
                    max-height: 320px;
                    overflow-y: auto;
                    animation: ctx-fadeIn 0.4s ease 0.1s both;
                }
                .ctx-body::-webkit-scrollbar { width: 6px; }
                .ctx-body::-webkit-scrollbar-track { background: transparent; }
                .ctx-body::-webkit-scrollbar-thumb { 
                    background: rgba(255,255,255,0.1); 
                    border-radius: 3px;
                }
                .ctx-para {
                    font-size: 0.95em;
                    line-height: 1.7;
                    color: #e0e0e0;
                    margin-bottom: 12px;
                }
                .ctx-para:last-child { margin-bottom: 0; }
                .ctx-no-result {
                    text-align: center;
                    padding: 20px;
                    color: #888;
                }
                .ctx-no-result-icon {
                    font-size: 2em;
                    margin-bottom: 10px;
                }
                .ctx-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    padding: 20px;
                    color: #bbb;
                    animation: ctx-fadeIn 0.3s ease both;
                }
                .ctx-loading-bar {
                    width: 120px;
                    height: 3px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    background-size: 200% 100%;
                    animation: ctx-shimmer 1.5s infinite;
                    border-radius: 2px;
                }
                .ctx-content p {
                    margin: 0 0 16px 0;
                    line-height: 1.75;
                    color: #bbb;
                    animation: ctx-fadeIn 0.3s ease both;
                }
                .ctx-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 18px;
                    background: rgba(255, 255, 255, 0.02);
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    gap: 10px;
                }
                .ctx-link {
                    color: #8ab4f8;
                    text-decoration: none;
                    font-size: 0.85em;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                }
                .ctx-link:hover { color: #aecbfa; transform: translateX(2px); }
                .ctx-action-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #aaa;
                    font-size: 0.85em;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .ctx-action-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    transform: translateY(-1px);
                }
                .ctx-action-btn.copied {
                    background: rgba(34, 197, 94, 0.2);
                    border-color: rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }
                .ctx-eli5-btn {
                    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
                    border-color: rgba(168, 85, 247, 0.3);
                    color: #c4b5fd;
                }
                .ctx-eli5-btn:hover {
                    background: linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%);
                    color: #ddd6fe;
                    border-color: rgba(168, 85, 247, 0.5);
                }
                .ctx-eli5-btn.loading {
                    opacity: 0.7;
                    pointer-events: none;
                }
                .ctx-footer-btns {
                    display: flex;
                    gap: 8px;
                }
                .ctx-learn-btn {
                    background: linear-gradient(135deg, rgba(16, 163, 127, 0.15) 0%, rgba(10, 130, 100, 0.15) 100%);
                    border-color: rgba(16, 163, 127, 0.3);
                    color: #5eead4;
                }
                .ctx-learn-btn:hover {
                    background: linear-gradient(135deg, rgba(16, 163, 127, 0.25) 0%, rgba(10, 130, 100, 0.25) 100%);
                    color: #99f6e4;
                    border-color: rgba(16, 163, 127, 0.5);
                }
            </style>
            <div class="ctx-header" id="ctx-header">
                <div class="ctx-controls">
                    <button class="ctx-btn ctx-btn-close" id="ctx-close" title="Close"></button>
                    <button class="ctx-btn ctx-btn-minimize" id="ctx-minimize" title="Minimize"></button>
                </div>
                <div class="ctx-title">
                    <span class="ctx-title-text">${escapeHtml(term.length > 40 ? term.substring(0, 40) + '...' : term)}</span>
                </div>
            </div>
            <div class="ctx-body" id="ctx-body">
                <div class="ctx-loading">
                    <div class="ctx-loading-bar"></div>
                    <span>Looking up definition...</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(popup);

        // Dragging functionality
        let isDragging = false;
        let startX, startY, initialX, initialY;
        const header = popup.querySelector('#ctx-header');

        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('ctx-btn')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = popup.getBoundingClientRect();
            initialX = rect.left + rect.width / 2;
            initialY = rect.top + rect.height / 2;
            popup.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            popup.style.left = (initialX + dx) + 'px';
            popup.style.top = (initialY + dy) + 'px';
            popup.style.transform = 'translate(-50%, -50%)';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                popup.style.transition = '';
            }
        });

        // Animate in
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        // Close handler
        const close = () => {
            overlay.style.opacity = '0';
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => {
                overlay.remove();
                popup.remove();
            }, 300);
            savedContext = null;
            isMinimized = false;
        };

        // Minimize handler
        const minimize = () => {
            savedContext = {
                term: term,
                content: popup.querySelector('#ctx-body').innerHTML,
                url: popup.dataset.url || ''
            };
            isMinimized = true;
            overlay.style.opacity = '0';
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -50%) scale(0.9) translateY(20px)';
            setTimeout(() => {
                overlay.remove();
                popup.remove();
            }, 300);
            showNotification('Context saved! Press Ctrl+Shift+X to restore');
        };

        overlay.addEventListener('click', close);
        popup.querySelector('#ctx-close').addEventListener('click', close);
        popup.querySelector('#ctx-minimize').addEventListener('click', minimize);

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        });

        // Fetch from Wikipedia
        fetchWikipediaSummary(term).then(result => {
            const bodyEl = popup.querySelector('#ctx-body');
            popup.dataset.url = result.url;

            if (result.extract) {
                bodyEl.innerHTML = `
                    <div class="ctx-content">
                        <p>${escapeHtml(result.extract)}</p>
                    </div>
                `;

                // Add footer with copy, ELI5, and link
                const footer = document.createElement('div');
                footer.className = 'ctx-footer';
                footer.innerHTML = `
                    <a href="${result.url}" target="_blank" class="ctx-link">
                        Read more on Wikipedia
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 17L17 7M17 7H7M17 7V17"/>
                        </svg>
                    </a>
                    <div class="ctx-footer-btns">
                        <button class="ctx-action-btn ctx-learn-btn" id="ctx-learn" title="Learn further with AI">
                            🪄 Learn further
                        </button>
                        <button class="ctx-action-btn ctx-eli5-btn" id="ctx-eli5" title="Explain Like I'm 5">
                            🧒 ELI5
                        </button>
                        <button class="ctx-action-btn" id="ctx-copy">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Copy
                        </button>
                    </div>
                `;
                popup.appendChild(footer);

                // Learn Further functionality
                footer.querySelector('#ctx-learn').addEventListener('click', () => {
                    const originalText = term;
                    const summary = result.extract;
                    const combinedContext = `Selection: "${originalText}"\n\nWikipedia Summary: "${summary}"`;

                    close();
                    setTimeout(() => {
                        createAIBar(combinedContext);
                    }, 300);
                });

                // Copy functionality
                footer.querySelector('#ctx-copy').addEventListener('click', () => {
                    navigator.clipboard.writeText(result.extract).then(() => {
                        const btn = footer.querySelector('#ctx-copy');
                        btn.classList.add('copied');
                        btn.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 6L9 17l-5-5"/>
                            </svg>
                            Copied!
                        `;
                        setTimeout(() => {
                            btn.classList.remove('copied');
                            btn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                                Copy
                            `;
                        }, 2000);
                    });
                });

                // ELI5 functionality - fetch from Simple English Wikipedia
                footer.querySelector('#ctx-eli5').addEventListener('click', async () => {
                    const eli5Btn = footer.querySelector('#ctx-eli5');
                    eli5Btn.classList.add('loading');
                    eli5Btn.innerHTML = '⏳ Loading...';

                    try {
                        const simpleResult = await fetchSimpleWikipedia(term);
                        const bodyEl = popup.querySelector('#ctx-body');

                        if (simpleResult.extract) {
                            bodyEl.innerHTML = `
                                <div class="ctx-content">
                                    <div style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(139, 92, 246, 0.1)); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.8em; color: #c4b5fd; display: flex; align-items: center; gap: 8px;">
                                        🧒 Simple Explanation
                                    </div>
                                    <p>${escapeHtml(simpleResult.extract)}</p>
                                </div>
                            `;
                            eli5Btn.innerHTML = '✅ Done';
                            popup.dataset.url = simpleResult.url;
                            footer.querySelector('.ctx-link').href = simpleResult.url;
                        } else {
                            eli5Btn.innerHTML = '❌ Not available';
                        }
                    } catch (e) {
                        eli5Btn.innerHTML = '❌ Error';
                    }

                    setTimeout(() => {
                        eli5Btn.classList.remove('loading');
                        eli5Btn.innerHTML = '🧒 ELI5';
                    }, 2000);
                });
            } else {
                bodyEl.innerHTML = `
                    <div style="text-align: center; padding: 30px 0; color: #666;">
                        <p style="margin: 0 0 16px 0;">No definition found for this term.</p>
                        <a href="https://www.google.com/search?q=${encodeURIComponent(term)}" target="_blank" class="ctx-link" style="justify-content: center;">
                            Search on Google instead →
                        </a>
                    </div>
                `;
            }
        }).catch(() => {
            popup.querySelector('#ctx-body').innerHTML = `
                <div style="text-align: center; padding: 30px 0; color: #f87171;">
                    Failed to fetch definition. Try again.
                </div>
            `;
        });
    }

    function restoreContextPopup() {
        if (!savedContext) return;

        document.getElementById('ctx-popup')?.remove();
        document.getElementById('ctx-overlay')?.remove();
        isMinimized = false;

        const overlay = document.createElement('div');
        overlay.id = 'ctx-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 999998;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const popup = document.createElement('div');
        popup.id = 'ctx-popup';
        popup.style.cssText = `
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%) scale(0.9) translateY(-20px);
            background: linear-gradient(145deg, #1e1e1e 0%, #141414 100%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px; padding: 0;
            max-width: 520px; width: 90%; max-height: 450px;
            overflow: hidden; z-index: 999999;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #e5e5e5; opacity: 0;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        popup.innerHTML = `
            <div class="ctx-header" id="ctx-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);cursor:grab;">
                <div style="flex:1;display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.2em;">📖</span>
                    <span style="font-size:0.95em;font-weight:600;color:#fff;">"${escapeHtml(savedContext.term.length > 60 ? savedContext.term.substring(0, 60) + '...' : savedContext.term)}"</span>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="ctx-btn ctx-btn-minimize" id="ctx-minimize" style="width:12px;height:12px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#ffbd2e,#ff9500);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);"></button>
                    <button class="ctx-btn ctx-btn-close" id="ctx-close" style="width:12px;height:12px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#ff5f56,#ff3b30);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);"></button>
                </div>
            </div>
            <div id="ctx-body" style="padding:20px 22px;max-height:320px;overflow-y:auto;">
                ${savedContext.content}
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(popup);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        const close = () => {
            overlay.style.opacity = '0';
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => { overlay.remove(); popup.remove(); }, 300);
            savedContext = null;
        };

        const minimize = () => {
            isMinimized = true;
            overlay.style.opacity = '0';
            popup.style.opacity = '0';
            setTimeout(() => { overlay.remove(); popup.remove(); }, 300);
            showNotification('Context minimized! Press Ctrl+Shift+X to restore');
        };

        overlay.addEventListener('click', close);
        popup.querySelector('#ctx-close').addEventListener('click', close);
        popup.querySelector('#ctx-minimize').addEventListener('click', minimize);
    }

    async function fetchWikipediaSummary(term) {
        try {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();
            return {
                extract: data.extract || '',
                url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(term)}`
            };
        } catch (e) {
            return { extract: '', url: '' };
        }
    }

    // Proactive Semantic Snippet Extraction
    function initSemanticSnippet() {
        // Wait for page to be semi-stable
        setTimeout(() => {
            const metaDesc = document.querySelector('meta[name="description"]')?.content;
            const h1 = document.querySelector('h1')?.textContent;
            const firstP = document.querySelector('p')?.textContent;

            const snippet = [metaDesc, h1, firstP]
                .filter(x => x && x.trim().length > 10)
                .join(' | ')
                .substring(0, 250);

            if (snippet) {
                chrome.runtime.sendMessage({ action: 'updateSnippet', snippet: snippet });
            }
        }, 1500);
    }

    initSemanticSnippet();
    initTrackerDisclosure();

    // ============================================
    // TRACKER DISCLOSURE
    // ============================================

    function initTrackerDisclosure() {
        // Wait for potential banners
        setTimeout(() => {
            // Check if feature is enabled via backend stats (if 0 or null, maybe disabled or no trackers)
            // Actually, we should check settings first, but we don't have direct access here easily without IPC.
            // We'll just ask for stats. If Main process sees disabled setting, it returns 0 or null?
            // Wait, we defined get-tracker-stats to return objects.
            // We'll assume if it returns valid object, we proceed.

            chrome.runtime.sendMessage({ action: 'getTrackerStats' }, (stats) => {
                if (stats && stats.total > 0) {
                    const banner = detectBanner();
                    if (banner) {
                        injectDisclosureWidget(banner, stats);
                    }
                }
            });
        }, 1500);
    }

    function detectBanner() {
        // Heuristics for Consent Banners
        const candidates = [];

        // 1. Common IDs/Classes
        const selectors = [
            '#onetrust-banner-sdk', '#qc-cmp2-container', '#gdpr-banner',
            '.fc-consent-root', '#cookie-banner', '.cookie-banner',
            '[aria-label*="cookie" i]', '[aria-label*="consent" i]'
        ];

        selectors.forEach(sel => {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) candidates.push(el);
        });

        // 2. Text Content Heuristic (Bottom/Top fixed elements with "cookie" or "consent")
        if (candidates.length === 0) {
            const divs = document.querySelectorAll('div, section, aside');
            for (const div of divs) {
                const style = window.getComputedStyle(div);
                if ((style.position === 'fixed' || style.position === 'sticky') && (style.bottom === '0px' || style.top === '0px')) {
                    if (div.innerText.toLowerCase().includes('cookie') || div.innerText.toLowerCase().includes('consent')) {
                        if (isVisible(div) && div.offsetHeight < 300) { // Banner probably isn't huge
                            candidates.push(div);
                        }
                    }
                }
            }
        }

        return candidates[0]; // Return best guess
    }

    function isVisible(el) {
        return el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    function injectDisclosureWidget(banner, stats) {
        if (document.getElementById('pulsar-tracker-disclosure')) return;

        const widget = document.createElement('div');
        widget.id = 'pulsar-tracker-disclosure';
        widget.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 14px;">🛡️</span>
                <span style="font-weight: 600; font-family: system-ui; font-size: 13px;">Pulsar Privacy</span>
            </div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">
                ${stats.total} trackers detected before consent:
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; opacity: 0.8;">
                <div>Ads: ${stats.advertising}</div>
                <div>Analytics: ${stats.analytics}</div>
                <div>Social: ${stats.social}</div>
                <div>Other: ${stats.other}</div>
            </div>
        `;

        // Styling
        widget.style.cssText = `
            position: absolute;
            top: -110px;
            left: 20px;
            background: #1e1e1e; /* Dark theme default */
            color: #fff;
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            z-index: 2147483647; /* Max Z-Index */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 200px;
            pointer-events: none; /* Let clicks pass through if needed, or maybe auto-dismiss? */
            animation: slideUp 0.4s ease-out;
        `;

        // Animation
        const style = document.createElement('style');
        style.textContent = `@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`;
        document.head.appendChild(style);

        // Position relative to banner
        // If banner is fixed bottom, place above it.
        // If banner is fixed top, place below it.
        const rect = banner.getBoundingClientRect();
        if (rect.top > window.innerHeight / 2) {
            // Bottom banner
            widget.style.top = 'auto';
            widget.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        } else {
            // Top banner
            widget.style.top = (rect.bottom + 10) + 'px';
        }

        document.body.appendChild(widget);
    }

    // ============================================
    // AI REWRITE UI
    // ============================================

    function showAIRewritePopup(data) {
        let existing = document.getElementById('htt-rewrite-overlay');
        if (existing) {
            updateAIRewritePopup(existing, data);
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'htt-rewrite-overlay';
        overlay.className = 'htt-rewrite-overlay';
        overlay.innerHTML = `
            <div class="htt-rewrite-card ${data.loading ? 'loading' : ''}">
                <div class="htt-rewrite-card-content">
                    <div class="htt-rewrite-header">
                        <div class="htt-rewrite-title">
                            <span>✨</span>
                            AI Rewrite
                        </div>
                        <button class="htt-close-muted" id="httRewriteClose">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="htt-rewrite-body">
                        <div class="htt-rewrite-preview">
                            <span class="htt-rewrite-label">Original</span>
                            <div class="htt-rewrite-text">"${escapeHtml(data.selectedText)}"</div>
                        </div>
                        <div class="htt-rewrite-label">AI Suggestion</div>
                        <div class="htt-rewrite-result ${data.loading ? 'loading' : ''}">
                            <div class="htt-rewrite-new-text ${data.result ? 'visible' : ''}">
                                ${data.result ? escapeHtml(data.result) : ''}
                            </div>
                        </div>
                    </div>
                    <div class="htt-rewrite-footer">
                        <button class="htt-rewrite-btn" id="httRewriteCancel">Cancel</button>
                        ${data.result ? '<button class="htt-rewrite-btn primary" id="httRewriteInject">Replace</button>' : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#httRewriteClose').onclick = () => overlay.remove();
        overlay.querySelector('#httRewriteCancel').onclick = () => overlay.remove();

        if (data.result) {
            overlay.querySelector('#httRewriteInject').onclick = () => {
                injectRewrittenText(data.result);
                overlay.remove();
            };
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    function updateAIRewritePopup(overlay, data) {
        const card = overlay.querySelector('.htt-rewrite-card');
        const resultContainer = overlay.querySelector('.htt-rewrite-result');
        const textContainer = overlay.querySelector('.htt-rewrite-new-text');
        const footer = overlay.querySelector('.htt-rewrite-footer');

        if (data.loading) {
            card.classList.add('loading');
            resultContainer.classList.add('loading');
            textContainer.classList.remove('visible');
            textContainer.innerText = '';
            footer.innerHTML = '<button class="htt-rewrite-btn" id="httRewriteCancel">Cancel</button>';
        } else if (data.result || data.error) {
            card.classList.remove('loading');
            resultContainer.classList.remove('loading');
            textContainer.innerText = data.error ? `Error: ${data.error}` : data.result;
            textContainer.classList.add('visible');

            footer.innerHTML = `
                <button class="htt-rewrite-btn" id="httRewriteCancel">Cancel</button>
                ${data.result ? '<button class="htt-rewrite-btn primary" id="httRewriteInject">Replace</button>' : ''}
            `;

            if (data.result) {
                footer.querySelector('#httRewriteInject').onclick = () => {
                    injectRewrittenText(data.result);
                    overlay.remove();
                };
            }
        }

        footer.querySelector('#httRewriteCancel').onclick = () => overlay.remove();
    }

    function injectRewrittenText(newText) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const activeEl = document.activeElement;

        // Check if we are in a text input or textarea
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            const start = activeEl.selectionStart;
            const end = activeEl.selectionEnd;
            const text = activeEl.value;
            const before = text.substring(0, start);
            const after = text.substring(end);

            activeEl.value = before + newText + after;

            // Dispatch events so the site knows the value changed
            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            activeEl.dispatchEvent(new Event('change', { bubbles: true }));

            // Highlight the new text with the swoosh effect
            activeEl.classList.add('htt-swoosh-inject');
            setTimeout(() => activeEl.classList.remove('htt-swoosh-inject'), 600);

            return;
        }

        // Handle contenteditable or regular page text
        range.deleteContents();

        const span = document.createElement('span');
        span.className = 'htt-swoosh-inject';
        span.textContent = newText;

        range.insertNode(span);

        // Remove the span after animation but keep text
        setTimeout(() => {
            const textNode = document.createTextNode(newText);
            span.parentNode.replaceChild(textNode, span);
        }, 500);

        selection.removeAllRanges();
    }

})();
