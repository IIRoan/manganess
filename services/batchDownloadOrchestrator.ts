import { downloadManagerService } from './downloadManager';
import { chapterStorageService } from './chapterStorageService';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import type { Chapter } from '@/types';
import { sortChaptersByNumber } from '@/utils/chapterOrdering';

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
  currentChapter: BatchChapter | null;
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

const delay = (ms: number) =>
  new Promise((resolve) => {
    const handle = setTimeout(() => {
      clearTimeout(handle);
      resolve(null);
    }, ms);
  });

interface Session {
  mangaId: string;
  mangaTitle: string;
  chapters: Chapter[];
  options: Required<Pick<UseBatchDownloadOptions, 'maxRetries' | 'throttleDelayMs'>> &
    UseBatchDownloadOptions;
  state: BatchDownloadState;
  queue: BatchChapter[];
  retries: Record<string, number>;
  cancelRequested: boolean;
  currentChapter: BatchChapter | null;
  webViewKey: number;
  listeners: Set<(state: BatchDownloadState) => void>;
  onChapterDownloaded?: (chapter: BatchChapter) => void;
  onBatchFinished?: (payload: {
    status: BatchStatus;
    failedChapters: BatchFailure[];
  }) => void;
}

interface ActiveWebViewRequest {
  sessionId: string;
  key: number;
  chapter: BatchChapter;
  url: string;
}

class BatchDownloadOrchestrator {
  private static instance: BatchDownloadOrchestrator;
  private sessions = new Map<string, Session>();
  private log = logger();
  private activeWebViewRequest: ActiveWebViewRequest | null = null;
  private webViewListeners = new Set<(request: ActiveWebViewRequest | null) => void>();

  static getInstance(): BatchDownloadOrchestrator {
    if (!BatchDownloadOrchestrator.instance) {
      BatchDownloadOrchestrator.instance = new BatchDownloadOrchestrator();
    }
    return BatchDownloadOrchestrator.instance;
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
        queue: [],
        retries: {},
        cancelRequested: false,
        currentChapter: null,
        webViewKey: 0,
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
    if (options?.onChapterDownloaded) {
      session.onChapterDownloaded = options.onChapterDownloaded;
    } else {
      delete session.onChapterDownloaded;
    }
    if (options?.onBatchFinished) {
      session.onBatchFinished = options.onBatchFinished;
    } else {
      delete session.onBatchFinished;
    }
  }

  subscribeWebView(
    listener: (request: ActiveWebViewRequest | null) => void
  ): () => void {
    this.webViewListeners.add(listener);
    listener(this.activeWebViewRequest);
    return () => {
      this.webViewListeners.delete(listener);
    };
  }

  getActiveWebViewRequest(): ActiveWebViewRequest | null {
    return this.activeWebViewRequest;
  }

