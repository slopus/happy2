import { useLayoutEffect, useState } from "react";
import { UserError } from "happy2-state";
import { settingsStoreFixtureCreate } from "happy2-state/testing";
import { SettingsPage } from "../../src/pages/settings/SettingsPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

const profile = {
    id: "user-blueprint",
    firstName: "Steve",
    lastName: "Miller",
    username: "steve",
    email: "steve@example.com",
};

const loaded = {
    type: "settingsLoaded" as const,
    profile,
    title: "Workspace owner",
    presence: {
        userId: "user-blueprint",
        availability: "online" as const,
        customStatusEmoji: "🚀",
        customStatusText: "Building Happy (2)",
        updatedAt: "2026-07-17T12:00:00.000Z",
    },
    notifications: {
        directMessages: "all" as const,
        mentions: "all" as const,
        threadReplies: "mentions" as const,
        reactions: "all" as const,
        calls: "all" as const,
        desktopNotifications: true,
        emailNotifications: false,
    },
    avatarRevision: 0,
};

export function SettingsStorePage() {
    const [fixtures] = useState(() => {
        const ready = settingsStoreFixtureCreate({ profile });
        ready.input(loaded);

        const saving = settingsStoreFixtureCreate({ profile });
        saving.input(loaded);
        saving.store.getState().displayNameUpdate("Steven", "Miller");
        saving.input({ type: "profileSaving" });

        const failed = settingsStoreFixtureCreate({ profile });
        failed.input(loaded);
        failed.input({
            type: "profileSaveFailed",
            error: new UserError("The profile service rejected this update."),
        });

        return { failed, ready, saving };
    });
    useLayoutEffect(
        () => () => {
            fixtures.ready[Symbol.dispose]();
            fixtures.saving[Symbol.dispose]();
            fixtures.failed[Symbol.dispose]();
        },
        [fixtures],
    );
    return (
        <ComponentPage
            contract="Surface store"
            number="P-001"
            summary="The complete settings page consumes one framework-neutral SettingsStore, exposes every supported typed field action, and remains renderable without authentication or transport."
            title="Settings page"
        >
            <FullScreenSpecimen
                detail="Loaded profile and notifications at rest, with the reserved status row silent"
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
                    store={fixtures.ready.store}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A profile save in progress uses the quiet reserved status row without moving the profile card"
                label="Settings — saving"
                number="02"
            >
                <SettingsPage avatarTone="brand" presence="online" store={fixtures.saving.store} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A failed save remains a loud danger alert with the server-provided message"
                label="Settings — failed"
                number="03"
            >
                <SettingsPage avatarTone="brand" presence="online" store={fixtures.failed.store} />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
