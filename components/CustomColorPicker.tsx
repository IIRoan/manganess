import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Expanded color palette to ensure even rows
const COLORS = [
  {
    category: 'Greens',
    items: [
      { color: '#2E8B57', name: 'Sea Green' },
      { color: '#3CB371', name: 'Medium Sea Green' },
      { color: '#00A36C', name: 'Jade' },
      { color: '#2AAA8A', name: 'Green Slate' },
      { color: '#4CBB17', name: 'Kelly Green' },
      { color: '#008000', name: 'Green' },
      { color: '#006400', name: 'Dark Green' },
      { color: '#32CD32', name: 'Lime Green' },
    ],
  },
  {
    category: 'Blues',
    items: [
      { color: '#4682B4', name: 'Steel Blue' },
      { color: '#6495ED', name: 'Cornflower Blue' },
      { color: '#1E90FF', name: 'Dodger Blue' },
      { color: '#00BFFF', name: 'Deep Sky Blue' },
      { color: '#0047AB', name: 'Cobalt Blue' },
      { color: '#000080', name: 'Navy' },
      { color: '#0000CD', name: 'Medium Blue' },
      { color: '#5D8AA8', name: 'Air Force Blue' },
    ],
  },
  {
    category: 'Purples',
    items: [
      { color: '#9370DB', name: 'Medium Purple' },
      { color: '#8A2BE2', name: 'Blue Violet' },
      { color: '#9932CC', name: 'Dark Orchid' },
      { color: '#BA55D3', name: 'Medium Orchid' },
      { color: '#6A0DAD', name: 'Purple' },
      { color: '#800080', name: 'Deep Purple' },
      { color: '#483D8B', name: 'Dark Slate Blue' },
      { color: '#DA70D6', name: 'Orchid' },
    ],
  },
  {
    category: 'Reds',
    items: [
      { color: '#FF6B6B', name: 'Light Red' },
      { color: '#FF4500', name: 'Orange Red' },
      { color: '#FF1493', name: 'Deep Pink' },
      { color: '#C71585', name: 'Medium Violet Red' },
      { color: '#DC143C', name: 'Crimson' },
      { color: '#B22222', name: 'Firebrick' },
      { color: '#CD5C5C', name: 'Indian Red' },
      { color: '#8B0000', name: 'Dark Red' },
    ],
  },
  {
    category: 'Yellows & Oranges',
    items: [
      { color: '#FFD700', name: 'Gold' },
      { color: '#FFA500', name: 'Orange' },
      { color: '#FF8C00', name: 'Dark Orange' },
      { color: '#FF7F50', name: 'Coral' },
      { color: '#F4C430', name: 'Saffron' },
      { color: '#DAA520', name: 'Goldenrod' },
      { color: '#FFFF00', name: 'Yellow' },
      { color: '#BDB76B', name: 'Dark Khaki' },
    ],
  },
];

interface CustomColorPickerProps {
  visible: boolean;
  onClose: () => void;
  onColorSelected: (color: string) => void;
  initialColor: string;
  colors: any;
}

const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  visible,
  onClose,
  onColorSelected,
  initialColor,
  colors,
}) => {
  const [selectedColor, setSelectedColor] = useState(initialColor);

  // Fixed number of columns regardless of screen size

  useEffect(() => {
    if (visible) setSelectedColor(initialColor);
  }, [visible, initialColor]);

  const getContrastText = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000' : '#fff';
  };

  const selectedColorName =
    COLORS.flatMap((cat) => cat.items).find(
      (item) => item.color === selectedColor
    )?.name || 'Custom';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              Choose Color
            </Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.background }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={COLORS}
            keyExtractor={(item) => item.category}
            renderItem={({ item: category }) => (
              <View style={styles.categorySection}>
                <Text style={[styles.categoryTitle, { color: colors.text }]}>
                  {category.category}
                </Text>
                <View style={styles.colorGrid}>
                  {category.items.map((colorItem) => (
                    <TouchableOpacity
                      key={colorItem.color}
                      style={styles.colorItem}
                      onPress={() => setSelectedColor(colorItem.color)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: colorItem.color },
                          selectedColor === colorItem.color && [
                            styles.selectedSwatch,
                            { borderColor: colors.primary },
                          ],
                        ]}
                      >
                        {selectedColor === colorItem.color && (
                          <Ionicons name="checkmark" size={22} color="#fff" />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.colorName,
                          { color: colors.secondaryText },
                        ]}
                        numberOfLines={1}
                      >
                        {colorItem.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            style={styles.list}
            showsVerticalScrollIndicator={true}
          />

          <View
            style={[
              styles.preview,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background + '40',
              },
            ]}
          >
            <View
              style={[
                styles.previewSwatch,
                {
                  backgroundColor: selectedColor,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={styles.previewInfo}>
              <Text style={[styles.previewName, { color: colors.text }]}>
                {selectedColorName}
              </Text>
              <Text
                style={[styles.previewHex, { color: colors.secondaryText }]}
              >
                {selectedColor.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: colors.background },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: selectedColor }]}
              onPress={() => {
                onColorSelected(selectedColor);
                onClose();
              }}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: getContrastText(selectedColor) },
                ]}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    width: '94%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexGrow: 0,
    maxHeight: 400,
  },
  categorySection: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginVertical: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  colorItem: {
    width: '25%', // Fixed width for 4 columns
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  colorSwatch: {
    width: 60,
    height: 60,
    borderRadius: Platform.OS === 'ios' ? 12 : 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  selectedSwatch: {
    transform: [{ scale: 1.05 }],
  },
  colorName: {
    fontSize: 11,
    textAlign: 'center',
    width: '100%',
  },
  preview: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  previewSwatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
    borderWidth: 1.5,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '600',
  },
  previewHex: {
    fontSize: 14,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomColorPicker;
