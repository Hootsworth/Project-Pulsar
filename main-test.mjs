import { app, BrowserWindow } from 'electron';

console.log('ESM Main process started. App object:', !!app);

if (app) {
    app.whenReady().then(() => {
        console.log('App ready (ESM)');
        const win = new BrowserWindow({ width: 800, height: 600 });
        win.loadURL('https://google.com');
        setTimeout(() => app.quit(), 2000);
    });
} else {
    console.error('FAILED TO GET APP OBJECT (ESM)');
}
