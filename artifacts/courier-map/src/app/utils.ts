/**
 * Escape HTML special characters to prevent XSS in popup content.
 * Used when inserting dynamic text into map popups via setHTML().
 */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
