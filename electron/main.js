const path = require("path");
const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
let mainWindow = null;
let isPushToTalkPressed = false;
let pushToTalkShortcut = "F8";

function createMainWindow() {
  const window = new BrowserWindow({
    width: 500,
    height: 860,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: "#111317",
    title: "BKG Voice App",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow = window;

  if (isDev) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
}

function sendPushToTalkState(pressed) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("push-to-talk-state", pressed);
}

function registerPushToTalkShortcut(shortcut = pushToTalkShortcut) {
  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(shortcut, () => {
    isPushToTalkPressed = !isPushToTalkPressed;
    sendPushToTalkState(isPushToTalkPressed);
  });

  if (registered) {
    pushToTalkShortcut = shortcut;
  }

  return registered;
}

app.whenReady().then(() => {
  createMainWindow();
  registerPushToTalkShortcut();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

ipcMain.handle("set-push-to-talk-shortcut", (_event, shortcut) => {
  isPushToTalkPressed = false;
  sendPushToTalkState(false);
  const registered = registerPushToTalkShortcut(String(shortcut || "F8"));
  return {
    ok: registered,
    shortcut: pushToTalkShortcut
  };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
