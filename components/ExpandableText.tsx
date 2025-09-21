import React, { useState, useCallback } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  TextStyle,
  LayoutAnimation,
} from 'react-native';

interface ExpandableTextProps {
  text: string;
  initialLines?: number;
  style?: TextStyle;
  expandedStyle?: TextStyle;
  stateKey?: string;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  initialLines = 3,
  style,
  expandedStyle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const onFullTextLayout = useCallback(
    (e: any) => {
      const lineCount = e.nativeEvent.lines.length;
      if (lineCount > initialLines) {
        setIsTruncated(true);
      }
    },
    [initialLines]
  );

  const onTruncatedTextLayout = useCallback(() => {}, []);

  const toggleExpand = useCallback(() => {
    if (!isTruncated) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  }, [isTruncated]);


  return (
    <TouchableOpacity
      onPress={toggleExpand}
      testID="expandable-text"
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Hidden text to measure full height */}
      <Text
        style={[styles.text, style, styles.hiddenText]}
        onTextLayout={onFullTextLayout}
      >
        {text}
      </Text>

      {/* Visible text */}
      <Text
        numberOfLines={isExpanded ? undefined : initialLines}
        onTextLayout={onTruncatedTextLayout}
        style={[styles.text, style, isExpanded && expandedStyle]}
      >
        {text}
      </Text>
      <Text
        style={[
          styles.expandIndicator,
          { color: style?.color || '#666', opacity: isTruncated ? 1 : 0 },
        ]}
      >
        {isExpanded ? '  ▲ Tap to collapse' : '  ▼ Tap to expand'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  expandableContainer: {
    borderRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
  },
  hiddenText: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
  },
  truncatedText: {
    marginBottom: 2,
  },
  expandIndicator: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    opacity: 0.7,
  },
});

export default React.memo(ExpandableText);
