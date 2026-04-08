const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("voiceApp", {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  platform: process.platform,
  nodeEnv: process.env.NODE_ENV || "development",
  serverUrl:
    process.env.SIGNALING_SERVER_URL ||
    "http://localhost:3001"
});
