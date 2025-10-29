import React, { useEffect, useState } from 'react';
import HiddenChapterWebView from '@/components/HiddenChapterWebView';
import {
  batchDownloadOrchestrator,
  type ActiveWebViewRequest,
} from '@/services/batchDownloadOrchestrator';

const BatchDownloadHost: React.FC = () => {
  const [request, setRequest] = useState<ActiveWebViewRequest | null>(
    () => batchDownloadOrchestrator.getActiveWebViewRequest()
  );

  useEffect(() => {
    return batchDownloadOrchestrator.subscribeWebView(setRequest);
  }, []);

  if (!request) {
    return null;
  }

  return (
    <HiddenChapterWebView
      key={`batch-webview-${request.sessionId}-${request.key}`}
      chapterUrl={request.url}
      onRequestIntercepted={(chapterId, vrfToken) => {
        batchDownloadOrchestrator.handleWebViewIntercepted(
          request.sessionId,
          chapterId,
          vrfToken
        );
      }}
      onError={(error) => {
        batchDownloadOrchestrator.handleWebViewError(
          request.sessionId,
          error
        );
      }}
      onTimeout={() => {
        batchDownloadOrchestrator.handleWebViewTimeout(request.sessionId);
      }}
      timeout={25000}
    />
  );
};

export default BatchDownloadHost;
