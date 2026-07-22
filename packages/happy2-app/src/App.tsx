import { RouterProvider } from "@tanstack/react-router";
import { useLayoutEffect, useReducer, type ReactNode } from "react";
import { happyStateCreate } from "happy2-state";
import { AuthGate, type AuthCredentialStore, type AuthSession } from "./components/AuthGate";
import { DesktopApp } from "./components/DesktopApp";
import { DevTokenGate } from "./components/DevTokenGate";
import { OnboardingBoundary } from "./components/OnboardingBoundary";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";
import type { DesktopNavigation } from "./navigation/desktopRouteTypes";
import type {
    DesktopInstanceStatus,
    DesktopInstanceTarget,
    DesktopInstanceUpdate,
} from "happy2-ui";

export interface AppDesktopRuntime {
    activeTargetId: string;
    notice?: string;
    onChangeMode(): void;
    onInstallUpdate?(): void;
    onTargetSelect(id: string): void;
    status?: DesktopInstanceStatus;
    targets: readonly DesktopInstanceTarget[];
    update?: DesktopInstanceUpdate;
}
export interface AppProps {
    navigation?: DesktopNavigation;
    platform?: "desktop" | "web";
    serverUrl?: string;
    /**
     * Web deployments authenticate every request through a same-origin HttpOnly
     * cookie the gateway sets and the browser attaches automatically; the app
     * never handles a bearer token in JavaScript. When true, no session token is
     * persisted and the workspace transport carries no Authorization header — the
     * cookie alone authenticates it.
     */
    cookieAuth?: boolean;
    /**
     * A cookie deployment whose only sign-in bootstraps the cookie from a
     * development token the user types. Renders the development-token gate, which
     * validates the token through a single bearer `/v0/me` and then relies on the
     * cookie. Only meaningful together with `cookieAuth`, and takes precedence over
     * the header sign-in flow.
     */
    requireDevelopmentToken?: boolean;
    /** Optional native credential boundary; browser header auth keeps localStorage. */
    credentialStore?: AuthCredentialStore;
    /** Native runtime identity rendered consistently in every sidebar variant. */
    desktopRuntime?: AppDesktopRuntime;
}
/** Owns host authentication plus the process-local state and navigation boundaries. */
export function App(props: AppProps) {
    const usesServer = !!props.serverUrl;
    const [resources] = useReducer(
        (value: {
            state?: ReturnType<typeof happyStateCreate>;
            navigation: DesktopNavigation;
            ownsNavigation: boolean;
        }) => value,
        undefined,
        () => ({
            state: usesServer ? undefined : happyStateCreate(),
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
    const renderWorkspace = (session: AuthSession) => (
        <DesktopApp
            navigation={navigation}
            platform={props.platform}
            session={session}
            state={session.state}
            desktopRuntime={props.desktopRuntime}
        />
    );
    let content: ReactNode;
    if (props.cookieAuth && props.requireDevelopmentToken) {
        // Cookie-authenticated web mode: the user types a development token, it is
        // validated once through a bearer `/v0/me`, and every later request rides
        // the HttpOnly cookie. No header sign-in or server-onboarding boundary.
        content = (
            <DevTokenGate serverUrl={props.serverUrl ?? ""} showWindowDragRegion={desktop}>
                {renderWorkspace}
            </DevTokenGate>
        );
    } else if (props.serverUrl) {
        content = (
            <AuthGate
                cookieAuth={props.cookieAuth}
                credentialStore={props.credentialStore}
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
                        {renderWorkspace(session)}
                    </OnboardingBoundary>
                )}
            </AuthGate>
        );
    } else {
        content = (
            <DesktopApp
                navigation={navigation}
                platform={props.platform}
                state={resources.state!}
            />
        );
    }
    return <RouterProvider context={{ content }} router={navigation.router} />;
}
