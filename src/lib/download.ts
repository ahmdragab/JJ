/**
 * Shared download utilities
 */

/**
 * Download a file from a URL
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadFromObjectUrl(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Download from an object URL (handles the DOM manipulation)
 */
export function downloadFromObjectUrl(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download a base64 encoded image
 */
export function downloadBase64Image(base64: string, filename: string, mimeType: string = 'image/png'): void {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Generate a unique filename with timestamp
 */
export function generateFilename(prefix: string, extension: string = 'png'): string {
  const timestamp = Date.now();
  const sanitizedPrefix = prefix.toLowerCase().replace(/\s+/g, '-');
  return `${sanitizedPrefix}-${timestamp}.${extension}`;
}

/**
 * Generate a unique ID for file uploads
 */
export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
