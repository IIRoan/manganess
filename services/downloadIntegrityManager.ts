// import { DownloadItem, DownloadStatus } from '@/types/download'; // Reserved for future use
import { chapterStorageService } from './chapterStorageService';
import {
  downloadValidationService,
  ChapterValidationResult,
} from './downloadValidationService';
// import { downloadErrorHandler } from './downloadErrorHandler'; // Reserved for future use
import { downloadNotificationService } from './downloadNotificationService';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

// Integrity management configuration
const VALIDATION_SCHEDULE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const CORRUPTION_REPAIR_THRESHOLD = 70; // Repair if integrity score < 70%
// const AUTO_REPAIR_MAX_ATTEMPTS = 2; // Reserved for future use
const BATCH_VALIDATION_SIZE = 5; // Validate 5 chapters at a time

export interface IntegrityReport {
  totalChapters: number;
  validChapters: number;
  corruptedChapters: number;
  repairedChapters: number;
  failedRepairs: number;
  averageIntegrityScore: number;
  recommendations: string[];
  detailedResults: Map<string, ChapterValidationResult>;
}

export interface AutoRepairResult {
  success: boolean;
  repairedChapters: number;
  failedRepairs: number;
  errors: string[];
  recommendations: string[];
}

class DownloadIntegrityManager {
  private static instance: DownloadIntegrityManager;
  private log = logger();
  private validationScheduler: NodeJS.Timeout | null = null;
  private ongoingValidations: Set<string> = new Set();
  private lastFullValidation: number = 0;

  private constructor() {}

  static getInstance(): DownloadIntegrityManager {
    if (!DownloadIntegrityManager.instance) {
      DownloadIntegrityManager.instance = new DownloadIntegrityManager();
    }
    return DownloadIntegrityManager.instance;
  }

  /**
   * Initialize integrity manager with scheduled validation
   */
  async initialize(): Promise<void> {
    try {
      // Load last validation timestamp
      this.lastFullValidation = await this.getLastValidationTimestamp();

      // Schedule periodic validation
      this.schedulePeriodicValidation();

      // Perform initial validation if it's been too long
      const timeSinceLastValidation = Date.now() - this.lastFullValidation;
      if (timeSinceLastValidation > VALIDATION_SCHEDULE_INTERVAL) {
        // Run validation in background
        this.performBackgroundValidation();
      }

      if (isDebugEnabled()) {
        this.log.info('Service', 'Download integrity manager initialized', {
          lastValidation: new Date(this.lastFullValidation).toISOString(),
          nextValidation: new Date(
            Date.now() + VALIDATION_SCHEDULE_INTERVAL
          ).toISOString(),
        });
      }
    } catch (error) {
      this.log.error('Service', 'Failed to initialize integrity manager', {
        error,
      });
    }
  }

