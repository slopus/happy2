import { contextBridge, ipcRenderer } from "electron";
import {
    desktopIpc,
    type DesktopRuntimeSnapshot,
    type DesktopStartRequest,
    type HappyDesktopBridge,
    type RigClientRequest,
    type RigInstallTerminalEvent,
    type RigStreamEvent,
    type RigStreamOpenRequest,
} from "./shared/desktopContract";

const bridge: HappyDesktopBridge = {
    runtimeGet: () => ipcRenderer.invoke(desktopIpc.runtimeGet),
    runtimeReset: () => ipcRenderer.invoke(desktopIpc.runtimeReset),
    runtimeRetry: () => ipcRenderer.invoke(desktopIpc.runtimeRetry),
    runtimeStart: (request: DesktopStartRequest) =>
        ipcRenderer.invoke(desktopIpc.runtimeStart, request),
    rigRequest: (request: RigClientRequest) =>
        ipcRenderer.invoke(desktopIpc.rigRequest, request) as never,
    rigStreamOpen: (request: RigStreamOpenRequest) =>
        ipcRenderer.invoke(desktopIpc.rigStreamOpen, request),
    rigStreamClose: (streamId) => ipcRenderer.invoke(desktopIpc.rigStreamClose, streamId),
    rigTerminalWrite: (streamId, data) =>
        ipcRenderer.invoke(desktopIpc.rigTerminalWrite, streamId, data),
    rigTerminalResize: (streamId, cols, rows) =>
        ipcRenderer.invoke(desktopIpc.rigTerminalResize, streamId, cols, rows),
    rigTerminalScrollback: (streamId, start, count, basis) =>
        ipcRenderer.invoke(desktopIpc.rigTerminalScrollback, streamId, start, count, basis),
    rigInstallOpen: () => ipcRenderer.invoke(desktopIpc.rigInstallOpen),
    rigInstallConfirm: (terminalId, cols, rows) =>
        ipcRenderer.invoke(desktopIpc.rigInstallConfirm, terminalId, cols, rows),
    rigInstallInput: (terminalId, data) =>
        ipcRenderer.invoke(desktopIpc.rigInstallInput, terminalId, data),
    rigInstallResize: (terminalId, cols, rows) =>
        ipcRenderer.invoke(desktopIpc.rigInstallResize, terminalId, cols, rows),
    rigInstallClose: (terminalId) => ipcRenderer.invoke(desktopIpc.rigInstallClose, terminalId),
    topologySelect: (topologyId) => ipcRenderer.invoke(desktopIpc.topologySelect, topologyId),
    updateInstall: () => ipcRenderer.invoke(desktopIpc.updateInstall),
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopRuntimeSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.runtimeChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.runtimeChanged, receive);
    },
    rigSubscribe(listener: (event: RigStreamEvent) => void) {
        const receive = (_event: Electron.IpcRendererEvent, event: RigStreamEvent) =>
            listener(event);
        ipcRenderer.on(desktopIpc.rigStreamEvent, receive);
        return () => ipcRenderer.removeListener(desktopIpc.rigStreamEvent, receive);
    },
    rigInstallSubscribe(listener: (event: RigInstallTerminalEvent) => void) {
        const receive = (_event: Electron.IpcRendererEvent, event: RigInstallTerminalEvent) =>
            listener(event);
        ipcRenderer.on(desktopIpc.rigInstallEvent, receive);
        return () => ipcRenderer.removeListener(desktopIpc.rigInstallEvent, receive);
    },
};

contextBridge.exposeInMainWorld("happyDesktop", bridge);
