/**
 * NestJS adapter. Nest (with the default Express platform) exposes the raw
 * body when the app is created with `{ rawBody: true }`; handlers then read
 * `req.rawBody`. For custom setups, `rawBodyMiddleware` from the Express
 * adapter works unchanged on Nest's underlying HTTP server.
 *
 * RAW-BODY FIDELITY: always verify against `req.rawBody`, never a parsed body.
 */
import type { RequestListener } from "node:http";
import {
	rawBodyMiddleware,
	toTarget as toExpressTarget,
} from "@hookkit-dev/adapter-express";
import type { FrameworkApp } from "@hookkit-dev/core";

export { rawBodyMiddleware };

/**
 * Wrap a Nest application as a HookKit delivery target. Pass the result of
 * `app.getHttpAdapter().getInstance()` (the underlying Express instance) or
 * any node:http request listener.
 */
export function toTarget(httpInstance: RequestListener): FrameworkApp {
	return toExpressTarget(httpInstance);
}
