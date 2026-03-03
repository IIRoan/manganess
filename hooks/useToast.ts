import { useAtomValue, useAtomInstance } from '@zedux/react';
import { toastAtom } from '@/atoms/toastAtom';
import { ToastConfig } from '@/types/atoms';

export const useToast = () => {
  const instance = useAtomInstance(toastAtom);
  const state = useAtomValue(toastAtom);

  const showToast = (config: ToastConfig) => {
    if (instance.exports?.showToast) {
      instance.exports.showToast(config);
    }
  };

  return {
    showToast,
    isVisible: state.isVisible,
    config: state.config,
  };
};
