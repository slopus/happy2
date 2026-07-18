import { useState, type CSSProperties } from "react";
import type { DeepReadonly, DirectoryUserProjection } from "happy2-state";
import {
    Box,
    Button,
    EmptyState,
    Menu,
    Modal,
    ModalOverlay,
    TextField,
    type MenuItem,
} from "./ChatPageComponents.js";

const stackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };

export interface ChatDirectMessageDialogProps {
    busy: boolean;
    users: readonly DeepReadonly<DirectoryUserProjection>[];
    onClose(): void;
    onSelect(userId: string): void;
}

export function ChatDirectMessageDialog(props: ChatDirectMessageDialogProps) {
    const [query, setQuery] = useState("");
    const needle = query.trim().toLowerCase();
    const users = [...props.users]
        .filter(
            (user) =>
                !needle ||
                user.displayName.toLowerCase().includes(needle) ||
                user.username.toLowerCase().includes(needle),
        )
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
    const items: MenuItem[] = users.map((user) => ({
        disabled: props.busy,
        icon: "users",
        id: user.id,
        kind: "item",
        label: `${user.displayName} · @${user.username}`,
    }));

    return (
        <ModalOverlay onDismiss={props.busy ? undefined : props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button disabled={props.busy} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                    </Box>
                }
                icon="edit"
                onClose={props.busy ? undefined : props.onClose}
                size="small"
                title="New direct message"
            >
                <Box style={stackStyle}>
                    <TextField
                        autoComplete="off"
                        fullWidth
                        label="Find a teammate"
                        leadingIcon="search"
                        onValueChange={setQuery}
                        placeholder="Name or username"
                        type="search"
                        value={query}
                    />
                    {items.length > 0 ? (
                        <Menu items={items} onSelect={props.onSelect} width={328} />
                    ) : (
                        <EmptyState
                            description={
                                needle
                                    ? "No teammate matches that name or username."
                                    : "No teammates are available to message yet."
                            }
                            icon="users"
                            size="inline"
                            title={needle ? "No matching teammate" : "No teammates yet"}
                        />
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
