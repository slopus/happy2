import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import type { McpAppResource } from "happy2-state";
import "./theme.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/mcp-app-shell.css";
import { McpAppShell } from "./McpAppShell";
import { McpAppErrorCode, type McpAppLogEntry, type McpAppSize } from "./mcpAppProtocol";
import { createRenderer } from "./testing";

const COMPLETED_RESULT = {
    content: [{ type: "text", text: "The Matrix (1999)" }],
    structuredContent: { movie: { id: "tt0133093" } },
};

function resource(html: string, hash = "c".repeat(64)): McpAppResource {
    return {
        html,
        contentHashSha256: hash,
        meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    };
}

function toolCallMock() {
    return vi.fn(
        async (
            _name: string,
            _args: Record<string, unknown>,
        ): Promise<Record<string, unknown>> => ({
            content: [{ type: "text", text: "Arrival (2016)" }],
        }),
    );
}
function resourceReadMock() {
    return vi.fn(
        async (uri: string): Promise<Record<string, unknown>> => ({ contents: [{ uri }] }),
    );
}
function logData(entry: McpAppLogEntry): Record<string, unknown> {
    return entry.data as Record<string, unknown>;
}
function logEntries(log: {
    readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> };
}): McpAppLogEntry[] {
    return log.mock.calls.map((call) => call[0] as McpAppLogEntry);
}
function logByTag(
    log: { readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> } },
    tag: string,
): Record<string, unknown> | undefined {
    const entry = logEntries(log).find((e) => logData(e).tag === tag);
    return entry ? logData(entry) : undefined;
}
function logIndex(
    log: { readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> } },
    tag: string,
): number {
    return log.mock.calls.findIndex((call) => logData(call[0] as McpAppLogEntry).tag === tag);
}

/* Handshake app: initializes, completes the handshake, then records the
 * delivered input/result and exercises every app->host capability. It sends
 * `ui/notifications/initialized` before logging because the host ignores logs
 * until initialization completes. */
const HANDSHAKE_APP = `<!doctype html><meta charset=utf-8><body><script>
  var initId="i1", pingId="p1", n=10, input=null, result=null;
  function rpc(m){ parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*"); }
  function log(data){ rpc({method:"notifications/message", params:{level:"info", data:data}}); }
  addEventListener("message", function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0") return;
    if(m.id===initId && m.result){ rpc({method:"ui/notifications/initialized", params:{}}); log({tag:"init", result:m.result}); rpc({id:pingId, method:"ping", params:{}}); return; }
    if(m.id===pingId && m.result){ log({tag:"pong"}); return; }
    if(m.method==="ui/notifications/tool-input"){ input=m.params; log({tag:"input", params:m.params}); return; }
    if(m.method==="ui/notifications/tool-result"){ result=m.params; log({tag:"result", params:m.params});
      rpc({id:n++, method:"tools/call", params:{name:"movie_next", arguments:{echoInput:input, echoResult:result}}});
      rpc({id:n++, method:"resources/read", params:{uri:"ui://movie-catalog/movie.html"}});
      rpc({method:"ui/notifications/size-changed", params:{height:240}});
      rpc({id:n++, method:"ui/open-link", params:{url:"https://example.com/x"}});
      return; }
  });
  rpc({id:initId, method:"ui/initialize", params:{protocolVersion:"2026-01-26", appInfo:{name:"test-app", version:"1.0.0"}, appCapabilities:{}}});
</script></body>`;

it("runs the full handshake: initialize result, ping, ordered input then result, and app calls", async () => {
    const view = createRenderer();
    const toolCall = toolCallMock();
    const resourceRead = resourceReadMock();
    const openLink = vi.fn((_url: string) => undefined);
    const log = vi.fn((_entry: McpAppLogEntry) => undefined);
    const sizeChange = vi.fn((_size: McpAppSize) => undefined);

    view.render(
        () => (
            <McpAppShell
                arguments={{ query: "matrix" }}
                data-testid="mcp-hs"
                onLog={log}
                onOpenLink={openLink}
                onResourceRead={resourceRead}
                onSizeChange={sizeChange}
                onToolCall={toolCall}
                resource={resource(HANDSHAKE_APP)}
                result={COMPLETED_RESULT}
                status="completed"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 300 },
    );
    await view.ready();

    await vi.waitFor(
        () => {
            expect(toolCall).toHaveBeenCalled();
            expect(resourceRead).toHaveBeenCalled();
            expect(openLink).toHaveBeenCalled();
            expect(sizeChange).toHaveBeenCalled();
        },
        { timeout: 10_000 },
    );

    /* Exact initialize result shape (protocolVersion, hostInfo, hostCapabilities, hostContext). */
    const initResult = logByTag(log, "init")!.result as Record<string, any>;
    expect(initResult.protocolVersion).toBe("2026-01-26");
    expect(initResult.hostInfo.name).toBeTruthy();
    expect(initResult.hostCapabilities.serverTools).toBeDefined();
    expect(initResult.hostCapabilities.serverResources).toBeDefined();
    expect(initResult.hostCapabilities.openLinks).toBeDefined();
    expect(initResult.hostCapabilities.logging).toBeDefined();
    expect(initResult.hostCapabilities.sandbox).toBeDefined();
    expect(initResult.hostContext.displayMode).toBe("inline");
    expect(initResult.hostContext.platform).toBe("desktop");
    /* toolInfo is omitted because the host cannot build a complete MCP Tool. */
    expect(initResult.hostContext.toolInfo).toBeUndefined();

    /* ping answered. */
    expect(logIndex(log, "pong")).toBeGreaterThanOrEqual(0);

    /* Tool input params are {arguments} only; tool result params are the CallToolResult verbatim. */
    expect(logByTag(log, "input")!.params).toEqual({ arguments: { query: "matrix" } });
    expect(logByTag(log, "result")!.params).toEqual(COMPLETED_RESULT);

    /* Input strictly precedes result. */
    expect(logIndex(log, "input")).toBeLessThan(logIndex(log, "result"));

    /* App->host calls carried the delivered input and result through. */
    const [toolName, args] = toolCall.mock.calls[0]!;
    expect(toolName).toBe("movie_next");
    expect(args).toEqual({
        echoInput: { arguments: { query: "matrix" } },
        echoResult: COMPLETED_RESULT,
    });
    expect(resourceRead).toHaveBeenCalledWith("ui://movie-catalog/movie.html");
    expect(openLink).toHaveBeenCalledWith("https://example.com/x");
    expect(sizeChange.mock.calls[0]![0]).toEqual({ height: 240 });
}, 120_000);

