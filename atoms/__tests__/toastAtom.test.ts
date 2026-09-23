import { createEcosystem } from '@zedux/react';
import { toastAtom } from '@/atoms/toastAtom';

describe('toastAtom persistent toasts', () => {
  it('stays visible until hideToast is called', () => {
    jest.useFakeTimers();
    const ecosystem = createEcosystem({ id: 'toast-persistent-test' });
    const instance = ecosystem.getInstance(toastAtom);

    instance.exports.showToast({
      message: 'Having trouble reaching MangaFire…',
      persistent: true,
      type: 'warning',
    });

    expect(instance.getState().isVisible).toBe(true);
    expect(instance.getState().config?.message).toContain('MangaFire');

    jest.advanceTimersByTime(60_000);
    expect(instance.getState().isVisible).toBe(true);

    instance.exports.hideToast();
    expect(instance.getState().isVisible).toBe(false);

    jest.useRealTimers();
    ecosystem.reset();
  });

  it('still auto-hides non-persistent toasts', () => {
    jest.useFakeTimers();
    const ecosystem = createEcosystem({ id: 'toast-auto-hide-test' });
    const instance = ecosystem.getInstance(toastAtom);

    instance.exports.showToast({
      message: 'Saved',
      type: 'success',
      duration: 2500,
    });

    expect(instance.getState().isVisible).toBe(true);
    jest.advanceTimersByTime(2500);
    expect(instance.getState().isVisible).toBe(false);

    jest.useRealTimers();
    ecosystem.reset();
  });
});
