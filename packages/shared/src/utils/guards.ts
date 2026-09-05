export const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const assertNever = (value: never, message = 'Unexpected value'): never => {
  throw new Error(`${message}: ${String(value)}`);
};

export const ensureArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
