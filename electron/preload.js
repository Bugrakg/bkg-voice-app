const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const defaultProductionServerUrl = "https://bkg-voice-app.onrender.com";

function appendPreloadLog(message) {
  try {
    const directory = path.join(process.cwd(), ".codex-logs");
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(
      path.join(directory, "ptt-debug.log"),
      `[${new Date().toISOString()}] [preload] ${message}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("[ptt] preload log write failed", error);
  }
}

appendPreloadLog("preload script evaluated");

contextBridge.exposeInMainWorld("voiceApp", {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  platform: process.platform,
  debugPtt: process.env.DEBUG_PTT === "true",
  nodeEnv: process.env.NODE_ENV || "development",
  appVersion: packageJson.version,
  serverUrl:
    process.env.SIGNALING_SERVER_URL ||
    (isDev ? "" : defaultProductionServerUrl),
  onPushToTalkDown(callback) {
    const listener = () => {
      appendPreloadLog("preload received ptt-down");
      callback();
    };
    ipcRenderer.on("ptt-down", listener);

    appendPreloadLog("preload subscribed ptt-down");

    return () => {
      ipcRenderer.removeListener("ptt-down", listener);
    };
  },
  onPushToTalkUp(callback) {
    const listener = () => {
      appendPreloadLog("preload received ptt-up");
      callback();
    };
    ipcRenderer.on("ptt-up", listener);

    appendPreloadLog("preload subscribed ptt-up");

    return () => {
      ipcRenderer.removeListener("ptt-up", listener);
    };
  },
  onPushToTalkDebug(callback) {
    const listener = (_event, message) => callback(String(message || ""));
    ipcRenderer.on("ptt-debug", listener);

    return () => {
      ipcRenderer.removeListener("ptt-debug", listener);
    };
  },
  setPushToTalkShortcut(shortcut) {
    return ipcRenderer.invoke("set-push-to-talk-shortcut", shortcut);
  },
  logPtt(message, extra) {
    return ipcRenderer.invoke("ptt-log", {
      message: String(message || ""),
      extra
    });
  },
  getPttLogPath() {
    return ipcRenderer.invoke("get-ptt-log-path");
  },
  getPushToTalkState() {
    return ipcRenderer.invoke("get-push-to-talk-state");
  },
  openMicrophonePrivacySettings() {
    return ipcRenderer.invoke("open-microphone-privacy-settings");
  },
  getAppVersion() {
    return ipcRenderer.invoke("get-app-version");
  },
  getUpdaterState() {
    return ipcRenderer.invoke("get-updater-state");
  },
  onUpdaterState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updater-state", listener);

    return () => {
      ipcRenderer.removeListener("updater-state", listener);
    };
  },
  openExternalUrl(url) {
    return ipcRenderer.invoke("open-external-url", url);
  },
  listDisplaySources() {
    return ipcRenderer.invoke("list-display-sources");
  },
  selectDisplaySource(sourceId) {
    return ipcRenderer.invoke("select-display-source", sourceId);
  }
});
