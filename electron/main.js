const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  shell
} = require("electron");
const { autoUpdater } = require("electron-updater");
const packageJson = require("../package.json");

// Keep renderer-side audio/PTT reactions alive even when the window is unfocused.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-background-timer-throttling");

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
let windowsPttMonitor = null;
let windowsPttMonitorBuffer = "";
let hasShownUpdateDialog = false;
let pendingDisplaySourceId = null;
let pttLogFilePath = null;
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

function getPttLogFilePath() {
  if (pttLogFilePath) {
    return pttLogFilePath;
  }

  const baseDirectory = path.join(process.cwd(), ".codex-logs");
  fs.mkdirSync(baseDirectory, { recursive: true });
  pttLogFilePath = path.join(baseDirectory, "ptt-debug.log");
  return pttLogFilePath;
}

function writePttLogLine(source, message, extra) {
  const timestamp = new Date().toISOString();
  const payload =
    typeof extra === "undefined" ? "" : ` ${JSON.stringify(extra)}`;
  const line = `[${timestamp}] [${source}] ${message}${payload}\n`;

  try {
    fs.appendFileSync(getPttLogFilePath(), line, "utf8");
  } catch (error) {
    console.error("[ptt] failed to write log file", error);
  }
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
  writePttLogLine("main", message, extra);
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
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow = window;
  logPtt("main window created");
  window.webContents.on("did-start-loading", () => {
    logPtt("webContents did-start-loading");
  });
  window.webContents.on("dom-ready", () => {
    logPtt("webContents dom-ready");
  });
  window.webContents.on("did-finish-load", () => {
    logPtt("webContents did-finish-load", {
      url: window.webContents.getURL()
    });
    void window.webContents
      .executeJavaScript(
        "({ hasVoiceApp: Boolean(window.voiceApp), keys: window.voiceApp ? Object.keys(window.voiceApp) : [] })",
        true
      )
      .then((result) => {
        logPtt("renderer bridge probe", result);
      })
      .catch((error) => {
        logPtt("renderer bridge probe failed", {
          message: error?.message || String(error)
        });
      });
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logPtt("webContents did-fail-load", {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      });
    }
  );
  window.webContents.session.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: {
            width: 640,
            height: 360
          },
          fetchWindowIcons: true
        });
        const selectedSource =
          sources.find((source) => source.id === pendingDisplaySourceId) ||
          sources.find((source) => source.id.startsWith("screen:")) ||
          sources[0];

        if (!selectedSource) {
          console.error("[screen-share] no display source found");
          callback({ video: null, audio: false });
          return;
        }

        console.log("[screen-share] source selected", {
          sourceId: selectedSource.id,
          name: selectedSource.name
        });

        callback({
          video: selectedSource,
          audio:
            process.platform === "win32" && request.audioRequested
              ? "loopback"
              : false
        });
      } catch (error) {
        console.error("[screen-share] display media request failed", error);
        callback({ video: null, audio: false });
      } finally {
        pendingDisplaySourceId = null;
      }
    },
    { useSystemPicker: false }
  );
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

  logPtt(`renderer'a ${channel} gonderildi`);
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

function getWindowsVirtualKey(shortcut) {
  const normalizedShortcut = normalizeShortcut(shortcut);

  if (/^[A-Z]$/.test(normalizedShortcut)) {
    return normalizedShortcut.charCodeAt(0);
  }

  const functionKeyMatch = normalizedShortcut.match(/^F([1-9]|1[0-2])$/);
  if (functionKeyMatch) {
    return 0x70 + Number(functionKeyMatch[1]) - 1;
  }

  if (normalizedShortcut === "SPACE") {
    return 0x20;
  }

  return null;
}

function stopWindowsPushToTalkMonitor() {
  if (!windowsPttMonitor) {
    return;
  }

  windowsPttMonitorBuffer = "";
  windowsPttMonitor.kill();
  windowsPttMonitor = null;
}

