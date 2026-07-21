import { app, BrowserWindow, nativeTheme } from "electron";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const builtApplicationIconPath = path.join(dirname, "renderer", "app-icon.png");
const sourceApplicationIconPath = path.join(dirname, "..", "public", "app-icon.png");
const applicationIconPath = existsSync(builtApplicationIconPath)
    ? builtApplicationIconPath
    : sourceApplicationIconPath;
const windowBackgroundColor = "#131217"; // Mirrors happy2-ui --happy2-bg-chrome.
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
        icon: applicationIconPath,
        show: false,
        ...(process.platform === "darwin" ? macosWindowChrome : {}),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    window.once("ready-to-show", () => window.show());

    const hostedServerUrl = process.env.HAPPY2_SERVER_URL;
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (hostedServerUrl) {
        const url = new URL(hostedServerUrl);
        url.searchParams.set("desktop", "1");
        void window.loadURL(url.toString());
    } else if (devServerUrl) {
        void window.loadURL(devServerUrl);
    } else {
        void window.loadFile(path.join(dirname, "renderer", "index.html"));
    }
}

app.whenReady().then(() => {
    app.dock?.setIcon(applicationIconPath);
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
