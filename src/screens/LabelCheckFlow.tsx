import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LabelCheckFlow() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Product Label Check</Text>
      <Text style={styles.desc}>Capture or upload a product label to analyze ingredients and nutrition.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, color: '#666', textAlign: 'center' },
});
