const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

let win;
let viewMode = 'normal'; // 'normal', 'bubble', 'chat'

function createWindow() {
    const width = 850;
    const height = 800;

    let w, h;
    if (viewMode === 'bubble') {
        w = 70;
        h = 70;
    } else if (viewMode === 'chat') {
        w = 400;
        h = 500;
    } else {
        w = width;
        h = height;
    }

    win = new BrowserWindow({
        width: w,
        height: h,
        alwaysOnTop: viewMode !== 'normal',
        frame: false,
        transparent: true,
        resizable: viewMode !== 'bubble',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'dist/chat-app/browser/favicon.ico')
    });

    win.loadURL(
        url.format({
            pathname: path.join(__dirname, 'dist/chat-app/browser/index.html'),
            protocol: 'file:',
            slashes: true
        })
    );

    // win.webContents.openDevTools();

    win.on('closed', () => {
        win = null;
    });
}

ipcMain.on('toggle-floating-mode', () => {
    if (win) {
        if (viewMode === 'normal') {
            viewMode = 'bubble';
            win.setSize(70, 70);
            win.setAlwaysOnTop(true);
            win.setResizable(false);
        } else {
            viewMode = 'normal';
            win.setSize(850, 800);
            win.setAlwaysOnTop(false);
            win.setResizable(true);
            win.center();
        }
        win.webContents.send('view-mode-changed', viewMode);
    }
});

ipcMain.on('expand-bubble', () => {
    if (win && viewMode === 'bubble') {
        viewMode = 'normal';
        // Notify renderer IMMEDIATELY so it starts fading in/preparing layout
        win.webContents.send('view-mode-changed', viewMode);

        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        const winWidth = 850;
        const winHeight = 800;
        const x = Math.round((width - winWidth) / 2);
        const y = Math.round((height - winHeight) / 2);

        win.setResizable(true);
        win.setAlwaysOnTop(false);
        // Atomic update for position and size
        win.setBounds({ x, y, width: winWidth, height: winHeight });
    }
});

ipcMain.on('collapse-bubble', () => {
    if (win && viewMode === 'chat') {
        viewMode = 'bubble';
        win.setSize(70, 70);
        win.setResizable(false);
        win.webContents.send('view-mode-changed', viewMode);
    }
});

ipcMain.on('window-move', (event, { x, y }) => {
    if (win) {
        const [winX, winY] = win.getPosition();
        win.setPosition(winX + x, winY + y);
    }
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
});
