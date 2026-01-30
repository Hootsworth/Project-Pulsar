
// ============================================
// AUTO UPDATER
// ============================================

if (window.browser?.onUpdateStatus) {
    window.browser.onUpdateStatus((data) => {
        console.log('[Renderer] Update status:', data);

        if (data.status === 'downloaded') {
            // Create a toast notification
            const toast = document.createElement('div');
            toast.className = 'update-toast';
            toast.innerHTML = `
                <div class="update-content">
                    <span>New version downloaded. Restart now?</span>
                    <button id="btn-restart-update" class="accent-button small">Restart</button>
                    <button id="btn-dismiss-update" class="text-button small">Later</button>
                </div>
            `;
            document.body.appendChild(toast);

            // Add styles dynamically if not present
            if (!document.getElementById('update-toast-style')) {
                const style = document.createElement('style');
                style.id = 'update-toast-style';
                style.textContent = `
                    .update-toast {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: var(--bg-sidebar);
                        border: 1px solid var(--border-glass);
                        border-radius: 12px;
                        padding: 16px;
                        z-index: 20000;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                        backdrop-filter: blur(20px);
                        animation: slideUp 0.3s ease-out;
                    }
                    .update-content {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 0.9rem;
                        color: white;
                    }
                    .accent-button.small {
                        padding: 6px 12px !important;
                        font-size: 0.8rem !important;
                    }
                    .text-button {
                        background: transparent;
                        border: none;
                        color: var(--text-secondary);
                        cursor: pointer;
                        padding: 6px;
                    }
                    .text-button:hover { color: white; }
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            // Handlers
            document.getElementById('btn-restart-update').onclick = () => {
                window.browser.installUpdate();
            };
            document.getElementById('btn-dismiss-update').onclick = () => {
                toast.remove();
            };
        }
    });
}
