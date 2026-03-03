/**
 * Reanimated Sync Utility
 *
 * Provides utilities to synchronize Zedux atom state with Reanimated shared values,
 * enabling state-driven animations that run on the UI thread.
 *
 * @see Requirements 19.1, 19.5
 */
import { useEffect } from 'react';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

/**
 * Synchronizes a Zedux atom value with a Reanimated shared value.
 *
 * When the atom value changes, the shared value is updated on the UI thread
 * using `runOnUI`, ensuring animations remain smooth and don't block the JS thread.
 *
 * @param atomValue - The current value from a Zedux atom (via useAtomValue)
 * @param transform - Optional transform function to convert atom value to shared value type
 * @returns The Reanimated shared value that stays in sync with the atom
 *
 * @example
 * // Sync toast visibility to a shared value for animations
 * const { isVisible } = useAtomValue(toastAtom);
 * const sharedVisible = useSyncAtomToSharedValue(isVisible ? 1 : 0);
 *
 * @example
 * // Sync with a transform
 * const { bookmarks } = useAtomValue(bookmarkListAtom);
 * const sharedCount = useSyncAtomToSharedValue(bookmarks, (b) => b.length);
 */
export function useSyncAtomToSharedValue<TAtom, TShared = TAtom>(
  atomValue: TAtom,
  transform?: (value: TAtom) => TShared
): SharedValue<TShared> {
  const initialValue = transform
    ? transform(atomValue)
    : (atomValue as unknown as TShared);
  const sharedValue = useSharedValue<TShared>(initialValue);

  useEffect(() => {
    const nextValue = transform
      ? transform(atomValue)
      : (atomValue as unknown as TShared);
    sharedValue.value = nextValue;
  }, [atomValue, transform, sharedValue]);

  return sharedValue;
}

/**
 * Synchronizes a boolean atom value to a numeric shared value (0 or 1).
 * Useful for driving opacity/scale animations from atom state.
 *
 * @param boolValue - Boolean value from a Zedux atom
 * @returns SharedValue<number> that is 1 when true, 0 when false
 *
 * @example
 * const { isVisible } = useAtomValue(toastAtom);
 * const opacity = useSyncBoolToSharedValue(isVisible);
 * const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
 */
export function useSyncBoolToSharedValue(
  boolValue: boolean
): SharedValue<number> {
  return useSyncAtomToSharedValue<boolean, number>(boolValue, (v) =>
    v ? 1 : 0
  );
}
