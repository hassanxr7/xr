// Spreadsheet formula-injection guard: Excel/Sheets treat a leading
// =, +, -, @, tab, or CR as the start of a formula/command when a CSV cell
// is opened. Prefixing with a single quote neutralizes that while keeping
// the value human-readable.
const DANGEROUS_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function csvSanitizeCell(value: string): string {
  if (DANGEROUS_PREFIXES.some((p) => value.startsWith(p))) {
    return `'${value}`;
  }
  return value;
}

export function csvEscapeField(value: string): string {
  const sanitized = csvSanitizeCell(value);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function csvRow(values: string[]): string {
  return values.map(csvEscapeField).join(",") + "\r\n";
}