function setupWindowsPushToTalkMonitor() {
  stopWindowsPushToTalkMonitor();

  const virtualKey = getWindowsVirtualKey(pushToTalkShortcut);
  if (!virtualKey) {
    console.warn(`[ptt] Unsupported Windows push-to-talk key: ${pushToTalkShortcut}`);
    sendPushToTalkDebug(`desteklenmeyen Windows PTT tusu: ${pushToTalkShortcut}`);
    return false;
  }

  const monitorScript = `
Add-Type @"
using System.Runtime.InteropServices;
public static class Win32Keyboard {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@
$virtualKey = ${virtualKey}
$isPressed = $false
while ($true) {
  $nextPressed = ([Win32Keyboard]::GetAsyncKeyState($virtualKey) -band 0x8000) -ne 0
  if ($nextPressed -ne $isPressed) {
    if ($nextPressed) {
      [Console]::Out.WriteLine("down")
    } else {
      [Console]::Out.WriteLine("up")
    }
    [Console]::Out.Flush()
    $isPressed = $nextPressed
  }
  Start-Sleep -Milliseconds 12
}
`.trim();

  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-Command",
      monitorScript
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    windowsPttMonitorBuffer += chunk;

    const lines = windowsPttMonitorBuffer.split(/\r?\n/);
    windowsPttMonitorBuffer = lines.pop() || "";

    for (const line of lines) {
      const message = line.trim().toLowerCase();

      if (message === "down" && !isPushToTalkPressed) {
        isPushToTalkPressed = true;
        logPtt("windows monitor keydown", {
          shortcut: pushToTalkShortcut,
          virtualKey
        });
        sendPushToTalkEvent("ptt-down");
      }

      if (message === "up" && isPushToTalkPressed) {
        isPushToTalkPressed = false;
        logPtt("windows monitor keyup", {
          shortcut: pushToTalkShortcut,
          virtualKey
        });
        sendPushToTalkEvent("ptt-up");
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    const message = String(chunk || "").trim();
    if (message) {
      console.error("[ptt] windows monitor error", message);
      sendPushToTalkDebug(`Windows PTT monitor hata verdi: ${message}`);
    }
  });

  child.on("exit", (code, signal) => {
    logPtt("windows monitor stopped", { code, signal });

    if (windowsPttMonitor === child) {
      windowsPttMonitor = null;
      windowsPttMonitorBuffer = "";
    }
  });

  windowsPttMonitor = child;
  logPtt("windows monitor started", {
    shortcut: pushToTalkShortcut,
    virtualKey
  });
  return true;
}

function teardownPushToTalkListeners() {
  stopWindowsPushToTalkMonitor();

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

async function setupPushToTalkListeners() {
  teardownPushToTalkListeners();

  if (process.platform === "win32") {
    const windowsMonitorStarted = setupWindowsPushToTalkMonitor();
    if (windowsMonitorStarted) {
      return true;
    }
  }

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
      await startResult;
      uiohookStarted = true;
      logPtt("listener started", {
        shortcut: pushToTalkShortcut,
        keycode: pushToTalkKeycode
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

app.whenReady().then(async () => {
  createMainWindow();
  await setupPushToTalkListeners();
  setupAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  teardownPushToTalkListeners();
});

ipcMain.handle("set-push-to-talk-shortcut", async (_event, shortcut) => {
  pushToTalkShortcut = normalizeShortcut(shortcut);
  pushToTalkKeycode = null;
  isPushToTalkPressed = false;
  sendPushToTalkEvent("ptt-up");

  const ok = await setupPushToTalkListeners();
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

ipcMain.handle("ptt-log", (_event, payload) => {
  const entry =
    payload && typeof payload === "object" ? payload : { message: String(payload || "") };
  writePttLogLine("renderer", entry.message || "", entry.extra);
  return true;
});

ipcMain.handle("get-ptt-log-path", () => {
  return getPttLogFilePath();
});

ipcMain.handle("get-push-to-talk-state", () => {
  return {
    pressed: isPushToTalkPressed,
    shortcut: pushToTalkShortcut
  };
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

ipcMain.handle("list-display-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: {
        width: 640,
        height: 360
      },
      fetchWindowIcons: true
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith("screen:") ? "screen" : "window",
      thumbnailDataUrl: source.thumbnail.isEmpty()
        ? ""
        : source.thumbnail.toDataURL(),
      appIconDataUrl: source.appIcon?.isEmpty?.() ? "" : source.appIcon?.toDataURL?.() || ""
    }));
  } catch (error) {
    console.error("[screen-share] failed to list display sources", error);
    return [];
  }
});

ipcMain.handle("select-display-source", (_event, sourceId) => {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    pendingDisplaySourceId = null;
    return false;
  }

  pendingDisplaySourceId = sourceId;
  console.log("[screen-share] pending source stored", sourceId);
  return true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  teardownPushToTalkListeners();
});
