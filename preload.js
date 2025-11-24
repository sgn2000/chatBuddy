const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    toggleFloating: () => ipcRenderer.send('toggle-floating-mode'),
    expandBubble: () => ipcRenderer.send('expand-bubble'),
    collapseBubble: () => ipcRenderer.send('collapse-bubble'),
    moveWindow: (x, y) => ipcRenderer.send('window-move', { x, y }),
    resetWindowSize: () => ipcRenderer.send('reset-window-size'),
    onViewModeChanged: (callback) => ipcRenderer.on('view-mode-changed', (event, mode) => callback(mode))
});
