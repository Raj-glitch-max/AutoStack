/**
 * validator.ts - Zero-dependency Type-Safe Input Validation
 * Optimized for Deno Edge Functions (Zero Cold-Start Impact).
 *
 * Supports: string, number, boolean, uuid, array, object, url types.
 * Constraints: required, min, max, pattern, enum, maxLength, message.
 */

export interface ValidationRule {
    type: 'string' | 'number' | 'boolean' | 'uuid' | 'array' | 'object' | 'url';
    required?: boolean;
    min?: number;
    max?: number;
    maxLength?: number;
    pattern?: RegExp;
    enum?: readonly string[];
    default?: any;
    message?: string; // Custom error message override
}

export type ValidationSchema = Record<string, ValidationRule>;

interface ValidationOptions {
    strict?: boolean; // Error if extra keys are present
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Validates a payload against a schema.
 * @throws Error with detailed issues if validation fails.
 * @returns Sanitized and typed payload (only schema-declared keys).
 */
export function validatePayload<T = any>(
    payload: any,
    schema: ValidationSchema,
    options: ValidationOptions = {}
): T {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Validation failed: request body must be a JSON object');
    }

    const errors: string[] = [];
    const validated: any = {};
    const payloadKeys = new Set(Object.keys(payload));

    for (const [key, rule] of Object.entries(schema)) {
        payloadKeys.delete(key);
        let value = payload[key];

        // 1. Apply defaults
        if ((value === undefined || value === null) && rule.default !== undefined) {
            value = rule.default;
        }

        // 2. Check required
        if (rule.required && (value === undefined || value === null || value === '')) {
            errors.push(rule.message ?? `${key} is required`);
            continue;
        }

        if (value === undefined || value === null) continue;

        // 3. Check type
        switch (rule.type) {
            case 'string':
                if (typeof value !== 'string') {
                    errors.push(rule.message ?? `${key} must be a string`);
                }
                break;
            case 'number':
                if (typeof value !== 'number' || isNaN(value)) {
                    errors.push(rule.message ?? `${key} must be a number`);
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    errors.push(rule.message ?? `${key} must be a boolean`);
                }
                break;
            case 'uuid':
                if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
                    errors.push(rule.message ?? `${key} must be a valid UUID`);
                }
                break;
            case 'url':
                if (typeof value !== 'string' || !URL_REGEX.test(value)) {
                    errors.push(rule.message ?? `${key} must be a valid URL`);
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    errors.push(rule.message ?? `${key} must be an array`);
                }
                break;
            case 'object':
                if (typeof value !== 'object' || Array.isArray(value)) {
                    errors.push(rule.message ?? `${key} must be an object`);
                }
                break;
        }

        // 4. Check constraints
        if (typeof value === 'string') {
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                errors.push(rule.message ?? `${key} must be at most ${rule.maxLength} characters`);
            }
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(rule.message ?? `${key} has invalid format`);
            }
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(rule.message ?? `${key} must be one of: ${rule.enum.join(', ')}`);
            }
        }

        if (typeof value === 'number') {
            if (rule.min !== undefined && value < rule.min) {
                errors.push(rule.message ?? `${key} must be >= ${rule.min}`);
            }
            if (rule.max !== undefined && value > rule.max) {
                errors.push(rule.message ?? `${key} must be <= ${rule.max}`);
            }
        }

        validated[key] = value;
    }

    // 5. Strict mode check
    if (options.strict && payloadKeys.size > 0) {
        errors.push(`Unknown keys: ${Array.from(payloadKeys).join(', ')}`);
    }

    if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join('; ')}`);
    }

    return validated as T;
}

/**
 * Wraps validatePayload into a standard error response for Edge Functions.
 * Returns null if valid, or a 400 Response if invalid.
 */
export function validateOrRespond(
    payload: any,
    schema: ValidationSchema,
    corsHeaders: Record<string, string>
): Response | null {
    try {
        validatePayload(payload, schema, { strict: false });
        return null; // Valid
    } catch (err: any) {
        return new Response(
            JSON.stringify({
                error: err.message,
                code: 'VALIDATION_ERROR',
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
}
