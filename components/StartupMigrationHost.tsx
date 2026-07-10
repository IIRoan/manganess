import React from 'react';
import { useStartupMigration } from '@/hooks/useStartupMigration';
import { StartupMigrationOverlay } from '@/components/StartupMigrationOverlay';

export const StartupMigrationHost: React.FC = () => {
  const { progress, isVisible } = useStartupMigration();

  return <StartupMigrationOverlay progress={progress} visible={isVisible} />;
};
