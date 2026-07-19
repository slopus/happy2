import type { HappyState } from "happy2-state";
import { SettingsPage } from "happy2-ui";
import type { AuthSession } from "../components/AuthGate";

export interface SettingsViewProps {
    state: HappyState;
    session?: AuthSession;
}

/** Selects one settings store; all page state, actions, and layout live in happy2-ui. */
export function SettingsView(props: SettingsViewProps) {
    const session = props.session;
    const store = props.state.settings({ profile: session?.user });
    return (
        <SettingsPage
            avatarActions={session ? props.state : undefined}
            avatarUrl={session?.user.avatarUrl}
            developmentTokenActions={session?.devTokensEnabled ? props.state : undefined}
            onAvatarChanged={session?.setAvatar}
            onProfileChange={
                session
                    ? (profile) =>
                          session.updateUser({
                              ...session.user,
                              ...profile,
                              avatarUrl: session.user.avatarUrl,
                              kind: session.user.kind,
                          })
                    : undefined
            }
            presence={session ? "online" : undefined}
            store={store}
        />
    );
}
