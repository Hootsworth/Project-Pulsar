const electron = require('electron');
console.log('Keys:', Object.getOwnPropertyNames(electron));

if ('app' in electron) {
    console.log('App key exists in electron object');
    console.log('App object type:', typeof electron.app);
} else {
    console.log('App key DOES NOT exist');
}

process.exit(0);
