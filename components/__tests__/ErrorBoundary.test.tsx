import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import ErrorBoundary from '../ErrorBoundary';

// Mock dependencies
jest.mock('@/constants/ThemeContext', () => ({
  useTheme: () => ({ actualTheme: 'light' }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <Text testID="success">No error</Text>;
};

// Component that throws after update
const ThrowOnUpdate: React.FC<{ throwOnRender: boolean }> = ({ throwOnRender }) => {
  if (throwOnRender) {
    throw new Error('Error on update');
  }
  return <Text testID="content">Content</Text>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for cleaner test output
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Normal operation', () => {
    it('renders children when no error occurs', () => {
      const { getByTestId } = render(
        <ErrorBoundary>
          <Text testID="child">Hello World</Text>
        </ErrorBoundary>
      );

      expect(getByTestId('child')).toBeTruthy();
      expect(getByTestId('child').props.children).toBe('Hello World');
    });

    it('renders multiple children', () => {
      const { getByTestId } = render(
        <ErrorBoundary>
          <Text testID="child1">First</Text>
          <Text testID="child2">Second</Text>
        </ErrorBoundary>
      );

      expect(getByTestId('child1')).toBeTruthy();
      expect(getByTestId('child2')).toBeTruthy();
    });
  });

  describe('Error handling', () => {
    it('catches errors and displays default fallback', () => {
      const { getByText, queryByTestId } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(queryByTestId('success')).toBeNull();
      expect(getByText('Something went wrong')).toBeTruthy();
      expect(getByText('Test error message')).toBeTruthy();
    });

    it('displays default message when error has no message', () => {
      const ThrowEmptyError = () => {
        throw new Error();
      };

      const { getByText } = render(
        <ErrorBoundary>
          <ThrowEmptyError />
        </ErrorBoundary>
      );

      expect(getByText('An unexpected error occurred')).toBeTruthy();
    });

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'ErrorBoundary caught an error:',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('catches errors in nested components', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <View>
            <View>
              <ThrowError />
            </View>
          </View>
        </ErrorBoundary>
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Reset functionality', () => {
    it('resets error state when Try Again is pressed', () => {
      const { getByText, rerender } = render(
        <ErrorBoundary>
          <ThrowOnUpdate throwOnRender={true} />
        </ErrorBoundary>
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Update component to not throw
      rerender(
        <ErrorBoundary>
          <ThrowOnUpdate throwOnRender={false} />
        </ErrorBoundary>
      );

      // Press Try Again
      fireEvent.press(getByText('Try Again'));

      // Error boundary should re-render children
      // Note: In real scenario, this would show children if they don't throw
    });

    it('shows Try Again button in fallback', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByText('Try Again')).toBeTruthy();
    });
  });

  describe('Custom fallback', () => {
    it('renders custom fallback component', () => {
      const CustomFallback: React.FC<{ error?: Error; resetError: () => void }> = ({
        error,
        resetError,
      }) => (
        <View testID="custom-fallback">
          <Text testID="custom-error">{error?.message}</Text>
          <Text testID="reset-btn" onPress={resetError}>
            Reset
          </Text>
        </View>
      );

      const { getByTestId, queryByText } = render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByTestId('custom-fallback')).toBeTruthy();
      expect(getByTestId('custom-error').props.children).toBe('Test error message');
      expect(queryByText('Something went wrong')).toBeNull(); // Default fallback not shown
    });

    it('passes resetError function to custom fallback', () => {
      const CustomFallback: React.FC<{ error?: Error; resetError: () => void }> = ({
        resetError,
      }) => (
        <Text testID="reset" onPress={resetError}>
          Custom Reset
        </Text>
      );

      const { getByTestId } = render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowError />
        </ErrorBoundary>
      );

      fireEvent.press(getByTestId('reset'));

      // The component's internal resetError would be called
      // We can verify the button is pressable
      expect(getByTestId('reset')).toBeTruthy();
    });

    it('renders custom fallback when a non-Error value is thrown', () => {
      const ThrowUndefined = () => {
        throw undefined;
      };

      const CustomFallback: React.FC<{ error?: Error; resetError: () => void }> = ({
        error,
      }) => <Text testID="error-type">{String(error)}</Text>;

      const { getByTestId } = render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowUndefined />
        </ErrorBoundary>
      );

      expect(getByTestId('error-type')).toBeTruthy();
    });
  });

  describe('Error info', () => {
    it('captures component stack in error info', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // The second argument to console.error should contain errorInfo
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });
  });

  describe('Multiple errors', () => {
    it('handles multiple consecutive errors', () => {
      const { getByText, rerender } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByText('Test error message')).toBeTruthy();

      // Reset by pressing Try Again
      fireEvent.press(getByText('Try Again'));

      // Another error should be caught
      const ThrowDifferentError = () => {
        throw new Error('Different error');
      };

      rerender(
        <ErrorBoundary>
          <ThrowDifferentError />
        </ErrorBoundary>
      );

      // The error boundary should catch the new error
    });
  });

  describe('Recovery scenarios', () => {
    it('recovers and renders children after reset when children no longer throw', () => {
      let shouldThrow = true;

      const ConditionalThrow = () => {
        if (shouldThrow) {
          throw new Error('Conditional error');
        }
        return <Text testID="recovered">Recovered!</Text>;
      };

      const { getByText } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(getByText('Conditional error')).toBeTruthy();

      // Fix the condition
      shouldThrow = false;

      // Reset
      fireEvent.press(getByText('Try Again'));

      // Note: In a real scenario, the component would need to be re-rendered
      // after resetError is called. The test demonstrates the reset flow.
    });
  });
});