/* Premature app: sends `initialized` and a privileged tools/call BEFORE any
 * ui/initialize, then completes a proper handshake to report the rejection. */
const PREMATURE_APP = `<!doctype html><meta charset=utf-8><body><script>
  var initId="i1", rejected=null;
  function rpc(m){ parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*"); }
  addEventListener("message", function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0") return;
    if(m.id==="c1" && m.error){ rejected=m.error.code; return; }
    if(m.id===initId && m.result){ rpc({method:"ui/notifications/initialized", params:{}}); return; }
    if(m.method==="ui/notifications/tool-input"){ rpc({method:"notifications/message", params:{level:"info", data:{tag:"rejected", code:rejected}}}); return; }
  });
  rpc({method:"ui/notifications/initialized", params:{}});
  rpc({id:"c1", method:"tools/call", params:{name:"movie_next", arguments:{}}});
  rpc({id:initId, method:"ui/initialize", params:{protocolVersion:"2026-01-26", appInfo:{name:"a", version:"1"}, appCapabilities:{}}});
</script></body>`;

it("does not let an early ui/notifications/initialized unlock privileged calls", async () => {
    const view = createRenderer();
    const toolCall = toolCallMock();
    const log = vi.fn((_entry: McpAppLogEntry) => undefined);
    view.render(
        () => (
            <McpAppShell
                data-testid="mcp-premature"
                onLog={log}
                onToolCall={toolCall}
                resource={resource(PREMATURE_APP)}
                status="in_progress"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 240 },
    );
    await view.ready();
    await vi.waitFor(() => expect(logIndex(log, "rejected")).toBeGreaterThanOrEqual(0), {
        timeout: 10_000,
    });
    /* The pre-initialize tools/call was rejected and never forwarded, even though
       an `initialized` notification had already been sent. */
    expect(logByTag(log, "rejected")!.code).toBe(McpAppErrorCode.notInitialized);
    expect(toolCall).not.toHaveBeenCalled();
}, 120_000);

/* Malformed app: after initialization, sends invalid then valid size/log, and a
 * non-web then an http(s) open-link; records the open-link responses. */
const MALFORMED_APP = `<!doctype html><meta charset=utf-8><body><script>
  var initId="i1";
  function rpc(m){ parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*"); }
  function log(d){ rpc({method:"notifications/message", params:{level:"info", data:d}}); }
  addEventListener("message", function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0") return;
    if(m.id==="o1"){ log({tag:"link-o1", error:!!m.error, ok:!!m.result}); return; }
    if(m.id==="o2"){ log({tag:"link-o2", error:!!m.error, ok:!!m.result}); return; }
    if(m.id===initId && m.result){
      rpc({method:"ui/notifications/initialized", params:{}});
      rpc({method:"ui/notifications/size-changed", params:{height:-5}});
      rpc({method:"ui/notifications/size-changed", params:{width:NaN}});
      rpc({method:"ui/notifications/size-changed", params:{height:240}});
      rpc({method:"notifications/message", params:{level:"bogus", data:{tag:"bad-log"}}});
      rpc({method:"notifications/message", params:{level:"info", data:{tag:"good-log"}}});
      rpc({id:"o1", method:"ui/open-link", params:{url:"javascript:alert(1)"}});
      rpc({id:"o2", method:"ui/open-link", params:{url:"https://ok.example.com"}});
      return;
    }
  });
  rpc({id:initId, method:"ui/initialize", params:{protocolVersion:"2026-01-26", appInfo:{name:"a", version:"1"}, appCapabilities:{}}});
</script></body>`;

