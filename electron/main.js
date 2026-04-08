const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const debugPtt = process.env.DEBUG_PTT === "true";
let mainWindow = null;
let pushToTalkShortcut = "V";
let pushToTalkKeycode = null;
let isPushToTalkPressed = false;
let uIOhook = null;
let UiohookKey = null;
let uiohookStarted = false;
let keydownListener = null;
let keyupListener = null;

function logPtt(message, extra) {
  if (!debugPtt) {
    return;
  }

  if (typeof extra === "undefined") {
    console.log(`[ptt] ${message}`);
    return;
  }

  console.log(`[ptt] ${message}`, extra);
}

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
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (isDev) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
}

function sendPushToTalkEvent(channel) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel);
}

function normalizeShortcut(shortcut) {
  return String(shortcut || "V").trim().toUpperCase() || "V";
}

function getPushToTalkKeycode(shortcut) {
  if (!UiohookKey) {
    return null;
  }

  const normalizedShortcut = normalizeShortcut(shortcut);

  if (/^[A-Z]$/.test(normalizedShortcut)) {
    return UiohookKey[normalizedShortcut] ?? null;
  }

  if (/^F([1-9]|1[0-2])$/.test(normalizedShortcut)) {
    return UiohookKey[normalizedShortcut] ?? null;
  }

  if (normalizedShortcut === "SPACE") {
    return UiohookKey.Space ?? null;
  }

  return null;
}

function teardownPushToTalkListeners() {
  if (!uIOhook) {
    return;
  }

  if (keydownListener) {
    uIOhook.removeListener("keydown", keydownListener);
    keydownListener = null;
  }

  if (keyupListener) {
    uIOhook.removeListener("keyup", keyupListener);
    keyupListener = null;
  }

  if (uiohookStarted) {
    uIOhook.stop();
    uiohookStarted = false;
  }
}

function setupPushToTalkListeners() {
  teardownPushToTalkListeners();

  try {
    ({ uIOhook, UiohookKey } = require("uiohook-napi"));
  } catch (error) {
    console.error("[ptt] uiohook-napi could not be loaded.", error);
    return false;
  }

  pushToTalkKeycode = getPushToTalkKeycode(pushToTalkShortcut);

  if (!pushToTalkKeycode) {
    console.warn(`[ptt] Unsupported push-to-talk key: ${pushToTalkShortcut}`);
    return false;
  }

  keydownListener = (event) => {
    if (event.keycode !== pushToTalkKeycode || isPushToTalkPressed) {
      return;
    }

    isPushToTalkPressed = true;
    logPtt("keydown", { shortcut: pushToTalkShortcut, keycode: event.keycode });
    sendPushToTalkEvent("ptt-down");
  };

  keyupListener = (event) => {
    if (event.keycode !== pushToTalkKeycode || !isPushToTalkPressed) {
      return;
    }

    isPushToTalkPressed = false;
    logPtt("keyup", { shortcut: pushToTalkShortcut, keycode: event.keycode });
    sendPushToTalkEvent("ptt-up");
  };

  uIOhook.on("keydown", keydownListener);
  uIOhook.on("keyup", keyupListener);
  uIOhook.start();
  uiohookStarted = true;
  logPtt("listener started", { shortcut: pushToTalkShortcut, keycode: pushToTalkKeycode });
  return true;
}

app.whenReady().then(() => {
  createMainWindow();
  setupPushToTalkListeners();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

ipcMain.handle("set-push-to-talk-shortcut", (_event, shortcut) => {
  pushToTalkShortcut = normalizeShortcut(shortcut);
  pushToTalkKeycode = null;
  isPushToTalkPressed = false;
  sendPushToTalkEvent("ptt-up");

  const ok = setupPushToTalkListeners();
  return {
    ok,
    shortcut: pushToTalkShortcut
  };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  teardownPushToTalkListeners();
});
