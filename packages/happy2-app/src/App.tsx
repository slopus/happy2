import { happyStateCreate } from "happy2-state";
import { onCleanup } from "solid-js";
import { AuthGate, type AuthSession } from "./components/AuthGate";
import { DesktopApp } from "./components/DesktopApp";
import { OnboardingBoundary } from "./components/OnboardingBoundary";
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
    const desktop = props.platform === "desktop";
    return props.serverUrl ? (
        <AuthGate
            navigation={navigation}
            serverUrl={props.serverUrl}
            showWindowDragRegion={desktop}
        >
            {(session: AuthSession) => (
                <OnboardingBoundary
                    navigation={navigation}
                    session={session}
                    showWindowDragRegion={desktop}
                >
                    <DesktopApp
                        navigation={navigation}
                        platform={props.platform}
                        session={session}
                        state={session.state}
                    />
                </OnboardingBoundary>
            )}
        </AuthGate>
    ) : (
        <DesktopApp navigation={navigation} platform={props.platform} state={staticState!} />
    );
}
