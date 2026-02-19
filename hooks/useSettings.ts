import { useAtomValue, useAtomInstance } from '@zedux/react';
import { settingsAtom } from '@/atoms/settingsAtom';
import { SettingsAtomState } from '@/types/atoms';

export const useSettings = () => {
  const instance = useAtomInstance(settingsAtom);
  const state = useAtomValue(settingsAtom);

  const updateSettings = (updates: Partial<SettingsAtomState>) => {
    if (instance.exports?.updateSettings) {
      instance.exports.updateSettings(updates);
    }
  };

  return {
    ...state,
    updateSettings,
  };
};

// Export standalone function for updating settings
export const updateSettings = (updates: Partial<SettingsAtomState>) => {
  // This will be used by components that have access to the atom instance
  return updates;
};
