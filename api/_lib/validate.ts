/**
 * Shared request validation for AI proxy routes.
 * Returns the parsed body or throws a ValidationError.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`Missing or empty field: ${field}`);
  }
  return value.trim();
};

export const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
};
