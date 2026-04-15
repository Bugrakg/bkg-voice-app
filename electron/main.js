const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const packageJson = require("../package.json");

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
let currentUpdaterState = {
  visible: false,
  status: "idle",
  title: "",
  detail: "",
  progressPercent: 0,
  bytesPerSecond: 0,
  version: ""
};

function sendUpdaterState(nextState) {
  currentUpdaterState = {
    ...currentUpdaterState,
    ...nextState
  };

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("updater-state", currentUpdaterState);
}

function loadUiohookModule() {
  try {
    const loadedModule = require("uiohook-napi");
    sendPushToTalkDebug("uiohook-napi standart yoldan yuklendi");
    return loadedModule;
  } catch (primaryError) {
    const unpackedModulePath = path.join(
      process.resourcesPath || "",
      "app.asar.unpacked",
      "node_modules",
      "uiohook-napi"
    );

    try {
      const loadedModule = require(unpackedModulePath);
      sendPushToTalkDebug("uiohook-napi unpacked yoldan yuklendi");
      return loadedModule;
    } catch (fallbackError) {
      console.error("[ptt] uiohook-napi could not be loaded.", {
        primaryError,
        fallbackError,
        unpackedModulePath
      });
      sendPushToTalkDebug("uiohook-napi yuklenemedi");
      return null;
    }
  }
}

function sendPushToTalkDebug(message) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("ptt-debug", message);
}

function logPtt(message, extra) {
  sendPushToTalkDebug(
    typeof extra === "undefined" ? message : `${message} ${JSON.stringify(extra)}`
  );

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
    width: 1080,
    height: 860,
    minWidth: 860,
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
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }

    return { action: "allow" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.webContents.on("did-finish-load", () => {
    sendUpdaterState(currentUpdaterState);
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

  const uiohookModule = loadUiohookModule();
  if (!uiohookModule) {
    return false;
  }

  ({ uIOhook, UiohookKey } = uiohookModule);

  pushToTalkKeycode = getPushToTalkKeycode(pushToTalkShortcut);

  if (!pushToTalkKeycode) {
    console.warn(`[ptt] Unsupported push-to-talk key: ${pushToTalkShortcut}`);
    sendPushToTalkDebug(`desteklenmeyen PTT tusu: ${pushToTalkShortcut}`);
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
  try {
    const startResult = uIOhook.start();

    if (startResult && typeof startResult.then === "function") {
      void startResult
        .then(() => {
          uiohookStarted = true;
          logPtt("listener started", {
            shortcut: pushToTalkShortcut,
            keycode: pushToTalkKeycode
          });
        })
        .catch((error) => {
          console.error("[ptt] uiohook-napi could not start.", error);
          sendPushToTalkDebug("PTT erisilebilirlik izni olmadigi icin baslatilamadi");
        });

      return true;
    }

    uiohookStarted = true;
  } catch (error) {
    console.error("[ptt] uiohook-napi start failed.", error);
    sendPushToTalkDebug("PTT erisilebilirlik izni olmadigi icin baslatilamadi");
    return false;
  }

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
    sendUpdaterState({
      visible: true,
      status: "checking",
      title: "Guncellemeler kontrol ediliyor",
      detail: "Uygulama yeni bir surum var mi diye bakiyor.",
      progressPercent: 0,
      bytesPerSecond: 0,
      version: ""
    });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update-available", info.version);
    sendUpdaterState({
      visible: true,
      status: "available",
      title: "Yeni surum bulundu",
      detail: `${info.version} surumu indirilmeye basladi.`,
      version: info.version || "",
      progressPercent: 0,
      bytesPerSecond: 0
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[updater] update-not-available", info.version);
    sendUpdaterState({
      visible: false,
      status: "idle",
      title: "",
      detail: "",
      progressPercent: 0,
      bytesPerSecond: 0,
      version: info.version || ""
    });
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater] error", error);
    sendUpdaterState({
      visible: true,
      status: "error",
      title: "Guncelleme kontrolunde sorun oldu",
      detail: error?.message || "Guncelleme servisine su an ulasilamiyor.",
      progressPercent: 0,
      bytesPerSecond: 0
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(
      `[updater] download-progress ${Math.round(progress.percent)}% (${Math.round(
        progress.bytesPerSecond
      )} B/s)`
    );
    sendUpdaterState({
      visible: true,
      status: "downloading",
      title: "Yeni surum indiriliyor",
      detail: "Indirme surerken uygulamayi kullanmaya devam edebilirsin.",
      progressPercent: Math.round(progress.percent),
      bytesPerSecond: Math.round(progress.bytesPerSecond)
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log("[updater] update-downloaded", info.version);
    sendUpdaterState({
      visible: true,
      status: "downloaded",
      title: "Guncelleme hazir",
      detail: "Indirme tamamlandi. Yeniden baslatinca yeni surume gececeksin.",
      progressPercent: 100,
      bytesPerSecond: 0,
      version: info.version || ""
    });

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
  return packageJson.version || app.getVersion();
});

ipcMain.handle("get-updater-state", () => {
  return currentUpdaterState;
});

ipcMain.handle("open-external-url", async (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error("[shell] failed to open external url", error);
    return false;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  teardownPushToTalkListeners();
});
