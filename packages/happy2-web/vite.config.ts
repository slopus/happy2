import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

/** Cookie the backend accepts for every browser authentication, matching the web gateway. */
const AUTHENTICATION_COOKIE = "happy2_auth_token";
/** 400 days in seconds — the browser ceiling for a persistent cookie (34_560_000). */
const DEV_TOKEN_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
/** Only a token-safe Bearer value from a successful backend request becomes a cookie. */
const AUTHORIZATION_BEARER = /^Bearer ([A-Za-z0-9._-]{1,4096})$/;

/**
 * The `/v0` dev proxy mirrors the packaged web proxy: the app presents the
 * authentication credential as an `Authorization: Bearer` header on its one
 * verification request to the proxy-only `/v0/auth/web/session` endpoint. That
 * proxy request becomes an upstream `/v0/me` request; when the backend confirms
 * it, the proxy issues an HttpOnly `happy2_auth_token` cookie so every later
 * same-origin request authenticates through the cookie the browser attaches
 * automatically. No `Secure` attribute is set, since local dev is plain HTTP.
 */
function developmentTokenProxy(target: string): ProxyOptions {
    return {
        target,
        changeOrigin: true,
        configure(proxy) {
            proxy.on("proxyRes", (proxyRes, req) => {
                if ((req.method ?? "GET").toUpperCase() !== "GET") return;
                if ((req.url ?? "").split("?")[0] !== "/v0/auth/web/session") return;
                if (proxyRes.statusCode !== 200) return;
                const authorization = req.headers.authorization;
                const match =
                    typeof authorization === "string"
                        ? AUTHORIZATION_BEARER.exec(authorization)
                        : null;
                if (!match) return;
                const cookie =
                    `${AUTHENTICATION_COOKIE}=${match[1]}; HttpOnly; Path=/; ` +
                    `SameSite=Strict; Max-Age=${DEV_TOKEN_MAX_AGE_SECONDS}`;
                const existing = proxyRes.headers["set-cookie"];
                proxyRes.headers["set-cookie"] = existing ? [...existing, cookie] : [cookie];
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const backendUrl = env.VITE_HAPPY2_SERVER_URL ?? "http://127.0.0.1:3000";
    return {
        plugins: [
            // The Rig terminal protocol (@slopus/ghostty-web) decodes compressed wire
            // frames with node:zlib and node Buffer; these polyfills make them real in
            // the browser instead of empty externals that would throw at runtime.
            nodePolyfills({
                include: ["buffer", "zlib", "crypto", "stream", "util"],
                globals: { Buffer: true },
            }),
            tailwindcss(),
            react(),
            babel({ presets: [reactCompilerPreset()] }),
        ],
        server: {
            proxy: {
                "/v0/auth/web/session": {
                    ...developmentTokenProxy(backendUrl),
                    rewrite: (path) => path.replace("/v0/auth/web/session", "/v0/me"),
                },
                "/v0": { target: backendUrl, changeOrigin: true, ws: true },
            },
        },
    };
});
