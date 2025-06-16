import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export enum HapticType {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
  Selection = 'selection',
}

class HapticFeedbackService {
  private static instance: HapticFeedbackService;
  private isEnabled: boolean = true;

  private constructor() {}

  static getInstance(): HapticFeedbackService {
    if (!HapticFeedbackService.instance) {
      HapticFeedbackService.instance = new HapticFeedbackService();
    }
    return HapticFeedbackService.instance;
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  async trigger(type: HapticType): Promise<void> {
    if (!this.isEnabled || Platform.OS === 'web') {
      return;
    }

    try {
      switch (type) {
        case HapticType.Light:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case HapticType.Medium:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case HapticType.Heavy:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case HapticType.Success:
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case HapticType.Warning:
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        case HapticType.Error:
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case HapticType.Selection:
          await Haptics.selectionAsync();
          break;
        default:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  // Convenience methods for common interactions
  async onPress(): Promise<void> {
    return this.trigger(HapticType.Light);
  }

  async onLongPress(): Promise<void> {
    return this.trigger(HapticType.Medium);
  }

  async onSuccess(): Promise<void> {
    return this.trigger(HapticType.Success);
  }

  async onError(): Promise<void> {
    return this.trigger(HapticType.Error);
  }

  async onSelection(): Promise<void> {
    return this.trigger(HapticType.Selection);
  }

  async onSwipe(): Promise<void> {
    return this.trigger(HapticType.Light);
  }

  async onBookmark(): Promise<void> {
    return this.trigger(HapticType.Medium);
  }

  async onChapterComplete(): Promise<void> {
    return this.trigger(HapticType.Success);
  }
}

export const hapticFeedback = HapticFeedbackService.getInstance();

// React hook for haptic feedback
export function useHapticFeedback() {
  return {
    onPress: () => hapticFeedback.onPress(),
    onLongPress: () => hapticFeedback.onLongPress(),
    onSuccess: () => hapticFeedback.onSuccess(),
    onError: () => hapticFeedback.onError(),
    onSelection: () => hapticFeedback.onSelection(),
    onSwipe: () => hapticFeedback.onSwipe(),
    onBookmark: () => hapticFeedback.onBookmark(),
    onChapterComplete: () => hapticFeedback.onChapterComplete(),
    trigger: (type: HapticType) => hapticFeedback.trigger(type),
    setEnabled: (enabled: boolean) => hapticFeedback.setEnabled(enabled),
  };
}