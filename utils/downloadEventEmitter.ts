// Simple event emitter for download status updates
export interface DownloadStatusEvent {
  type:
    | 'download_started'
    | 'download_progress'
    | 'download_completed'
    | 'download_failed'
    | 'download_paused'
    | 'download_resumed'
    | 'download_deleted';
  mangaId: string;
  chapterNumber: string;
  downloadId: string;
  progress?: number;
  estimatedTimeRemaining?: number;
  downloadSpeed?: number;
  error?: string;
}

type EventCallback = (event: DownloadStatusEvent) => void;

class DownloadEventEmitter {
  private listeners: Map<string, EventCallback[]> = new Map();
  private globalListeners: EventCallback[] = [];

  // Subscribe to global events (all chapters)
  subscribeGlobal(callback: EventCallback): () => void {
    this.globalListeners.push(callback);

    // Return unsubscribe function
    return () => {
      const currentIndex = this.globalListeners.indexOf(callback);
      if (currentIndex > -1) {
        this.globalListeners.splice(currentIndex, 1);
      }
    };
  }

  // Subscribe to events for a specific chapter
  subscribe(
    mangaId: string,
    chapterNumber: string,
    callback: EventCallback
  ): () => void {
    const key = `${mangaId}_${chapterNumber}`;

    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }

    const callbacks = this.listeners.get(key)!;
    callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const currentIndex = callbacks.indexOf(callback);
      if (currentIndex > -1) {
        callbacks.splice(currentIndex, 1);
      }

      if (callbacks.length === 0) {
        this.listeners.delete(key);
      }
    };
  }

  // Emit an event
  emit(event: DownloadStatusEvent): void {
    const key = `${event.mangaId}_${event.chapterNumber}`;
    const callbacks = this.listeners.get(key);

    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in download event callback:', error);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in global download event callback:', error);
      }
    });
  }

  // Emit progress event
  emitProgress(
    mangaId: string,
    chapterNumber: string,
    downloadId: string,
    progress: number,
    estimatedTimeRemaining?: number,
    downloadSpeed?: number
  ): void {
    const event: DownloadStatusEvent = {
      type: 'download_progress',
      mangaId,
      chapterNumber,
      downloadId,
      progress,
    };

    if (estimatedTimeRemaining !== undefined) {
      event.estimatedTimeRemaining = estimatedTimeRemaining;
    }

    if (downloadSpeed !== undefined) {
      event.downloadSpeed = downloadSpeed;
    }

    this.emit(event);
  }

  // Emit started event
  emitStarted(
    mangaId: string,
    chapterNumber: string,
    downloadId: string
  ): void {
    this.emit({
      type: 'download_started',
      mangaId,
      chapterNumber,
      downloadId,
    });
  }

  // Emit completed event
  emitCompleted(
    mangaId: string,
    chapterNumber: string,
    downloadId: string
  ): void {
    this.emit({
      type: 'download_completed',
      mangaId,
      chapterNumber,
      downloadId,
      progress: 100,
    });
  }

  // Emit failed event
  emitFailed(
    mangaId: string,
    chapterNumber: string,
    downloadId: string,
    error: string
  ): void {
    this.emit({
      type: 'download_failed',
      mangaId,
      chapterNumber,
      downloadId,
      error,
    });
  }

  // Emit paused event
  emitPaused(
    mangaId: string,
    chapterNumber: string,
    downloadId: string,
    progress?: number
  ): void {
    const event: DownloadStatusEvent = {
      type: 'download_paused',
      mangaId,
      chapterNumber,
      downloadId,
    };

    if (progress !== undefined) {
      event.progress = progress;
    }

    this.emit(event);
  }

  // Emit resumed event
  emitResumed(
    mangaId: string,
    chapterNumber: string,
    downloadId: string,
    progress?: number,
    estimatedTimeRemaining?: number,
    downloadSpeed?: number
  ): void {
    const event: DownloadStatusEvent = {
      type: 'download_resumed',
      mangaId,
      chapterNumber,
      downloadId,
    };

    if (progress !== undefined) {
      event.progress = progress;
    }

    if (estimatedTimeRemaining !== undefined) {
      event.estimatedTimeRemaining = estimatedTimeRemaining;
    }

    if (downloadSpeed !== undefined) {
      event.downloadSpeed = downloadSpeed;
    }

    this.emit(event);
  }

  // Emit deleted event
  emitDeleted(
    mangaId: string,
    chapterNumber: string,
    downloadId: string
  ): void {
    this.emit({
      type: 'download_deleted',
      mangaId,
      chapterNumber,
      downloadId,
    });
  }

  // Clear all listeners
  clear(): void {
    this.listeners.clear();
  }
}

// Export singleton instance
export const downloadEventEmitter = new DownloadEventEmitter();
