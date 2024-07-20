import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useColorScheme, TouchableWithoutFeedback, Animated } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type IconName = 'options' | 'key' | 'search' | 'repeat' | 'link' | 'at' | 'push' | 'map' | 'filter' | 'scale' | 'body' | 'code' | 'menu' | 'time' | 'ellipse' | 'image' | 'stop' | 'text' | 'alert'; // Add other valid icon names as needed

interface Option {
  text: string;
  onPress: () => void;
  icon: IconName;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: Option[];
}


const Alert: React.FC<CustomAlertProps> = ({ visible, title, onClose, options }) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : theme as ColorScheme;
  const colors = Colors[colorScheme];

  const styles = getStyles(colors);
  const scaleValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scaleValue, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.centeredView}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.modalView, { transform: [{ scale: scaleValue }] }]}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalText}>{title}</Text>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.button}
                  onPress={() => {
                    option.onPress();
                    onClose();
                  }}
                >
                  <Ionicons name={option.icon} size={24} color={colors.text} style={styles.icon} />
                  <Text style={styles.textStyle}>{option.text}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 25,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 280,
    maxWidth: '80%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginRight: 10,
  },
  textStyle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
    flex: 1,
  },
  modalText: {
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 22,
    color: colors.primary,
  },
  closeButton: {
    position: 'absolute',
    right: 15,
    top: 15,
    zIndex: 1,
  },
});

export default Alert;
