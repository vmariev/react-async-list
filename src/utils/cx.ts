export type ClassValue = string | number | false | null | undefined;

/**
 * Minimal `classnames` replacement so the package ships with zero runtime
 * dependencies. Returns `undefined` rather than an empty string so React does
 * not render a stray `class=""` attribute.
 */
export const cx = (...values: ClassValue[]): string | undefined => {
  let result = '';

  for (const value of values) {
    if (!value && value !== 0) {
      continue;
    }

    result = result ? `${result} ${value}` : String(value);
  }

  return result || undefined;
};
