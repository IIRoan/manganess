import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  useColorScheme,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { CustomAlertProps } from '@/types';

const Alert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  onClose,
  type,
  options,
  message,
}) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
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
  }, [visible, scaleValue]);

  const renderContent = () => {
    if (type === 'bookmarks') {
      return (
        <View testID="alert-options" style={styles.optionsContainer}>
          {options?.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.button}
              onPress={() => {
                option.onPress();
                onClose();
              }}
            >
              {option.icon && (
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={colors.primary}
                  />
                </View>
              )}
              <Text style={styles.textStyle}>{option.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    } else if (type === 'confirm') {
      return (
        <>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.confirmButtonsContainer}>
            {options?.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.confirmButton,
                  index === 0
                    ? styles.cancelButton
                    : styles.confirmActionButton,
                ]}
                onPress={() => {
                  option.onPress();
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.confirmButtonText,
                    index === 0
                      ? styles.cancelButtonText
                      : styles.confirmActionButtonText,
                  ]}
                >
                  {option.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      );
    }
    return null;
  };

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
            <Animated.View
              style={[styles.modalView, { transform: [{ scale: scaleValue }] }]}
            >
              <TouchableOpacity
                testID="close-button"
                style={styles.closeButton}
                onPress={onClose}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text testID="alert-title" style={styles.modalText}>
                {title}
              </Text>
              {renderContent()}
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalView: {
      margin: 20,
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 24,
      alignItems: 'stretch',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
      minWidth: 300,
      maxWidth: '85%',
    },
    optionsContainer: {
      marginTop: 16,
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
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${colors.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    textStyle: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 16,
      flex: 1,
    },
    modalText: {
      marginBottom: 16,
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: 24,
      color: colors.primary,
    },
    closeButton: {
      position: 'absolute',
      right: 16,
      top: 16,
      zIndex: 1,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${colors.text}10`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    message: {
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 20,
    },
    confirmButtonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      gap: 12,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      alignItems: 'center',
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    cancelButton: {
      backgroundColor: colors.primary,
    },
    cancelButtonText: {
      color: colors.card,
    },
    confirmActionButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmActionButtonText: {
      color: colors.text,
    },
  });

export default Alert;
