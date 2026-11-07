/**
 * CSV writing (RFC 4180) that is also safe to open in spreadsheets: cells that
 * start with = + - @ (even after whitespace), or with a tab or line break, are
 * prefixed with an apostrophe, so a dish name or note like "=HYPERLINK(...)"
 * can never run as a formula.
 */
const FORMULA_START = /^\s*[=+\-@]|^[\t\r\n]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : String(value);
  if (typeof value !== "number" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Whole document with CRLF line endings and a UTF-8 BOM (Excel-friendly). */
export function csvDocument(header: string[], rows: unknown[][]): string {
  return "﻿" + [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/** 1234 → "12.34" for a 2-decimal currency. */
export function centsToDecimal(cents: number, digits = 2): string {
  return digits === 0 ? String(cents) : (cents / 10 ** digits).toFixed(digits);
}
