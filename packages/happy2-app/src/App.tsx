import { RouterProvider } from "@tanstack/react-router";
import { useLayoutEffect, useReducer } from "react";
import { happyStateCreate } from "happy2-state";
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
    const [resources] = useReducer(
        (value: {
            state?: ReturnType<typeof happyStateCreate>;
            navigation: DesktopNavigation;
            ownsNavigation: boolean;
        }) => value,
        undefined,
        () => ({
            state: props.serverUrl ? undefined : happyStateCreate(),
            navigation: props.navigation ?? desktopNavigationCreate(),
            ownsNavigation: !props.navigation,
        }),
    );
    const navigation = resources.navigation;
    useLayoutEffect(() => {
        const { state, navigation, ownsNavigation } = resources;
        return () => {
            state?.[Symbol.dispose]();
            if (ownsNavigation) navigation[Symbol.dispose]();
        };
    }, [resources]);
    const desktop = props.platform === "desktop";
    const content = props.serverUrl ? (
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
        <DesktopApp navigation={navigation} platform={props.platform} state={resources.state!} />
    );
    return <RouterProvider context={{ content }} router={navigation.router} />;
}
