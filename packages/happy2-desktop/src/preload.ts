import { contextBridge, ipcRenderer } from "electron";
import {
    desktopIpc,
    type DesktopRuntimeSnapshot,
    type DesktopStartRequest,
    type HappyDesktopBridge,
} from "./shared/desktopContract";

const bridge: HappyDesktopBridge = {
    runtimeGet: () => ipcRenderer.invoke(desktopIpc.runtimeGet),
    runtimeReset: () => ipcRenderer.invoke(desktopIpc.runtimeReset),
    runtimeRetry: () => ipcRenderer.invoke(desktopIpc.runtimeRetry),
    runtimeStart: (request: DesktopStartRequest) =>
        ipcRenderer.invoke(desktopIpc.runtimeStart, request),
    localCapabilityGet: (targetId) => ipcRenderer.invoke(desktopIpc.localCapabilityGet, targetId),
    localCapabilityConfirm: (targetId, value) =>
        ipcRenderer.invoke(desktopIpc.localCapabilityConfirm, targetId, value),
    topologySelect: (topologyId) => ipcRenderer.invoke(desktopIpc.topologySelect, topologyId),
    updateInstall: () => ipcRenderer.invoke(desktopIpc.updateInstall),
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopRuntimeSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.runtimeChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.runtimeChanged, receive);
    },
};

contextBridge.exposeInMainWorld("happyDesktop", bridge);
