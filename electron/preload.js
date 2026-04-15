const { contextBridge, ipcRenderer } = require("electron");
const packageJson = require("../package.json");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const defaultProductionServerUrl = "https://bkg-voice-app.onrender.com";

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
    const listener = () => callback();
    ipcRenderer.on("ptt-down", listener);

    return () => {
      ipcRenderer.removeListener("ptt-down", listener);
    };
  },
  onPushToTalkUp(callback) {
    const listener = () => callback();
    ipcRenderer.on("ptt-up", listener);

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
