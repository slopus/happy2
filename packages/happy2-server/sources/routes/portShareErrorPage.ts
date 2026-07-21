import { readFileSync } from "node:fs";

interface PortShareErrorReply {
    code(statusCode: number): PortShareErrorReply;
    header(name: string, value: string): PortShareErrorReply;
    type(contentType: string): PortShareErrorReply;
    send(payload: string): unknown;
}

const page = readFileSync(new URL("./portShareErrorPage.html", import.meta.url), "utf8");

/** Sends the static, detail-free browser fallback shared by port-proxy authorization and upstream failures. */
export function portShareErrorPageSend(reply: PortShareErrorReply, statusCode: number) {
    return reply
        .code(statusCode)
        .header("cache-control", "no-store")
        .header(
            "content-security-policy",
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        )
        .header("referrer-policy", "no-referrer")
        .header("x-content-type-options", "nosniff")
        .type("text/html; charset=utf-8")
        .send(page);
}
