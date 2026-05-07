/**
 * Excel file validation utility for security purposes.
 * Provides defense-in-depth against malicious Excel files.
 */

const VALID_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // Some browsers report this for xlsx
];
const VALID_EXTENSIONS = ['.xls', '.xlsx'];

export interface ExcelValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an Excel file before parsing to prevent potential security issues.
 * 
 * Checks:
 * - File extension validation
 * - MIME type validation (when available)
 * 
 * @param file - The File object to validate
 * @returns Validation result with error message if invalid
 */
export function validateExcelFile(file: File): ExcelValidationResult {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No se proporcionó ningún archivo' };
  }
  // Check file size is not zero (empty file)
  if (file.size === 0) {
    return { valid: false, error: 'El archivo está vacío' };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = VALID_EXTENSIONS.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return { 
      valid: false, 
      error: 'Solo se permiten archivos Excel (.xls, .xlsx)' 
    };
  }

  // Check MIME type (note: some browsers may not report accurate MIME types)
  if (file.type && !VALID_MIME_TYPES.includes(file.type)) {
    // Log for debugging but don't reject - MIME types can be unreliable
    console.warn(`Unexpected MIME type for Excel file: ${file.type}`);
  }

  return { valid: true };
}

/**
 * Wraps a Promise with a timeout to prevent hanging on malicious files.
 * Useful for protecting against ReDoS attacks in parsing libraries.
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
 * @returns The wrapped promise that rejects on timeout
 */
export function withParseTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('El procesamiento del archivo excedió el tiempo límite. El archivo podría estar corrupto o ser demasiado complejo.')), timeoutMs)
    )
  ]);
}
