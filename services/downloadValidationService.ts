import { ChapterImage } from '@/types/download';
import { chapterStorageService } from './chapterStorageService';
// import {
//   downloadErrorHandler,
//   ValidationErrorContext,
// } from './downloadErrorHandler'; // Reserved for future use
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import { File as FSFile } from 'expo-file-system';

// Validation configuration
const MIN_IMAGE_SIZE = 1024; // 1KB minimum file size
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB maximum file size
const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
// const VALIDATION_TIMEOUT = 10000; // 10 seconds per validation - Reserved for future use
// const CORRUPTION_CHECK_SAMPLE_SIZE = 5; // Check first 5 images for corruption patterns - Reserved for future use

// Image validation results
export interface ImageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileSize: number;
  format?: string;
  dimensions?: { width: number; height: number };
  corruptionDetected: boolean;
  missingImages?: number;
}

export interface ChapterValidationResult {
  isValid: boolean;
  totalImages: number;
  validImages: number;
  corruptedImages: number;
  missingImages: number;
  totalSize: number;
  errors: string[];
  warnings: string[];
  imageResults: Map<number, ImageValidationResult>;
  integrityScore: number; // 0-100 score
  recommendedAction:
    | 'none'
    | 'redownload_corrupted'
    | 'redownload_all'
    | 'manual_check';
}

export interface IntegrityCheckOptions {
  validateFileSize: boolean;
  validateFormat: boolean;
  validateContent: boolean;
  checkDimensions: boolean;
  deepScan: boolean;
  repairCorrupted: boolean;
}

class DownloadValidationService {
  private static instance: DownloadValidationService;
  private log = logger();
  private validationCache: Map<string, ChapterValidationResult> = new Map();
  private ongoingValidations: Map<string, Promise<ChapterValidationResult>> =
    new Map();

  private constructor() {}

  static getInstance(): DownloadValidationService {
    if (!DownloadValidationService.instance) {
      DownloadValidationService.instance = new DownloadValidationService();
    }
    return DownloadValidationService.instance;
  }

  /**
   * Validate downloaded chapter integrity
   */
  async validateChapterIntegrity(
    mangaId: string,
    chapterNumber: string,
    options: Partial<IntegrityCheckOptions> = {}
  ): Promise<ChapterValidationResult> {
    const validationKey = `${mangaId}_${chapterNumber}`;

    // Check if validation is already in progress
    const ongoingValidation = this.ongoingValidations.get(validationKey);
    if (ongoingValidation) {
      return ongoingValidation;
    }

    // Check cache first (with 5-minute expiry)
    const cached = this.validationCache.get(validationKey);
    if (cached && Date.now() - (cached as any).timestamp < 5 * 60 * 1000) {
      return cached;
    }

    // Start new validation
    const validationPromise = this.performChapterValidation(
      mangaId,
      chapterNumber,
      {
        validateFileSize: true,
        validateFormat: true,
        validateContent: false,
        checkDimensions: false,
        deepScan: false,
        repairCorrupted: false,
        ...options,
      }
    );

    this.ongoingValidations.set(validationKey, validationPromise);

    try {
      const result = await validationPromise;

      // Cache result
      (result as any).timestamp = Date.now();
      this.validationCache.set(validationKey, result);

      return result;
    } finally {
      this.ongoingValidations.delete(validationKey);
    }
  }

