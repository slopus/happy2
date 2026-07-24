import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    nativeTheme,
    shell,
    type BrowserWindowConstructorOptions,
    type MenuItemConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DesktopRuntime } from "./main/desktopRuntime";
import { desktopInstanceMenuTargets } from "./main/applicationMenu";
import {
    desktopWindowTarget,
    remoteNavigationAllowed,
    rendererNavigationAllowed,
} from "./main/navigation";
import { desktopUpdaterCreate } from "./main/updater";
import { DesktopWindowLifecycle, type DesktopWindowBounds } from "./main/windowLifecycle";
import { desktopStartRequestValidate, desktopTopologyIdValidate } from "./main/runtimeValidation";
import { desktopIpc } from "./shared/desktopContract";
import { localRigConnectorCreate } from "./main/localRig";
import { RigIpcHost } from "./main/rigIpcHost";
import {
    rigClientRequestValidate,
    rigScrollbackBasisValidate,
    rigScrollbackValidate,
    rigStreamIdValidate,
    rigStreamOpenRequestValidate,
    rigTerminalInputValidate,
    rigTerminalSizeValidate,
} from "./main/rigIpcValidation";
import { RigInstallTerminalManager } from "./main/rigInstallTerminal";

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
let rigIpcHost: RigIpcHost;
let rigInstallManager: RigInstallTerminalManager;
let quitting = false;
let activeRigConnectionId: number | undefined;
const windowLifecycle = new DesktopWindowLifecycle<BrowserWindow>();

function windowOptions(
    bounds: DesktopWindowBounds | undefined,
    webPreferences: BrowserWindowConstructorOptions["webPreferences"],
): BrowserWindowConstructorOptions {
    return {
        backgroundColor: windowBackgroundColor,
        width: bounds?.width ?? 1100,
        height: bounds?.height ?? 760,
        ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
        minWidth: 720,
        minHeight: 480,
        icon: applicationIconPath,
        show: false,
        ...macosWindowChrome,
        webPreferences,
    };
}

function localWindowCreate(bounds?: DesktopWindowBounds) {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL;
    const rendererPath = join(dirname, "renderer", "index.html");
    const rendererUrl = developmentUrl ?? pathToFileURL(rendererPath).toString();
    const window = new BrowserWindow({
        ...windowOptions(bounds, {
            contextIsolation: true,
            nodeIntegration: false,
            preload: join(dirname, "preload.cjs"),
            sandbox: true,
        }),
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
        if (!rendererNavigationAllowed(url, rendererUrl, developmentUrl !== undefined))
            event.preventDefault();
    };
    window.webContents.on("will-navigate", preventUntrustedNavigation);
    window.webContents.on("will-redirect", preventUntrustedNavigation);
    const ownerId = window.webContents.id;
    const cleanup = () => {
        rigIpcHost?.closeOwner(ownerId);
        rigInstallManager?.closeOwner(ownerId);
    };
    window.webContents.on("render-process-gone", cleanup);
    window.webContents.on("destroyed", cleanup);
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) cleanup();
    });
    return {
        load: () =>
            developmentUrl ? window.loadURL(developmentUrl) : window.loadFile(rendererPath),
        window,
    };
}

function remoteWindowCreate(url: string, bounds?: DesktopWindowBounds) {
    // This is deliberately a separate WebContents from the local shell. Access,
    // its identity providers, and the remote Happy deployment never receive the
    // preload bridge or any native credential/runtime capability.
    const window = new BrowserWindow({
        ...windowOptions(bounds, {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        }),
    });
    window.webContents.setWindowOpenHandler(({ url: candidate }) => {
        if (remoteNavigationAllowed(candidate)) void shell.openExternal(candidate);
        return { action: "deny" };
    });
    const preventUntrustedNavigation = (event: Electron.Event, candidate: string) => {
        if (!remoteNavigationAllowed(candidate)) event.preventDefault();
    };
    window.webContents.on("will-navigate", preventUntrustedNavigation);
    window.webContents.on("will-redirect", preventUntrustedNavigation);
    return { load: () => window.loadURL(url), window };
}

function windowSynchronize(snapshot: ReturnType<DesktopRuntime["get"]>): BrowserWindow {
    const target = desktopWindowTarget(snapshot);
    return windowLifecycle.synchronize(target.key, (bounds) =>
        target.kind === "cloud"
            ? remoteWindowCreate(target.url, bounds)
            : localWindowCreate(bounds),
    );
}

function applicationMenuInstall(snapshot: ReturnType<DesktopRuntime["get"]>): void {
    const targets = desktopInstanceMenuTargets(snapshot);
    const instances: MenuItemConstructorOptions[] = targets.map((target) => ({
        label: target.label,
        type: "checkbox",
        checked: target.active,
        click: () => void runtime.topologySelect(target.id).catch(() => undefined),
    }));
    if (instances.length === 0) instances.push({ label: "No saved instances", enabled: false });
    instances.push(
        { type: "separator" },
        {
            label: "Choose or Add Instance…",
            accelerator: "CmdOrCtrl+Shift+I",
            click: () => void runtime.reset().catch(() => undefined),
        },
    );
    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
            {
                role: "appMenu",
                submenu: [
                    { role: "about" },
                    { type: "separator" },
                    { role: "services" },
                    { type: "separator" },
                    { role: "hide" },
                    { role: "hideOthers" },
                    { role: "unhide" },
                    { type: "separator" },
                    { role: "quit" },
                ],
            },
            { label: "Instances", submenu: instances },
            { role: "editMenu" },
            { role: "viewMenu" },
            { role: "windowMenu" },
        ]),
    );
}

