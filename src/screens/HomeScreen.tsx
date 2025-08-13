import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
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

      <TouchableOpacity
        style={[styles.card, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}
        onPress={() => Linking.openURL('https://www.instagram.com/reel/DJl7w29JArs/?utm_source=ig_web_copy_link')}
      >
        <Text style={styles.cardTitle}>🔗 Try with sample IG Reel</Text>
        <Text style={styles.cardDesc}>Opens Instagram to copy/share the link</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('LabelCheck')}>
        <Text style={styles.cardTitle}>🏷️ Product Label Check</Text>
        <Text style={styles.cardDesc}>Scan ingredients and nutrition for health impact</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: '#F5F9FF' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: '#0F172A' },
  subtitle: { fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 12 },
  card: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, color: '#0F172A' },
  cardDesc: { fontSize: 14, color: '#64748B' },
});
