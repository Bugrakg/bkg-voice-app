const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceApp", {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  platform: process.platform,
  nodeEnv: process.env.NODE_ENV || "development",
  onPushToTalkStateChange(callback) {
    const listener = (_event, pressed) => callback(Boolean(pressed));
    ipcRenderer.on("push-to-talk-state", listener);

    return () => {
      ipcRenderer.removeListener("push-to-talk-state", listener);
    };
  },
  setPushToTalkShortcut(shortcut) {
    return ipcRenderer.invoke("set-push-to-talk-shortcut", shortcut);
  }
});
