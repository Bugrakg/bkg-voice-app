const { contextBridge, ipcRenderer } = require("electron");

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
  setPushToTalkShortcut(shortcut) {
    return ipcRenderer.invoke("set-push-to-talk-shortcut", shortcut);
  },
  openMicrophonePrivacySettings() {
    return ipcRenderer.invoke("open-microphone-privacy-settings");
  }
});
