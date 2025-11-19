import React, { useEffect, useState } from 'react';
import HiddenChapterWebView from '@/components/HiddenChapterWebView';
import {
  downloadQueueService,
  type ActiveWebViewRequest,
} from '@/services/downloadQueue';

const BatchDownloadHost: React.FC = () => {
  const [request, setRequest] = useState<ActiveWebViewRequest | null>(
    () => downloadQueueService.getActiveWebViewRequest()
  );

  useEffect(() => {
    return downloadQueueService.subscribeWebView(setRequest);
  }, []);

  if (!request) {
    return null;
  }

  return (
    <HiddenChapterWebView
      key={`batch-webview-${request.id}-${request.attempt}`}
      chapterUrl={request.url}
      onRequestIntercepted={(chapterId, vrfToken) => {
        downloadQueueService.handleWebViewIntercepted(
          chapterId,
          vrfToken
        );
      }}
      onError={(error) => {
        downloadQueueService.handleWebViewError(
          error
        );
      }}
      onTimeout={() => {
        downloadQueueService.handleWebViewError('Timeout waiting for interception');
      }}
      timeout={45000}
    />
  );
};

export default BatchDownloadHost;