  async startBatchDownload(mangaId: string, selected?: Chapter[]): Promise<void> {
    const session = this.ensureSession(mangaId);

    const source = selected?.length ? selected : session.chapters;

    if (!source || source.length === 0) {
      this.finalize(session, 'completed', 'No chapters available to download');
      return;
    }

    if (session.state.status === 'downloading' || session.state.isCancelling) {
      return;
    }

    session.cancelRequested = false;
    session.queue = [];
    session.retries = {};
    session.currentChapter = null;

    this.updateState(session, {
      status: 'preparing',
      totalChapters: 0,
      processedChapters: 0,
      completedChapters: 0,
      failedChapters: [],
      currentChapter: null,
      progress: 0,
      message: 'Preparing chapters for download...',
      startedAt: Date.now(),
      isCancelling: false,
    });

    try {
      const sorted = sortChaptersByNumber(source).map(this.toBatchChapter);

      const checks = await Promise.all(
        sorted.map(async (chapter) => {
          try {
            const already = await chapterStorageService.isChapterDownloaded(
              mangaId,
              chapter.number
            );
            return { chapter, already };
          } catch (error) {
            if (isDebugEnabled()) {
              this.log.error('Service', 'Storage check failed', {
                mangaId,
                chapter: chapter.number,
                error,
              });
            }
            return { chapter, already: false };
          }
        })
      );

      const pending = sortChaptersByNumber(
        checks.filter((item) => !item.already).map((item) => item.chapter)
      );

      if (pending.length === 0) {
        this.finalize(session, 'completed', 'All chapters already downloaded');
        return;
      }

      session.queue = pending;

      this.updateState(session, {
        status: 'downloading',
        totalChapters: pending.length,
        processedChapters: 0,
        completedChapters: 0,
        failedChapters: [],
        currentChapter: null,
        progress: 0,
        message: `Downloading ${pending.length} chapters`,
      });

      this.advanceQueue(session);
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
    if (session.state.status !== 'downloading') {
      return;
    }

    session.cancelRequested = true;
    session.queue = [];
    this.updateState(session, {
      isCancelling: true,
      message: 'Cancelling batch download...',
    });
  }

  retryFailedChapters(mangaId: string) {
    const session = this.ensureSession(mangaId);
    const failed = session.state.failedChapters;
    if (!failed.length) {
      return;
    }

    session.cancelRequested = false;
    session.queue = sortChaptersByNumber(failed.map((item) => item.chapter));
    session.currentChapter = null;
    session.retries = {};

    this.updateState(session, {
      status: 'downloading',
      failedChapters: [],
      processedChapters: Math.max(
        session.state.processedChapters - failed.length,
        0
      ),
      progress:
        session.state.totalChapters > 0
          ? Math.round(
              ((session.state.processedChapters - failed.length) /
                session.state.totalChapters) *
                100
            )
          : 0,
      message: 'Retrying failed chapters',
    });

    this.advanceQueue(session);
  }

  handleWebViewIntercepted(
    sessionId: string,
    chapterId: string,
    vrfToken: string
  ) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentChapter) {
      return;
    }

    this.setActiveWebViewRequest(null);

    const chapter = session.currentChapter;

    this.updateState(session, {
      message: `Downloading chapter ${chapter.number} (${session.state.completedChapters + 1}/${session.state.totalChapters})`,
    });

