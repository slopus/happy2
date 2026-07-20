import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/mcp-app-shell.css";
import {
    McpAppBridgeFrame,
    type McpAppBridgeResource,
    type McpAppDisplayMode,
} from "./mcpAppBridge";
import type { McpAppLogEntry } from "./mcpAppProtocol";
import { createRenderer } from "./testing";

function resource(hash: string): McpAppBridgeResource {
    return {
        html: DURABLE_APP,
        contentHashSha256: hash,
        csp: { connectDomains: [], resourceDomains: [] },
    };
}

function instanceContext(dataRevision: number) {
    return {
        "happy2/instance": {
            id: "instance-1",
            key: "todos:list:1",
            context: { listId: "1", dataRevision },
            dataRevision,
            definitionRevision: 0,
        },
    } as const;
}

/* Durable app: initializes, completes the handshake, logs the initialize host
 * context, requests fullscreen, and logs every host-context-changed payload. */
const DURABLE_APP = `<!doctype html><meta charset=utf-8><body><script>
  var initId="i1";
  function rpc(m){ parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*"); }
  function log(d){ rpc({method:"notifications/message", params:{level:"info", data:d}}); }
  addEventListener("message", function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0") return;
    if(m.id===initId && m.result){
      rpc({method:"ui/notifications/initialized", params:{}});
      log({tag:"init", ctx:m.result.hostContext});
      rpc({id:"dm", method:"ui/request-display-mode", params:{mode:"fullscreen"}});
      return;
    }
    if(m.id==="dm" && m.result){ log({tag:"dm", mode:m.result.mode}); return; }
    if(m.method==="ui/notifications/host-context-changed"){ log({tag:"hcc", params:m.params}); return; }
  });
  rpc({id:initId, method:"ui/initialize", params:{protocolVersion:"2026-01-26", appInfo:{name:"a", version:"1"}, appCapabilities:{availableDisplayModes:["inline","fullscreen"]}}});
</script></body>`;

interface HarnessState {
    resource: McpAppBridgeResource;
    hostContext: Readonly<Record<string, unknown>>;
    displayMode: McpAppDisplayMode;
}

function harnessStore(initial: HarnessState) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next: Partial<HarnessState>) {
            state = { ...state, ...next };
            for (const listener of listeners) listener();
        },
    };
}

function logByTag(
    log: { readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> } },
    tag: string,
): Record<string, unknown> | undefined {
    for (const call of log.mock.calls) {
        const entry = call[0] as McpAppLogEntry;
        const data = entry.data as Record<string, unknown>;
        if (data.tag === tag) return data;
    }
    return undefined;
}

function Harness(props: {
    store: ReturnType<typeof harnessStore>;
    onLog: (entry: McpAppLogEntry) => void;
    onRequestDisplayMode: (mode: McpAppDisplayMode) => McpAppDisplayMode;
}) {
    const snapshot = useSyncExternalStore(
        props.store.subscribe,
        props.store.getState,
        props.store.getState,
    );
    return (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
            <McpAppBridgeFrame
                availableDisplayModes={["inline", "fullscreen"]}
                data-testid="bridge"
                displayMode={snapshot.displayMode}
                fill
                hostContext={snapshot.hostContext}
                key={snapshot.resource.contentHashSha256}
                onLog={props.onLog}
                onRequestDisplayMode={props.onRequestDisplayMode}
                resource={snapshot.resource}
                title="Durable app"
            />
        </div>
    );
}

it("sends host-context-changed on a context revision without remounting, and answers display-mode", async () => {
    const view = createRenderer();
    const log = vi.fn((_entry: McpAppLogEntry) => undefined);
    const onRequestDisplayMode = vi.fn((mode: McpAppDisplayMode) => mode);
    const store = harnessStore({
        resource: resource("a".repeat(64)),
        hostContext: instanceContext(1),
        displayMode: "inline",
    });
    view.render(
        () => <Harness onLog={log} onRequestDisplayMode={onRequestDisplayMode} store={store} />,
        { width: 480, height: 320 },
    );
    await view.ready();

    // Initialize host context carries the durable instance + display modes.
    await vi.waitFor(() => expect(logByTag(log, "init")).toBeDefined(), { timeout: 10_000 });
    const ctx = logByTag(log, "init")!.ctx as Record<string, any>;
    expect(ctx.displayMode).toBe("inline");
    expect(ctx.availableDisplayModes).toEqual(["inline", "fullscreen"]);
    expect(ctx["happy2/instance"].dataRevision).toBe(1);
    expect(ctx["happy2/instance"].id).toBe("instance-1");

    // ui/request-display-mode is honored and echoed.
    await vi.waitFor(() => expect(logByTag(log, "dm")).toBeDefined(), { timeout: 10_000 });
    expect(logByTag(log, "dm")!.mode).toBe("fullscreen");
    expect(onRequestDisplayMode).toHaveBeenCalledWith("fullscreen");

    const frameBefore = view.$(
        '[data-testid="bridge"] [data-happy2-ui="mcp-app-host-frame"]',
    ).element;

    // A new dataRevision on the SAME resource pushes host-context-changed and
    // keeps the exact same iframe DOM node (no remount).
    store.set({ hostContext: instanceContext(2) });
    await vi.waitFor(() => expect(logByTag(log, "hcc")).toBeDefined(), { timeout: 10_000 });
    const hcc = logByTag(log, "hcc")!.params as Record<string, any>;
    expect(hcc["happy2/instance"].dataRevision).toBe(2);
    expect(
        view.$('[data-testid="bridge"] [data-happy2-ui="mcp-app-host-frame"]').element,
        "a context revision must not remount the frame",
    ).toBe(frameBefore);

    // A genuinely new resource content hash IS a lifetime boundary: remount.
    store.set({ resource: resource("b".repeat(64)) });
    await vi.waitFor(() =>
        expect(
            view.$('[data-testid="bridge"] [data-happy2-ui="mcp-app-host-frame"]').element,
        ).not.toBe(frameBefore),
    );
}, 120_000);
