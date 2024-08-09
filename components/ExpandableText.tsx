import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ExpandableText = ({ text, initialLines, style, expandTextStyle }) => {
  const [textShown, setTextShown] = useState(false);
  const [lengthMore, setLengthMore] = useState(false);

  const toggleNumberOfLines = () => {
    setTextShown(!textShown);
  };

  const onTextLayout = useCallback(e => {
    if (e.nativeEvent.lines.length > initialLines) {
      setLengthMore(true);
    }
  }, [initialLines]);

  return (
    <View>
      <Text
        onTextLayout={onTextLayout}
        numberOfLines={textShown ? undefined : initialLines}
        style={style}
      >
        {text}
      </Text>
      
      {lengthMore && (
        <TouchableOpacity onPress={toggleNumberOfLines} style={styles.expandButton}>
          <Text style={[styles.expandText, expandTextStyle]}>
            {textShown ? 'Show less' : 'Show more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  expandButton: {
    position: 'absolute',
    right: 0,
    bottom: -30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  expandText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default ExpandableText;
