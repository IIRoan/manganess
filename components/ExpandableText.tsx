import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextStyle, Platform, TextInput, LayoutAnimation } from 'react-native';

interface ExpandableTextProps {
  text: string;
  initialLines?: number;
  style?: TextStyle;
  expandedStyle?: TextStyle;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({ 
  text, 
  initialLines = 3, 
  style,
  expandedStyle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const onTextLayout = useCallback((e: any) => {
    if (e.nativeEvent.lines.length > initialLines) {
      setIsTruncated(true);
    }
  }, [initialLines]);

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  }, []);

  const TextComponent = useMemo(() => {
    return Text;
  }, [text]);

  const textProps = useMemo(() => {
    if (TextComponent === TextInput) {
      return {
        multiline: true,
        editable: false,
        scrollEnabled: false,
      };
    }
    return {
      numberOfLines: isExpanded ? undefined : initialLines,
      onTextLayout: onTextLayout,
    };
  }, [TextComponent, isExpanded, initialLines, onTextLayout]);

  return (
    <TouchableOpacity 
      onPress={toggleExpand}
      activeOpacity={0.7}
      style={styles.container}
    >
      <TextComponent
        {...textProps}
        style={[
          styles.text, 
          style,
          isExpanded && expandedStyle,
          isTruncated && !isExpanded && styles.truncatedText
        ]}
      >
        {text}
      </TextComponent>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
  },
  truncatedText: {
    marginBottom: 4, // Add some space for the fade effect
  },
});

export default React.memo(ExpandableText);
