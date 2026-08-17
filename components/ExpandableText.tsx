import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextStyle,
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
  const textRef = useRef(text);

  useEffect(() => {
    if (textRef.current === text) {
      return;
    }
    textRef.current = text;
    setIsExpanded(false);
    setIsTruncated(false);
  }, [text]);

  const onFullTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const lineCount = e.nativeEvent.lines.length;
      setIsTruncated((prev) => prev || lineCount > initialLines);
    },
    [initialLines]
  );

  const toggleExpand = useCallback(() => {
    if (!isTruncated) return;
    setIsExpanded((prev) => !prev);
  }, [isTruncated]);

  return (
    <TouchableOpacity
      onPress={toggleExpand}
      testID="expandable-text"
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Hidden text to measure full height without affecting layout */}
      <Text
        style={[styles.text, style, styles.hiddenText]}
        onTextLayout={onFullTextLayout}
        pointerEvents="none"
      >
        {text}
      </Text>

      {/* Visible text */}
      <Text
        numberOfLines={isExpanded ? undefined : initialLines}
        style={[styles.text, style, isExpanded && expandedStyle]}
      >
        {text}
      </Text>
      {isTruncated && (
        <Text
          style={[styles.expandIndicator, { color: style?.color || '#666' }]}
        >
          {isExpanded ? '  ▲ Tap to collapse' : '  ▼ Tap to expand'}
        </Text>
      )}
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
    left: 0,
    right: 0,
    top: 0,
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
