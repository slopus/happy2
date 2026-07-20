import { useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import type { HappyState, McpAppHandle, McpAppSnapshot } from "happy2-state";
import { McpAppShell, StoreSurface, type McpAppRenderInput } from "happy2-ui";

export interface MessageAppProps {
    state: HappyState;
    input: McpAppRenderInput;
}

/**
 * Glue for one interactive MCP App attached to an assistant message. It leases
 * the per-callId surface store for its own lifetime (acquiring on mount,
 * disposing on unmount), renders through a single coarse StoreSurface
 * subscription, and binds the shell's privileged callbacks to the store handle
 * so the reusable component stays transport-free. It owns no product state.
 */
export function MessageApp(props: MessageAppProps) {
    const { state, input } = props;
    const [handle, setHandle] = useReducer(
        (_current: McpAppHandle | undefined, next: McpAppHandle | undefined) => next,
        undefined,
    );
    const handleRef = useRef<McpAppHandle | undefined>(undefined);
    useLayoutEffect(() => {
        const acquired = state.mcpAppOpen(input.messageId, input.callId);
        handleRef.current = acquired;
        setHandle(acquired);
        return () => {
            acquired[Symbol.dispose]();
            handleRef.current = undefined;
            setHandle(undefined);
        };
    }, [state, input.messageId, input.callId]);

    if (!handle) return <McpAppShell status="loading" toolName={input.toolName} />;
    return (
        <StoreSurface store={handle}>
            {(snapshot: McpAppSnapshot) => renderShell(snapshot, handle, input)}
        </StoreSurface>
    );
}

function renderShell(
    snapshot: McpAppSnapshot,
    handle: McpAppHandle,
    input: McpAppRenderInput,
): ReactNode {
    const view = snapshot.view;
    if (view.type === "ready") {
        const { app, resource } = view.value;
        return (
            <McpAppShell
                arguments={app.arguments}
                onOpenLink={openExternalLink}
                onReload={() => handle.mcpAppReload()}
                onResourceRead={(uri) => handle.mcpAppResourceRead(uri)}
                onToolCall={(name, args) => handle.mcpAppToolCall(name, args)}
                resource={resource}
                result={app.result}
                status={app.status}
                toolName={app.toolName}
            />
        );
    }
    if (view.type === "error")
        return (
            <McpAppShell
                error={view.error.message}
                onReload={() => handle.mcpAppReload()}
                status="failed"
                toolName={input.toolName}
            />
        );
    return <McpAppShell status="loading" toolName={input.toolName} />;
}

/**
 * Opens an app-requested external link only when it is a plain web URL. An
 * untrusted app can ask to open a link, so anything but http/https is refused,
 * and the new context is fully severed from Happy with noopener/noreferrer.
 */
function openExternalLink(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    window.open(parsed.href, "_blank", "noopener,noreferrer");
}
