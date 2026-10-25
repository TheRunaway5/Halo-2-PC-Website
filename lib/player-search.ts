export const DISPLAY_NAME_LIMIT = 64;
export const PLAYER_SEARCH_LIMIT = DISPLAY_NAME_LIMIT + 9;

export function displayNameQuery(value: string): string | null {
  if (/[\u0000-\u001f\u007f]/u.test(value)) return null;
  const name = value.trim();
  const tag = /^(.*)#([0-9]{8})$/u.exec(name);
  return name.length > 0 && (tag ? tag[1].length > 0 && tag[1].length <= DISPLAY_NAME_LIMIT : name.length <= DISPLAY_NAME_LIMIT) ? name : null;
}
