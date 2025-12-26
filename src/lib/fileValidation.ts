// File upload validation utilities
// Prevents upload of potentially dangerous files

// Allowed MIME types for document uploads
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Images
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  // Text
  'text/plain',
  'text/csv',
];

// Blocked file extensions (dangerous executables)
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.psm1',
  '.jar', '.msi', '.dll', '.scr', '.pif', '.application',
  '.gadget', '.hta', '.cpl', '.msc', '.js', '.jse', '.vb',
  '.vbe', '.vbs', '.ws', '.wsf', '.wsc', '.wsh', '.reg',
];

// Maximum file size (10 MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a file for upload
 * Checks size, extension, and MIME type
 */
export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `El archivo es demasiado grande. Máximo permitido: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // Get file extension
  const fileName = file.name.toLowerCase();
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';

  // Check blocked extensions
  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `Tipo de archivo no permitido: ${extension}. Los archivos ejecutables no están permitidos.`,
    };
  }

  // Check MIME type (if browser provides it)
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    // Allow files without MIME type or with unrecognized types
    // but log for monitoring
    console.warn(`File uploaded with unrecognized MIME type: ${file.type}`);
  }

  // Sanitize filename - remove special characters that could cause issues
  const sanitizedName = sanitizeFileName(file.name);
  if (sanitizedName !== file.name) {
    console.log(`Filename sanitized from "${file.name}" to "${sanitizedName}"`);
  }

  return { isValid: true };
}

/**
 * Sanitizes a filename by removing dangerous characters
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts
  let sanitized = fileName.replace(/\.\./g, '');
  
  // Remove directory separators
  sanitized = sanitized.replace(/[/\\]/g, '_');
  
  // Remove special characters except for safe ones
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  
  // Limit filename length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 255 - ext.length);
    sanitized = name + ext;
  }
  
  // Ensure filename is not empty
  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'unnamed_file';
  }
  
  return sanitized;
}

/**
 * Get allowed file types as string for file input accept attribute
 */
export function getAllowedFileTypesAccept(): string {
  return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv';
}
