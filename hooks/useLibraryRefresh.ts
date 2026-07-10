import { useEffect, useRef } from 'react';
import { useAtomValue } from '@zedux/react';
import { libraryRefreshAtom } from '@/atoms/libraryRefreshAtom';

export function useLibraryRefresh(onRefresh: () => void | Promise<void>) {
  const { version } = useAtomValue(libraryRefreshAtom);
  const isFirstRenderRef = useRef(true);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    void onRefreshRef.current();
  }, [version]);
}
