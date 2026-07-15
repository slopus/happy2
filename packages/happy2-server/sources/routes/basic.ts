import type { FastifyInstance } from "fastify";

export function registerBasicRoutes(app: FastifyInstance): void {
    app.get("/", async () => ({ service: "happy2", status: "ok" }));
    app.get("/v0/health", async () => ({ status: "ok" }));
}
