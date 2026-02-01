/**
 * Intents - Background Service Worker
 * Creates context menus and handles storage for Hold That Thought and Intent Mode
 */

// Function to create all context menus
function createContextMenus() {
    // Clear existing menus first
    chrome.contextMenus.removeAll(() => {
        // Side Panel
        chrome.contextMenus.create({
            id: 'open-side-panel',
            title: '📂 Open Research Side Panel',
            contexts: ['all']
        });

        // Hold That Thought menu (for selected text)
        chrome.contextMenus.create({
            id: 'hold-that-thought',
            title: '💭 Hold That Thought',
            contexts: ['selection']
        });

        // Single Intent Mode option (uses 'read' mode by default)
        chrome.contextMenus.create({
            id: 'intent-mode',
            title: '🧠 Intent Mode',
            contexts: ['page']
        });

        // Footsteps
        chrome.contextMenus.create({
            id: 'footsteps',
            title: '👣 Footsteps Trail',
            contexts: ['page']
        });

        // Isolate Mode
        chrome.contextMenus.create({
            id: 'isolate-text',
            title: '🔍 Isolate this section',
            contexts: ['selection']
        });
    });
}

// Create context menus on install only (prevents duplicate ID errors)
chrome.runtime.onInstalled.addListener(() => {
    createContextMenus();
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Skip chrome:// and other restricted pages
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
    }

    // Handle Side Panel
    if (info.menuItemId === 'open-side-panel') {
        chrome.sidePanel.open({ tabId: tab.id });
        return;
    }

    // Handle Hold That Thought
    if (info.menuItemId === 'hold-that-thought' && info.selectionText) {
        try {
            // Try to send message first
            await chrome.tabs.sendMessage(tab.id, {
                action: 'showThoughtPopup',
                selectedText: info.selectionText,
                pageTitle: tab.title,
                pageUrl: tab.url
            });
        } catch (error) {
            // Content script not injected - inject it now
            try {
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['thought-popup.css']
                });
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait a bit for script to load, then send message
                setTimeout(async () => {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'showThoughtPopup',
                            selectedText: info.selectionText,
                            pageTitle: tab.title,
                            pageUrl: tab.url
                        });
                    } catch (e) {
                        console.log('Failed to show popup after injection:', e);
                    }
                }, 100);
            } catch (injectError) {
                console.log('Cannot inject into this page:', injectError);
            }
        }
        return;
    }

    // Handle Isolate
    if (info.menuItemId === 'isolate-text') {
        sendMessageOrInject(tab, { action: 'triggerIsolate' }, ['intent-mode.css'], ['intent-mode.js']);
        return;
    }

    // Handle Intent Mode (single option, defaults to 'read')
    if (info.menuItemId === 'intent-mode') {
        sendMessageOrInject(tab, {
            action: 'activateIntentMode',
            intent: 'read'
        }, ['intent-mode.css'], ['intent-mode.js']);
        return;
    }

    // Handle Footsteps
    if (info.menuItemId === 'footsteps') {
        sendMessageOrInject(tab, { action: 'showFootstepsPanel' }, ['thought-popup.css'], ['content.js']);
    }
});

// Helper for injection
async function sendMessageOrInject(tab, message, cssFiles, jsFiles) {
    try {
        await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
        try {
            if (cssFiles && cssFiles.length) {
                await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: cssFiles });
            }
            if (jsFiles && jsFiles.length) {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: jsFiles });
            }
            setTimeout(async () => {
                try {
                    await chrome.tabs.sendMessage(tab.id, message);
                } catch (e) {
                    console.log('Failed after injection:', e);
                }
            }, 150);
        } catch (injectError) {
            console.log('Injection failed:', injectError);
        }
    }
}

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

    if (command === 'hold-that-thought') {
        sendMessageOrInject(tab, { action: 'triggerHoldThought' }, ['thought-popup.css'], ['content.js']);
    }

    if (command === 'ping-me') {
        sendMessageOrInject(tab, { action: 'showPingBar' }, ['thought-popup.css'], ['content.js']);
    }

    if (command === 'footsteps') {
        sendMessageOrInject(tab, { action: 'showFootstepsPanel' }, ['thought-popup.css'], ['content.js']);
    }
});