    downloadManagerService
      .downloadChapterFromInterceptedRequest(
        session.mangaId,
        chapter.number,
        chapterId,
        vrfToken,
        chapter.url,
        session.mangaTitle
      )
      .then((result) => {
        if (result.success) {
          this.handleDownloadSuccess(session);
        } else {
          this.handleDownloadFailure(
            session,
            chapter,
            result.error?.message || 'Download failed',
            Boolean(result.error?.retryable)
          );
        }
      })
      .catch((error) => {
        this.handleDownloadFailure(
          session,
          chapter,
          error instanceof Error ? error.message : 'Download failed',
          true
        );
      });
  }

  handleWebViewError(sessionId: string, errorMessage: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentChapter) {
      return;
    }
    this.setActiveWebViewRequest(null);
    this.handleDownloadFailure(
      session,
      session.currentChapter,
      errorMessage,
      true
    );
  }

  handleWebViewTimeout(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentChapter) {
      return;
    }
    this.setActiveWebViewRequest(null);
    this.handleDownloadFailure(
      session,
      session.currentChapter,
      'Timeout while loading chapter page',
      true
    );
  }

  private toBatchChapter(chapter: Chapter): BatchChapter {
    return {
      number: chapter.number,
      title: chapter.title,
      url: chapter.url,
    };
  }

  private advanceQueue(session: Session) {
    if (session.cancelRequested) {
      this.finalize(session, 'cancelled', 'Batch download cancelled');
      return;
    }

    if (session.queue.length === 0) {
      const hasFailures = session.state.failedChapters.length > 0;
      this.finalize(
        session,
        hasFailures ? 'error' : 'completed',
        hasFailures
          ? 'Some chapters failed to download'
          : 'All chapters downloaded'
      );
      return;
    }

    const nextChapter = session.queue.shift();
    if (!nextChapter) {
      this.finalize(session, 'completed', 'All chapters downloaded');
      return;
    }

    session.currentChapter = nextChapter;
    session.webViewKey += 1;

    this.setActiveWebViewRequest({
      sessionId: session.mangaId,
      key: session.webViewKey,
      chapter: nextChapter,
      url: nextChapter.url,
    });

    this.updateState(session, {
      status: 'downloading',
      currentChapter: nextChapter,
      message: `Preparing chapter ${nextChapter.number}`,
    });
  }

  private handleDownloadSuccess(session: Session) {
    const completedChapter = session.currentChapter;

    this.updateState(session, {
      completedChapters: session.state.completedChapters + 1,
      processedChapters: session.state.processedChapters + 1,
      currentChapter: null,
      progress:
        session.state.totalChapters > 0
          ? Math.round(
              ((session.state.processedChapters + 1) /
                session.state.totalChapters) *
                100
            )
          : 0,
      message: completedChapter
        ? `Downloaded chapter ${completedChapter.number}`
        : session.state.message,
    });

    session.currentChapter = null;

    if (completedChapter && session.onChapterDownloaded) {
      try {
        session.onChapterDownloaded(completedChapter);
      } catch (error) {
        console.error('Batch download onChapterDownloaded error:', error);
      }
    }

    delay(session.options.throttleDelayMs).then(() => {
      this.advanceQueue(session);
    });
  }

  private handleDownloadFailure(
    session: Session,
    chapter: BatchChapter,
    errorMessage: string,
    allowRetry: boolean
  ) {
    const attempts = (session.retries[chapter.number] ?? 0) + 1;
    session.retries[chapter.number] = attempts;

    const shouldRetry = allowRetry && attempts <= session.options.maxRetries;

    if (isDebugEnabled()) {
      this.log.warn('Service', 'Chapter download failed', {
        mangaId: session.mangaId,
        chapter: chapter.number,
        attempts,
        shouldRetry,
        errorMessage,
      });
    }

    if (shouldRetry) {
      session.queue.push(chapter);
      this.updateState(session, {
        currentChapter: null,
        message: `Retrying chapter ${chapter.number} (${attempts}/${session.options.maxRetries})`,
      });
      session.currentChapter = null;
      delay(session.options.throttleDelayMs).then(() => {
        this.advanceQueue(session);
      });
      return;
    }

    this.updateState(session, {
      failedChapters: [
        ...session.state.failedChapters,
        { chapter, error: errorMessage },
      ],
      processedChapters: session.state.processedChapters + 1,
      currentChapter: null,
      progress:
        session.state.totalChapters > 0
          ? Math.round(
              ((session.state.processedChapters + 1) /
                session.state.totalChapters) *
                100
            )
          : 0,
      message: `Failed to download chapter ${chapter.number}`,
    });

    session.currentChapter = null;

    delay(session.options.throttleDelayMs).then(() => {
      this.advanceQueue(session);
    });
  }

  private finalize(session: Session, status: BatchStatus, message?: string) {
    const snapshot = session.state;

    this.updateState(session, {
      status,
      currentChapter: null,
      isCancelling: false,
      message: message ?? null,
      progress:
        snapshot.totalChapters > 0
          ? Math.round(
              (snapshot.processedChapters / snapshot.totalChapters) * 100
            )
          : 100,
    });

    session.queue = [];
    session.currentChapter = null;
    session.cancelRequested = false;

    if (session.onBatchFinished) {
      try {
        session.onBatchFinished({
          status,
          failedChapters: snapshot.failedChapters,
        });
      } catch (error) {
        console.error('Batch download onBatchFinished error:', error);
      }
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
        console.error('Batch download state listener error:', error);
      }
    });
  }

  private setActiveWebViewRequest(request: ActiveWebViewRequest | null) {
    this.activeWebViewRequest = request;
    this.webViewListeners.forEach((listener) => {
      try {
        listener(request);
      } catch (error) {
        console.error('Batch download webview listener error:', error);
      }
    });
  }
}

export const batchDownloadOrchestrator = BatchDownloadOrchestrator.getInstance();

export type { ActiveWebViewRequest };
