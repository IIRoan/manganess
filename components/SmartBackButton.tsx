import React from 'react';
import BackButton from './BackButton';

// Legacy wrapper for backward compatibility
// @deprecated Use BackButton with variant="smart" instead
interface SmartBackButtonProps {
  size?: number;
  color?: string;
  style?: any;
  showLabel?: boolean;
  customOnPress?: () => void;
  disabled?: boolean;
}

const SmartBackButton: React.FC<SmartBackButtonProps> = (props) => {
  return (
    <BackButton
      {...props}
      variant="smart"
      showLabel={props.showLabel ?? false}
    />
  );
};

export default SmartBackButton;
