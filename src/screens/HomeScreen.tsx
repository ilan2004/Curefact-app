import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

 type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CureFact</Text>
      <Text style={styles.subtitle}>Choose what you want to verify</Text>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('FactCheck')}>
        <Text style={styles.cardTitle}>📱 Social Media Fact Check</Text>
        <Text style={styles.cardDesc}>Share reels/shorts to verify health claims</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('LabelCheck')}>
        <Text style={styles.cardTitle}>🏷️ Product Label Check</Text>
        <Text style={styles.cardDesc}>Scan ingredients and nutrition for health impact</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 12 },
  card: { padding: 20, backgroundColor: '#f2f5ff', borderRadius: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardDesc: { fontSize: 14, color: '#555' },
});
