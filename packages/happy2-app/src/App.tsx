import { happyStateCreate } from "happy2-state";
import { onCleanup } from "solid-js";
import { AuthGate } from "./components/AuthGate";
import { DesktopApp } from "./components/DesktopApp";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";
import type { DesktopNavigation } from "./navigation/desktopRouteTypes";

export interface AppProps {
    navigation?: DesktopNavigation;
    platform?: "desktop" | "web";
    serverUrl?: string;
}

/** Owns host authentication plus the process-local state and navigation boundaries. */
export function App(props: AppProps) {
    const staticState = props.serverUrl ? undefined : happyStateCreate();
    const ownedNavigation = props.navigation ? undefined : desktopNavigationCreate();
    const navigation = props.navigation ?? ownedNavigation!;
    onCleanup(() => {
        staticState?.[Symbol.dispose]();
        ownedNavigation?.[Symbol.dispose]();
    });
    return props.serverUrl ? (
        <AuthGate serverUrl={props.serverUrl} showWindowDragRegion={props.platform === "desktop"}>
            {(session) => (
                <DesktopApp
                    navigation={navigation}
                    platform={props.platform}
                    session={session}
                    state={session.state}
                />
            )}
        </AuthGate>
    ) : (
        <DesktopApp navigation={navigation} platform={props.platform} state={staticState!} />
    );
}
