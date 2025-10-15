import React, { useState, useEffect, useCallback } from 'react';
import Toast from './Toast';
import { toastService, ToastConfig } from '@/services/toastService';

interface ToastState extends ToastConfig {
  visible: boolean;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: 'checkmark-circle',
    duration: 2500,
  });

  const handleShow = useCallback((config: ToastConfig) => {
    setToast({
      visible: true,
      message: config.message,
      icon: config.icon || 'checkmark-circle',
      duration: config.duration || 2500,
    });
  }, []);

  const handleHide = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    toastService.on('show', handleShow);
    toastService.on('hide', handleHide);

    return () => {
      toastService.off('show', handleShow);
      toastService.off('hide', handleHide);
    };
  }, [handleShow, handleHide]);

  return (
    <>
      {children}
      <Toast
        visible={toast.visible}
        message={toast.message}
        icon={toast.icon as any}
        duration={toast.duration}
        onHide={handleHide}
      />
    </>
  );
};
