import { fireEvent, render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import ExpandableText from '../ExpandableText';

function requireFirst(nodes: ReactTestInstance[]): ReactTestInstance {
  const node = nodes[0];
  if (!node) {
    throw new Error('Expected rendered synopsis text');
  }
  return node;
}

describe('ExpandableText', () => {
  it('shows an expand control after measuring more than the initial lines', () => {
    const { getAllByText, getByText, queryByText } = render(
      <ExpandableText text="A long synopsis" initialLines={3} />
    );

    expect(queryByText(/Tap to expand/)).toBeNull();

    fireEvent(requireFirst(getAllByText('A long synopsis')), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}, {}] },
    });

    expect(getByText(/Tap to expand/)).toBeTruthy();
  });

  it('does not collapse the expand control if a later layout reports fewer lines', () => {
    const { getAllByText, getByText } = render(
      <ExpandableText text="A long synopsis" initialLines={3} />
    );

    const hiddenText = requireFirst(getAllByText('A long synopsis'));
    fireEvent(hiddenText, 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}, {}] },
    });
    fireEvent(hiddenText, 'textLayout', {
      nativeEvent: { lines: [{}, {}] },
    });

    expect(getByText(/Tap to expand/)).toBeTruthy();
  });
});
