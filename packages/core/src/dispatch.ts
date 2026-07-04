import type {
	DeliveryResult,
	DeliveryTarget,
	GeneratedEvent,
} from "./types.js";

function isFrameworkApp(
	target: DeliveryTarget,
): target is Exclude<DeliveryTarget, string> {
	return typeof target !== "string" && typeof target.inject === "function";
}

/**
 * Dispatcher — deliver a generated event's exact bytes to a URL (the user's
 * own local server) or to a FrameworkApp via an adapter (no network at all).
 * The Buffer is handed to the transport untouched.
 */
export async function dispatch(
	evt: GeneratedEvent,
	target: DeliveryTarget,
): Promise<DeliveryResult> {
	const started = performance.now();

	if (isFrameworkApp(target)) {
		const res = await target.inject({
			method: "POST",
			url: "/",
			headers: evt.headers,
			body: evt.rawBody,
		});
		return { ...res, ms: performance.now() - started };
	}

	const response = await fetch(target, {
		method: "POST",
		headers: evt.headers,
		body: new Uint8Array(evt.rawBody),
	});
	const body = await response.text();
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return {
		status: response.status,
		body,
		headers,
		ms: performance.now() - started,
	};
}
