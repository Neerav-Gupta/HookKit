/** Deep-merge `overrides` into `base`. Objects merge recursively; arrays and scalars replace. */
export function deepMerge(base: unknown, overrides: unknown): unknown {
	if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
	const result: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(overrides)) {
		result[key] = key in result ? deepMerge(result[key], value) : value;
	}
	return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Set a dot-path (e.g. "data.object.amount_total") on a nested override object. */
export function setPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split(".");
	let cursor: Record<string, unknown> = target;
	for (const key of keys.slice(0, -1)) {
		const next = cursor[key];
		if (typeof next !== "object" || next === null) {
			cursor[key] = {};
		}
		cursor = cursor[key] as Record<string, unknown>;
	}
	const last = keys.at(-1);
	if (last !== undefined) cursor[last] = value;
}
