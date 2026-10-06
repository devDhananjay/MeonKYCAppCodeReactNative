import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {KycTheme, withOpacity} from '../theme/kycTheme';

interface LoaderProps {
  message?: string;
  /** When true, shows a simpler inline loader without the white card */
  minimal?: boolean;
}

/**
 * Lightweight, non-intrusive loader for necessary loading states
 * (e.g., initial data fetch, get-context API calls). Port of components/loader.dart.
 */
export function Loader({message = 'Loading your data...', minimal = false}: LoaderProps) {
  if (minimal) {
    // Minimal version: just spinner + text, no card, less intrusive
    return (
      <View style={styles.minimalContainer}>
        <View style={styles.center}>
          <View style={styles.spinnerBox}>
            <ActivityIndicator size="small" color={KycTheme.primary} />
          </View>
          <View style={{height: 16}} />
          <Text style={styles.minimalText}>{message}</Text>
        </View>
      </View>
    );
  }

  // Standard version: with subtle card for important loading states
  return (
    <View style={styles.standardContainer}>
      <View style={styles.card}>
        <View style={styles.spinnerBox}>
          <ActivityIndicator size="small" color={KycTheme.primary} />
        </View>
        <View style={{height: 18}} />
        <Text style={styles.cardText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  minimalContainer: {flex: 1, backgroundColor: KycTheme.background, alignItems: 'center', justifyContent: 'center'},
  center: {alignItems: 'center'},
  spinnerBox: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  minimalText: {
    fontSize: 14,
    fontWeight: '500',
    color: KycTheme.textSecondary,
    lineHeight: 14 * 1.4,
    textAlign: 'center',
  },
  standardContainer: {
    flex: 1,
    // Very transparent background so users can see content behind
    backgroundColor: withOpacity(KycTheme.background, 0.95),
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    paddingHorizontal: 28,
    paddingVertical: 24,
    marginHorizontal: 32,
    maxWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  cardText: {
    fontSize: 15,
    fontWeight: '500',
    color: KycTheme.textPrimary,
    lineHeight: 15 * 1.4,
    textAlign: 'center',
  },
});