// Handle save thought from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveThought') {
        saveThought(request.thought).then(() => {
            sendResponse({ success: true });
        }).catch((err) => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response
    }

    if (request.action === 'getThoughts') {
        getThoughts().then((thoughts) => {
            sendResponse({ thoughts });
        });
        return true;
    }

    if (request.action === 'deleteThought') {
        deleteThought(request.id).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'createPing') {
        saveThought({ ...request.thought, isPing: true }).then((savedThought) => {
            if (request.minutes) {
                chrome.alarms.create(`ping_${savedThought.id}`, { delayInMinutes: parseFloat(request.minutes) });
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'mergeThoughts') {
        mergeThoughts(request.thoughtIds).then((result) => {
            sendResponse(result);
        });
        return true;
    }

    if (request.action === 'askAI') {
        const context = request.context || '';

        if (request.includeHistory) {
            chrome.storage.local.get(['footsteps'], (result) => {
                const footsteps = result.footsteps || [];
                // Increase to 25 as requested, within the last hour
                const oneHourAgo = Date.now() - (60 * 60 * 1000);

                const historyList = footsteps
                    .filter(f => f.timestamp > oneHourAgo)
                    .slice(0, 25)
                    .map((f, i) => `${i + 1}. [${f.title}] from ${f.domain}. Snippet: ${f.snippet || 'No intro available'}. URL: ${f.url}`)
                    .join('\n');

                const rankingContext = `[USER RECENT BROWSING HISTORY (Last 25 Sites)]:\n${historyList}\n\n[TASK]: Rank these websites based on their relevance to the user's query. If a specific site is highly likely to contain the answer, prioritize its URL.`;

                const enhancedContext = context
                    ? `${context}\n\n${rankingContext}`
                    : rankingContext;

                handleAIRequest(request.prompt, enhancedContext, sendResponse);
            });
        } else {
            handleAIRequest(request.prompt, context, sendResponse);
        }
        return true;
    }

    if (request.action === 'checkAIKey') {
        chrome.storage.local.get(['openaiKey'], (result) => {
            sendResponse({ hasKey: !!result.openaiKey });
        });
        return true;
    }

    if (request.action === 'saveAIKey') {
        chrome.storage.local.set({ openaiKey: request.key }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'saveIntentsSearchKey') {
        chrome.storage.local.set({ intentsSearchKey: request.key }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'organizeTabs') {
        handleTabShepherd(sendResponse);
        return true;
    }

    if (request.action === 'intentsSearchAI') {
        handleIntentsSearchAI(request.query, sendResponse);
        return true;
    }

    if (request.action === 'fetchLyrics') {
        fetchLyricsFromOVH(request.artist, request.title, sendResponse);
        return true;
    }

    if (request.action === 'openInIntentMode') {
        // Open the URL in a new tab and activate Intent Mode
        chrome.tabs.create({ url: request.url }, async (tab) => {
            // Wait for page to load, then inject Intent Mode
            const onUpdated = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdated);

                    // Inject Intent Mode CSS and JS
                    chrome.scripting.insertCSS({
                        target: { tabId: tab.id },
                        files: ['intent-mode.css']
                    }).then(() => {
                        return chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['intent-mode.js']
                        });
                    }).then(() => {
                        // Activate Intent Mode with saved scroll position
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tab.id, {
                                action: 'activateIntentMode',
                                intent: 'read',
                                scrollTop: request.scrollTop
                            });
                        }, 300);
                    }).catch(err => console.log('Intent Mode injection error:', err));
                }
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
        });
        sendResponse({ success: true });
        return true;
    }

    // Footsteps actions
    if (request.action === 'getFootsteps') {
        getFootsteps().then(footsteps => {
            sendResponse({ footsteps });
        });
        return true;
    }

    if (request.action === 'clearFootsteps') {
        clearFootsteps().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'navigateToFootstep') {
        chrome.tabs.update({ url: request.url });
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'updateSnippet') {
        updateFootstepSnippet(sender.tab.url, request.snippet);
        sendResponse({ success: true });
        return true;
    }
});

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('ping_')) {
        const thoughtId = alarm.name.replace('ping_', '');

        getThoughts().then(thoughts => {
            const thought = thoughts.find(t => t.id === thoughtId);
            if (thought) {
                // 1. Delete the thought (it's done)
                deleteThought(thoughtId);

                // 2. Trigger Custom Friendly UI on active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) {
                        sendMessageOrInject(tabs[0], {
                            action: 'triggerPingNotification',
                            thought: thought
                        }, ['thought-popup.css'], ['content.js']);
                    }
                });
            }
        });
    }
});

