const path = require("path");
const { app, BrowserWindow } = require("electron");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

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
      nodeIntegration: false
    }
  });

  if (isDev) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
