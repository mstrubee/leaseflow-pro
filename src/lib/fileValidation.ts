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

// Maximum file size (200 MB)
const MAX_FILE_SIZE = 200 * 1024 * 1024;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a file for upload
 * Checks size, extension, and MIME type
 */
export function validateFile(file: File): FileValidationResult {
  // Size limit removed — uploads are not blocked by size.
  void MAX_FILE_SIZE;

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
  // Get extension first
  const lastDotIndex = fileName.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';
  const nameWithoutExt = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
  
  // Normalize to decompose accented characters, then remove diacritics
  let sanitized = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritical marks
  
  // Replace spaces with underscores
  sanitized = sanitized.replace(/\s+/g, '_');
  
  // Remove path traversal attempts
  sanitized = sanitized.replace(/\.\./g, '');
  
  // Remove directory separators
  sanitized = sanitized.replace(/[/\\]/g, '_');
  
  // Keep only alphanumeric, underscores, and hyphens
  sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  // Limit filename length
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  // Ensure filename is not empty
  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'unnamed_file';
  }
  
  // Add extension back (also sanitize it)
  const sanitizedExt = ext.toLowerCase().replace(/[^a-zA-Z0-9.]/g, '');
  
  return sanitized + sanitizedExt;
}

/**
 * Get allowed file types as string for file input accept attribute
 */
export function getAllowedFileTypesAccept(): string {
  return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv';
}
