document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    const thoughtsList = document.getElementById('thoughts-list');
    const trailList = document.getElementById('trail-list');
    const thoughtSearch = document.getElementById('thought-search');

    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Load Data
    async function refreshData() {
        const { thoughts = [], footsteps = [] } = await chrome.storage.local.get(['thoughts', 'footsteps']);
        renderThoughts(thoughts);
        renderTrail(footsteps);
    }

    function renderThoughts(thoughts) {
        const query = thoughtSearch.value.toLowerCase();
        const filtered = (thoughts || []).filter(t =>
            (t.text && t.text.toLowerCase().includes(query)) ||
            (t.tag && t.tag.toLowerCase().includes(query))
        );

        thoughtsList.innerHTML = filtered.map((t, i) => `
            <div class="item-card" data-id="${t.id}" style="animation-delay: ${i * 0.05}s">
                <div class="item-text">${escapeHtml(t.text)}</div>
                <div class="item-meta">
                    <span class="item-date">${new Date(t.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    ${t.tag ? `<span class="item-tag">${escapeHtml(t.tag)}</span>` : ''}
                </div>
            </div>
        `).join('') || '<div class="empty-state">No thoughts found</div>';
    }

    function renderTrail(steps) {
        trailList.innerHTML = (steps || []).map((s, i) => `
            <div class="item-card trail-item" data-url="${s.url}" style="animation-delay: ${i * 0.05}s">
                <div class="trail-favicon-wrapper">
                    <img src="${s.favicon || `https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=32`}" class="trail-favicon">
                </div>
                <div class="trail-info">
                    <div class="trail-title">${escapeHtml(s.title || s.domain)}</div>
                    <div class="trail-url">${escapeHtml(s.domain)}</div>
                </div>
            </div>
        `).join('') || '<div class="empty-state">No trail yet</div>';

        // Add click events for trail items
        trailList.querySelectorAll('.trail-item').forEach(item => {
            item.addEventListener('click', () => {
                chrome.tabs.create({ url: item.dataset.url });
            });
        });

        // Add error handler for favicons
        trailList.querySelectorAll('.trail-favicon').forEach(img => {
            img.addEventListener('error', () => {
                img.src = 'icons/icon16.png';
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Search listener
    thoughtSearch.addEventListener('input', () => {
        chrome.storage.local.get(['thoughts'], (data) => {
            renderThoughts(data.thoughts || []);
        });
    });

    // Initial load
    refreshData();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.thoughts || changes.footsteps) {
            refreshData();
        }
    });

    // Tab Shepherd
    const organizeBtn = document.getElementById('organize-tabs-btn');
    const statusDiv = document.getElementById('organize-status');

    if (organizeBtn) {
        organizeBtn.addEventListener('click', () => {
            statusDiv.innerHTML = '<span class="loading-spinner"></span> Shepherding your tabs...';
            organizeBtn.disabled = true;
            organizeBtn.style.opacity = '0.7';

            chrome.runtime.sendMessage({ action: 'organizeTabs' }, (response) => {
                organizeBtn.disabled = false;
                organizeBtn.style.opacity = '1';

                if (response && response.success) {
                    statusDiv.innerHTML = '✨ Tabs organized successfully!';
                    setTimeout(() => statusDiv.innerHTML = '', 3000);

                    if (response.groups) {
                        const list = document.getElementById('grouped-tabs-list');
                        list.innerHTML = ''; // Clear previous

                        response.groups.forEach((group, index) => {
                            setTimeout(() => {
                                const groupEl = document.createElement('div');
                                groupEl.className = 'grouped-group';
                                groupEl.style.animation = 'itemReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) both';
                                groupEl.innerHTML = `
                                    <div class="group-header">
                                        <div class="group-color-dot" style="background: ${getRandomColor()}"></div>
                                        <span>${group.title}</span>
                                        <span class="group-count">${group.ids.length} tabs</span>
                                    </div>
                                `;
                                list.appendChild(groupEl);
                                // Optional sound effect per item if sound enabled
                            }, index * 150); // Staggered delay (150ms)
                        });
                    }
                } else {
                    statusDiv.innerHTML = '❌ Failed: ' + (response?.error || 'Unknown error');
                }
            });
        });
    }

    function getRandomColor() {
        const colors = ['#FF5F6D', '#FFC371', '#FFD700', '#4CD964', '#5AC8FA', '#007AFF', '#A259FF', '#FF3B30'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
});

