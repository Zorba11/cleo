import { AssetType } from '@prisma/client';

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  AUDIO: 50 * 1024 * 1024,     // 50MB for audio files
  VIDEO: 500 * 1024 * 1024,    // 500MB for video files
  FRAME: 10 * 1024 * 1024,     // 10MB for image frames
  DOC: 5 * 1024 * 1024,        // 5MB for documents
  ALIGN: 1024 * 1024,          // 1MB for alignment files
  CUE: 1024 * 1024,            // 1MB for cue files
} as const;

// Allowed MIME types for each asset type
export const ALLOWED_MIME_TYPES = {
  AUDIO: [
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm'
  ],
  VIDEO: [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/ogg'
  ],
  FRAME: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ],
  DOC: [
    'application/json',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  ALIGN: [
    'application/json',
    'text/plain'
  ],
  CUE: [
    'application/json',
    'text/plain'
  ]
} as const;

// File extension patterns
export const ALLOWED_EXTENSIONS = {
  AUDIO: ['.wav', '.mp3', '.mp4', '.aac', '.ogg', '.webm', '.m4a'],
  VIDEO: ['.mp4', '.mpeg', '.mov', '.avi', '.webm', '.ogv', '.mkv'],
  FRAME: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
  DOC: ['.json', '.pdf', '.txt', '.md', '.doc', '.docx'],
  ALIGN: ['.json', '.txt'],
  CUE: ['.json', '.txt']
} as const;

// Standard filename patterns for specific file types
export const FILENAME_PATTERNS = {
  BEAT_AUDIO: /^beat_\d+\.(wav|mp3|mp4|aac|ogg|webm|m4a)$/i,
  BEAT_ALIGNMENT: /^beat_\d+\.json$/i,
  FRAME: /^B\d+_F\d+\.(png|jpg|jpeg|webp|gif)$/i,
  PROJECT_PLAN: /^ProjectPlan\.json$/i,
  STYLE_BIBLE: /^StyleBible\.min\.json$/i,
  CUES: /^cues\.json$/i,
  FINAL_VIDEO: /^final\.(mp4|webm|mov)$/i,
  FINAL_ALIGNMENT: /^final\.json$/i
} as const;

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate file size
export function validateFileSize(
  buffer: Buffer | ArrayBuffer | number, 
  assetType: AssetType
): ValidationResult {
  const size = typeof buffer === 'number' ? buffer : buffer.byteLength || (buffer as Buffer).length;
  const limit = FILE_SIZE_LIMITS[assetType];
  
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  if (size > limit) {
    result.isValid = false;
    result.errors.push(
      `File size ${formatBytes(size)} exceeds limit of ${formatBytes(limit)} for ${assetType} files`
    );
  }
  
  // Warning for files larger than 50% of limit
  if (size > limit * 0.5) {
    result.warnings.push(
      `File size ${formatBytes(size)} is large for ${assetType} files (limit: ${formatBytes(limit)})`
    );
  }
  
  return result;
}

// Validate MIME type
export function validateMimeType(
  mimeType: string | undefined, 
  assetType: AssetType
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  if (!mimeType) {
    result.isValid = false;
    result.errors.push('MIME type is required');
    return result;
  }
  
  const allowedTypes = ALLOWED_MIME_TYPES[assetType];
  
  if (!allowedTypes.includes(mimeType as any)) {
    result.isValid = false;
    result.errors.push(
      `MIME type "${mimeType}" is not allowed for ${assetType} files. Allowed types: ${allowedTypes.join(', ')}`
    );
  }
  
  return result;
}

// Validate file extension
export function validateFileExtension(
  filename: string, 
  assetType: AssetType
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const extension = getFileExtension(filename);
  const allowedExtensions = ALLOWED_EXTENSIONS[assetType];
  
  if (!allowedExtensions.includes(extension as any)) {
    result.isValid = false;
    result.errors.push(
      `File extension "${extension}" is not allowed for ${assetType} files. Allowed extensions: ${allowedExtensions.join(', ')}`
    );
  }
  
  return result;
}

// Validate filename pattern for specific file types
export function validateFilenamePattern(
  filename: string, 
  expectedPattern?: keyof typeof FILENAME_PATTERNS
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  if (!expectedPattern) {
    return result; // No specific pattern required
  }
  
  const pattern = FILENAME_PATTERNS[expectedPattern];
  
  if (!pattern.test(filename)) {
    result.isValid = false;
    result.errors.push(
      `Filename "${filename}" does not match expected pattern for ${expectedPattern}`
    );
  }
  
  return result;
}

// Comprehensive file validation
export function validateFile(
  filename: string,
  buffer: Buffer | ArrayBuffer,
  assetType: AssetType,
  mimeType?: string,
  expectedPattern?: keyof typeof FILENAME_PATTERNS
): ValidationResult {
  const results = [
    validateFileSize(buffer, assetType),
    validateFileExtension(filename, assetType),
    validateMimeType(mimeType, assetType),
    validateFilenamePattern(filename, expectedPattern)
  ];
  
  // Combine all validation results
  const combined: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  for (const result of results) {
    if (!result.isValid) {
      combined.isValid = false;
    }
    combined.errors.push(...result.errors);
    combined.warnings.push(...result.warnings);
  }
  
  return combined;
}

// Validate project file structure
export function validateProjectFileStructure(projectId: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  // Validate project ID format (UUID-like)
  const uuidPattern = /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  
  if (!uuidPattern.test(projectId)) {
    result.warnings.push('Project ID does not follow UUID format');
  }
  
  return result;
}

// Utility functions
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function generateSafeFilename(originalName: string): string {
  // Remove special characters and spaces, convert to lowercase
  return originalName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function inferAssetTypeFromFilename(filename: string): AssetType | null {
  const extension = getFileExtension(filename);
  
  if (ALLOWED_EXTENSIONS.AUDIO.includes(extension as any)) return 'AUDIO';
  if (ALLOWED_EXTENSIONS.VIDEO.includes(extension as any)) return 'VIDEO';
  if (ALLOWED_EXTENSIONS.FRAME.includes(extension as any)) return 'FRAME';
  if (ALLOWED_EXTENSIONS.DOC.includes(extension as any)) return 'DOC';
  if (extension === '.json' && filename.includes('align')) return 'ALIGN';
  if (extension === '.json' && filename.includes('cue')) return 'CUE';
  
  return null;
}

// Content validation helpers
export function validateJSON(content: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  try {
    JSON.parse(content);
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return result;
}

export function validateProjectPlan(content: string): ValidationResult {
  const jsonValidation = validateJSON(content);
  if (!jsonValidation.isValid) {
    return jsonValidation;
  }
  
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  try {
    const plan = JSON.parse(content);
    
    // Check for required fields
    const requiredFields = ['dialogueInputs', 'beats', 'styleBibleMin', 'timelineSkeleton'];
    const missingFields = requiredFields.filter(field => !plan[field]);
    
    if (missingFields.length > 0) {
      result.isValid = false;
      result.errors.push(`Missing required fields in project plan: ${missingFields.join(', ')}`);
    }
    
    // Validate beats structure
    if (plan.beats && Array.isArray(plan.beats)) {
      for (let i = 0; i < plan.beats.length; i++) {
        const beat = plan.beats[i];
        if (typeof beat.index !== 'number' || typeof beat.summary !== 'string') {
          result.warnings.push(`Beat ${i} is missing required fields (index, summary)`);
        }
      }
    }
    
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Failed to validate project plan structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return result;
}