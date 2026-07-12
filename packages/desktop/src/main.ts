import { app, BrowserWindow, nativeTheme } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const windowBackgroundColor = "#131217"; // Mirrors rigged-ui --rg-bg-chrome.
const titleBarHeight = 38;
const macosTrafficLightSize = 14;
const macosWindowChrome = {
    titleBarStyle: "hidden",
    trafficLightPosition: {
        x: 14,
        y: (titleBarHeight - macosTrafficLightSize) / 2,
    },
} as const;

nativeTheme.themeSource = "dark";

function createWindow() {
    const window = new BrowserWindow({
        backgroundColor: windowBackgroundColor,
        width: 1100,
        height: 760,
        minWidth: 720,
        minHeight: 480,
        show: false,
        ...(process.platform === "darwin" ? macosWindowChrome : {}),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    window.once("ready-to-show", () => window.show());

    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
        void window.loadURL(devServerUrl);
    } else {
        void window.loadFile(path.join(dirname, "renderer", "index.html"));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
