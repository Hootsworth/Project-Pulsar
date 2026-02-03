
// ============================================
// CONTEXT MENU
// ============================================

function attachContextMenu(webContents) {
    if (!webContents) return;

    webContents.on('context-menu', (event, params) => {
        const menuTemplate = [];

        // 1. Text Selection
        if (params.selectionText) {
            menuTemplate.push(
                { role: 'copy' },
                {
                    label: `Search Google for "${params.selectionText.substring(0, 20)}..."`,
                    click: () => {
                        createTab('https://www.google.com/search?q=' + encodeURIComponent(params.selectionText), false, { windowId: BrowserWindow.fromWebContents(webContents).id });
                    }
                },
                { type: 'separator' }
            );
        }

        // 2. Links
        if (params.linkURL) {
            menuTemplate.push(
                {
                    label: 'Open Link in New Tab',
                    click: () => {
                        createTab(params.linkURL, false, { windowId: BrowserWindow.fromWebContents(webContents).id });
                    }
                },
                {
                    label: 'Open Link in Incognito Window',
                    click: () => {
                        createTab(params.linkURL, true, { windowId: BrowserWindow.fromWebContents(webContents).id });
                    }
                },
                {
                    label: 'Copy Link Address',
                    click: () => {
                        const { clipboard } = require('electron');
                        clipboard.writeText(params.linkURL);
                    }
                },
                { type: 'separator' }
            );
        }

        // 3. Images
        if (params.mediaType === 'image') {
            menuTemplate.push(
                {
                    label: 'Open Image in New Tab',
                    click: () => {
                        createTab(params.srcURL, false, { windowId: BrowserWindow.fromWebContents(webContents).id });
                    }
                },
                {
                    label: 'Save Image As...',
                    click: () => {
                        webContents.downloadURL(params.srcURL);
                    }
                },
                {
                    label: 'Copy Image Address',
                    click: () => {
                        const { clipboard } = require('electron');
                        clipboard.writeText(params.srcURL);
                    }
                },
                { type: 'separator' }
            );
        }

        // 4. Editable (Input fields)
        if (params.isEditable) {
            menuTemplate.push(
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' }
            );
        }

        // 5. Navigation (Default if no specific selection)
        if (!params.selectionText && !params.linkURL && !params.mediaType) {
            menuTemplate.push(
                {
                    label: 'Back',
                    click: () => {
                        if (webContents.canGoBack()) webContents.goBack();
                    },
                    enabled: webContents.canGoBack()
                },
                {
                    label: 'Forward',
                    click: () => {
                        if (webContents.canGoForward()) webContents.goForward();
                    },
                    enabled: webContents.canGoForward()
                },
                {
                    label: 'Reload',
                    role: 'reload'
                },
                { type: 'separator' },
                {
                    label: 'Print...',
                    click: () => { webContents.print(); }
                }
            );
        }

        // 6. Developer Tools (Always available)
        menuTemplate.push(
            { type: 'separator' },
            {
                label: 'Inspect Element',
                click: () => {
                    webContents.inspectElement(params.x, params.y);
                }
            }
        );

        if (menuTemplate.length > 0) {
            const win = BrowserWindow.fromWebContents(webContents);
            if (win) {
                const menu = Menu.buildFromTemplate(menuTemplate);
                menu.popup({ window: win });
            }
        }
    });
}
