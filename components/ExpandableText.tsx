import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ExpandableText = ({ text, initialLines, style, expandTextStyle }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View>
      <Text numberOfLines={isExpanded ? undefined : initialLines} style={style}>
        {text}
      </Text>
      <Text
        style={[styles.expandText, expandTextStyle]}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  expandText: {
    marginTop: 0,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ExpandableText;