  /**
   * Validate all downloaded chapters and generate integrity report
   */
  async validateAllDownloads(): Promise<IntegrityReport> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting full download validation');
    }

    const report: IntegrityReport = {
      totalChapters: 0,
      validChapters: 0,
      corruptedChapters: 0,
      repairedChapters: 0,
      failedRepairs: 0,
      averageIntegrityScore: 0,
      recommendations: [],
      detailedResults: new Map(),
    };

    try {
      // Get all downloaded chapters
      const storageStats = await chapterStorageService.getStorageStats();
      if (storageStats.totalChapters === 0) {
        return report;
      }

      // Get detailed storage stats to iterate through chapters
      const detailedStats =
        await chapterStorageService.getDetailedStorageStats();
      const allChapters: Array<{ mangaId: string; chapterNumber: string }> = [];

      // Collect all chapter identifiers
      for (const [mangaId, _mangaInfo] of Object.entries(
        detailedStats.storageBreakdown
      )) {
        const downloadedChapters =
          await chapterStorageService.getDownloadedChapters(mangaId);
        for (const chapterNumber of downloadedChapters) {
          allChapters.push({ mangaId, chapterNumber });
        }
      }

      report.totalChapters = allChapters.length;

      // Validate chapters in batches to avoid overwhelming the system
      let totalIntegrityScore = 0;

      for (let i = 0; i < allChapters.length; i += BATCH_VALIDATION_SIZE) {
        const batch = allChapters.slice(i, i + BATCH_VALIDATION_SIZE);

        const batchPromises = batch.map(async ({ mangaId, chapterNumber }) => {
          const chapterKey = `${mangaId}_${chapterNumber}`;

          if (this.ongoingValidations.has(chapterKey)) {
            return null; // Skip if already validating
          }

          this.ongoingValidations.add(chapterKey);

          try {
            const validationResult =
              await downloadValidationService.validateChapterIntegrity(
                mangaId,
                chapterNumber,
                {
                  validateFileSize: true,
                  validateFormat: true,
                  validateContent: true,
                  checkDimensions: false,
                  deepScan: false,
                  repairCorrupted: false,
                }
              );

            report.detailedResults.set(chapterKey, validationResult);
            totalIntegrityScore += validationResult.integrityScore;

            if (validationResult.isValid) {
              report.validChapters++;
            } else {
              report.corruptedChapters++;
            }

            return { mangaId, chapterNumber, validationResult };
          } catch (error) {
            this.log.error('Service', 'Chapter validation failed', {
              mangaId,
              chapterNumber,
              error,
            });
            return null;
          } finally {
            this.ongoingValidations.delete(chapterKey);
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);

        // Small delay between batches to avoid overwhelming the system
        if (i + BATCH_VALIDATION_SIZE < allChapters.length) {
          await this.delay(1000);
        }
      }

      // Calculate average integrity score
      report.averageIntegrityScore =
        report.totalChapters > 0
          ? Math.round(totalIntegrityScore / report.totalChapters)
          : 100;

      // Generate recommendations
      report.recommendations = this.generateRecommendations(report);

      // Update last validation timestamp
      this.lastFullValidation = Date.now();
      await this.saveLastValidationTimestamp(this.lastFullValidation);

      if (isDebugEnabled()) {
        this.log.info('Service', 'Full validation completed', {
          totalChapters: report.totalChapters,
          validChapters: report.validChapters,
          corruptedChapters: report.corruptedChapters,
          averageIntegrityScore: report.averageIntegrityScore,
        });
      }

      return report;
    } catch (error) {
      this.log.error('Service', 'Full validation failed', { error });
      report.recommendations.push(
        'Validation failed. Try again later or check system resources.'
      );
      return report;
    }
  }

  /**
   * Automatically repair corrupted downloads
   */
  async autoRepairCorruptedDownloads(): Promise<AutoRepairResult> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting auto-repair of corrupted downloads');
    }

    const result: AutoRepairResult = {
      success: true,
      repairedChapters: 0,
      failedRepairs: 0,
      errors: [],
      recommendations: [],
    };

    try {
      // First, validate all downloads to identify corrupted ones
      const integrityReport = await this.validateAllDownloads();

      if (integrityReport.corruptedChapters === 0) {
        result.recommendations.push(
          'No corrupted downloads found. All chapters are in good condition.'
        );
        return result;
      }

      // Find chapters that need repair
      const chaptersToRepair: Array<{
        mangaId: string;
        chapterNumber: string;
        validationResult: ChapterValidationResult;
      }> = [];

      for (const [
        chapterKey,
        validationResult,
      ] of integrityReport.detailedResults) {
        if (
          !validationResult.isValid &&
          validationResult.integrityScore < CORRUPTION_REPAIR_THRESHOLD &&
          validationResult.recommendedAction !== 'manual_check'
        ) {
          const parts = chapterKey.split('_');
          const mangaId = parts[0] || '';
          const chapterNumber = parts[1] || '';
          chaptersToRepair.push({ mangaId, chapterNumber, validationResult });
        }
      }

      if (chaptersToRepair.length === 0) {
        result.recommendations.push(
          'Corrupted chapters found, but they require manual intervention.'
        );
        return result;
      }

      // Repair chapters one by one
      for (const {
        mangaId,
        chapterNumber,
        validationResult,
      } of chaptersToRepair) {
        try {
          const repairResult =
            await downloadValidationService.repairCorruptedChapter(
              mangaId,
              chapterNumber,
              validationResult
            );

          if (repairResult.success) {
            result.repairedChapters++;

            if (isDebugEnabled()) {
              this.log.info('Service', 'Chapter repaired successfully', {
                mangaId,
                chapterNumber,
                repairedImages: repairResult.repairedImages,
              });
            }
          } else {
            result.failedRepairs++;
            result.errors.push(
              `Failed to repair ${mangaId}/${chapterNumber}: ${repairResult.errors.join(', ')}`
            );
          }
        } catch (error) {
          result.failedRepairs++;
          result.errors.push(
            `Repair error for ${mangaId}/${chapterNumber}: ${error}`
          );

          this.log.error('Service', 'Chapter repair failed', {
            mangaId,
            chapterNumber,
            error,
          });
        }

        // Small delay between repairs
        await this.delay(2000);
      }

      // Generate final recommendations
      if (result.repairedChapters > 0) {
        result.recommendations.push(
          `Successfully repaired ${result.repairedChapters} chapters.`
        );
      }

      if (result.failedRepairs > 0) {
        result.recommendations.push(
          `${result.failedRepairs} chapters could not be repaired automatically. Manual intervention may be required.`
        );
      }

      result.success = result.failedRepairs === 0;

      if (isDebugEnabled()) {
        this.log.info('Service', 'Auto-repair completed', {
          repairedChapters: result.repairedChapters,
          failedRepairs: result.failedRepairs,
          success: result.success,
        });
      }

      return result;
    } catch (error) {
      this.log.error('Service', 'Auto-repair failed', { error });

      result.success = false;
      result.errors.push(`Auto-repair failed: ${error}`);
      result.recommendations.push(
        'Auto-repair encountered an error. Try manual repair or contact support.'
      );

      return result;
    }
  }

  /**
   * Validate a specific chapter and repair if needed
   */
  async validateAndRepairChapter(
    mangaId: string,
    chapterNumber: string,
    forceRepair: boolean = false
  ): Promise<{
    validationResult: ChapterValidationResult;
    repairAttempted: boolean;
    repairSuccess: boolean;
    errors: string[];
  }> {
    const chapterKey = `${mangaId}_${chapterNumber}`;

    if (this.ongoingValidations.has(chapterKey)) {
      throw new Error('Chapter validation already in progress');
    }

    this.ongoingValidations.add(chapterKey);

    try {
      // Validate chapter integrity
      const validationResult =
        await downloadValidationService.validateChapterIntegrity(
          mangaId,
          chapterNumber,
          {
            validateFileSize: true,
            validateFormat: true,
            validateContent: true,
            checkDimensions: true,
            deepScan: true,
            repairCorrupted: false,
          }
        );

      let repairAttempted = false;
      let repairSuccess = false;
      const errors: string[] = [];

      // Determine if repair is needed
      const needsRepair =
        forceRepair ||
        (!validationResult.isValid &&
          validationResult.recommendedAction !== 'manual_check');

      if (needsRepair) {
        repairAttempted = true;

        try {
          const repairResult =
            await downloadValidationService.repairCorruptedChapter(
              mangaId,
              chapterNumber,
              validationResult
            );

          repairSuccess = repairResult.success;
          if (!repairSuccess) {
            errors.push(...repairResult.errors);
          }
        } catch (repairError) {
          errors.push(`Repair failed: ${repairError}`);
        }
      }

      return {
        validationResult,
        repairAttempted,
        repairSuccess,
        errors,
      };
    } finally {
      this.ongoingValidations.delete(chapterKey);
    }
  }

  /**
   * Check integrity before offline reading
   */
  async validateForOfflineReading(
    mangaId: string,
    chapterNumber: string
  ): Promise<{
    canRead: boolean;
    integrityScore: number;
    missingImages: number[];
    corruptedImages: number[];
    warnings: string[];
    autoRepairSuggested: boolean;
  }> {
    try {
      const validationResult =
        await downloadValidationService.validateForOfflineReading(
          mangaId,
          chapterNumber
        );

      // Get detailed integrity information
      const fullValidation =
        await downloadValidationService.validateChapterIntegrity(
          mangaId,
          chapterNumber,
          {
            validateFileSize: true,
            validateFormat: true,
            validateContent: false, // Skip for faster reading
            checkDimensions: false,
            deepScan: false,
            repairCorrupted: false,
          }
        );

      return {
        canRead: validationResult.canRead,
        integrityScore: fullValidation.integrityScore,
        missingImages: validationResult.missingImages,
        corruptedImages: validationResult.corruptedImages,
        warnings: validationResult.warnings,
        autoRepairSuggested:
          !fullValidation.isValid &&
          fullValidation.recommendedAction === 'redownload_corrupted',
      };
    } catch (error) {
      this.log.error('Service', 'Offline reading validation failed', {
        mangaId,
        chapterNumber,
        error,
      });

      return {
        canRead: false,
        integrityScore: 0,
        missingImages: [],
        corruptedImages: [],
        warnings: [`Validation failed: ${error}`],
        autoRepairSuggested: false,
      };
    }
  }

  /**
   * Schedule periodic validation
   */
  private schedulePeriodicValidation(): void {
    if (this.validationScheduler) {
      clearInterval(this.validationScheduler);
    }

    this.validationScheduler = setInterval(() => {
      this.performBackgroundValidation();
    }, VALIDATION_SCHEDULE_INTERVAL) as any;
  }

  /**
   * Perform background validation without blocking
   */
  private async performBackgroundValidation(): Promise<void> {
    try {
      if (isDebugEnabled()) {
        this.log.info('Service', 'Starting background validation');
      }

      // Run validation in background
      const report = await this.validateAllDownloads();

      // If significant corruption is found, notify user
      if (report.corruptedChapters > 0 && report.averageIntegrityScore < 80) {
        await downloadNotificationService.showStorageWarning(
          report.corruptedChapters,
          report.totalChapters,
          80
        );
      }

      // Auto-repair if corruption is manageable
      if (report.corruptedChapters > 0 && report.corruptedChapters <= 5) {
        await this.autoRepairCorruptedDownloads();
      }
    } catch (error) {
      this.log.error('Service', 'Background validation failed', { error });
    }
  }

  /**
   * Generate recommendations based on integrity report
   */
  private generateRecommendations(report: IntegrityReport): string[] {
    const recommendations: string[] = [];

    if (report.totalChapters === 0) {
      recommendations.push('No downloaded chapters found.');
      return recommendations;
    }

    if (report.averageIntegrityScore >= 95) {
      recommendations.push('All downloads are in excellent condition.');
    } else if (report.averageIntegrityScore >= 80) {
      recommendations.push('Most downloads are in good condition.');
    } else if (report.averageIntegrityScore >= 60) {
      recommendations.push(
        'Some downloads may have issues. Consider running auto-repair.'
      );
    } else {
      recommendations.push(
        'Significant corruption detected. Manual intervention recommended.'
      );
    }

    if (report.corruptedChapters > 0) {
      const corruptionPercent = Math.round(
        (report.corruptedChapters / report.totalChapters) * 100
      );
      recommendations.push(
        `${report.corruptedChapters} chapters (${corruptionPercent}%) have integrity issues.`
      );

      if (report.corruptedChapters <= 10) {
        recommendations.push(
          'Consider using auto-repair to fix corrupted chapters.'
        );
      } else {
        recommendations.push(
          'Large number of corrupted chapters detected. Check storage device health.'
        );
      }
    }

    return recommendations;
  }

  /**
   * Get last validation timestamp
   */
  private async getLastValidationTimestamp(): Promise<number> {
    try {
      // This would be stored in AsyncStorage in a real implementation
      return 0; // Default to never validated
    } catch {
      return 0;
    }
  }

  /**
   * Save last validation timestamp
   */
  private async saveLastValidationTimestamp(_timestamp: number): Promise<void> {
    try {
      // This would be stored in AsyncStorage in a real implementation
    } catch (error) {
      this.log.error('Service', 'Failed to save validation timestamp', {
        error,
      });
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get integrity statistics
   */
  async getIntegrityStats(): Promise<{
    lastValidation: number;
    ongoingValidations: number;
    nextScheduledValidation: number;
  }> {
    return {
      lastValidation: this.lastFullValidation,
      ongoingValidations: this.ongoingValidations.size,
      nextScheduledValidation:
        this.lastFullValidation + VALIDATION_SCHEDULE_INTERVAL,
    };
  }

  /**
   * Cleanup integrity manager resources
   */
  cleanup(): void {
    if (this.validationScheduler) {
      clearInterval(this.validationScheduler);
      this.validationScheduler = null;
    }

    this.ongoingValidations.clear();

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download integrity manager cleaned up');
    }
  }
}

// Export singleton instance
export const downloadIntegrityManager = DownloadIntegrityManager.getInstance();
