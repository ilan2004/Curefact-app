import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import RNFS from 'react-native-fs';

export default function FactCheckFlow() {
  const [url, setUrl] = useState<string>('https://www.instagram.com/reel/DJl7w29JArs/?utm_source=ig_web_copy_link');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<null | {
    mainClaim: string;
    verdict: 'Accurate' | 'Misleading' | 'False' | 'Unverified';
    explanation: string;
    confidence: number;
    sources: Array<{ title: string; url: string; publisher?: string }>;
  }>(null);

  const localFilePath = useMemo(() => {
    const fileName = `video_${Date.now()}.mp4`;
    return `${RNFS.CachesDirectoryPath}/${fileName}`;
  }, []);

  const handleDownload = useCallback(async () => {
    setResult(null);
    setIsAnalyzing(false);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadPath(null);

    try {
      // Resolve media URL via local server
      const base = 'http://192.168.124.130:3001';
      const resp = await fetch(`${base}/api/fetch-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!resp.ok) throw new Error(`Resolver error ${resp.status}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Unknown error');
      const data = json;

      const download = RNFS.downloadFile({
        fromUrl: data.downloadUrl,
        toFile: localFilePath,
        progressDivider: 5,
        progress: ({ contentLength, bytesWritten }) => {
          if (contentLength > 0) {
            setDownloadProgress(bytesWritten / contentLength);
          }
        },
        headers: data.headers || undefined,
      });

      const res = await download.promise;
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        setDownloadPath(localFilePath);
      } else {
        throw new Error(`Download failed with status ${res.statusCode}`);
      }
    } catch (e: any) {
      console.error('Download error', e);
      setDownloadPath(null);
    } finally {
      setIsDownloading(false);
    }
  }, [localFilePath]);

  const handleAnalyze = useCallback(async () => {
    if (!downloadPath) return;
    setIsAnalyzing(true);
    try {
      // Call real Gemini analysis
      const base = 'http://192.168.124.130:3001';
      const analysisResp = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoUrl: downloadPath, 
          originalUrl: url 
        }),
      });
      
      if (!analysisResp.ok) {
        throw new Error(`Analysis error ${analysisResp.status}`);
      }
      
      const analysisResult = await analysisResp.json();
      setResult(analysisResult);
    } catch (e) {
      console.error('Analysis error:', e);
      // Fallback to mock if Gemini fails
      const mock = {
        mainClaim: 'Drinking lemon water prevents viral infections',
        verdict: 'Misleading' as const,
        explanation:
          'There is no strong clinical evidence that lemon water prevents viral infections. Hydration is helpful, and vitamin C supports immunity, but it does not prevent infection.',
        confidence: 0.62,
        sources: [
          { title: 'WHO: Nutrition and immunity', url: 'https://www.who.int/', publisher: 'WHO' },
          { title: 'CDC: Preventing Viral Infections', url: 'https://www.cdc.gov/', publisher: 'CDC' },
        ],
      };
      setResult(mock);
    } finally {
      setIsAnalyzing(false);
    }
  }, [downloadPath, url]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Social Media Fact Check</Text>
      <Text style={styles.desc}>Paste a reel/short URL, download the video, then analyze with Gemini.</Text>

      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://www.instagram.com/reel/..."
        placeholderTextColor="#94A3B8"
        selectionColor="#2563EB"
        cursorColor="#2563EB"
      />

      <TouchableOpacity style={[styles.button, isDownloading && styles.buttonDisabled]} onPress={handleDownload} disabled={isDownloading}>
        <Text style={styles.buttonText}>{isDownloading ? 'Downloading…' : 'Download Video'}</Text>
      </TouchableOpacity>

      {isDownloading && (
        <View style={styles.progressRow}>
          <ActivityIndicator />
          <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, (!downloadPath || isAnalyzing) && styles.buttonDisabled]}
        onPress={handleAnalyze}
        disabled={!downloadPath || isAnalyzing}
      >
        <Text style={styles.buttonText}>{isAnalyzing ? 'Analyzing…' : 'Analyze with Gemini (mock)'}</Text>
      </TouchableOpacity>

      {result && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Main Claim</Text>
          <Text style={styles.cardBody}>{result.mainClaim}</Text>

          <Text style={[styles.cardTitle, { marginTop: 12 }]}>Verdict</Text>
          <Text style={[styles.verdict, styles[`verdict_${result.verdict}` as const]]}>{result.verdict}</Text>

          <Text style={[styles.cardTitle, { marginTop: 12 }]}>Explanation</Text>
          <Text style={styles.cardBody}>{result.explanation}</Text>

          <Text style={[styles.cardTitle, { marginTop: 12 }]}>Sources</Text>
          <FlatList
            data={result.sources}
            keyExtractor={(item, index) => `${item.url || item.title}-${index}`}
            renderItem={({ item }) => (
              <Text style={styles.cardBody}>
                {item.publisher ? `${item.publisher} — ` : ''}{item.title}
              </Text>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F9FF' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center', color: '#0F172A' },
  desc: { fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#D0D8E7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'center' },
  progressText: { marginLeft: 8, color: '#1F2937' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontWeight: '700', color: '#0F172A' },
  cardBody: { color: '#334155', marginTop: 4 },
  verdict: { fontWeight: '800' },
  verdict_Accurate: { color: '#16a34a' },
  verdict_Misleading: { color: '#f59e0b' },
  verdict_False: { color: '#ef4444' },
  verdict_Unverified: { color: '#64748b' },
});
