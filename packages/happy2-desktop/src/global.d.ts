import type { HappyDesktopBridge } from "./shared/desktopContract";

declare global {
    interface Window {
        happyDesktop?: HappyDesktopBridge;
    }
}

export {};
