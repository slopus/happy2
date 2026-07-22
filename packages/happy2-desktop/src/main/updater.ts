import { createRequire } from "node:module";
import type { DesktopUpdateSnapshot } from "../shared/desktopContract";

const { autoUpdater } = createRequire(import.meta.url)(
    "electron-updater",
) as typeof import("electron-updater");

export interface DesktopUpdater {
    check(): Promise<void>;
    install(): void;
}

export function desktopUpdaterCreate(input: {
    packaged: boolean;
    update: (snapshot: DesktopUpdateSnapshot) => void;
}): DesktopUpdater {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => input.update({ status: "checking" }));
    autoUpdater.on("update-not-available", () => input.update({ status: "idle" }));
    autoUpdater.on("update-available", (info) =>
        input.update({ status: "available", availableVersion: info.version }),
    );
    autoUpdater.on("download-progress", (progress) =>
        input.update({
            status: "downloading",
            message: `${Math.round(progress.percent)}% downloaded`,
        }),
    );
    autoUpdater.on("update-downloaded", (info) =>
        input.update({ status: "downloaded", availableVersion: info.version }),
    );
    autoUpdater.on("error", (error) => input.update({ status: "error", message: error.message }));
    return {
        async check() {
            if (!input.packaged) return;
            await autoUpdater.checkForUpdates();
        },
        install() {
            autoUpdater.quitAndInstall(false, true);
        },
    };
}
