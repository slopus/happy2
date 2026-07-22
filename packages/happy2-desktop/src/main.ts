import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CredentialVault } from "./main/credentialVault";
import { DesktopRuntime } from "./main/desktopRuntime";
import { rendererNavigationAllowed } from "./main/navigation";
import { desktopUpdaterCreate } from "./main/updater";
import {
    desktopCredentialValueValidate,
    desktopStartRequestValidate,
    desktopTopologyIdValidate,
} from "./main/runtimeValidation";
import { desktopIpc } from "./shared/desktopContract";

if (process.platform !== "darwin") {
    console.error("Happy (2) desktop is available only on macOS.");
    app.exit(1);
}
if (!app.requestSingleInstanceLock()) app.quit();

const dirname = fileURLToPath(new URL(".", import.meta.url));
const builtApplicationIconPath = join(dirname, "renderer", "app-icon.png");
const sourceApplicationIconPath = join(dirname, "..", "public", "app-icon.png");
const applicationIconPath = existsSync(builtApplicationIconPath)
    ? builtApplicationIconPath
    : sourceApplicationIconPath;
const windowBackgroundColor = nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#f5f5f5";
const titleBarHeight = 38;
const macosTrafficLightSize = 14;
const macosWindowChrome = {
    titleBarStyle: "hidden",
    trafficLightPosition: {
        x: 14,
        y: (titleBarHeight - macosTrafficLightSize) / 2,
    },
} as const;

nativeTheme.themeSource = "system";

let runtime: DesktopRuntime;
let quitting = false;

function createWindow(): void {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const rendererPath = join(dirname, "renderer", "index.html");
    const rendererUrl = devServerUrl ?? pathToFileURL(rendererPath).toString();
    const window = new BrowserWindow({
        backgroundColor: windowBackgroundColor,
        width: 1100,
        height: 760,
        minWidth: 720,
        minHeight: 480,
        icon: applicationIconPath,
        show: false,
        ...macosWindowChrome,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: join(dirname, "preload.cjs"),
            sandbox: true,
        },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
        if (!rendererNavigationAllowed(url, rendererUrl, devServerUrl !== undefined))
            event.preventDefault();
    };
    window.webContents.on("will-navigate", preventUntrustedNavigation);
    window.webContents.on("will-redirect", preventUntrustedNavigation);
    window.once("ready-to-show", () => window.show());
    if (devServerUrl) void window.loadURL(devServerUrl);
    else void window.loadFile(rendererPath);
}

void app
    .whenReady()
    .then(async () => {
        app.dock?.setIcon(applicationIconPath);
        const desktopRoot = join(app.getPath("userData"), "desktop");
        const vault = new CredentialVault(join(desktopRoot, "credentials.json"), {
            available: () => safeStorage.isEncryptionAvailable(),
            decrypt: (value) => safeStorage.decryptString(value),
            encrypt: (value) => safeStorage.encryptString(value),
        });
        runtime = await DesktopRuntime.create(
            {
                executablePath: process.execPath,
                root: desktopRoot,
                serverWorkerPath: join(dirname, "server-process.js"),
                webRoot: join(dirname, "renderer"),
            },
            vault,
        );
        const updater = desktopUpdaterCreate({
            packaged: app.isPackaged,
            update: (snapshot) => runtime.updateSet(snapshot),
        });
        runtime.subscribe((snapshot) => {
            for (const window of BrowserWindow.getAllWindows())
                window.webContents.send(desktopIpc.runtimeChanged, snapshot);
        });
        ipcMain.handle(desktopIpc.runtimeGet, () => runtime.get());
        ipcMain.handle(desktopIpc.runtimeStart, (_event, request: unknown) =>
            runtime.start(desktopStartRequestValidate(request)),
        );
        ipcMain.handle(desktopIpc.runtimeRetry, () => runtime.retry());
        ipcMain.handle(desktopIpc.runtimeReset, () => runtime.reset());
        ipcMain.handle(desktopIpc.topologySelect, (_event, topologyId: unknown) =>
            runtime.topologySelect(desktopTopologyIdValidate(topologyId)),
        );
        ipcMain.handle(desktopIpc.sessionCredentialGet, (_event, targetId: unknown) =>
            runtime.sessionCredentialGet(desktopTopologyIdValidate(targetId)),
        );
        ipcMain.handle(
            desktopIpc.sessionCredentialSet,
            (_event, targetId: unknown, value: unknown) =>
                runtime.sessionCredentialSet(
                    desktopTopologyIdValidate(targetId),
                    desktopCredentialValueValidate(value),
                ),
        );
        ipcMain.handle(desktopIpc.updateInstall, () => updater.install());
        createWindow();
        void updater.check().catch(() => undefined);
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    })
    .catch((error: unknown) => {
        dialog.showErrorBox(
            "Happy could not start",
            error instanceof Error ? error.message : "The desktop runtime failed to initialize.",
        );
        app.quit();
    });

app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
});

app.on("before-quit", (event) => {
    if (quitting || !runtime) return;
    event.preventDefault();
    void runtime.close().finally(() => {
        quitting = true;
        app.quit();
    });
});