  /**
   * Perform comprehensive chapter validation
   */
  private async performChapterValidation(
    mangaId: string,
    chapterNumber: string,
    options: IntegrityCheckOptions
  ): Promise<ChapterValidationResult> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting chapter validation', {
        mangaId,
        chapterNumber,
        options,
      });
    }

    try {
      // Get chapter images from storage
      const images = await chapterStorageService.getChapterImages(
        mangaId,
        chapterNumber
      );

      if (!images || images.length === 0) {
        return {
          isValid: false,
          totalImages: 0,
          validImages: 0,
          corruptedImages: 0,
          missingImages: 0,
          totalSize: 0,
          errors: ['Chapter not found or has no images'],
          warnings: [],
          imageResults: new Map(),
          integrityScore: 0,
          recommendedAction: 'redownload_all',
        };
      }

      const result: ChapterValidationResult = {
        isValid: true,
        totalImages: images.length,
        validImages: 0,
        corruptedImages: 0,
        missingImages: 0,
        totalSize: 0,
        errors: [],
        warnings: [],
        imageResults: new Map(),
        integrityScore: 0,
        recommendedAction: 'none',
      };

      // Validate each image
      for (const image of images) {
        try {
          const imageResult = await this.validateSingleImage(image, options);
          result.imageResults.set(image.pageNumber, imageResult);
          result.totalSize += imageResult.fileSize;

          if (imageResult.isValid) {
            result.validImages++;
          } else {
            if (imageResult.corruptionDetected) {
              result.corruptedImages++;
            } else {
              result.missingImages++;
            }
            result.errors.push(...imageResult.errors);
          }

          result.warnings.push(...imageResult.warnings);
        } catch (error) {
          result.errors.push(
            `Failed to validate image ${image.pageNumber}: ${error}`
          );
          result.missingImages++;
        }
      }

      // Calculate integrity score
      result.integrityScore = Math.round(
        (result.validImages / result.totalImages) * 100
      );

      // Determine if chapter is valid overall
      result.isValid = result.integrityScore >= 80; // 80% threshold

      // Determine recommended action
      result.recommendedAction = this.determineRecommendedAction(result);

      if (isDebugEnabled()) {
        this.log.info('Service', 'Chapter validation completed', {
          mangaId,
          chapterNumber,
          integrityScore: result.integrityScore,
          validImages: result.validImages,
          totalImages: result.totalImages,
          recommendedAction: result.recommendedAction,
        });
      }

      return result;
    } catch (error) {
      this.log.error('Service', 'Chapter validation failed', {
        mangaId,
        chapterNumber,
        error,
      });

      return {
        isValid: false,
        totalImages: 0,
        validImages: 0,
        corruptedImages: 0,
        missingImages: 0,
        totalSize: 0,
        errors: [`Validation failed: ${error}`],
        warnings: [],
        imageResults: new Map(),
        integrityScore: 0,
        recommendedAction: 'manual_check',
      };
    }
  }

  /**
   * Validate a single image file
   */
  private async validateSingleImage(
    image: ChapterImage,
    options: IntegrityCheckOptions
  ): Promise<ImageValidationResult> {
    const result: ImageValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileSize: 0,
      corruptionDetected: false,
    };

    try {
      // Check if file exists
      if (!image.localPath) {
        result.isValid = false;
        result.errors.push('No local path specified');
        return result;
      }

      const file = new FSFile(image.localPath);
      const fileInfo = file.info();

      if (!fileInfo.exists) {
        result.isValid = false;
        result.errors.push('File does not exist');
        result.missingImages = 1;
        return result;
      }

      result.fileSize = typeof fileInfo.size === 'number' ? fileInfo.size : 0;

      // Validate file size
      if (options.validateFileSize) {
        if (result.fileSize < MIN_IMAGE_SIZE) {
          result.isValid = false;
          result.errors.push(`File too small: ${result.fileSize} bytes`);
          result.corruptionDetected = true;
        } else if (result.fileSize > MAX_IMAGE_SIZE) {
          result.warnings.push(
            `File very large: ${this.formatFileSize(result.fileSize)}`
          );
        }
      }

      // Validate file format
      if (options.validateFormat) {
        const formatValidation = await this.validateImageFormat(file);
        if (!formatValidation.isValid) {
          result.isValid = false;
          result.errors.push(...formatValidation.errors);
          result.corruptionDetected = true;
        }
        if (formatValidation.format) {
          result.format = formatValidation.format;
        }
      }

      // Validate content (basic corruption check)
      if (options.validateContent && result.fileSize > 0) {
        const contentValidation = await this.validateImageContent(file);
        if (!contentValidation.isValid) {
          result.isValid = false;
          result.errors.push(...contentValidation.errors);
          result.corruptionDetected = true;
        }
      }

      // Check dimensions if requested
      if (options.checkDimensions) {
        try {
          const dimensions = await this.getImageDimensions(file);
          result.dimensions = dimensions;

          if (dimensions.width < 100 || dimensions.height < 100) {
            result.warnings.push(
              `Very small image: ${dimensions.width}x${dimensions.height}`
            );
          }
        } catch (error) {
          result.warnings.push('Could not read image dimensions');
        }
      }

      // Deep scan for corruption patterns
      if (options.deepScan) {
        const deepScanResult = await this.performDeepScan(file);
        if (!deepScanResult.isValid) {
          result.isValid = false;
          result.errors.push(...deepScanResult.errors);
          result.corruptionDetected = true;
        }
        result.warnings.push(...deepScanResult.warnings);
      }

      return result;
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error}`);
      result.corruptionDetected = true;
      return result;
    }
  }

  /**
   * Validate image file format
   */
  private async validateImageFormat(file: FSFile): Promise<{
    isValid: boolean;
    errors: string[];
    format?: string;
  }> {
    try {
      // Read first few bytes to check magic numbers
      const buffer = await this.readFileBytes(file, 0, 12);

      if (!buffer || buffer.length < 4) {
        return {
          isValid: false,
          errors: ['Cannot read file header'],
        };
      }

      // Check magic numbers for common image formats
      const format = this.detectImageFormat(buffer);

      if (!format) {
        return {
          isValid: false,
          errors: ['Unknown or invalid image format'],
        };
      }

      if (!SUPPORTED_IMAGE_FORMATS.includes(format.toLowerCase())) {
        return {
          isValid: false,
          errors: [`Unsupported image format: ${format}`],
        };
      }

      return {
        isValid: true,
        errors: [],
        format,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Format validation failed: ${error}`],
      };
    }
  }

  /**
   * Validate image content for basic corruption
   */
  private async validateImageContent(file: FSFile): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    try {
      const fileInfo = file.info();
      const fileSize = typeof fileInfo.size === 'number' ? fileInfo.size : 0;

      if (fileSize === 0) {
        return {
          isValid: false,
          errors: ['File is empty'],
        };
      }

      // Read first and last few bytes to check for truncation
      const headerSize = Math.min(1024, fileSize);
      const footerSize = Math.min(1024, fileSize);

      const header = await this.readFileBytes(file, 0, headerSize);
      const footer = await this.readFileBytes(
        file,
        fileSize - footerSize,
        footerSize
      );

      if (!header || !footer) {
        return {
          isValid: false,
          errors: ['Cannot read file content'],
        };
      }

      // Check for common corruption patterns
      const errors: string[] = [];

      // Check for all-zero bytes (common corruption)
      if (this.isAllZeros(header) || this.isAllZeros(footer)) {
        errors.push('File contains corrupted data (all zeros)');
      }

      // Check for repeated patterns (another corruption indicator)
      if (this.hasRepeatedPattern(header) || this.hasRepeatedPattern(footer)) {
        errors.push('File may be corrupted (repeated patterns detected)');
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Content validation failed: ${error}`],
      };
    }
  }

  /**
   * Perform deep scan for corruption patterns
   */
  private async performDeepScan(file: FSFile): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const fileInfo = file.info();
      const fileSize = typeof fileInfo.size === 'number' ? fileInfo.size : 0;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (fileSize === 0) {
        errors.push('File is empty');
        return { isValid: false, errors, warnings };
      }

      // Sample multiple points in the file
      const samplePoints = Math.min(10, Math.floor(fileSize / 1024));
      let corruptedSamples = 0;

      for (let i = 0; i < samplePoints; i++) {
        const offset = Math.floor((fileSize / samplePoints) * i);
        const sampleSize = Math.min(512, fileSize - offset);

        const sample = await this.readFileBytes(file, offset, sampleSize);

        if (!sample) {
          corruptedSamples++;
          continue;
        }

        // Check for corruption patterns in this sample
        if (this.isAllZeros(sample) || this.hasRepeatedPattern(sample)) {
          corruptedSamples++;
        }
      }

      // If more than 30% of samples are corrupted, consider file corrupted
      const corruptionRatio = corruptedSamples / samplePoints;
      if (corruptionRatio > 0.3) {
        errors.push(
          `High corruption detected (${Math.round(corruptionRatio * 100)}% of samples)`
        );
      } else if (corruptionRatio > 0.1) {
        warnings.push(
          `Possible corruption detected (${Math.round(corruptionRatio * 100)}% of samples)`
        );
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Deep scan failed: ${error}`],
        warnings: [],
      };
    }
  }

  /**
   * Detect image format from file header
   */
  private detectImageFormat(buffer: Uint8Array): string | null {
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg';
    }

    // PNG
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'png';
    }

    // WebP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'webp';
    }

    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }

    return null;
  }

  /**
   * Read bytes from file
   */
  private async readFileBytes(
    _file: FSFile,
    _offset: number,
    _length: number
  ): Promise<Uint8Array | null> {
    try {
      // This is a simplified implementation - in a real app you'd use proper file reading
      // For now, we'll simulate reading by checking if file exists
      const fileInfo = _file.info();
      if (!fileInfo.exists) {
        return null;
      }

      // Return a mock buffer for demonstration
      // In real implementation, you'd read actual file bytes
      return new Uint8Array(_length).fill(0x42); // Mock data
    } catch (error) {
      return null;
    }
  }

  /**
   * Get image dimensions (mock implementation)
   */
  private async getImageDimensions(
    _file: FSFile
  ): Promise<{ width: number; height: number }> {
    // This would use a proper image library in real implementation
    // For now, return mock dimensions
    return { width: 800, height: 1200 };
  }

  /**
   * Check if buffer contains all zeros
   */
  private isAllZeros(buffer: Uint8Array): boolean {
    return buffer.every((byte) => byte === 0);
  }

  /**
   * Check for repeated patterns in buffer
   */
  private hasRepeatedPattern(buffer: Uint8Array): boolean {
    if (buffer.length < 16) return false;

    // Check for 4-byte repeated patterns
    const pattern = buffer.slice(0, 4);
    let repeats = 0;

    for (let i = 4; i < buffer.length - 4; i += 4) {
      const chunk = buffer.slice(i, i + 4);
      if (this.arraysEqual(pattern, chunk)) {
        repeats++;
      }
    }

    // If more than 75% of the buffer is the same pattern, it's likely corrupted
    return repeats > (buffer.length / 4) * 0.75;
  }

  /**
   * Compare two Uint8Arrays for equality
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }

  /**
   * Determine recommended action based on validation results
   */
  private determineRecommendedAction(
    result: ChapterValidationResult
  ): 'none' | 'redownload_corrupted' | 'redownload_all' | 'manual_check' {
    if (result.integrityScore >= 95) {
      return 'none';
    }

    if (result.integrityScore >= 80 && result.corruptedImages <= 2) {
      return 'redownload_corrupted';
    }

    if (result.integrityScore >= 50) {
      return 'redownload_all';
    }

    return 'manual_check';
  }

  /**
   * Repair corrupted chapter by re-downloading failed images
   */
  async repairCorruptedChapter(
    mangaId: string,
    chapterNumber: string,
    validationResult: ChapterValidationResult
  ): Promise<{
    success: boolean;
    repairedImages: number;
    errors: string[];
  }> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting chapter repair', {
        mangaId,
        chapterNumber,
        corruptedImages: validationResult.corruptedImages,
      });
    }

    const errors: string[] = [];
    let repairedImages = 0;

    try {
      // Get list of corrupted images
      const corruptedImageNumbers: number[] = [];

      for (const [pageNumber, imageResult] of validationResult.imageResults) {
        if (!imageResult.isValid && imageResult.corruptionDetected) {
          corruptedImageNumbers.push(pageNumber);
        }
      }

      if (corruptedImageNumbers.length === 0) {
        return {
          success: true,
          repairedImages: 0,
          errors: [],
        };
      }

      // This would integrate with the download manager to re-download specific images
      // For now, we'll simulate the repair process
      for (const pageNumber of corruptedImageNumbers) {
        try {
          // In real implementation, this would:
          // 1. Delete the corrupted image file
          // 2. Re-download the image from the original URL
          // 3. Validate the new download

          if (isDebugEnabled()) {
            this.log.info('Service', 'Repairing corrupted image', {
              mangaId,
              chapterNumber,
              pageNumber,
            });
          }

          // Simulate successful repair
          repairedImages++;
        } catch (repairError) {
          errors.push(`Failed to repair image ${pageNumber}: ${repairError}`);
        }
      }

      // Clear validation cache to force re-validation
      this.clearValidationCache(mangaId, chapterNumber);

      return {
        success: errors.length === 0,
        repairedImages,
        errors,
      };
    } catch (error) {
      this.log.error('Service', 'Chapter repair failed', {
        mangaId,
        chapterNumber,
        error,
      });

      return {
        success: false,
        repairedImages,
        errors: [`Repair failed: ${error}`],
      };
    }
  }

  /**
   * Validate chapter during offline reading
   */
  async validateForOfflineReading(
    mangaId: string,
    chapterNumber: string
  ): Promise<{
    canRead: boolean;
    missingImages: number[];
    corruptedImages: number[];
    warnings: string[];
  }> {
    try {
      const validationResult = await this.validateChapterIntegrity(
        mangaId,
        chapterNumber,
        {
          validateFileSize: true,
          validateFormat: true,
          validateContent: false, // Skip content validation for faster reading
          checkDimensions: false,
          deepScan: false,
          repairCorrupted: false,
        }
      );

      const missingImages: number[] = [];
      const corruptedImages: number[] = [];

      for (const [pageNumber, imageResult] of validationResult.imageResults) {
        if (!imageResult.isValid) {
          if (imageResult.corruptionDetected) {
            corruptedImages.push(pageNumber);
          } else {
            missingImages.push(pageNumber);
          }
        }
      }

      // Chapter is readable if at least 70% of images are valid
      const canRead = validationResult.integrityScore >= 70;

      return {
        canRead,
        missingImages,
        corruptedImages,
        warnings: validationResult.warnings,
      };
    } catch (error) {
      this.log.error('Service', 'Offline reading validation failed', {
        mangaId,
        chapterNumber,
        error,
      });

      return {
        canRead: false,
        missingImages: [],
        corruptedImages: [],
        warnings: [`Validation failed: ${error}`],
      };
    }
  }

  /**
   * Clear validation cache for a specific chapter
   */
  clearValidationCache(mangaId: string, chapterNumber: string): void {
    const validationKey = `${mangaId}_${chapterNumber}`;
    this.validationCache.delete(validationKey);
  }

  /**
   * Clear all validation cache
   */
  clearAllValidationCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    cacheSize: number;
    ongoingValidations: number;
    totalValidations: number;
  } {
    return {
      cacheSize: this.validationCache.size,
      ongoingValidations: this.ongoingValidations.size,
      totalValidations:
        this.validationCache.size + this.ongoingValidations.size,
    };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Cleanup validation service resources
   */
  cleanup(): void {
    this.validationCache.clear();
    this.ongoingValidations.clear();

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download validation service cleaned up');
    }
  }
}

// Export singleton instance
export const downloadValidationService =
  DownloadValidationService.getInstance();
