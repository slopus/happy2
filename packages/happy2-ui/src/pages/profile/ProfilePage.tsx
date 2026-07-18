import type { DirectoryStore } from "happy2-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { EmptyState } from "../../EmptyState";
import { ProfileCard } from "../../ProfileCard";
import { StoreSurface } from "../../StoreSurface";

export interface ProfilePageProps {
    store: DirectoryStore;
    userId: string;
    imageUrl?: (fileId?: string) => string | undefined;
}

/** Complete public profile projection backed by the live directory surface. */
export function ProfilePage(props: ProfilePageProps) {
    return (
        <StoreSurface store={props.store}>
            {(snapshot) => {
                const user = snapshot.users.find((candidate) => candidate.id === props.userId);
                if (snapshot.status.type === "error")
                    return (
                        <Banner tone="danger" title="Profile unavailable">
                            {snapshot.status.error.message}
                        </Banner>
                    );
                if (!user)
                    return (
                        <EmptyState
                            description={
                                snapshot.status.type === "ready"
                                    ? "This person is no longer available in the workspace directory."
                                    : "Loading the latest workspace directory."
                            }
                            icon="at"
                            size="inline"
                            title={
                                snapshot.status.type === "ready"
                                    ? "Profile not found"
                                    : "Loading profile…"
                            }
                        />
                    );
                return (
                    <Box
                        data-testid="profile-page"
                        style={{ display: "flex", flexDirection: "column", gap: "14px" }}
                    >
                        <ProfileCard
                            imageUrl={props.imageUrl?.(user.photoFileId)}
                            initials={initials(user.displayName)}
                            name={user.displayName}
                            presence={user.presence}
                            status={{
                                emoji: user.customStatusEmoji,
                                text: user.customStatusText,
                            }}
                            title={user.title}
                            tone="brand"
                            username={user.username}
                        />
                        <Box
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                            }}
                        >
                            <Badge
                                label={user.role === "admin" ? "Administrator" : "Member"}
                                variant={user.role === "admin" ? "accent" : "neutral"}
                            />
                            <Badge
                                label={user.presence === "online" ? "Online" : "Offline"}
                                variant={user.presence === "online" ? "success" : "neutral"}
                            />
                            {user.availability ? (
                                <Badge
                                    label={availabilityLabel(user.availability)}
                                    variant="info"
                                />
                            ) : null}
                        </Box>
                    </Box>
                );
            }}
        </StoreSurface>
    );
}

function initials(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

function availabilityLabel(value: "automatic" | "online" | "away" | "dnd"): string {
    if (value === "dnd") return "Do not disturb";
    return value.replace(/^./, (letter) => letter.toUpperCase());
}
