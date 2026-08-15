import React, { useEffect } from 'react';
import { useAtomInstance, useAtomValue } from '@zedux/react';
import { appUpdateAtom } from '@/atoms/appUpdateAtom';
import { AppUpdatePrompt } from '@/components/AppUpdatePrompt';
import { areUpdatesAvailable } from '@/services/updateService';

export const AppUpdateHost: React.FC = () => {
  const state = useAtomValue(appUpdateAtom);
  const instance = useAtomInstance(appUpdateAtom);

  useEffect(() => {
    if (!areUpdatesAvailable()) {
      return;
    }

    instance.exports.startListening();

    return () => {
      instance.exports.stopListening();
    };
  }, [instance]);

  if (!areUpdatesAvailable()) {
    return null;
  }

  return (
    <AppUpdatePrompt
      visible={state.visible}
      phase={state.phase}
      error={state.error}
      isDownloaded={state.isDownloaded}
      onInstall={() => {
        void instance.exports.install();
      }}
      onRestart={() => {
        void instance.exports.restart();
      }}
      onLater={() => {
        instance.exports.dismiss();
      }}
    />
  );
};
