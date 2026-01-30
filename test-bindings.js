try {
    const common = process._linkedBinding('electron_common');
    console.log('electron_common keys:', Object.keys(common));
    const browser = process._linkedBinding('electron_browser');
    console.log('electron_browser keys:', Object.keys(browser));
} catch (e) {
    console.error('Linked binding failed:', e.message);
}
process.exit(0);
