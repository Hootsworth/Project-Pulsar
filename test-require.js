try {
    const { app } = require('electron/main');
    console.log('App from electron/main:', typeof app);
} catch (e) {
    console.error('electron/main failed:', e.message);
}

try {
    const electron = require('electron');
    console.log('electron type:', typeof electron);
} catch (e) {
    console.error('electron failed:', e.message);
}
process.exit(0);
