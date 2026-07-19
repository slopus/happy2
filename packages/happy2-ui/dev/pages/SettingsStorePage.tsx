import { useLayoutEffect, useState } from "react";
import { settingsStoreFixtureCreate } from "happy2-state/testing";
import { SettingsPage } from "../../src/pages/settings/SettingsPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";
export function SettingsStorePage() {
    const [fixture] = useState(() => {
        const value = settingsStoreFixtureCreate({
            profile: {
                id: "user-blueprint",
                firstName: "Steve",
                lastName: "Miller",
                username: "steve",
                email: "steve@example.com",
            },
        });
        value.input({
            type: "settingsLoaded",
            profile: {
                id: "user-blueprint",
                firstName: "Steve",
                lastName: "Miller",
                username: "steve",
                email: "steve@example.com",
            },
            title: "Workspace owner",
            presence: {
                userId: "user-blueprint",
                availability: "online",
                customStatusEmoji: "🚀",
                customStatusText: "Building Happy (2)",
                updatedAt: "2026-07-17T12:00:00.000Z",
            },
            notifications: {
                directMessages: "all",
                mentions: "all",
                threadReplies: "mentions",
                reactions: "all",
                calls: "all",
                desktopNotifications: true,
                emailNotifications: false,
            },
            avatarRevision: 0,
        });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return (
        <ComponentPage
            contract="Surface store"
            number="P-001"
            summary="The complete settings page consumes one framework-neutral SettingsStore, exposes every supported typed field action, and remains renderable without authentication or transport."
            title="Settings page"
        >
            <FullScreenSpecimen
                detail="Loaded profile, presence, notifications, autosave feedback, and username confirmation at the desktop minimum viewport"
                label="Settings — ready"
                number="01"
            >
                <SettingsPage
                    avatarTone="brand"
                    developmentTokenActions={{
                        developmentTokenCreate: async () => ({
                            token: "happy2_dev_blueprint_token",
                            sessionId: "session_blueprint",
                            expiresAt: "2026-07-20T01:00:00.000Z",
                        }),
                    }}
                    presence="online"
                    store={fixture.store}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
