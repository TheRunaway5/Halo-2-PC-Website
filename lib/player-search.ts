export const DISPLAY_NAME_LIMIT = 64;

export function displayNameQuery(value: string): string | null {
  if (/[\u0000-\u001f\u007f]/u.test(value)) return null;
  const name = value.trim();
  return name.length > 0 && name.length <= DISPLAY_NAME_LIMIT ? name : null;
}
