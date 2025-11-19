import { downloadManagerService } from './downloadManager';
import { chapterStorageService } from './chapterStorageService';
import { downloadQueueService } from './downloadQueue';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import type { Chapter } from '@/types';
import { sortChaptersByNumber } from '@/utils/chapterOrdering';
import { DownloadStatus } from '@/types/download';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';

type BatchStatus =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface BatchChapter {
  number: string;
  title?: string;
  url: string;
}

export interface BatchFailure {
  chapter: BatchChapter;
  error: string;
}

export interface BatchDownloadState {
  status: BatchStatus;
  totalChapters: number;
  processedChapters: number;
  completedChapters: number;
  failedChapters: BatchFailure[];
  currentChapter: BatchChapter | null; // Kept for compat, but mostly unused
  progress: number;
  message: string | null;
  startedAt: number | null;
  lastUpdatedAt: number | null;
  isCancelling: boolean;
}

export interface UseBatchDownloadOptions {
  maxRetries?: number;
  throttleDelayMs?: number;
  onChapterDownloaded?: (chapter: BatchChapter) => void;
  onBatchFinished?: (payload: {
    status: BatchStatus;
    failedChapters: BatchFailure[];
  }) => void;
}

const DEFAULT_OPTIONS: Required<
  Pick<UseBatchDownloadOptions, 'maxRetries' | 'throttleDelayMs'>
> = {
  maxRetries: 2,
  throttleDelayMs: 800,
};

interface Session {
  mangaId: string;
  mangaTitle: string;
  chapters: Chapter[];
  options: Required<Pick<UseBatchDownloadOptions, 'maxRetries' | 'throttleDelayMs'>> &
    UseBatchDownloadOptions;
  state: BatchDownloadState;
  listeners: Set<(state: BatchDownloadState) => void>;
}

class BatchDownloadOrchestrator {
  private static instance: BatchDownloadOrchestrator;
  private sessions = new Map<string, Session>();
  private log = logger();

  private constructor() {
    // Listen to global download events to update session states
    this.setupGlobalListeners();
  }

  static getInstance(): BatchDownloadOrchestrator {
    if (!BatchDownloadOrchestrator.instance) {
      BatchDownloadOrchestrator.instance = new BatchDownloadOrchestrator();
    }
    return BatchDownloadOrchestrator.instance;
  }

  private setupGlobalListeners() {
      downloadEventEmitter.subscribeGlobal((event) => {
          // Find if we have a session for this manga
          const session = this.sessions.get(event.mangaId);
          if (!session) return;

          if (session.state.status !== 'downloading' && session.state.status !== 'preparing') {
              // If we aren't actively tracking a batch, ignore (or maybe we should auto-start tracking?)
              return;
          }

          switch (event.type) {
              case 'download_completed':
                  this.handleChapterSuccess(session, event.chapterNumber);
                  break;
              case 'download_failed':
                  this.handleChapterFailure(session, event.chapterNumber, event.error || 'Unknown error');
                  break;
              case 'download_progress':
                  // Optional: Update progress message?
                  break;
          }
      });
  }

  private getDefaultState(): BatchDownloadState {
    return {
      status: 'idle',
      totalChapters: 0,
      processedChapters: 0,
      completedChapters: 0,
      failedChapters: [],
      currentChapter: null,
      progress: 0,
      message: null,
      startedAt: null,
      lastUpdatedAt: null,
      isCancelling: false,
    };
  }

  private ensureSession(mangaId: string): Session {
    let session = this.sessions.get(mangaId);
    if (!session) {
      session = {
        mangaId,
        mangaTitle: '',
        chapters: [],
        options: { ...DEFAULT_OPTIONS },
        state: this.getDefaultState(),
        listeners: new Set(),
      };
      this.sessions.set(mangaId, session);
    }
    return session;
  }

  getState(mangaId: string): BatchDownloadState {
    return this.ensureSession(mangaId).state;
  }

  subscribeState(
    mangaId: string,
    listener: (state: BatchDownloadState) => void
  ): () => void {
    const session = this.ensureSession(mangaId);
    session.listeners.add(listener);
    listener(session.state);
    return () => {
      session.listeners.delete(listener);
    };
  }

