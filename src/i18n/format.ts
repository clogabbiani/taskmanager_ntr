/** Fills `{name}` placeholders in a message from src/i18n/it.ts. */
export function t(message: string, vars: Record<string, string | number> = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
