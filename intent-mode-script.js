/**
 * Intent Mode - Webpage Reader Transformation
 * Transform any webpage into the best possible version for thinking
 */

// Prevent multiple injections
if (window.__INTENT_MODE_LOADED__) {
    // Already loaded, nothing to do
} else {
    window.__INTENT_MODE_LOADED__ = true;

    // Register message listener ONLY ONCE inside the guard
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'activateIntentMode') {
            if (typeof window.__intentModeActivate__ === 'function') {
                window.__intentModeActivate__(request.intent, null, request.scrollTop);
            }
            sendResponse({ success: true });
        }

        if (request.action === 'triggerIsolate') {
            // Use provided text or get selection more reliably
            const selectionText = request.selectedText || window.getSelection().toString().trim();

            if (selectionText.length > 0) {
                // If it's already isolated, don't re-isolate with the same text
                savedSelection = selectionText;

                // Create a clean format for the selection
                const div = document.createElement('div');
                div.innerHTML = selectionText.split('\n').map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('');

                if (typeof window.__intentModeActivate__ === 'function') {
                    window.__intentModeActivate__('read', div.innerHTML);
                }
            } else {
                // Show notification instead of blocking alert
                const notif = document.createElement('div');
                notif.className = 'intent-notification';
                notif.textContent = 'Select some text to isolate';
                notif.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(30,30,32,0.95);color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;z-index:100000;';
                document.body.appendChild(notif);
                setTimeout(() => notif.remove(), 2000);
            }
            sendResponse({ success: true });
        }
        return true;
    });

    // Intent configurations
    const INTENTS = {
        read: {
            name: 'Read',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
            maxWidth: '720px',
            fontSize: '20px',
            lineHeight: '1.8',
            letterSpacing: '0.01em',
            showToc: false,
            codeEmphasis: false
        },
        learn: {
            name: 'Learn',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/><path d="M4 4h16"/></svg>',
            maxWidth: '700px',
            fontSize: '19px',
            lineHeight: '1.75',
            letterSpacing: '0.01em',
            showToc: true,
            codeEmphasis: false
        },
        fix: {
            name: 'Fix',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            maxWidth: '800px',
            fontSize: '18px',
            lineHeight: '1.7',
            letterSpacing: '0',
            showToc: true,
            codeEmphasis: true
        },
        study: {
            name: 'Study',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5"/><path d="M14 2v6h6"/><path d="M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l1-3.95 5.42-5.44Z"/></svg>',
            maxWidth: '680px',
            fontSize: '18px',
            lineHeight: '1.75',
            letterSpacing: '0.01em',
            showToc: true,
            codeEmphasis: false
        },
        reflect: {
            name: 'Reflect',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m14 18-3-3 3-3"/><path d="M10 18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4"/><path d="m20 20-3-3"/></svg>',
            maxWidth: '600px',
            fontSize: '21px',
            lineHeight: '1.9',
            letterSpacing: '0.02em',
            showToc: false,
            codeEmphasis: false
        }
    };

    // State
    let currentIntent = null;
    let readerActive = false;
    let fontSizeOffset = 0;
    let currentSelection = '';
    let savedSelection = '';
    let selectionRect = null;
    let hiddenElements = new Map();
    let currentExtractedData = null; // Store for refreshing without reload

    // Feature Toggles (Module Level)
    let vocabSimplifierEnabled = false;
    let conceptSimplifierEnabled = false;
    let bionicEnabled = false;
    let goldenThreadEnabled = false;

    // Application Flags
    let vocabSimplifierApplied = false;
    let conceptSimplifierApplied = false;

    // Caches
    const vocabCache = new Map();
    const conceptCache = new Map();

    // Hold That Thought constants
    const HTT_COLORS = [
        { name: 'Yellow', value: '#fef08a' },
        { name: 'Green', value: '#bbf7d0' },
        { name: 'Blue', value: '#bfdbfe' },
        { name: 'Purple', value: '#ddd6fe' },
        { name: 'Pink', value: '#fbcfe8' },
        { name: 'Orange', value: '#fed7aa' }
    ];

    const HTT_TAGS = ['📚 Read Later', '💡 Idea', '📝 Note', '⭐ Important', '🔗 Reference', '❓ Question'];

    /**
     * Main activation function
     */
    /**
     * Main activation function
     */
    function activateIntentMode(intent, contentOverride = null, resumeScrollTop = null) {
        if (readerActive) {
            // Update intent if already active (ignoring contentOverride in update for simplicity)
            const oldIntent = currentIntent;
            currentIntent = INTENTS[intent] || INTENTS.read;

            // Just update CSS variables if container exists
            const container = document.getElementById('intentModeContainer');
            if (container) {
                const baseFontSize = parseInt(currentIntent.fontSize);
                container.dataset.intent = currentIntent.name.toLowerCase();
                container.style.setProperty('--intent-max-width', currentIntent.maxWidth);
                container.style.setProperty('--intent-line-height', currentIntent.lineHeight);
                container.style.setProperty('--intent-letter-spacing', currentIntent.letterSpacing);
                container.style.setProperty('--intent-font-size', `${baseFontSize + fontSizeOffset}px`);

                // Update badge
                const badge = container.querySelector('.intent-badge');
                if (badge) badge.textContent = `${currentIntent.icon} ${currentIntent.name} Mode`;

                return;
            }
        }

        currentIntent = INTENTS[intent] || INTENTS.read;

        // Extract main content or use override
        let extracted;
        if (contentOverride) {
            // Create temp container to analyze content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentOverride;
            const wCount = countWords(tempDiv);

            extracted = {
                title: 'Isolated Selection',
                content: contentOverride,
                byline: 'Selected Text',
                url: window.location.href,
                wordCount: wCount,
                readingTime: Math.ceil(wCount / 200),
                headings: extractHeadings(tempDiv),
                siteName: document.domain,
                publishDate: new Date().toLocaleDateString()
            };
        } else {
            extracted = extractContent();
        }

        currentExtractedData = extracted; // Save state

        if (!extracted || !extracted.content || extracted.content.trim().length < 50) {
            if (!contentOverride) showNotification('Could not extract content from this page.');
            // For isolate, we might persist even if short?
            // If it's override, we respect it.
            if (contentOverride) { /* allow */ } else { return; }
        }

        // Hide original page content (non-destructive)
        hideOriginalContent();

        // Build and inject reader view
        buildReaderView(extracted, !!contentOverride);
        readerActive = true;

        // Resume scroll position if provided (from Continue Reading shelf)
        if (resumeScrollTop && resumeScrollTop > 0) {
            setTimeout(() => {
                window.scrollTo({ top: resumeScrollTop, behavior: 'auto' });
            }, 100);
        }
    }

    /**
     * Deactivate and restore original page
     */
    function deactivateIntentMode() {
        if (!readerActive) return;

        // Remove reader view
        const container = document.getElementById('intentModeContainer');
        if (container) {
            container.remove();
        }

        // Remove style
        document.body.classList.remove('intent-mode-active');

        // Restore original content visibility
        restoreOriginalContent();

        readerActive = false;
        currentIntent = null;
        fontSizeOffset = 0;
        currentExtractedData = null;
        vocabSimplifierApplied = false;
        conceptSimplifierApplied = false;

        // Remove event listeners
        document.removeEventListener('keydown', handleKeyboard);
        document.removeEventListener('mouseup', handleTextSelection);
    }

    /**
     * Hide original page content
     */
    function hideOriginalContent() {
        hiddenElements.clear();
        Array.from(document.body.children).forEach(child => {
            if (child.id !== 'intentModeContainer' && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
                hiddenElements.set(child, child.style.display);
                child.style.setProperty('display', 'none', 'important');
            }
        });
    }

    /**
     * Restore original page content
     */
    function restoreOriginalContent() {
        hiddenElements.forEach((originalDisplay, element) => {
            if (element && element.style) {
                if (originalDisplay) {
                    element.style.display = originalDisplay;
                } else {
                    element.style.removeProperty('display');
                }
            }
        });
        hiddenElements.clear();
    }

    /**
     * Content extraction - finds and extracts the main readable content
     */
    function extractContent() {
        // Try semantic containers first
        const candidates = [
            document.querySelector('article'),
            document.querySelector('[role="main"]'),
            document.querySelector('main'),
            document.querySelector('.post-content'),
            document.querySelector('.article-content'),
            document.querySelector('.entry-content'),
            document.querySelector('.content'),
            document.querySelector('#content'),
            document.querySelector('.post'),
            document.querySelector('.article')
        ].filter(Boolean);

        let mainElement = null;
        let highestScore = 0;

        // Score each candidate
        for (const candidate of candidates) {
            const score = scoreElement(candidate);
            if (score > highestScore) {
                highestScore = score;
                mainElement = candidate;
            }
        }

        // Fallback: find highest scoring div/section
        if (!mainElement || highestScore < 50) {
            const allContainers = document.querySelectorAll('div, section');
            for (const el of allContainers) {
                const score = scoreElement(el);
                if (score > highestScore) {
                    highestScore = score;
                    mainElement = el;
                }
            }
        }

        if (!mainElement) {
            // Final fallback: Use the body itself if mostly text
            // Clone body but remove scripts/styles first to avoid noise
            const bodyClone = document.body.cloneNode(true);
            cleanContent(bodyClone); // Basic cleaning
            if (bodyClone.textContent.trim().length > 100) {
                mainElement = document.body; // Use real body as source
            } else {
                return null;
            }
        }

        // Extract metadata
        const title = extractTitle();
        const siteName = extractSiteName();
        const publishDate = extractDate();
        const author = extractAuthor();

        // Extract and clean content
        const content = cleanContent(mainElement.cloneNode(true));
        const headings = extractHeadings(content);
        const wordCount = countWords(content);
        const readingTime = Math.ceil(wordCount / 200); // ~200 wpm average

        return {
            title,
            siteName,
            publishDate,
            author,
            content: content.innerHTML,
            headings,
            wordCount,
            readingTime,
            url: window.location.href
        };
    }

    /**
     * Score an element for content likelihood
     */
    function scoreElement(el) {
        if (!el) return 0;

        let score = 0;
        const text = el.textContent || '';
        const textLength = text.length;

        // Text length bonus
        score += Math.min(textLength / 100, 50);

        // Paragraph count bonus
        const paragraphs = el.querySelectorAll('p');
        score += paragraphs.length * 3;

        // Heading presence bonus
        const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
        score += headings.length * 5;

        // Link density penalty (too many links = navigation)
        const links = el.querySelectorAll('a');
        const linkText = Array.from(links).reduce((sum, a) => sum + (a.textContent || '').length, 0);
        const linkDensity = textLength > 0 ? linkText / textLength : 1;
        score -= linkDensity * 50;

        // Negative indicators
        const classList = el.className.toLowerCase();
        const id = (el.id || '').toLowerCase();

        const negativePatterns = ['nav', 'sidebar', 'footer', 'header', 'menu', 'comment', 'social', 'share', 'ad', 'promo', 'related', 'recommended'];
        for (const pattern of negativePatterns) {
            if (classList.includes(pattern) || id.includes(pattern)) {
                score -= 30;
            }
        }

        // Positive indicators
        const positivePatterns = ['article', 'content', 'post', 'entry', 'story', 'body', 'text'];
        for (const pattern of positivePatterns) {
            if (classList.includes(pattern) || id.includes(pattern)) {
                score += 20;
            }
        }

        return score;
    }

    /**
     * Clean content of unwanted elements
     */
    function cleanContent(container) {
        // Remove unwanted elements
        const removeSelectors = [
            'script', 'style', 'noscript', 'iframe', 'object', 'embed',
            'nav', 'aside', 'footer', 'header',
            '.ad', '.ads', '.advertisement', '.promo', '.sponsored',
            '.social', '.share', '.sharing', '.social-share',
            '.related', '.recommended', '.suggestions',
            '.comments', '.comment', '#comments',
            '.newsletter', '.subscribe', '.signup',
            '.popup', '.modal', '.overlay',
            '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
            '.sidebar', '#sidebar',
            'form', 'button:not(.code-copy)',
            '.author-bio', '.bio',
            'svg:not(.inline-svg)', // Remove most SVGs except inline ones
            '.hidden', '[hidden]', '[aria-hidden="true"]'
        ];

        removeSelectors.forEach(selector => {
            container.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Clean attributes but preserve essential ones
        const cleanElement = (el) => {
            const allowedAttrs = ['href', 'src', 'alt', 'title', 'class', 'id', 'lang', 'colspan', 'rowspan'];
            const attrs = Array.from(el.attributes);
            attrs.forEach(attr => {
                if (!allowedAttrs.includes(attr.name) && !attr.name.startsWith('data-intent-')) {
                    el.removeAttribute(attr.name);
                }
            });
        };

        container.querySelectorAll('*').forEach(cleanElement);

        // Process images - add loading lazy and constrain
        container.querySelectorAll('img').forEach(img => {
            img.setAttribute('loading', 'lazy');
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
        });

        // Process code blocks
        container.querySelectorAll('pre, code').forEach(code => {
            code.classList.add('intent-code');
        });

        // Remove empty paragraphs
        container.querySelectorAll('p').forEach(p => {
            if (!p.textContent.trim() && !p.querySelector('img')) {
                p.remove();
            }
        });

        return container;
    }

    /**
     * Extract page title
     */
    function extractTitle() {
        return (
            document.querySelector('article h1')?.textContent ||
            document.querySelector('h1.title')?.textContent ||
            document.querySelector('.post-title')?.textContent ||
            document.querySelector('h1')?.textContent ||
            document.querySelector('meta[property="og:title"]')?.content ||
            document.title ||
            'Untitled'
        ).trim();
    }

    /**
     * Extract site name
     */
    function extractSiteName() {
        return (
            document.querySelector('meta[property="og:site_name"]')?.content ||
            document.querySelector('meta[name="application-name"]')?.content ||
            window.location.hostname.replace('www.', '')
        );
    }

    /**
     * Extract publish date
     */
    function extractDate() {
        const dateElement =
            document.querySelector('time[datetime]') ||
            document.querySelector('[class*="date"]') ||
            document.querySelector('[class*="publish"]');

        if (dateElement) {
            const datetime = dateElement.getAttribute('datetime') || dateElement.textContent;
            try {
                const date = new Date(datetime);
                if (!isNaN(date)) {
                    return date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                }
            } catch (e) { }
        }
        return null;
    }

    /**
     * Extract author
     */
    function extractAuthor() {
        return (
            document.querySelector('[rel="author"]')?.textContent ||
            document.querySelector('.author-name')?.textContent ||
            document.querySelector('meta[name="author"]')?.content ||
            document.querySelector('[class*="author"]')?.textContent ||
            null
        )?.trim();
    }

    /**
     * Extract headings for table of contents
     */
    function extractHeadings(container) {
        const headings = [];
        container.querySelectorAll('h1, h2, h3, h4').forEach((h, index) => {
            const text = h.textContent.trim();
            if (text) {
                const id = `intent-heading-${index}`;
                h.id = id;
                headings.push({
                    level: parseInt(h.tagName[1]),
                    text: text.substring(0, 60) + (text.length > 60 ? '...' : ''),
                    id
                });
            }
        });
        return headings;
    }

    /**
     * Count words in content
     */
    function countWords(container) {
        const text = container.textContent || '';
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Build the reader view
     */
    function buildReaderView(extracted, isIsolate = false) {
        const intent = currentIntent;
        const baseFontSize = parseInt(intent.fontSize);
        const adjustedFontSize = baseFontSize + fontSizeOffset;

        // Build TOC HTML if needed
        let tocHtml = '';
        if (intent.showToc && extracted.headings.length > 3) {
            tocHtml = `
            <nav class="intent-toc" id="intentToc">
                <div class="intent-toc-header">
                    <span>Contents</span>
                    <button class="intent-toc-toggle" id="intentTocToggle">−</button>
                </div>
                <ul class="intent-toc-list">
                    ${extracted.headings.map(h => `
                        <li class="intent-toc-item level-${h.level}">
                            <a href="#${h.id}">${escapeHtml(h.text)}</a>
                        </li>
                    `).join('')}
                </ul>
            </nav>
        `;
        }

        // Metadata line
        const metaParts = [];
        if (extracted.siteName) metaParts.push(extracted.siteName);
        if (extracted.author) metaParts.push(extracted.author);
        if (extracted.publishDate) metaParts.push(extracted.publishDate);
        const metaHtml = metaParts.length > 0
            ? `<div class="intent-meta">${metaParts.join(' · ')}</div>`
            : '';

        // Build the reader view
        const readerHtml = `
        <div class="intent-mode-container" id="intentModeContainer" 
             data-intent="${intent.name.toLowerCase()}"
             style="--intent-max-width: ${intent.maxWidth}; 
                    --intent-font-size: ${adjustedFontSize}px; 
                    --intent-line-height: ${intent.lineHeight};
                    --intent-letter-spacing: ${intent.letterSpacing};">
            
            <!-- Progress bar -->
            <div class="intent-progress" id="intentProgress">
                <div class="intent-progress-bar" id="intentProgressBar"></div>
            </div>
            
            <!-- Top bar -->
            <div class="intent-topbar" id="intentTopbar">
                <div class="intent-topbar-left">
                    <span class="intent-badge ${isIsolate ? 'intent-badge-isolate' : ''}">
                        ${isIsolate ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>' : intent.icon} 
                        ${isIsolate ? 'Isolate' : intent.name} Mode
                    </span>
                    <span class="intent-reading-time">${extracted.readingTime} min read</span>
                </div>
                <div class="intent-topbar-right">
                    <button type="button" class="intent-btn intent-btn-ai" id="intentSummarize" title="AI Summarize (TL;DR)">
                        <span class="ai-stars"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/></svg></span> Summarize
                    </button>
                    <button type="button" class="intent-btn intent-btn-icon" id="intentBionic" title="Bionic Reading Mode">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    </button>
                    <button type="button" class="intent-btn intent-btn-icon" id="intentAudio" title="Read Aloud">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                    <button type="button" class="intent-btn intent-btn-ai intent-btn-icon" id="intentFocusSpot" title="AI Focus Spotlight">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                    </button>
                    <button type="button" class="intent-btn intent-btn-icon" id="intentToggleLinks" title="Disable Links">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>
                    <button type="button" class="intent-btn intent-btn-icon" id="intentToggleImages" title="Hide Images">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </button>
                    <button type="button" class="intent-btn intent-btn-icon" id="intentSettingsToggle" title="Typography Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </button>
                    <button type="button" class="intent-btn" id="intentFontDecrease" title="Decrease font size">A−</button>
                    <button type="button" class="intent-btn" id="intentFontIncrease" title="Increase font size">A+</button>
                    <button type="button" class="close-btn-mac" id="intentClose" title="${isIsolate ? 'Exit Isolation' : 'Exit Intent Mode (Esc)'}" style="width: 20px; height: 20px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Typography Settings Panel -->
            <div class="intent-settings-panel" id="intentSettingsPanel">
                <div class="intent-settings-header">
                    <span>Preferences</span>
                    <button type="button" class="close-btn-mac intent-settings-close-mac" id="intentSettingsClose" style="width: 16px; height: 16px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                
                <div class="intent-settings-tabs">
                    <div class="intent-settings-tab active" data-section="reading">Reading</div>
                    <div class="intent-settings-tab" data-section="accessibility">Accessibility</div>
                </div>

                <div class="intent-settings-body">
                    <!-- Reading Section -->
                    <div class="intent-settings-section active" id="section-reading">
                        <div class="intent-setting-group">
                            <label>Theme</label>
                            <div class="intent-theme-options">
                                <button class="intent-theme-btn active" data-theme="dark" title="Dark">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                                </button>
                                <button class="intent-theme-btn" data-theme="light" title="Light">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                                </button>
                                <button class="intent-theme-btn" data-theme="sepia" title="Sepia">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="intent-setting-group">
                            <label>Font</label>
                            <select id="intentFontSelect" class="intent-select">
                                <option value="system">System (Default)</option>
                                <option value="serif">Serif (Georgia)</option>
                                <option value="mono">Monospace</option>
                                <option value="dyslexic">OpenDyslexic</option>
                            </select>
                        </div>
                        <div class="intent-setting-group">
                            <label>Line Height</label>
                            <input type="range" id="intentLineHeight" class="intent-slider" min="1.4" max="2.4" step="0.1" value="${intent.lineHeight}">
                            <span class="intent-slider-value" id="intentLineHeightValue">${intent.lineHeight}</span>
                        </div>
                        <div class="intent-setting-group">
                            <label>Letter Spacing</label>
                            <input type="range" id="intentLetterSpacing" class="intent-slider" min="0" max="0.1" step="0.01" value="0.01">
                            <span class="intent-slider-value" id="intentLetterSpacingValue">0.01em</span>
                        </div>
                    </div>

                    <!-- Accessibility Section -->
                    <div class="intent-settings-section" id="section-accessibility">
                        <div class="intent-setting-group intent-golden-thread-toggle">
                            <button class="intent-golden-btn" id="intentGoldenToggle">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 21a9 9 0 0 0 9-9c0-1.49-1.45-3.6-3-5a12.19 12.19 0 0 0-6-3 12.19 12.19 0 0 0-6 3c-1.55 1.4-3 3.51-3 5a9 9 0 0 0 9 9Z"/>
                                    <path d="M12 13V7"/>
                                    <circle cx="12" cy="15" r="1"/>
                                </svg>
                                <span>Golden Thread Reading Aid</span>
                            </button>
                            <span class="intent-golden-hint">Subtle margin anchor tracks your reading line (ADHD-friendly)</span>
                        </div>
                        <div class="intent-setting-group intent-dyslexia-toggle" style="margin-top: 18px;">
                            <button class="intent-dyslexia-btn" id="intentDyslexiaToggle">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M12 6v6l4 2"/>
                                </svg>
                                <span>Dyslexia-Friendly Mode</span>
                            </button>
                            <span class="intent-dyslexia-hint">OpenDyslexic font + wider spacing</span>
                        </div>
                        <div class="intent-setting-group intent-vocab-toggle" style="margin-top: 18px;">
                            <button class="intent-vocab-btn" id="intentVocabToggle">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                                    <path d="M8 7h8M8 11h6"/>
                                </svg>
                                <span>Vocabulary Simplifier</span>
                            </button>
                            <span class="intent-vocab-hint">AI highlights complex words with simpler alternatives</span>
                        </div>
                        <div class="intent-setting-group intent-concept-toggle" style="margin-top: 18px;">
                            <button class="intent-concept-btn" id="intentConceptToggle">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="16" x2="12" y2="12"/>
                                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                                <span>Concept Cheat Sheet</span>
                            </button>
                            <span class="intent-concept-hint">AI explains acronyms & technical concepts on hover</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Main content area -->
            <div class="intent-reader" id="intentReader">
                ${tocHtml}
                
                <article class="intent-article ${intent.codeEmphasis ? 'code-emphasis' : ''}">
                    <header class="intent-header">
                        <h1 class="intent-title">${escapeHtml(extracted.title)}</h1>
                        ${metaHtml}
                    </header>
                    
                    <div class="intent-content" id="intentContent">
                        ${extracted.content}
                    </div>
                    
                    ${isIsolate ? `
                    <div style="margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--intent-border); text-align: center;">
                        <button type="button" class="intent-btn intent-btn-close" id="intentExitIso" style="padding: 12px 24px; font-size: 15px;">
                            Exit Isolation & Show Website
                        </button>
                    </div>
                    ` : ''}

                    <footer class="intent-footer">
                        <div class="intent-source">
                            <span>Source:</span>
                            <a href="${extracted.url}" target="_blank" rel="noopener">${extracted.url}</a>
                        </div>
                        <div class="intent-word-count">${extracted.wordCount.toLocaleString()} words</div>
                    </footer>
                </article>
            </div>
            
            <!-- Keyboard hint -->
            <div class="intent-hint" id="intentHint">
                Press <kbd>Esc</kbd> to exit · <kbd>↑</kbd><kbd>↓</kbd> to scroll · <kbd>T</kbd> toggle TOC
            </div>
        </div>
    `;

        // Inject container
        document.body.appendChild(document.createRange().createContextualFragment(readerHtml));
        document.body.classList.add('intent-mode-active');

        // Attach event listeners
        attachReaderListeners();

        // Initialize progress tracking
        initProgressTracking();
    }

    /**
     * Attach event listeners to reader view
     */
    function attachReaderListeners() {
        // Close button
        document.getElementById('intentClose')?.addEventListener('click', deactivateIntentMode);
        document.getElementById('intentExitIso')?.addEventListener('click', deactivateIntentMode);

        // Link Disable Toggle
        document.getElementById('intentToggleLinks')?.addEventListener('click', () => {
            const container = document.getElementById('intentModeContainer');
            const content = document.getElementById('intentContent');
            const btn = document.getElementById('intentToggleLinks');
            const isDisabled = container.classList.toggle('intent-links-disabled');

            if (isDisabled && content) {
                // Disable links
                content.querySelectorAll('a').forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const text = link.textContent.trim();

                    // Check if link text is just a URL
                    const isPlainUrl = /^(https?:\/\/|www\.)/i.test(text) || text === href;

                    if (isPlainUrl) {
                        // Plain URL link - hide completely
                        link.style.display = 'none';
                        link.dataset.intentHidden = 'true';
                    } else {
                        // Text link - convert to plain text span
                        link.dataset.intentOriginalHref = href;
                        link.removeAttribute('href');
                        link.style.color = 'inherit';
                        link.style.cursor = 'text';
                        link.style.textDecoration = 'none';
                        link.style.pointerEvents = 'none';
                    }
                });
            } else if (content) {
                // Restore links
                content.querySelectorAll('a').forEach(link => {
                    if (link.dataset.intentHidden === 'true') {
                        link.style.display = '';
                        delete link.dataset.intentHidden;
                    }
                    if (link.dataset.intentOriginalHref) {
                        link.setAttribute('href', link.dataset.intentOriginalHref);
                        link.style.color = '';
                        link.style.cursor = '';
                        link.style.textDecoration = '';
                        link.style.pointerEvents = '';
                        delete link.dataset.intentOriginalHref;
                    }
                });
            }

            if (btn) btn.style.opacity = isDisabled ? '0.5' : '1';
        });

        // Font size controls
        document.getElementById('intentFontDecrease')?.addEventListener('click', () => adjustFontSize(-2));
        document.getElementById('intentFontIncrease')?.addEventListener('click', () => adjustFontSize(2));

        // Summarize button
        document.getElementById('intentSummarize')?.addEventListener('click', generateAISummary);

        // Hide images toggle
        document.getElementById('intentToggleImages')?.addEventListener('click', () => {
            const container = document.getElementById('intentModeContainer');
            const content = document.getElementById('intentContent');
            const btn = document.getElementById('intentToggleImages');
            const isHidden = container.classList.toggle('intent-images-hidden');

            if (isHidden && content) {
                content.querySelectorAll('img, figure, picture, video, iframe').forEach(el => {
                    el.style.display = 'none';
                    el.dataset.intentImageHidden = 'true';
                });
            } else if (content) {
                content.querySelectorAll('[data-intent-image-hidden]').forEach(el => {
                    el.style.display = '';
                    delete el.dataset.intentImageHidden;
                });
            }

            if (btn) btn.style.opacity = isHidden ? '0.5' : '1';
        });

        // Settings panel toggle
        document.getElementById('intentSettingsToggle')?.addEventListener('click', () => {
            document.getElementById('intentSettingsPanel')?.classList.toggle('open');
        });
        document.getElementById('intentSettingsClose')?.addEventListener('click', () => {
            document.getElementById('intentSettingsPanel')?.classList.remove('open');
        });

        // Tab switching
        document.querySelectorAll('.intent-settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const section = tab.dataset.section;
                document.querySelectorAll('.intent-settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.intent-settings-section').forEach(s => s.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`section-${section}`)?.classList.add('active');
            });
        });

        // Theme buttons
        document.querySelectorAll('.intent-theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                const container = document.getElementById('intentModeContainer');

                // Remove all theme classes from both container and body
                container.classList.remove('intent-theme-light', 'intent-theme-sepia', 'intent-theme-dark');
                document.body.classList.remove('intent-theme-light', 'intent-theme-sepia', 'intent-theme-dark');

                // Apply selected theme
                if (theme === 'light') {
                    container.classList.add('intent-theme-light');
                    document.body.classList.add('intent-theme-light');
                }
                if (theme === 'sepia') {
                    container.classList.add('intent-theme-sepia');
                    document.body.classList.add('intent-theme-sepia');
                }
                if (theme === 'dark') {
                    container.classList.add('intent-theme-dark');
                    document.body.classList.add('intent-theme-dark');
                }

                // Update active state
                document.querySelectorAll('.intent-theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Save to storage
                chrome.storage.local.set({ intentTheme: theme });
            });
        });

        // Font select
        document.getElementById('intentFontSelect')?.addEventListener('change', (e) => {
            const font = e.target.value;
            const container = document.getElementById('intentModeContainer');

            container.classList.remove('intent-font-serif', 'intent-font-mono', 'intent-font-dyslexic');
            if (font === 'serif') container.classList.add('intent-font-serif');
            if (font === 'mono') container.classList.add('intent-font-mono');
            if (font === 'dyslexic') container.classList.add('intent-font-dyslexic');
        });

        // Line height slider
        document.getElementById('intentLineHeight')?.addEventListener('input', (e) => {
            const value = e.target.value;
            const container = document.getElementById('intentModeContainer');
            container.style.setProperty('--intent-line-height', value);
            document.getElementById('intentLineHeightValue').textContent = value;
        });

        // Letter spacing slider
        document.getElementById('intentLetterSpacing')?.addEventListener('input', (e) => {
            const value = e.target.value;
            const container = document.getElementById('intentModeContainer');
            container.style.setProperty('--intent-letter-spacing', value + 'em');
            document.getElementById('intentLetterSpacingValue').textContent = value + 'em';
        });

        // Dyslexia Mode toggle
        document.getElementById('intentDyslexiaToggle')?.addEventListener('click', () => {
            const container = document.getElementById('intentModeContainer');
            const btn = document.getElementById('intentDyslexiaToggle');
            const isEnabled = container.classList.toggle('intent-dyslexia-mode');

            if (isEnabled) {
                // Apply dyslexia-friendly settings
                container.classList.add('intent-font-dyslexic');
                container.style.setProperty('--intent-line-height', '2.0');
                container.style.setProperty('--intent-letter-spacing', '0.05em');
                document.getElementById('intentLineHeight').value = '2.0';
                document.getElementById('intentLineHeightValue').textContent = '2.0';
                document.getElementById('intentLetterSpacing').value = '0.05';
                document.getElementById('intentLetterSpacingValue').textContent = '0.05em';
                document.getElementById('intentFontSelect').value = 'dyslexic';
                btn.classList.add('active');
            } else {
                // Reset to defaults
                container.classList.remove('intent-font-dyslexic');
                container.style.setProperty('--intent-line-height', '1.75');
                container.style.setProperty('--intent-letter-spacing', '0.01em');
                document.getElementById('intentLineHeight').value = '1.75';
                document.getElementById('intentLineHeightValue').textContent = '1.75';
                document.getElementById('intentLetterSpacing').value = '0.01';
                document.getElementById('intentLetterSpacingValue').textContent = '0.01em';
                document.getElementById('intentFontSelect').value = 'system';
                btn.classList.remove('active');
            }
        });

        // === REFRESH CONTENT LOGIC ===
        function refreshContent() {
            const content = document.getElementById('intentContent');
            if (!content || !currentExtractedData) return;

            // Restore base content
            content.innerHTML = currentExtractedData.content;

            // Reset application flags
            vocabSimplifierApplied = false;
            conceptSimplifierApplied = false;

            // Re-apply enabled features
            if (vocabSimplifierEnabled) applyVocabSimplifier();
            if (conceptSimplifierEnabled) applyConceptSimplifier();
            if (bionicEnabled) applyBionicReading();
        }

        // === BIONIC READING MODE ===
        function applyBionicReading() {
            const content = document.getElementById('intentContent');
            if (!content) return;

            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);

            textNodes.forEach(node => {
                const val = node.nodeValue.trim();
                if (val.length === 0) return;
                const parent = node.parentNode;
                if (parent.tagName === 'STRONG' || parent.classList?.contains('bionic-word')) return;

                const words = node.nodeValue.split(/(\s+)/);
                const fragment = document.createDocumentFragment();

                words.forEach(word => {
                    if (/^\s+$/.test(word)) {
                        fragment.appendChild(document.createTextNode(word));
                    } else if (word.length > 0) {
                        const span = document.createElement('span');
                        span.className = 'bionic-word';
                        const boldLen = Math.ceil(word.length * 0.4);
                        span.innerHTML = `<strong>${word.slice(0, boldLen)}</strong>${word.slice(boldLen)}`;
                        fragment.appendChild(span);
                    }
                });

                parent.replaceChild(fragment, node);
            });
        }

        document.getElementById('intentBionic')?.addEventListener('click', () => {
            const btn = document.getElementById('intentBionic');
            bionicEnabled = !bionicEnabled;
            chrome.storage.local.set({ bionicEnabled });

            if (bionicEnabled) {
                applyBionicReading();
                btn.classList.add('active');
                btn.style.background = 'rgba(255,255,255,0.15)';
            } else {
                refreshContent();
                btn.classList.remove('active');
                btn.style.background = '';
            }
        });

        // === AUDIO NARRATION ===
        let speechInstance = null;
        let isPlaying = false;
        document.getElementById('intentAudio')?.addEventListener('click', () => {
            const content = document.getElementById('intentContent');
            const btn = document.getElementById('intentAudio');
            if (!content) return;

            if (isPlaying) {
                // Stop
                window.speechSynthesis.cancel();
                isPlaying = false;
                btn.classList.remove('active');
                btn.style.background = '';
                return;
            }

            // Start narration
            const text = content.innerText;
            speechInstance = new SpeechSynthesisUtterance(text);
            speechInstance.rate = 0.9;
            speechInstance.pitch = 1;

            // Use a nice voice if available
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
            if (preferredVoice) speechInstance.voice = preferredVoice;

            speechInstance.onend = () => {
                isPlaying = false;
                btn.classList.remove('active');
                btn.style.background = '';
            };

            window.speechSynthesis.speak(speechInstance);
            isPlaying = true;
            btn.classList.add('active');
            btn.style.background = 'rgba(255,255,255,0.15)';
        });

        // === AI FOCUS SPOTLIGHT ===
        document.getElementById('intentFocusSpot')?.addEventListener('click', async () => {
            const content = document.getElementById('intentContent');
            const btn = document.getElementById('intentFocusSpot');
            if (!content || btn.classList.contains('intent-btn-loading')) return;

            btn.classList.add('intent-btn-loading');

            // Remove existing spotlight
            content.querySelectorAll('.focus-spotlight').forEach(el => el.classList.remove('focus-spotlight'));

            try {
                // Get more context - up to 15 paragraphs
                const paragraphs = Array.from(content.querySelectorAll('p')).filter(p => p.textContent.trim().length > 40);
                if (paragraphs.length === 0) return;

                const paragraphTexts = paragraphs.slice(0, 15).map((p, i) => `[${i}] ${p.textContent.substring(0, 250)}...`).join('\n');

                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'askAI',
                        prompt: `You are an expert editor. Below are paragraphs from an article. 
                        Identify the paragraph number [X] that contains the most CRITICAL, ESSENTIAL, or IMPORTANT core argument of the text.
                        Respond with ONLY the number in brackets, e.g., "[3]".`,
                        context: paragraphTexts
                    }, resolve);
                });

                if (response?.answer) {
                    const match = response.answer.match(/\[(\d+)\]/) || response.answer.match(/(\d+)/);
                    if (match) {
                        const index = parseInt(match[1]);
                        if (paragraphs[index]) {
                            paragraphs[index].classList.add('focus-spotlight');
                            paragraphs[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }
            } catch (err) {
                console.error('Focus Spotlight error:', err);
            } finally {
                btn.classList.remove('intent-btn-loading');
            }
        });

        // Feature state already declared at module level

        // Load saved preferences
        chrome.storage.local.get(['vocabSimplifierEnabled', 'conceptSimplifierEnabled', 'intentTheme', 'goldenThreadEnabled', 'bionicEnabled', 'fontSizeOffset'], (result) => {
            vocabSimplifierEnabled = result.vocabSimplifierEnabled || false;
            conceptSimplifierEnabled = result.conceptSimplifierEnabled || false;
            bionicEnabled = result.bionicEnabled || false;
            goldenThreadEnabled = result.goldenThreadEnabled !== undefined ? result.goldenThreadEnabled : true;
            fontSizeOffset = result.fontSizeOffset || 0;
            const savedTheme = result.intentTheme || 'dark';

            if (vocabSimplifierEnabled) {
                document.getElementById('intentVocabToggle')?.classList.add('active');
                applyVocabSimplifier();
            }
            if (conceptSimplifierEnabled) {
                document.getElementById('intentConceptToggle')?.classList.add('active');
                applyConceptSimplifier();
            }
            if (goldenThreadEnabled) {
                document.getElementById('intentGoldenToggle')?.classList.add('active');
                initGoldenThread();
            }
            if (bionicEnabled) {
                document.getElementById('intentBionic')?.classList.add('active');
                document.getElementById('intentBionic').style.background = 'rgba(255,255,255,0.15)';
                applyBionicReading();
            }
            if (fontSizeOffset !== 0) {
                const container = document.getElementById('intentModeContainer');
                if (container) {
                    const baseSize = parseInt(currentIntent?.fontSize || '20px');
                    container.style.setProperty('--intent-font-size', `${baseSize + fontSizeOffset}px`);
                }
            }

            // Apply saved theme
            if (savedTheme !== 'dark') {
                const container = document.getElementById('intentModeContainer');

                // Reset classes
                const targets = [container, document.body].filter(Boolean);
                targets.forEach(el => {
                    el.classList.remove('intent-theme-light', 'intent-theme-sepia', 'intent-theme-dark');
                    el.classList.add(`intent-theme-${savedTheme}`);
                });

                // Update active button state
                document.querySelectorAll('.intent-theme-btn').forEach(btn => {
                    if (btn.dataset.theme === savedTheme) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        });

        // Toggle handlers
        document.getElementById('intentVocabToggle')?.addEventListener('click', () => {
            vocabSimplifierEnabled = !vocabSimplifierEnabled;
            chrome.storage.local.set({ vocabSimplifierEnabled });
            if (vocabSimplifierEnabled) {
                document.getElementById('intentVocabToggle').classList.add('active');
                applyVocabSimplifier();
            } else {
                document.getElementById('intentVocabToggle').classList.remove('active');
                refreshContent();
            }
        });

        document.getElementById('intentConceptToggle')?.addEventListener('click', () => {
            conceptSimplifierEnabled = !conceptSimplifierEnabled;
            chrome.storage.local.set({ conceptSimplifierEnabled });
            if (conceptSimplifierEnabled) {
                document.getElementById('intentConceptToggle').classList.add('active');
                applyConceptSimplifier();
            } else {
                document.getElementById('intentConceptToggle').classList.remove('active');
                refreshContent();
            }
        });

        document.getElementById('intentGoldenToggle')?.addEventListener('click', () => {
            goldenThreadEnabled = !goldenThreadEnabled;
            chrome.storage.local.set({ goldenThreadEnabled });
            if (goldenThreadEnabled) {
                document.getElementById('intentGoldenToggle').classList.add('active');
                initGoldenThread();
            } else {
                document.getElementById('intentGoldenToggle').classList.remove('active');
                document.querySelector('.golden-thread-container')?.remove();
                window.removeEventListener('scroll', updateGoldenThread);
            }
        });

        function initGoldenThread() {
            if (document.querySelector('.golden-thread-container')) return;

            const container = document.createElement('div');
            container.className = 'golden-thread-container';
            container.innerHTML = `
                <div class="golden-thread">
                    <div class="golden-thread-seed"></div>
                </div>
            `;
            document.getElementById('intentModeContainer')?.appendChild(container);

            window.addEventListener('scroll', updateGoldenThread, { passive: true });
            updateGoldenThread();
        }

        function updateGoldenThread() {
            if (!goldenThreadEnabled) return;

            const seed = document.querySelector('.golden-thread-seed');
            const thread = document.querySelector('.golden-thread');
            const container = document.getElementById('intentModeContainer');
            if (!seed || !thread || !container) return;

            // Updated thread position to match modern layout
            const maxWidth = container.style.getPropertyValue('--intent-max-width') || '680px';
            thread.style.left = `calc(50% - ${maxWidth} / 2 - 40px)`;

            // Find current paragraph under center of viewport
            const centerY = window.innerHeight / 2;
            const content = document.getElementById('intentContent');
            if (!content) return;

            const paragraphs = Array.from(content.querySelectorAll('p, h1, h2, h3, h4, li')).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.top < centerY + 100 && rect.bottom > centerY - 100;
            });

            if (paragraphs.length > 0) {
                // Find paragraph closest to center
                let closest = paragraphs[0];
                let minDistance = Math.abs((closest.getBoundingClientRect().top + closest.getBoundingClientRect().bottom) / 2 - centerY);

                paragraphs.forEach(p => {
                    const rect = p.getBoundingClientRect();
                    const distance = Math.abs((rect.top + rect.bottom) / 2 - centerY);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closest = p;
                    }
                });

                const targetRect = closest.getBoundingClientRect();
                const targetTop = targetRect.top + (targetRect.height / 2);

                // Smoothly position seed relative to viewport center, but anchored to line
                seed.style.top = `${targetTop}px`;
            }
        }

        function applyVocabSimplifier() {
            if (vocabSimplifierApplied) return;
            vocabSimplifierApplied = true;

            const content = document.getElementById('intentContent');
            if (!content) return;

            const commonWords = new Set(['president', 'government', 'information', 'everything', 'something', 'different', 'important', 'throughout', 'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us']);

            const countSyllables = (word) => {
                word = word.toLowerCase().replace(/[^a-z]/g, '');
                if (word.length <= 3) return 1;
                word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
                word = word.replace(/^y/, '');
                const syllables = word.match(/[aeiouy]{1,2}/g);
                return syllables ? syllables.length : 1;
            };

            const isComplex = (word) => {
                const clean = word.toLowerCase();
                if (clean.length < 8) return false;
                if (commonWords.has(clean)) return false;
                return countSyllables(clean) >= 3;
            };

            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            const complexWordsFound = new Set();
            const currentSessionSimplifications = {};

            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.parentNode.closest('.vocab-word, .concept-word, .bionic-word, pre, code')) continue;

                const words = node.nodeValue.match(/\b[a-zA-Z]{8,}\b/g) || [];
                words.forEach(word => {
                    const clean = word.toLowerCase();
                    if (isComplex(clean)) {
                        if (vocabCache.has(clean)) {
                            const cached = vocabCache.get(clean);
                            if (cached !== 'SKIP') currentSessionSimplifications[clean] = cached;
                        } else {
                            complexWordsFound.add(word);
                        }
                    }
                });
            }

            const wordsToAsk = Array.from(complexWordsFound).slice(0, 15);

            const processDOM = (simplifications) => {
                const innerWalker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
                const nodesToProcess = [];
                while (innerWalker.nextNode()) nodesToProcess.push(innerWalker.currentNode);

                const sortedWords = Object.keys(simplifications).sort((a, b) => b.length - a.length);
                if (sortedWords.length === 0) return;

                nodesToProcess.forEach(node => {
                    if (node.parentNode.closest('.vocab-word, .concept-word, .bionic-word, pre, code')) return;
                    let text = node.nodeValue;
                    let hasMatch = false;
                    for (const word of sortedWords) {
                        if (new RegExp(`\\b${word}\\b`, 'gi').test(text)) {
                            hasMatch = true;
                            break;
                        }
                    }

                    if (hasMatch) {
                        const span = document.createElement('span');
                        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        for (const word of sortedWords) {
                            const regex = new RegExp(`\\b(${word})\\b`, 'gi');
                            html = html.replace(regex, (match) => {
                                const simple = simplifications[word.toLowerCase()];
                                return `<span class="vocab-word">${match}<span class="vocab-tooltip"><span class="vocab-simple">${simple}</span> <span class="vocab-original">(${match})</span></span></span>`;
                            });
                        }
                        span.innerHTML = html;
                        node.parentNode.replaceChild(span, node);
                    }
                });
            };

            if (wordsToAsk.length === 0) {
                if (Object.keys(currentSessionSimplifications).length > 0) processDOM(currentSessionSimplifications);
                return;
            }

            chrome.runtime.sendMessage({
                action: 'askAI',
                prompt: `You are a vocabulary simplifier. For each word provided:
                1. If the word is already simple or common (like "president"), respond with "SKIP".
                2. If it is complex, provide ONE much simpler synonym.
                
                Format: "complex:simple" or "complex:SKIP", one per line.
                Words: ${wordsToAsk.join(', ')}`,
                context: 'Objective: Simplify vocabulary only when necessary to save mental energy.'
            }, (response) => {
                if (!response?.answer) return;

                response.answer.split('\n').forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const complex = parts[0].trim().toLowerCase();
                        const simple = parts[1].trim();
                        if (simple.toUpperCase() === 'SKIP') {
                            vocabCache.set(complex, 'SKIP');
                        } else if (complex && simple) {
                            vocabCache.set(complex, simple);
                            currentSessionSimplifications[complex] = simple;
                        }
                    }
                });

                processDOM(currentSessionSimplifications);
            });
        }

        function applyConceptSimplifier() {
            if (conceptSimplifierApplied) return;
            conceptSimplifierApplied = true;

            const content = document.getElementById('intentContent');
            if (!content) return;

            // Pattern for acronyms (caps/numbers) or specific terms we want to check
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            const conceptsFound = new Set();
            const currentSessionConcepts = {};

            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.parentNode.closest('.vocab-word, .concept-word, .bionic-word, pre, code')) continue;

                // Look for: Acronyms (NASA, SEO), Mixed case with numbers (SaaS, Web3), or potential jargon ( capitalized words or short all-caps)
                const words = node.nodeValue.match(/\b([A-Z]{2,}|[A-Z][a-z]+[A-Z][a-z]+|[A-Z][a-z]+[0-9]+)\b/g) || [];
                words.forEach(word => {
                    if (word.length > 10) return; // Skip very long names that aren't likely concepts
                    if (conceptCache.has(word)) {
                        const cached = conceptCache.get(word);
                        if (cached !== 'SKIP') currentSessionConcepts[word] = cached;
                    } else {
                        conceptsFound.add(word);
                    }
                });
            }

            const termsToAsk = Array.from(conceptsFound).slice(0, 10);

            const processConceptDOM = (explanations) => {
                const innerWalker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
                const nodesToProcess = [];
                while (innerWalker.nextNode()) nodesToProcess.push(innerWalker.currentNode);

                const sortedTerms = Object.keys(explanations).sort((a, b) => b.length - a.length);
                if (sortedTerms.length === 0) return;

                nodesToProcess.forEach(node => {
                    if (node.parentNode.closest('.vocab-word, .concept-word, .bionic-word, pre, code')) return;
                    let text = node.nodeValue;
                    let hasMatch = false;
                    for (const term of sortedTerms) {
                        if (new RegExp(`\\b${term}\\b`).test(text)) {
                            hasMatch = true;
                            break;
                        }
                    }

                    if (hasMatch) {
                        const span = document.createElement('span');
                        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        for (const term of sortedTerms) {
                            const regex = new RegExp(`\\b(${term})\\b`, 'g');
                            html = html.replace(regex, (match) => {
                                const explanation = explanations[match];
                                return `<span class="concept-word">${match}<span class="concept-tooltip"><span class="concept-label">Concept</span><span class="concept-text">${explanation}</span></span></span>`;
                            });
                        }
                        span.innerHTML = html;
                        node.parentNode.replaceChild(span, node);
                    }
                });
            };

            if (termsToAsk.length === 0) {
                if (Object.keys(currentSessionConcepts).length > 0) processConceptDOM(currentSessionConcepts);
                return;
            }

            chrome.runtime.sendMessage({
                action: 'askAI',
                prompt: `You are a technical concept explainer. For each term/acronym provided:
                1. If it's a common word that doesn't need expansion/explanation, respond with "SKIP".
                2. If it's an acronym or technical concept, provide a 5-8 word explanation of what it stands for or means.
                
                Format: "term:explanation" or "term:SKIP", one per line.
                Terms: ${termsToAsk.join(', ')}`,
                context: 'Objective: Help readers quickly understand technical terms and acronyms without leaving the page.'
            }, (response) => {
                if (!response?.answer) return;

                response.answer.split('\n').forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const term = parts[0].trim();
                        const explanation = parts[1].trim();
                        if (explanation.toUpperCase() === 'SKIP') {
                            conceptCache.set(term, 'SKIP');
                        } else if (term && explanation) {
                            conceptCache.set(term, explanation);
                            currentSessionConcepts[term] = explanation;
                        }
                    }
                });

                processConceptDOM(currentSessionConcepts);
            });
        }

        // Reading Progress Memory - save scroll position
        // Note: We listen on window because the body/window scrolls, not the reader element
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (!readerActive) return;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                saveReadingProgress(window.location.href, window.scrollY);
            }, 500);
        });

        // Check for saved progress and show resume prompt
        checkReadingProgress(window.location.href);


        // TOC toggle
        document.getElementById('intentTocToggle')?.addEventListener('click', toggleToc);

        // TOC link clicks - smooth scroll
        document.querySelectorAll('.intent-toc-item a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Highlight briefly
                    target.classList.add('intent-highlight');
                    setTimeout(() => target.classList.remove('intent-highlight'), 1500);
                }
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', handleKeyboard);

        // Initialize text selection handling for Hold That Thought
        initSelectionHandling();

        // Hide hint after a few seconds
        setTimeout(() => {
            const hint = document.getElementById('intentHint');
            if (hint) hint.classList.add('fading');
        }, 5000);
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboard(e) {
        if (!readerActive) return;

        switch (e.key) {
            case 'Escape':
                deactivateIntentMode();
                break;
            case 't':
            case 'T':
                if (!e.ctrlKey && !e.metaKey) {
                    toggleToc();
                }
                break;
            case 'ArrowUp':
                if (!e.ctrlKey && !e.metaKey) {
                    window.scrollBy({ top: -100, behavior: 'smooth' });
                }
                break;
            case 'ArrowDown':
                if (!e.ctrlKey && !e.metaKey) {
                    window.scrollBy({ top: 100, behavior: 'smooth' });
                }
                break;
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    adjustFontSize(2);
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    adjustFontSize(-2);
                }
                break;
        }
    }

    /**
     * Toggle table of contents visibility
     */
    function toggleToc() {
        const toc = document.getElementById('intentToc');
        const toggle = document.getElementById('intentTocToggle');
        if (toc && toggle) {
            toc.classList.toggle('collapsed');
            toggle.textContent = toc.classList.contains('collapsed') ? '+' : '−';
        }
    }

    /**
     * Adjust font size
     */
    function adjustFontSize(delta) {
        fontSizeOffset += delta;
        fontSizeOffset = Math.max(-6, Math.min(10, fontSizeOffset)); // Clamp

        const container = document.getElementById('intentModeContainer');
        if (container && currentIntent) {
            const baseFontSize = parseInt(currentIntent.fontSize);
            container.style.setProperty('--intent-font-size', `${baseFontSize + fontSizeOffset}px`);
        }
    }

    /**
     * Initialize reading progress tracking
     */
    function initProgressTracking() {
        const progressBar = document.getElementById('intentProgressBar');
        const reader = document.getElementById('intentReader');

        if (!progressBar || !reader) return;

        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            progressBar.style.width = `${Math.min(100, progress)}%`;
        };

        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();
    }

    /**
     * Show notification
     */
    function showNotification(message) {
        const existing = document.querySelector('.intent-notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.className = 'intent-notification';
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== Hold That Thought Integration ====================

    /**
     * Initialize text selection handling
     */
    function initSelectionHandling() {
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('keyup', (e) => {
            if (e.shiftKey) handleTextSelection();
        });

        // Hide tooltip on click elsewhere
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.intent-htt-tooltip') && !e.target.closest('.intent-htt-panel')) {
                hideSelectionTooltip();
            }
        });
    }

    /**
     * Handle text selection
     */
    function handleTextSelection(e) {
        // Ignore if reader not active
        // Ignore clicks inside the tooltip or panel
        if (e && e.target && (e.target.closest('.intent-htt-tooltip') || e.target.closest('.intent-htt-panel'))) {
            return;
        }

        // Removed readerActive check to allow isolation from any page

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 2) { // Minimum selection length lowered to 2 for easier testing
            currentSelection = text;
            const range = selection.getRangeAt(0);
            selectionRect = range.getBoundingClientRect();
            showSelectionTooltip();
        } else {
            // Only hide if we aren't interacting with the tooltip
            // Note: The mousedown handler handles closing on outside clicks, 
            // but we double check here to handle empty selections
            hideSelectionTooltip();
        }
    }

    /**
     * Show the floating tooltip near selection
     */
    function showSelectionTooltip() {
        hideSelectionTooltip(); // Remove existing

        const tooltip = document.createElement('div');
        tooltip.className = 'intent-htt-tooltip';
        tooltip.innerHTML = `
        <button type="button" class="intent-htt-tooltip-btn" id="httTooltipBtn">
            Save thought
        </button>
        <div class="intent-htt-tooltip-divider"></div>
        <button type="button" class="intent-htt-tooltip-btn" id="intentIsolateBtn">
            Isolate
        </button>
    `;

        document.body.appendChild(tooltip);

        // Position near selection
        const scrollTop = window.scrollY;
        const scrollLeft = window.scrollX;

        tooltip.style.top = `${selectionRect.top + scrollTop - tooltip.offsetHeight - 8}px`;
        tooltip.style.left = `${selectionRect.left + scrollLeft + (selectionRect.width / 2) - (tooltip.offsetWidth / 2)}px`;

        // Keep within viewport
        const rect = tooltip.getBoundingClientRect();
        if (rect.left < 10) tooltip.style.left = '10px';
        if (rect.right > window.innerWidth - 10) {
            tooltip.style.left = `${window.innerWidth - tooltip.offsetWidth - 10}px`;
        }
        if (rect.top < 60) { // Below selection if too high
            tooltip.style.top = `${selectionRect.bottom + scrollTop + 8}px`;
        }

        // Store the selection text before any click clears it (module-level)
        savedSelection = currentSelection;

        // Attach click handlers
        document.getElementById('httTooltipBtn')?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.getElementById('httTooltipBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            savedSelection = currentSelection;
            showHttPanel();
            hideSelectionTooltip();
        });

        document.getElementById('intentIsolateBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (savedSelection) {
                activateIntentMode('read', savedSelection);
                hideSelectionTooltip();
            }
        });

        // Animate in
        requestAnimationFrame(() => tooltip.classList.add('visible'));
    }

    /**
     * Hide the selection tooltip
     */
    function hideSelectionTooltip() {
        const tooltip = document.querySelector('.intent-htt-tooltip');
        if (tooltip) {
            tooltip.classList.remove('visible');
            setTimeout(() => tooltip.remove(), 150);
        }
    }

    /**
     * Show the integrated HTT panel
     */
    function showHttPanel() {
        hideHttPanel(); // Remove existing

        // Use savedSelection as fallback when currentSelection is empty
        const selectionText = currentSelection || savedSelection || '';
        const pageTitle = document.querySelector('.intent-title')?.textContent || document.title;
        const pageUrl = window.location.href;

        // If no selection, show notification and exit
        if (!selectionText) {
            showNotification('Select some text first');
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'intent-htt-panel';
        panel.id = 'intentHttPanel';
        // Store selection in data attribute for later retrieval
        panel.dataset.selectionText = selectionText;

        panel.innerHTML = `
        <div class="intent-htt-panel-header">
            <h3>Hold That Thought</h3>
            <button type="button" class="close-btn-mac" id="httPanelClose" style="width: 24px; height: 24px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
        
        <div class="intent-htt-panel-content">
            <div class="intent-htt-preview">
                <p class="intent-htt-selected-text">"${escapeHtml(selectionText.substring(0, 120))}${selectionText.length > 120 ? '...' : ''}"</p>
            </div>
            
            <div class="intent-htt-field">
                <label>Tag</label>
                <div class="intent-htt-tags" id="httTags">
                    <button type="button" class="intent-htt-tag active" data-tag="📝 Note">Note</button>
                    <button type="button" class="intent-htt-tag" data-tag="💡 Idea">Idea</button>
                    <button type="button" class="intent-htt-tag" data-tag="📚 Read Later">Read Later</button>
                </div>
            </div>
            
            <div class="intent-htt-field">
                <label>Note</label>
                <textarea id="httContext" placeholder="Why save this?"></textarea>
            </div>
        </div>
        
        <div class="intent-htt-panel-footer">
            <button type="button" class="intent-htt-cancel" id="httCancel">Cancel</button>
            <button type="button" class="intent-htt-save" id="httSave">Save</button>
        </div>
    `;

        document.body.appendChild(panel);

        // Animate in
        requestAnimationFrame(() => panel.classList.add('open'));

        // Attach event listeners
        document.getElementById('httPanelClose').addEventListener('click', hideHttPanel);
        document.getElementById('httCancel').addEventListener('click', hideHttPanel);
        document.getElementById('httSave').addEventListener('click', saveHttThought);

        // Tag selection
        document.querySelectorAll('.intent-htt-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.intent-htt-tag').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Keyboard: Escape to close, Cmd/Ctrl+Enter to save
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                hideHttPanel();
                document.removeEventListener('keydown', keyHandler);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                saveHttThought();
            }
        };
        document.addEventListener('keydown', keyHandler);

        // Focus context textarea
        setTimeout(() => document.getElementById('httContext')?.focus(), 100);
    }

    /**
     * Hide the HTT panel
     */
    function hideHttPanel() {
        const panel = document.getElementById('intentHttPanel');
        if (panel) {
            panel.classList.remove('open');
            setTimeout(() => panel.remove(), 200);
        }
        currentSelection = '';
    }

    /**
     * Save the thought via background script
     */
    function saveHttThought() {
        // Get the selection text from the panel's data attribute
        const panel = document.getElementById('intentHttPanel');
        const selectionText = panel?.dataset.selectionText || currentSelection || savedSelection || '';

        const tag = document.querySelector('.intent-htt-tag.active')?.dataset.tag || '📝 Note';
        const context = document.getElementById('httContext')?.value || '';

        const pageTitle = document.querySelector('.intent-title')?.textContent || document.title;
        const pageUrl = window.location.href;

        const thought = {
            text: selectionText,
            pageTitle,
            pageUrl,
            tag,
            color: '#fef08a', // Default yellow
            importance: 'medium',
            context
        };

        chrome.runtime.sendMessage({ action: 'saveThought', thought }, (response) => {
            if (response?.success) {
                hideHttPanel();
                showNotification('Saved');
            } else {
                showNotification('Failed to save');
            }
        });
    }

    // ========== READING PROGRESS MEMORY ==========
    function getReadingProgressKey(url) {
        return 'intent-reading-progress-' + btoa(url).substring(0, 32);
    }

    function saveReadingProgress(url, scrollTop) {
        const key = getReadingProgressKey(url);

        // Calculate progress percentage using document scroll
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progressPercent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;

        // Get page metadata
        const title = document.querySelector('.intent-title')?.textContent || document.title || 'Untitled';
        const favicon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
        const readingTime = document.querySelector('.intent-reading-time')?.textContent || '';

        const data = {
            scrollTop,
            timestamp: Date.now(),
            url,
            title: title.substring(0, 100),
            favicon,
            progressPercent,
            readingTime,
            hostname: new URL(url).hostname
        };

        // Save to localStorage for Intent Mode resume prompt
        localStorage.setItem(key, JSON.stringify(data));

        // Also save to chrome.storage.local for the New Tab shelf
        // Only save if significant progress (> 5% and < 95%)
        if (progressPercent > 5 && progressPercent < 95) {
            chrome.storage.local.get(['readingShelf'], (result) => {
                const shelf = result.readingShelf || {};
                shelf[key] = data;
                chrome.storage.local.set({ readingShelf: shelf });
            });
        } else if (progressPercent >= 95) {
            // Remove from shelf if finished
            chrome.storage.local.get(['readingShelf'], (result) => {
                const shelf = result.readingShelf || {};
                delete shelf[key];
                chrome.storage.local.set({ readingShelf: shelf });
            });
        }

        // Clean up old entries (older than 7 days)
        cleanOldReadingProgress();
    }

    function checkReadingProgress(url) {
        const key = getReadingProgressKey(url);
        const saved = localStorage.getItem(key);

        if (!saved) return;

        try {
            const data = JSON.parse(saved);
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            // Only show if saved within 7 days and scrolled past 200px
            if (Date.now() - data.timestamp < sevenDays && data.scrollTop > 200) {
                showResumePrompt(data.scrollTop);
            }
        } catch (e) {
            localStorage.removeItem(key);
        }
    }

    function showResumePrompt(scrollTop) {
        const container = document.getElementById('intentModeContainer');
        if (!container) return;

        const prompt = document.createElement('div');
        prompt.className = 'intent-resume-prompt';
        prompt.innerHTML = `
            <div class="intent-resume-content">
                <span class="intent-resume-text">Continue where you left off?</span>
                <button class="intent-resume-btn" id="intentResumeYes">Resume</button>
                <button class="close-btn-mac intent-resume-close" id="intentResumeNo" style="width: 14px; height: 14px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;

        container.appendChild(prompt);
        requestAnimationFrame(() => prompt.classList.add('visible'));

        // Resume button
        document.getElementById('intentResumeYes')?.addEventListener('click', () => {
            window.scrollTo({ top: scrollTop, behavior: 'smooth' });
            dismissResumePrompt(prompt);
        });

        // Dismiss button
        document.getElementById('intentResumeNo')?.addEventListener('click', () => {
            dismissResumePrompt(prompt);
            // Clear saved progress for this page
            localStorage.removeItem(getReadingProgressKey(window.location.href));
        });

        // Auto dismiss after 8 seconds
        setTimeout(() => dismissResumePrompt(prompt), 8000);
    }

    function dismissResumePrompt(prompt) {
        if (!prompt) return;
        prompt.classList.remove('visible');
        setTimeout(() => prompt.remove(), 300);
    }

    function cleanOldReadingProgress() {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('intent-reading-progress-')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (now - data.timestamp > sevenDays) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        }
    }

    async function generateAISummary() {
        const btn = document.getElementById('intentSummarize');
        const content = document.getElementById('intentContent');
        if (!content || (btn && btn.disabled)) return;

        // Check if we already have a summary
        const existing = document.querySelector('.intent-ai-summary');
        if (existing) {
            existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.classList.add('thinking');
            btn.innerHTML = '<span class="ai-stars loading"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg></span> Thinking...';
        }

        try {
            // Get content text (limit to avoid token issues)
            const textToSummarize = content.innerText.substring(0, 4000);
            const title = document.title;

            // Request from Background AI
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'askAI',
                    prompt: `You are an expert content distiller. Summarize the provided article content with extreme precision and clarity.

You MUST provide EXACTLY TWO sections in your response:

1. ELI5: A one-sentence, ultra-simple explanation of the core concept that even a 5-year-old would understand.
2. TLDR: Precisely 3 key takeaways as bullet points.

STRICT FORMAT:
ELI5: [Simple sentence]
TLDR:
- [Key point 1]
- [Key point 2]
- [Key point 3]

Do not include any other text or formatting.`,
                    context: `Article Title: ${title}\nContent: ${textToSummarize}`
                }, resolve);
            });

            if (response.error) {
                showNotification(response.error);
                if (btn) btn.innerHTML = '✨ Error';
                return;
            }

            const answer = response.answer;

            // Parse custom format
            const eli5Match = answer.match(/ELI5:\s*(.*)/i);
            const tldrMatch = answer.match(/TLDR:\s*([\s\S]*)/i);

            const eli5Text = eli5Match ? eli5Match[1].trim() : "Unable to generate ELI5.";
            const tldrText = tldrMatch ? tldrMatch[1].trim() : "";

            const tldrPoints = tldrText
                .split('\n')
                .map(p => p.replace(/^-\s*/, '').trim())
                .filter(p => p.length > 0)
                .slice(0, 3);

            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'intent-ai-summary';
            summaryDiv.innerHTML = `
                <div class="ai-summary-inner">
                    <div class="ai-summary-header">
                        <div class="ai-label-group">
                            <span class="ai-stars"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg></span>
                            <span class="ai-label">AI Insights</span>
                        </div>
                        <button class="ai-summary-close" id="closeAISummary" title="Remove Insights">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="ai-summary-content">
                        <section class="ai-summary-section">
                            <div class="ai-section-title">Explain Like I'm 5</div>
                            <p class="ai-eli5-text">"${eli5Text}"</p>
                        </section>
                        <section class="ai-summary-section">
                            <div class="ai-section-title">TL;DR Summary</div>
                            <ul class="ai-tldr-list">
                                ${tldrPoints.length > 0
                    ? tldrPoints.map(p => `<li class="ai-tldr-item">${p}</li>`).join('')
                    : `<li class="ai-tldr-item">${answer.substring(0, 200)}...</li>`}
                            </ul>
                        </section>
                    </div>
                    <div class="ai-summary-footer">
                        <button class="ai-footer-btn" id="aiResearchBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>
                            Deep Research
                        </button>
                        <button class="ai-footer-btn" id="aiCopySummary">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            Copy Insights
                        </button>
                    </div>
                </div>
            `;

            const articleHeader = content.parentElement.querySelector('.intent-header');
            if (articleHeader) {
                articleHeader.after(summaryDiv);
            } else {
                content.prepend(summaryDiv);
            }

            // === ULTRA-PREMIUM ANIMATION SYSTEM ===
            const animateText = (element, text, baseDelay = 0) => {
                element.innerHTML = '';
                element.style.opacity = '1';

                const words = text.split(' ');
                words.forEach((word, wordIndex) => {
                    const wordSpan = document.createElement('span');
                    wordSpan.style.cssText = 'display: inline-block; white-space: pre;';

                    [...word].forEach((char, charIndex) => {
                        const charSpan = document.createElement('span');
                        charSpan.textContent = char;
                        charSpan.style.cssText = `
                            display: inline-block;
                            opacity: 0;
                            transform: translateY(8px) scale(0.9);
                            filter: blur(4px);
                            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                        `;
                        wordSpan.appendChild(charSpan);

                        const delay = baseDelay + (wordIndex * 60) + (charIndex * 25);
                        setTimeout(() => {
                            charSpan.style.opacity = '1';
                            charSpan.style.transform = 'translateY(0) scale(1)';
                            charSpan.style.filter = 'blur(0)';
                        }, delay);
                    });

                    // Add space after word
                    const space = document.createElement('span');
                    space.innerHTML = '&nbsp;';
                    space.style.display = 'inline-block';
                    wordSpan.appendChild(space);

                    element.appendChild(wordSpan);
                });
            };

            const animateBullet = (element, text, delay = 0) => {
                const arrow = element.querySelector('::before') || null;
                element.textContent = '';
                element.style.opacity = '1';

                // Animate arrow first
                const arrowSpan = document.createElement('span');
                arrowSpan.textContent = '→ ';
                arrowSpan.style.cssText = `
                    position: absolute;
                    left: 0;
                    opacity: 0;
                    transform: translateX(-10px);
                    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                    color: rgba(255,255,255,0.7);
                    font-weight: 700;
                `;
                element.style.position = 'relative';
                element.style.paddingLeft = '20px';
                element.insertBefore(arrowSpan, element.firstChild);

                setTimeout(() => {
                    arrowSpan.style.opacity = '1';
                    arrowSpan.style.transform = 'translateX(0)';
                }, delay);

                // Text content
                const textSpan = document.createElement('span');
                textSpan.style.cssText = `
                    opacity: 0;
                    display: inline;
                    transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                `;
                textSpan.textContent = text;
                element.appendChild(textSpan);

                setTimeout(() => {
                    textSpan.style.opacity = '1';
                }, delay + 150);
            };

            // Start animation sequence
            requestAnimationFrame(() => {
                // Header fade in
                const header = summaryDiv.querySelector('.ai-summary-header');
                if (header) {
                    header.style.cssText = 'opacity: 0; transform: translateY(-10px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);';
                    setTimeout(() => {
                        header.style.opacity = '1';
                        header.style.transform = 'translateY(0)';
                    }, 100);
                }

                // Section titles with elegant fade
                const sectionTitles = summaryDiv.querySelectorAll('.ai-section-title');
                sectionTitles.forEach((title, i) => {
                    title.style.cssText = 'opacity: 0; transform: translateX(-20px); transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);';
                    setTimeout(() => {
                        title.style.opacity = '1';
                        title.style.transform = 'translateX(0)';
                    }, 300 + i * 800);
                });

                // ELI5 text - character by character
                const eli5 = summaryDiv.querySelector('.ai-eli5-text');
                if (eli5) {
                    const originalText = eli5.textContent;
                    eli5.style.borderLeft = '2px solid transparent';
                    eli5.style.transition = 'border-color 0.5s ease';

                    setTimeout(() => {
                        eli5.style.borderLeftColor = 'rgba(255,255,255,0.15)';
                    }, 400);

                    animateText(eli5, originalText, 500);
                }

                // TLDR items - staggered smooth fade
                const tldrItems = summaryDiv.querySelectorAll('.ai-tldr-item');
                tldrItems.forEach((item, i) => {
                    const originalText = item.textContent;
                    item.innerHTML = '';
                    item.style.cssText = 'opacity: 0; transform: translateY(12px); transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); position: relative; padding-left: 20px;';

                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';

                        // Arrow
                        const arrow = document.createElement('span');
                        arrow.textContent = '→';
                        arrow.style.cssText = 'position: absolute; left: 0; opacity: 0; transform: translateX(-5px); transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); color: rgba(255,255,255,0.5); font-weight: 600;';
                        item.appendChild(arrow);

                        setTimeout(() => {
                            arrow.style.opacity = '1';
                            arrow.style.transform = 'translateX(0)';
                        }, 100);

                        // Text
                        const textNode = document.createElement('span');
                        textNode.textContent = originalText;
                        textNode.style.cssText = 'opacity: 0; transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);';
                        item.appendChild(textNode);

                        setTimeout(() => {
                            textNode.style.opacity = '1';
                        }, 200);

                    }, 1200 + i * 300);
                });

                // Footer - gentle rise
                const footer = summaryDiv.querySelector('.ai-summary-footer');
                if (footer) {
                    footer.style.cssText = 'opacity: 0; transform: translateY(15px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);';
                    setTimeout(() => {
                        footer.style.opacity = '1';
                        footer.style.transform = 'translateY(0)';
                    }, 2200);
                }

                // Summary card glow pulse
                summaryDiv.style.boxShadow = '0 0 0 rgba(255,255,255,0)';
                summaryDiv.style.transition = 'box-shadow 1.5s cubic-bezier(0.16, 1, 0.3, 1)';
                setTimeout(() => {
                    summaryDiv.style.boxShadow = '0 0 60px rgba(255,255,255,0.03), 0 20px 40px rgba(0,0,0,0.3)';
                }, 500);
            });

            // Scroll to summary
            setTimeout(() => {
                summaryDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);

            // Actions
            document.getElementById('closeAISummary').onclick = () => {
                summaryDiv.style.opacity = '0';
                summaryDiv.style.transform = 'translateY(-10px)';
                setTimeout(() => summaryDiv.remove(), 400);
            };

            document.getElementById('aiResearchBtn').onclick = () => {
                const query = `Provide a deep analysis of: ${window.location.href}`;
                window.open(`https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`, '_blank');
            };

            document.getElementById('aiCopySummary').onclick = (e) => {
                const text = `ELI5: ${eli5Text}\nTLDR:\n${tldrPoints.map(p => `- ${p}`).join('\n')}`;
                navigator.clipboard.writeText(text);
                e.target.textContent = 'Copied!';
                setTimeout(() => e.target.textContent = 'Copy Insights', 2000);
            };

            if (btn) btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;"><path d="M20 6L9 17l-5-5"/></svg> Summarized';
        } catch (err) {
            if (btn) btn.innerHTML = '✨ Error';
            console.error('AI Summary Error:', err);
        } finally {
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove('thinking');
                    btn.innerHTML = '<span class="ai-stars"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/></svg></span> Summarize';
                }
            }, 3000);
        }
    }

    // Expose activateIntentMode globally so the message listener can call it
    window.__intentModeActivate__ = activateIntentMode;

} // End of guard block
void 0;