chrome.notifications.onButtonClicked.addListener(() => {
    chrome.tabs.create({ url: 'index.html' });
});

// Save thought to storage
async function saveThought(thought) {
    const result = await chrome.storage.local.get(['thoughts']);
    const thoughts = result.thoughts || [];
    const newThought = {
        ...thought,
        id: Date.now().toString(),
        timestamp: new Date().toISOString()
    };
    thoughts.unshift(newThought);
    // Keep only last 100 thoughts
    await chrome.storage.local.set({ thoughts: thoughts.slice(0, 100) });
    return newThought;
}

// Get all thoughts
async function getThoughts() {
    const result = await chrome.storage.local.get(['thoughts']);
    return result.thoughts || [];
}

// Delete a thought
async function deleteThought(id) {
    const result = await chrome.storage.local.get(['thoughts']);
    const thoughts = (result.thoughts || []).filter(t => t.id !== id);
    await chrome.storage.local.set({ thoughts });
}

// Merge thoughts
async function mergeThoughts(thoughtIds) {
    const result = await chrome.storage.local.get(['thoughts']);
    const all = result.thoughts || [];
    const toMerge = all.filter(t => thoughtIds.includes(t.id));

    if (toMerge.length < 2) return { success: false, error: 'Not enough thoughts to merge' };

    // Sort old -> new
    toMerge.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const newest = toMerge[toMerge.length - 1]; // Use newest metadata
    const combinedText = toMerge.map(t => t.text).join('\n\n');

    // Combine context properly
    const uniqueContexts = [...new Set(toMerge.map(t => t.context).filter(c => c))];
    const combinedContext = uniqueContexts.join('\n---\n');

    // Combine tags
    const uniqueTags = [...new Set(toMerge.map(t => t.tag))];
    const combinedTag = uniqueTags.join(', ');

    const merged = {
        ...newest,
        text: combinedText,
        context: combinedContext,
        tag: combinedTag,
        id: Date.now().toString(),
        timestamp: new Date().toISOString()
    };

    const remaining = all.filter(t => !thoughtIds.includes(t.id));
    // Put merged at the top (newest)
    const final = [merged, ...remaining];

    await chrome.storage.local.set({ thoughts: final });
    return { success: true };
}

