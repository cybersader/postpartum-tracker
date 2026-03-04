/**
 * Deep merge utility for nested settings objects.
 * Recursively merges `overrides` into `defaults`, preserving default values
 * for any keys missing in overrides. Arrays are replaced, not merged.
 */
export function deepMerge<T extends object>(defaults: T, overrides: Record<string, unknown>): T {
	if (!overrides || typeof overrides !== 'object') return { ...defaults };
	const result = { ...defaults } as Record<string, unknown>;
	for (const key of Object.keys(overrides)) {
		const defVal = (defaults as Record<string, unknown>)[key];
		const overVal = overrides[key];
		if (
			defVal !== null && overVal !== null &&
			typeof defVal === 'object' && typeof overVal === 'object' &&
			!Array.isArray(defVal) && !Array.isArray(overVal)
		) {
			result[key] = deepMerge(defVal as object, overVal as Record<string, unknown>);
		} else if (overVal !== undefined) {
			result[key] = overVal;
		}
	}
	return result as T;
}
