const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const debugPtt = process.env.DEBUG_PTT === "true";
const hasGitHubToken = Boolean(process.env.GH_TOKEN);
let mainWindow = null;
let pushToTalkShortcut = "V";
let pushToTalkKeycode = null;
let isPushToTalkPressed = false;
let uIOhook = null;
let UiohookKey = null;
let uiohookStarted = false;
let keydownListener = null;
let keyupListener = null;
let hasShownUpdateDialog = false;

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
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: 500,
    height: 860,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: "#111317",
    title: "BKG Voice App",
    autoHideMenuBar: true,
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
  logPtt("listener started", {
    shortcut: pushToTalkShortcut,
    keycode: pushToTalkKeycode
  });
  return true;
}

function getDialogWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  return undefined;
}

async function openMicrophonePrivacySettings() {
  try {
    if (process.platform === "win32") {
      await shell.openExternal("ms-settings:privacy-microphone");
      return true;
    }

    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
      );
      return true;
    }
  } catch (error) {
    console.error("[permissions] failed to open microphone settings", error);
  }

  return false;
}

function setupAutoUpdates() {
  if (isDev) {
    console.log("[updater] Development mode detected, auto-update disabled.");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking-for-update");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update-available", info.version);
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[updater] update-not-available", info.version);
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater] error", error);
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(
      `[updater] download-progress ${Math.round(progress.percent)}% (${Math.round(
        progress.bytesPerSecond
      )} B/s)`
    );
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log("[updater] update-downloaded", info.version);

    if (hasShownUpdateDialog) {
      return;
    }

    hasShownUpdateDialog = true;
    const result = await dialog.showMessageBox(getDialogWindow(), {
      type: "info",
      buttons: ["Simdi guncelle", "Sonra"],
      defaultId: 0,
      cancelId: 1,
      title: "Guncelleme hazir",
      message: "Yeni surum indirildi.",
      detail: "Uygulamayi simdi yeniden baslatip guncellemek ister misin?"
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
      return;
    }

    hasShownUpdateDialog = false;
  });

  const checkForUpdates = async () => {
    try {
      if (!hasGitHubToken) {
        console.warn(
          "[updater] GH_TOKEN not set. Public GitHub releases can still work, but private access will fail."
        );
      }

      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("[updater] checkForUpdates failed", error);
    }
  };

  app.whenReady().then(() => {
    setTimeout(() => {
      void checkForUpdates();
    }, 3000);
  });
}

app.whenReady().then(() => {
  createMainWindow();
  setupPushToTalkListeners();
  setupAutoUpdates();

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

ipcMain.handle("open-microphone-privacy-settings", () => {
  return openMicrophonePrivacySettings();
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  teardownPushToTalkListeners();
});