void app
    .whenReady()
    .then(async () => {
        app.dock?.setIcon(applicationIconPath);
        const desktopRoot = join(app.getPath("userData"), "desktop");
        const connector = localRigConnectorCreate();
        runtime = await DesktopRuntime.create(
            {
                root: desktopRoot,
            },
            { localRigConnector: connector },
        );
        rigIpcHost = new RigIpcHost(() => runtime.localRigTransport());
        rigInstallManager = new RigInstallTerminalManager(connector, {
            verified: () => void runtime.retry().catch(() => undefined),
        });
        const updater = desktopUpdaterCreate({
            packaged: app.isPackaged,
            update: (snapshot) => runtime.updateSet(snapshot),
        });
        runtime.subscribe((snapshot) => {
            const previous = windowLifecycle.get();
            const nextRigConnectionId =
                snapshot.phase === "ready" && snapshot.mode === "local"
                    ? snapshot.connectionId
                    : undefined;
            if (
                previous &&
                activeRigConnectionId !== undefined &&
                nextRigConnectionId !== activeRigConnectionId
            )
                rigIpcHost.closeOwner(previous.webContents.id);
            activeRigConnectionId = nextRigConnectionId;
            const window = windowSynchronize(snapshot);
            applicationMenuInstall(snapshot);
            if (window === previous && desktopWindowTarget(snapshot).kind === "local")
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
        ipcMain.handle(desktopIpc.rigRequest, (_event, request: unknown) =>
            rigIpcHost.request(rigClientRequestValidate(request)),
        );
        ipcMain.handle(desktopIpc.rigStreamOpen, (event, request: unknown) =>
            rigIpcHost.streamOpen(
                event.sender.id,
                rigStreamOpenRequestValidate(request),
                (streamEvent) => {
                    if (!event.sender.isDestroyed())
                        event.sender.send(desktopIpc.rigStreamEvent, streamEvent);
                },
            ),
        );
        ipcMain.handle(desktopIpc.rigStreamClose, (event, streamId: unknown) =>
            rigIpcHost.streamClose(event.sender.id, rigStreamIdValidate(streamId)),
        );
        ipcMain.handle(desktopIpc.rigTerminalWrite, (event, streamId: unknown, data: unknown) =>
            rigIpcHost.terminalWrite(
                event.sender.id,
                rigStreamIdValidate(streamId),
                rigTerminalInputValidate(data),
            ),
        );
        ipcMain.handle(
            desktopIpc.rigTerminalResize,
            (event, streamId: unknown, cols: unknown, rows: unknown) => {
                const size = rigTerminalSizeValidate(cols, rows);
                rigIpcHost.terminalResize(
                    event.sender.id,
                    rigStreamIdValidate(streamId),
                    size.cols,
                    size.rows,
                );
            },
        );
        ipcMain.handle(
            desktopIpc.rigTerminalScrollback,
            (event, streamId: unknown, start: unknown, count: unknown, basis: unknown) => {
                const range = rigScrollbackValidate(start, count);
                return rigIpcHost.terminalScrollback(
                    event.sender.id,
                    rigStreamIdValidate(streamId),
                    range.start,
                    range.count,
                    rigScrollbackBasisValidate(basis),
                );
            },
        );
        ipcMain.handle(desktopIpc.rigInstallOpen, (event) =>
            rigInstallManager.open(event.sender.id, (installEvent) => {
                if (!event.sender.isDestroyed())
                    event.sender.send(desktopIpc.rigInstallEvent, installEvent);
            }),
        );
        ipcMain.handle(
            desktopIpc.rigInstallConfirm,
            (event, terminalId: unknown, cols: unknown, rows: unknown) => {
                const size = rigTerminalSizeValidate(cols, rows);
                if (typeof terminalId !== "string")
                    throw new Error("The Rig installation terminal identity is invalid.");
                rigInstallManager.confirm(event.sender.id, terminalId, size.cols, size.rows);
            },
        );
        ipcMain.handle(desktopIpc.rigInstallInput, (event, terminalId: unknown, data: unknown) => {
            if (typeof terminalId !== "string")
                throw new Error("The Rig installation terminal identity is invalid.");
            rigInstallManager.input(event.sender.id, terminalId, rigTerminalInputValidate(data));
        });
        ipcMain.handle(
            desktopIpc.rigInstallResize,
            (event, terminalId: unknown, cols: unknown, rows: unknown) => {
                const size = rigTerminalSizeValidate(cols, rows);
                if (typeof terminalId !== "string")
                    throw new Error("The Rig installation terminal identity is invalid.");
                rigInstallManager.resize(event.sender.id, terminalId, size.cols, size.rows);
            },
        );
        ipcMain.handle(desktopIpc.rigInstallClose, (event, terminalId: unknown) => {
            if (typeof terminalId !== "string")
                throw new Error("The Rig installation terminal identity is invalid.");
            rigInstallManager.close(event.sender.id, terminalId);
        });
        ipcMain.handle(desktopIpc.updateInstall, () => updater.install());
        windowSynchronize(runtime.get());
        applicationMenuInstall(runtime.get());
        void updater.check().catch(() => undefined);
        app.on("activate", () => {
            if (!windowLifecycle.get()) windowSynchronize(runtime.get());
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
    const window = windowLifecycle.get();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
});

app.on("before-quit", (event) => {
    if (quitting || !runtime) return;
    event.preventDefault();
    void runtime.close().finally(() => {
        rigIpcHost?.[Symbol.dispose]();
        rigInstallManager?.[Symbol.dispose]();
        quitting = true;
        app.quit();
    });
});
