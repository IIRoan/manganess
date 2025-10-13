import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface NavigationHistoryPanelProps {
  visible: boolean;
  onClose: () => void;
}

const NavigationHistoryPanel: React.FC<NavigationHistoryPanelProps> = ({
  visible,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Navigation History</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 8,
    zIndex: 1000,
  },
  text: {
    color: 'white',
    textAlign: 'center',
  },
});

export default NavigationHistoryPanel;
