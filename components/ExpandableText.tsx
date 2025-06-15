import React, { useState, useCallback } from 'react';
import { Text, TouchableOpacity, StyleSheet, TextStyle, LayoutAnimation, View } from 'react-native';

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
  const [fullHeight, setFullHeight] = useState(0);
  const [truncatedHeight, setTruncatedHeight] = useState(0);

  const onFullTextLayout = useCallback((e: any) => {
    const lineCount = e.nativeEvent.lines.length;
    console.log(`Full text layout: ${lineCount} lines`);
    if (lineCount > initialLines) {
      setIsTruncated(true);
      console.log('Text needs truncation');
    }
  }, [initialLines]);

  const onTruncatedTextLayout = useCallback((e: any) => {
    const lineCount = e.nativeEvent.lines.length;
    console.log(`Truncated text layout: ${lineCount} lines`);
  }, []);

  const toggleExpand = useCallback(() => {
    console.log('Toggle expand pressed, isTruncated:', isTruncated);
    if (!isTruncated) return;
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => {
      console.log('Toggling from', prev, 'to', !prev);
      return !prev;
    });
  }, [isTruncated]);

  console.log('Rendering with isExpanded:', isExpanded, 'isTruncated:', isTruncated);

  return (
    <TouchableOpacity 
      onPress={toggleExpand}
      testID="expandable-text"
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Hidden text to measure full height */}
      <Text
        style={[
          styles.text,
          style,
          styles.hiddenText
        ]}
        onTextLayout={onFullTextLayout}
      >
        {text}
      </Text>
      
      {/* Visible text */}
      <Text
        numberOfLines={isExpanded ? undefined : initialLines}
        onTextLayout={onTruncatedTextLayout}
        style={[
          styles.text, 
          style,
          isExpanded && expandedStyle,
        ]}
      >
        {text}
      </Text>
      {isTruncated && (
        <Text style={[styles.expandIndicator, { color: style?.color || '#666' }]}>
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