it("validates sizes/log levels and returns errors for non-http(s) open-link URLs", async () => {
    const view = createRenderer();
    const openLink = vi.fn((_url: string) => undefined);
    const log = vi.fn((_entry: McpAppLogEntry) => undefined);
    const sizeChange = vi.fn((_size: McpAppSize) => undefined);
    view.render(
        () => (
            <McpAppShell
                data-testid="mcp-bad"
                onLog={log}
                onOpenLink={openLink}
                onSizeChange={sizeChange}
                resource={resource(MALFORMED_APP)}
                status="in_progress"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 240 },
    );
    await view.ready();
    await vi.waitFor(() => expect(logByTag(log, "link-o2")).toBeDefined(), { timeout: 10_000 });

    /* Only the finite positive size and the known log level survived. */
    expect(sizeChange.mock.calls).toHaveLength(1);
    expect(sizeChange.mock.calls[0]![0]).toEqual({ height: 240 });
    expect(logByTag(log, "good-log")).toBeDefined();
    expect(logByTag(log, "bad-log")).toBeUndefined();

    /* The javascript: URL is refused with a JSON-RPC error; only the https URL
       succeeds and reaches the host handler. */
    expect(logByTag(log, "link-o1")).toEqual({ tag: "link-o1", error: true, ok: false });
    expect(logByTag(log, "link-o2")).toEqual({ tag: "link-o2", error: false, ok: true });
    expect(openLink.mock.calls).toHaveLength(1);
    expect(openLink).toHaveBeenCalledWith("https://ok.example.com/");
}, 120_000);

interface HarnessState {
    resource?: McpAppResource;
    result?: Record<string, unknown>;
    status: "loading" | "in_progress" | "completed";
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

function staticResource(hash: string): McpAppResource {
    return {
        html: "<!doctype html><meta charset=utf-8><body style='margin:0'><main id=app></main></body>",
        contentHashSha256: hash,
        meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    };
}

function Harness(props: { store: ReturnType<typeof harnessStore> }) {
    const snapshot = useSyncExternalStore(
        props.store.subscribe,
        props.store.getState,
        props.store.getState,
    );
    return (
        <McpAppShell
            arguments={{ query: "matrix" }}
            data-testid="mcp-id"
            resource={snapshot.resource}
            result={snapshot.result}
            status={snapshot.status}
            toolName="movie_show"
        />
    );
}

it("keeps the app frame DOM identity across data updates and remounts on a new resource", async () => {
    const view = createRenderer();
    const store = harnessStore({ resource: staticResource("d".repeat(64)), status: "in_progress" });
    view.render(() => <Harness store={store} />, { width: 420, height: 300 });
    await view.ready();

    const original = view.$('[data-testid="mcp-id"] [data-happy2-ui="mcp-app-host-frame"]').element;

    /* A result arriving (in_progress -> completed) is the same resource: the
       host frame DOM node and its running bridge must survive the update. */
    store.set({ status: "completed", result: { content: [{ type: "text", text: "done" }] } });
    await vi.waitFor(() =>
        expect(view.$('[data-testid="mcp-id"]').element.getAttribute("data-status")).toBe(
            "completed",
        ),
    );
    expect(
        view.$('[data-testid="mcp-id"] [data-happy2-ui="mcp-app-host-frame"]').element,
        "same resource preserves the app frame node",
    ).toBe(original);

    /* A genuinely different resource is a lifetime boundary: the frame remounts. */
    store.set({ resource: staticResource("e".repeat(64)) });
    await vi.waitFor(() =>
        expect(
            view.$('[data-testid="mcp-id"] [data-happy2-ui="mcp-app-host-frame"]').element,
        ).not.toBe(original),
    );
}, 120_000);

it("sends ui/resource-teardown to the proxy before removing the frame on unmount", async () => {
    const view = createRenderer();
    const store = harnessStore({ resource: staticResource("f".repeat(64)), status: "in_progress" });
    view.render(() => <Harness store={store} />, { width: 420, height: 300 });
    await view.ready();

    /* Observe the host->proxy channel deterministically: shadow the frame's
       contentWindow so the synchronous teardown post in the effect cleanup is
       captured before the iframe is detached. */
    const frame = view.$('[data-testid="mcp-id"] [data-happy2-ui="mcp-app-host-frame"]')
        .element as HTMLIFrameElement;
    const posted: Array<Record<string, unknown>> = [];
    Object.defineProperty(frame, "contentWindow", {
        configurable: true,
        get: () => ({ postMessage: (message: Record<string, unknown>) => posted.push(message) }),
    });

    store.set({ resource: undefined, status: "loading" });
    await vi.waitFor(() =>
        expect(view.container.querySelector('[data-testid="mcp-id"] iframe')).toBeNull(),
    );

    const teardown = posted.find((message) => message.method === "ui/resource-teardown");
    expect(teardown, "ui/resource-teardown sent before frame removal").toBeDefined();
    expect((teardown!.params as { reason?: string }).reason).toBeTruthy();
}, 120_000);
