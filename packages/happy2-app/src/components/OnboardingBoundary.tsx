import { Show, createSignal, type JSX } from "solid-js";
import type { AuthSession } from "./AuthGate";
import { ServerOnboarding } from "./ServerOnboarding";
import type { DesktopNavigation } from "../navigation/desktopRouteTypes";

export type OnboardingBoundaryProps = {
    navigation: DesktopNavigation;
    session: AuthSession;
    showWindowDragRegion?: boolean;
    children: JSX.Element;
};

/**
 * Blocks the main application until durable server setup is complete. It mounts
 * the centered server-onboarding surface first; only when that surface reports
 * the setup route has become complete does the application take over. The latch
 * keeps the workspace mounted afterwards so a later reconciliation never tears
 * the app back down.
 */
export function OnboardingBoundary(props: OnboardingBoundaryProps) {
    const [complete, setComplete] = createSignal(false);
    return (
        <Show
            when={complete()}
            fallback={
                <ServerOnboarding
                    navigation={props.navigation}
                    onComplete={() => setComplete(true)}
                    showWindowDragRegion={props.showWindowDragRegion}
                    state={props.session.state}
                />
            }
        >
            {props.children}
        </Show>
    );
}
