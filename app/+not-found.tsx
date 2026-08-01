import React from 'react';
import { Link, Stack } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useTheme, Theme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!', headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons
            name="alert-circle-outline"
            size={80}
            color={colors.primary}
          />
          <Text style={styles.title}>Page Not Found</Text>
          <Text style={styles.message}>
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </Text>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Go to Home</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </>
  );
}

const getStyles = (colors: Theme['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 20,
      marginBottom: 10,
    },
    message: {
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 30,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 5,
    },
    buttonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