// ===== MULTI-PROVIDER AI HANDLER =====
async function handleIntentsSearchAI(query, sendResponse) {
    try {
        const settings = await chrome.storage.local.get(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey']);
        const provider = settings.aiProvider || 'openai';

        switch (provider) {
            case 'gemini':
                if (!settings.geminiKey) return sendResponse({ error: 'Gemini API Key missing' });
                await callGemini(query, settings.geminiKey, sendResponse, SYSTEM_PROMPT);
                break;
            case 'grok':
                if (!settings.grokKey) return sendResponse({ error: 'Grok API Key missing' });
                await callGrok(query, settings.grokKey, sendResponse, SYSTEM_PROMPT);
                break;
            case 'llama':
                if (!settings.llamaKey) return sendResponse({ error: 'Llama API Key missing' });
                await callLlama(query, settings.llamaKey, sendResponse, SYSTEM_PROMPT);
                break;
            case 'openai':
            default:
                if (!settings.openaiKey) return sendResponse({ error: 'OpenAI API Key missing' });
                await callOpenAI(query, settings.openaiKey, sendResponse, SYSTEM_PROMPT);
                break;
        }
    } catch (error) {
        sendResponse({ error: 'AI Request Failed: ' + error.message });
    }
}

// --- Universal AI Caller Helper ---
async function callAI(query, systemPrompt) {
    const settings = await chrome.storage.local.get(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey']);
    const provider = settings.aiProvider || 'openai';

    return new Promise((resolve) => {
        const wrapper = (result) => resolve(result); // Wrap sendResponse style

        switch (provider) {
            case 'gemini':
                if (!settings.geminiKey) return resolve({ error: 'Gemini API Key missing' });
                callGemini(query, settings.geminiKey, wrapper, systemPrompt);
                break;
            case 'grok':
                if (!settings.grokKey) return resolve({ error: 'Grok API Key missing' });
                callGrok(query, settings.grokKey, wrapper, systemPrompt);
                break;
            case 'llama':
                if (!settings.llamaKey) return resolve({ error: 'Llama API Key missing' });
                callLlama(query, settings.llamaKey, wrapper, systemPrompt);
                break;
            case 'openai':
            default:
                if (!settings.openaiKey) return resolve({ error: 'OpenAI API Key missing' });
                callOpenAI(query, settings.openaiKey, wrapper, systemPrompt);
                break;
        }
    });
}

const SYSTEM_PROMPT = `You are a high-level research assistant.
1. Provide a comprehensive yet concise synthesis (max 180 words).
2. Use professional, clear language.
3. Suggest 3-4 distinct, high-quality resources.
4. Format response STRICTLY as JSON: {"summary": "...", "links": [{"title": "...", "url": "..."}, ...]}
5. IF the user is specifically asking for song lyrics, ADD "song_info": {"artist": "Exact Artist", "title": "Exact Title"} to the JSON.`;

// --- OpenAI Handler ---
async function callOpenAI(query, key, sendResponse, systemPrompt = SYSTEM_PROMPT) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                max_tokens: 600,
                temperature: 0.7
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        await processAIResponse(data.choices[0].message.content, sendResponse);
    } catch (e) { sendResponse({ error: e.message }); }
}

