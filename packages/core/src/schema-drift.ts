/**
 * Runtime schema-drift detection: does a REAL captured/verified payload still
 * match the JSON Schema HookKit knows for that event (the same schemas the
 * fixture CI gate validates against)? Complements that CI-time check with a
 * live one — surfaced in the inspector and the CLI's `verify` command.
 */
import type { ValidateFunction } from "ajv";
import Ajv from "ajv";
import { registry } from "./registry.js";

export interface SchemaDriftResult {
	/** Whether a check was actually attempted (the event type was identifiable and has a schema). */
	checked: boolean;
	/** Only meaningful when `checked` is true. */
	matched?: boolean;
	eventType?: string;
	errors?: string[];
}

const ajv = new Ajv({ allErrors: true });
const validatorCache = new Map<string, ValidateFunction>();

function compiledValidator(cacheKey: string, schema: object): ValidateFunction {
	let validate = validatorCache.get(cacheKey);
	if (!validate) {
		validate = ajv.compile(schema);
		validatorCache.set(cacheKey, validate);
	}
	return validate;
}

export function detectSchemaDrift(
	providerId: string,
	input: { headers: Record<string, string>; parsedBody: unknown },
): SchemaDriftResult {
	const adapter = registry.get(providerId);
	if (!adapter.identifyEvent) return { checked: false };

	const eventType = adapter.identifyEvent(input);
	if (!eventType) return { checked: false };

	const descriptor = adapter.events[eventType];
	if (!descriptor?.schema) return { checked: false, eventType };

	const validate = compiledValidator(
		`${providerId}:${eventType}`,
		descriptor.schema as object,
	);
	const matched = validate(input.parsedBody);
	return {
		checked: true,
		matched,
		eventType,
		...(matched
			? {}
			: {
					errors: (validate.errors ?? []).map(
						(e) => `${e.instancePath} ${e.message}`,
					),
				}),
	};
}
