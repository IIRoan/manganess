import React from 'react';
import { render } from '@testing-library/react-native';
import { StartupMigrationOverlay } from '../StartupMigrationOverlay';

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

describe('StartupMigrationOverlay', () => {
  it('renders nothing when hidden', () => {
    const { toJSON } = render(
      <StartupMigrationOverlay visible={false} progress={null} />
    );

    expect(toJSON()).toBeNull();
  });

  it('shows migration title and message while visible', () => {
    const { getByText } = render(
      <StartupMigrationOverlay
        visible
        progress={{
          phase: 'migrating_storage',
          title: 'Updating saved data',
          message:
            'MangaNess recently changed how bookmarks are stored. We are moving your library to the new format now.',
        }}
      />
    );

    expect(getByText('Updating saved data')).toBeTruthy();
    expect(
      getByText(
        'MangaNess recently changed how bookmarks are stored. We are moving your library to the new format now.'
      )
    ).toBeTruthy();
  });

  it('shows per-item progress while migrating manga IDs', () => {
    const { getByText } = render(
      <StartupMigrationOverlay
        visible
        progress={{
          phase: 'migrating_ids',
          title: 'Updating manga links',
          message: 'Updating bookmark 2 of 5...',
          current: 2,
          total: 5,
        }}
      />
    );

    expect(getByText('2 / 5')).toBeTruthy();
  });

  it('shows the completion message without progress counts', () => {
    const { getByText, queryByText } = render(
      <StartupMigrationOverlay
        visible
        progress={{
          phase: 'complete',
          title: 'Migration complete',
          message:
            'Your library has been updated for the latest version of MangaNess.',
        }}
      />
    );

    expect(getByText('Migration complete')).toBeTruthy();
    expect(queryByText(/\d+ \/ \d+/)).toBeNull();
  });
});