// --- Gemini Handler (Google AI Studio) ---
async function callGemini(query, key, sendResponse, systemPrompt = SYSTEM_PROMPT) {
    try {
        // Maps to gemini-1.5-flash (User requested "Gemini 2.5 Flash")
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\nUser Query: ${query}`
                    }] // System instructions are often better as part of the prompt in REST API
                }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const content = data.candidates[0].content.parts[0].text;
        await processAIResponse(content, sendResponse);
    } catch (e) { sendResponse({ error: e.message }); }
}

// --- Grok Handler (xAI via OpenAI-compatible endpoint) ---
async function callGrok(query, key, sendResponse, systemPrompt = SYSTEM_PROMPT) {
    try {
        // Maps to grok-beta (User requested "Grok 4.1")
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'grok-beta',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                max_tokens: 600,
                temperature: 0.7
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        await processAIResponse(data.choices[0].message.content, sendResponse);
    } catch (e) { sendResponse({ error: e.message }); }
}

// --- Llama Handler (via Groq) ---
async function callLlama(query, key, sendResponse, systemPrompt = SYSTEM_PROMPT) {
    try {
        // Maps to llama-3.1-70b-versatile (User requested "Llama 4 Maverick")
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.1-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                max_tokens: 600,
                temperature: 0.7
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        await processAIResponse(data.choices[0].message.content, sendResponse);
    } catch (e) { sendResponse({ error: e.message }); }
}


// --- Helper: Parse JSON Response & Handle Intent ---
async function processAIResponse(content, sendResponse) {
    let finalSummary = content;
    let finalLinks = [];
    let songInfo = null;
    let navAction = null;
    let navUrl = null;

    try {
        // Robust extraction: Find the first '{' and the last '}'
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            if (parsed.summary) finalSummary = parsed.summary;
            if (Array.isArray(parsed.links)) finalLinks = parsed.links;
            if (parsed.song_info) songInfo = parsed.song_info;
            // Navigation fields
            if (parsed.action) navAction = parsed.action;
            if (parsed.url) navUrl = parsed.url;
            if (parsed.query) finalSummary = parsed.query; // If generic search, use query as summary (hacky but works for return text)
        } else {
            // Logic to strip markdown if no JSON found, just in case
            finalSummary = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        }
    } catch (e) {
        // Fallback: use raw content as summary
        console.warn('Intents: JSON parse failed, utilizing raw output', e);
        finalSummary = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    }

    sendResponse({
        success: true,
        summary: finalSummary,
        links: finalLinks,
        song_info: songInfo,
        action: navAction,
        url: navUrl
    });
}



// --- Fetch Lyrics ---
async function fetchLyricsFromOVH(artist, title, sendResponse) {
    try {
        // Switch to Lrclib.net (more reliable)
        // Endpoint: https://lrclib.net/api/get?artist_name=...&track_name=...
        const lyricsUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(lyricsUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text();
                console.warn('Lyrics fetch non-200:', response.status, text);
                sendResponse({ success: false, error: `API Error: ${response.status}` });
                return;
            }

            const data = await response.json();
            // Lrclib returns 'plainLyrics' or 'syncedLyrics'
            if (data.plainLyrics) {
                sendResponse({ success: true, lyrics: data.plainLyrics });
            } else {
                sendResponse({ success: false, error: 'Lyrics not found in database.' });
            }
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                sendResponse({ success: false, error: 'Request timed out' });
            } else {
                throw fetchError;
            }
        }
    } catch (e) {
        console.error('Lyrics fetch failed:', e);
        sendResponse({ success: false, error: 'Network/Parsing error' });
    }
}

// ============================================
// FOOTSTEPS - Browsing Trail Tracker
// ============================================

// Track navigation for footsteps
chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Only track main frame navigations (not iframes)
    if (details.frameId !== 0) return;

    // Skip chrome:// and extension pages
    if (details.url.startsWith('chrome://') ||
        details.url.startsWith('chrome-extension://') ||
        details.url.startsWith('about:') ||
        details.url === 'about:blank') return;

    // 1. Handle Automatic Dark Mode (Injection if granted)
    const settings = await chrome.storage.local.get(['forceDarkMode']);
    if (settings.forceDarkMode) {
        // We attempt to inject. If we don't have permission for this site, it will fail silently.
        try {
            await chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                files: ['content.js']
            });
        } catch (e) {
            // Silently fail if no permission for this host
        }
    }

    // 2. Get tab info for title (Footsteps)
    try {
        const tab = await chrome.tabs.get(details.tabId);
        await addFootstep({
            url: details.url,
            title: tab.title || new URL(details.url).hostname,
            tabId: details.tabId,
            timestamp: Date.now(),
            transitionType: details.transitionType
        });
    } catch (e) {
        console.log('Footsteps: Could not get tab info', e);
    }
});

// Scrape page context on completion for smarter history
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (details.url.startsWith('chrome') || details.url.startsWith('about')) return;

    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            func: () => {
                const title = document.title;
                const desc = document.querySelector('meta[name="description"]')?.content;
                const h1 = document.querySelector('h1')?.innerText;
                // Combine into a clean one-liner
                const parts = [title];
                if (desc) parts.push(desc);
                else if (h1) parts.push(h1);
                return parts.join(' - ').substring(0, 300); // 300 char limit
            }
        });

        if (result && result.result) {
            updateFootstepSnippet(details.url, result.result);
        }
    } catch (e) {
        // Ignore script errors
    }
});

// Update title when page finishes loading (titles are often empty on commit)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.title && tab.url) {
        await updateFootstepTitle(tab.url, changeInfo.title);
    }
});

// Add a footstep to the trail
async function addFootstep(footstep) {
    const result = await chrome.storage.local.get(['footsteps']);
    let footsteps = result.footsteps || [];

    // Don't add duplicate consecutive URLs
    if (footsteps.length > 0 && footsteps[0].url === footstep.url) {
        return;
    }

    // Add to front (newest first)
    footsteps.unshift({
        id: Date.now().toString(),
        url: footstep.url,
        title: footstep.title,
        domain: extractDomain(footstep.url),
        favicon: `https://www.google.com/s2/favicons?domain=${extractDomain(footstep.url)}&sz=32`,
        timestamp: footstep.timestamp,
        transitionType: footstep.transitionType
    });

    // Keep only last 50 footsteps
    footsteps = footsteps.slice(0, 50);

    await chrome.storage.local.set({ footsteps });
}

// Update footstep title
async function updateFootstepTitle(url, title) {
    const result = await chrome.storage.local.get(['footsteps']);
    let footsteps = result.footsteps || [];

    const footstep = footsteps.find(f => f.url === url);
    if (footstep && (!footstep.title || footstep.title === extractDomain(url))) {
        footstep.title = title;
        await chrome.storage.local.set({ footsteps });
    }
}