  updateSessionMetadata(
    mangaId: string,
    mangaTitle: string,
    chapters: Chapter[],
    options?: UseBatchDownloadOptions
  ) {
    const session = this.ensureSession(mangaId);
    session.mangaTitle = mangaTitle;
    session.chapters = chapters;
    session.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  async startBatchDownload(mangaId: string, selected?: Chapter[]): Promise<void> {
    const session = this.ensureSession(mangaId);
    const source = selected?.length ? selected : session.chapters;

    if (!source || source.length === 0) {
      this.finalize(session, 'completed', 'No chapters available to download');
      return;
    }

    this.updateState(session, {
      status: 'preparing',
      totalChapters: 0,
      processedChapters: 0,
      completedChapters: 0,
      failedChapters: [],
      progress: 0,
      message: 'Preparing chapters for download...',
      startedAt: Date.now(),
      isCancelling: false,
    });

    try {
      const sorted = sortChaptersByNumber(source);

      // Add all to queue
      const pending: Chapter[] = [];
      
      for (const chapter of sorted) {
          const isDownloaded = await chapterStorageService.isChapterDownloaded(mangaId, chapter.number);
          if (!isDownloaded) {
              pending.push(chapter);
          }
      }

      if (pending.length === 0) {
        this.finalize(session, 'completed', 'All chapters already downloaded');
        return;
      }

      // Add to Queue Service
      for (const chapter of pending) {
        await downloadQueueService.addToQueue({
          id: `${mangaId}_${chapter.number}`,
          mangaId,
          mangaTitle: session.mangaTitle,
          chapterNumber: chapter.number,
          chapterUrl: chapter.url,
          priority: 1,
          addedAt: Date.now(),
        });
      }

      this.updateState(session, {
        status: 'downloading',
        totalChapters: pending.length,
        processedChapters: 0,
        message: `Downloading ${pending.length} chapters`,
      });

    } catch (error) {
      this.finalize(
        session,
        'error',
        error instanceof Error ? error.message : 'Failed to prepare downloads'
      );
    }
  }

  cancelBatchDownload(mangaId: string) {
    const session = this.ensureSession(mangaId);
    session.listeners.forEach(l => l({ ...session.state, isCancelling: true, message: 'Cancelling...' }));
    
    // Remove items from queue
    // We don't know exactly which ones were in *this* batch vs others, but 
    // usually we cancel all for this manga.
    // This is a simplification.
    downloadQueueService.getQueuedItems().then(items => {
        items.filter(i => i.mangaId === mangaId).forEach(i => {
            downloadQueueService.removeFromQueue(i.mangaId, i.chapterNumber);
        });
    });

    this.finalize(session, 'cancelled', 'Batch download cancelled');
  }

  retryFailedChapters(mangaId: string) {
     // Re-add failed chapters to queue
     const session = this.ensureSession(mangaId);
     const failed = session.state.failedChapters;
     
     if (failed.length === 0) return;
     
     this.updateState(session, {
         status: 'downloading',
         failedChapters: [], // Clear failed
         message: 'Retrying...'
     });

     failed.forEach(f => {
         downloadQueueService.addToQueue({
            id: `${mangaId}_${f.chapter.number}`,
            mangaId,
            mangaTitle: session.mangaTitle,
            chapterNumber: f.chapter.number,
            chapterUrl: f.chapter.url,
            priority: 1,
            addedAt: Date.now()
         });
     });
  }

  // --- Event Handlers ---

  private handleChapterSuccess(session: Session, chapterNumber: string) {
      // Check if this chapter was part of our "batch" scope?
      // For simplicity, if we are in 'downloading' mode for this manga, we count it.
      
      const newProcessed = session.state.processedChapters + 1;
      const newCompleted = session.state.completedChapters + 1;
      const progress = Math.round((newProcessed / Math.max(session.state.totalChapters, 1)) * 100);

      this.updateState(session, {
          processedChapters: newProcessed,
          completedChapters: newCompleted,
          progress,
          message: `Downloaded chapter ${chapterNumber}`
      });

      if (newProcessed >= session.state.totalChapters) {
          this.finalize(session, 'completed', 'All chapters downloaded');
      }
  }

  private handleChapterFailure(session: Session, chapterNumber: string, error: string) {
      const newProcessed = session.state.processedChapters + 1;
      const progress = Math.round((newProcessed / Math.max(session.state.totalChapters, 1)) * 100);

      // Find url from chapters list if possible
      const chapter = session.chapters.find(c => c.number === chapterNumber);
      const batchChapter: BatchChapter = {
          number: chapterNumber,
          url: chapter?.url || '',
          ...(chapter?.title ? { title: chapter.title } : {})
      };

      const newFailed = [...session.state.failedChapters, { chapter: batchChapter, error }];

      this.updateState(session, {
          processedChapters: newProcessed,
          failedChapters: newFailed,
          progress,
          message: `Failed chapter ${chapterNumber}`
      });

      if (newProcessed >= session.state.totalChapters) {
          this.finalize(session, newFailed.length > 0 ? 'error' : 'completed', 'Batch finished');
      }
  }

  private finalize(session: Session, status: BatchStatus, message?: string) {
    this.updateState(session, {
      status,
      isCancelling: false,
      message: message ?? null,
      progress: 100, // Ensure we show full bar
    });

    if (session.options.onBatchFinished) {
        // Call callback (if needed)
    }
  }

  private updateState(
    session: Session,
    partial: Partial<BatchDownloadState>
  ) {
    session.state = {
      ...session.state,
      ...partial,
      lastUpdatedAt: Date.now(),
    };

    session.listeners.forEach((listener) => {
      try {
        listener(session.state);
      } catch (error) {
        this.log.error('Service', 'Batch download state listener error', {
          mangaId: session.mangaId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}

export const batchDownloadOrchestrator = BatchDownloadOrchestrator.getInstance();
