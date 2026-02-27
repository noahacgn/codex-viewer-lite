import { Hono } from "hono";
import { routes } from "$lib/server/hono/routes";

export const honoApp = new Hono().basePath("/api").route("/", routes);