// Update footstep with semantic snippet
async function updateFootstepSnippet(url, snippet) {
    const result = await chrome.storage.local.get(['footsteps']);
    let footsteps = result.footsteps || [];

    const footstep = footsteps.find(f => f.url === url);
    if (footstep && snippet) {
        footstep.snippet = snippet.substring(0, 200); // Keep it small
        await chrome.storage.local.set({ footsteps });
    }
}

// Extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url;
    }
}

// Get footsteps
async function getFootsteps() {
    const result = await chrome.storage.local.get(['footsteps']);
    return result.footsteps || [];
}

// Clear footsteps
async function clearFootsteps() {
    await chrome.storage.local.set({ footsteps: [] });
}




// ============================================
// OFFLINE ZEN MODE - Redirect to calm game
// ============================================

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
    // Only handle main frame errors
    if (details.frameId !== 0) return;

    // Check for internet disconnected error
    if (details.error === 'net::ERR_INTERNET_DISCONNECTED') {
        const settings = await chrome.storage.local.get(['offlineGame']);

        if (settings.offlineGame) {
            // Redirect to our custom offline page
            chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL('offline.html')
            });
        }
    }
});

// ============================================
// OMNIBOX - Quick Search for Thoughts/Trail
// ============================================

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const thoughts = await getThoughts();
    const footsteps = await getFootsteps();

    const suggestions = [];

    // Filter thoughts
    const filteredThoughts = (thoughts || []).filter(t =>
        t && t.text && t.text.toLowerCase().includes(text.toLowerCase())
    ).slice(0, 4);

    filteredThoughts.forEach(t => {
        const textSnippet = (t.text || '').substring(0, 30).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        suggestions.push({
            content: `thought:${t.id}`,
            description: `<dim>💭 Thought:</dim> <match>${textSnippet}...</match> ${t.tag ? `[<url>${t.tag}</url>]` : ''}`
        });
    });

    // Filter footsteps
    const filteredSteps = (footsteps || []).filter(f =>
        f && f.title && f.title.toLowerCase().includes(text.toLowerCase())
    ).slice(0, 4);

    filteredSteps.forEach(f => {
        const titleSnippet = (f.title || '').substring(0, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        suggestions.push({
            content: f.url,
            description: `<dim>👣 Trail:</dim> <match>${titleSnippet}</match> — <url>${f.domain}</url>`
        });
    });

    suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
    // Get the current active tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (text.startsWith('thought:')) {
        const thoughtId = text.replace('thought:', '');
        chrome.tabs.update(currentTab.id, { url: `index.html?thought=${thoughtId}` });
    } else if (text.startsWith('http')) {
        chrome.tabs.update(currentTab.id, { url: text });
    } else {
        // Open Intents Search in same tab
        // NEW: Check for Natural Language Navigation (Context Aware)
        // Heuristic: Check if user is asking to "go", "take me", "history", "last site"
        const lowerText = text.toLowerCase();
        const navTriggers = ['go to', 'take me', 'bring me', 'back to', 'last site', 'was in', 'closed', 'history', 'yesterday', 'earlier'];

        const isNavRequest = navTriggers.some(trigger => lowerText.includes(trigger));

        if (isNavRequest) {
            // Context Aware Navigation
            await handleOmniboxNav(text, currentTab.id);
        } else {
            // Standard Search
            chrome.tabs.update(currentTab.id, { url: `index.html?intentsSearch=${encodeURIComponent(text)}` });
        }
    }
});

