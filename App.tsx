/**
 * CureFact App
 * @format
 */

import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';

type Screen = 'Home' | 'FactCheck' | 'LabelCheck';

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');

  const Header = (
    <View style={styles.header}>
      {screen !== 'Home' ? (
        <TouchableOpacity onPress={() => setScreen('Home')}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}
      <Text style={styles.headerTitle}>
        {screen === 'Home' && 'CureFact'}
        {screen === 'FactCheck' && 'Social Media Check'}
        {screen === 'LabelCheck' && 'Product Label Check'}
      </Text>
      <View />
    </View>
  );

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {Header}
      {screen === 'Home' && (
        <View style={styles.container}>
          <Text style={styles.title}>CureFact</Text>
          <Text style={styles.subtitle}>Choose what you want to verify</Text>

          <TouchableOpacity style={styles.card} onPress={() => setScreen('FactCheck')}>
            <Text style={styles.cardTitle}>📱 Social Media Fact Check</Text>
            <Text style={styles.cardDesc}>Share reels/shorts to verify health claims</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => setScreen('LabelCheck')}>
            <Text style={styles.cardTitle}>🏷️ Product Label Check</Text>
            <Text style={styles.cardDesc}>Scan ingredients and nutrition for health impact</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'FactCheck' && (
        <View style={styles.center}>
          <Text style={styles.flowTitle}>Social Media Fact Check</Text>
          <Text style={styles.flowDesc}>Placeholder screen. We’ll add share intent + overlay next.</Text>
        </View>
      )}

      {screen === 'LabelCheck' && (
        <View style={styles.center}>
          <Text style={styles.flowTitle}>Product Label Check</Text>
          <Text style={styles.flowDesc}>Placeholder screen. We’ll add camera + OCR next.</Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  back: { fontSize: 16, color: '#2563eb', paddingVertical: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 12 },
  card: { padding: 20, backgroundColor: '#f2f5ff', borderRadius: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardDesc: { fontSize: 14, color: '#555' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  flowTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  flowDesc: { fontSize: 15, color: '#555', textAlign: 'center' },
});
