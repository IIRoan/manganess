import React from 'react';
import BackButton from './BackButton';

// Legacy wrapper for backward compatibility
// @deprecated Use BackButton with variant="enhanced" instead
interface EnhancedBackButtonProps {
  size?: number;
  color?: string;
  style?: any;
  showHistoryOnLongPress?: boolean;
  customOnPress?: () => void;
  disabled?: boolean;
}

const EnhancedBackButton: React.FC<EnhancedBackButtonProps> = (props) => {
  return (
    <BackButton
      {...props}
      variant="enhanced"
      showHistoryOnLongPress={props.showHistoryOnLongPress ?? true}
    />
  );
};

// Legacy floating button wrapper
// @deprecated Use BackButton with variant="floating" instead
interface FloatingBackButtonProps extends EnhancedBackButtonProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset?: { x: number; y: number };
}

export const FloatingBackButton: React.FC<FloatingBackButtonProps> = ({
  position = 'top-left',
  offset = { x: 20, y: 60 },
  size = 28,
  ...props
}) => {
  return (
    <BackButton
      {...props}
      variant="floating"
      position={position}
      offset={offset}
      size={size}
      showHistoryOnLongPress={props.showHistoryOnLongPress ?? true}
    />
  );
};

export default EnhancedBackButton;
