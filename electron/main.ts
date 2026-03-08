import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { BackendManager } from './backend-manager';
import { buildMenu } from './menu';

const IS_DEV = !app.isPackaged;
const backend = new BackendManager();

let splashWin: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;

function createSplashWindow(): void {
  splashWin = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.center();
}

function createMainWindow(): void {
  mainWin = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#050810',
    icon: path.join(__dirname, 'icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (IS_DEV) {
    mainWin.loadURL('http://localhost:5173');
  } else {
    mainWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open external links in system browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

function updateSplashStatus(text: string): void {
  if (splashWin && !splashWin.isDestroyed()) {
    const escaped = text.replace(/'/g, "\\'");
    splashWin.webContents
      .executeJavaScript(`document.getElementById('status').textContent='${escaped}'`)
      .catch(() => {});
  }
}

app.whenReady().then(async () => {
  buildMenu();
  createSplashWindow();

  updateSplashStatus('Starting backend...');

  backend.onProgress = (msg) => updateSplashStatus(msg);

  try {
    await backend.start();
    updateSplashStatus('Loading dashboard...');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateSplashStatus(`Backend error: ${message}`);
    // Still try to open main window — user can retry manually
  }

  createMainWindow();

  mainWin!.once('ready-to-show', () => {
    mainWin!.show();
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.close();
      splashWin = null;
    }
  });
});

app.on('window-all-closed', () => {
  backend.stop();
  app.quit();
});

app.on('before-quit', () => {
  backend.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    mainWin!.show();
  }
});