async function handleOmniboxNav(query, tabId) {
    const footsteps = await getFootsteps();
    const historyContext = footsteps.slice(0, 15).map((f, i) =>
        `${i + 1}. [${f.title}] (${f.url}) - Context: ${f.snippet || 'Visited recently'}`
    ).join('\n');

    const NAV_SYSTEM_PROMPT = `You are a browser navigation assistant. 
1. Analyze the USER QUERY and the BROWSING HISTORY.
2. If the user wants to go to a specific website from history, return the URL.
3. If the user wants to search, return the query.
4. JSON Output STRICTLY: {"action": "navigate", "url": "..."} OR {"action": "search", "query": "..."}`;

    const prompt = `[HISTORY]:\n${historyContext}\n\n[USER QUERY]: ${query}`;

    // Show loading state (optional, or just wait)

    // Call AI
    const result = await callAI(prompt, NAV_SYSTEM_PROMPT);

    if (result && result.success && result.action === 'navigate' && result.url) {
        chrome.tabs.create({ url: result.url });
    } else {
        // Fallback to search
        const searchQuery = (result && result.success && result.action === 'search' && result.summary)
            ? result.summary
            : query; // fallback to original query

        chrome.tabs.update(tabId, { url: `index.html?intentsSearch=${encodeURIComponent(searchQuery)}` });
    }
}

// Enable side panel on action click
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));


// ============================================
// TAB SHEPHERD - AI Tab Organizer
// ============================================

async function handleTabShepherd(sendResponse) {
    try {
        const tabs = await chrome.tabs.query({ currentWindow: true });

        // Filter out irrelevant tabs
        const validTabs = tabs.filter(t =>
            !t.url.startsWith('chrome://') &&
            !t.url.startsWith('chrome-extension://') &&
            t.title
        ).map(t => ({
            id: t.id,
            title: t.title,
            url: t.url
        }));

        if (validTabs.length < 3) {
            return sendResponse({ success: false, error: 'Not enough tabs to organize (need 3+).' });
        }

        const tabsList = validTabs.map(t => `ID: ${t.id} | Title: ${t.title} | URL: ${t.url}`).join('\n');

        const systemPrompt = `You are an expert browser tab organizer.
1. Group these tabs into logical, thematic clusters (e.g., 'Research', 'Social', 'Development', 'News').
2. Return a JSON object with a 'groups' array.
3. Each item in 'groups' must have: 'title' (string) and 'ids' (array of tab integers).
4. Ignore tabs that don't fit well.
5. JSON STRICTLY: {'groups': [{'title': 'Work', 'ids': [101, 102]}]}`;

        const userContent = `[Tabs to Organize]:\n${tabsList}`;

        // Call AI
        const response = await callShepherdAI(userContent, systemPrompt);

        if (response.groups && Array.isArray(response.groups)) {
            // Find ungrouped tabs
            const allTabIds = new Set(validTabs.map(t => t.id));
            const groupedTabIds = new Set();

            response.groups.forEach(g => {
                if (g.ids) g.ids.forEach(id => groupedTabIds.add(id));
            });

            const ungroupedIds = [...allTabIds].filter(id => !groupedTabIds.has(id));

            if (ungroupedIds.length > 0) {
                response.groups.push({
                    title: 'Others',
                    ids: ungroupedIds
                });
            }

            await performTabGrouping(response.groups);
            sendResponse({ success: true, groups: response.groups });
        } else {
            sendResponse({ success: false, error: 'AI failed to group tabs.' });
        }

    } catch (e) {
        console.error('Tab Shepherd Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}

async function performTabGrouping(groups) {
    for (const group of groups) {
        if (!group.ids || group.ids.length === 0) continue;
        try {
            const groupId = await chrome.tabs.group({ tabIds: group.ids });
            await chrome.tabGroups.update(groupId, {
                title: group.title,
                collapsed: false
            });
        } catch (e) {
            console.warn('Failed to group tabs:', group.title, e);
        }
    }
}

async function callShepherdAI(query, systemPrompt) {
    const settings = await chrome.storage.local.get(['aiProvider', 'openaiKey', 'geminiKey', 'grokKey', 'llamaKey']);
    const provider = settings.aiProvider || 'openai';
    let content = '';

    if (provider === 'gemini' && settings.geminiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n${query}` }] }]
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        content = data.candidates[0].content.parts[0].text;
    }
    else {
        // Default to OpenAI
        const key = settings.openaiKey;
        if (!key) throw new Error('OpenAI Key missing');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                max_tokens: 1000,
                temperature: 0.3,
                response_format: { type: 'json_object' }
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        content = data.choices[0].message.content;
    }

    try {
        const clean = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        console.error('JSON Parse Error', content);
        throw new Error('Invalid JSON from AI');
    }
}

