/**
 * CureFact App
 * @format
 */

import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';

type Screen = 'home' | 'factCheck' | 'labelCheck' | 'analyzing' | 'results';

type AnalysisResult = {
  mainClaim: string;
  verdict: 'Accurate' | 'Misleading' | 'False' | 'Unverified';
  explanation: string;
  confidence: number;
  sources: Array<{ title: string; url: string; publisher?: string }>;
};

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [videoUrl, setVideoUrl] = useState(
    'https://www.instagram.com/reel/DJl7w29JArs/?utm_source=ig_web_copy_link',
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const localFilePath = useMemo(() => {
    const fileName = `video_${Date.now()}.mp4`;
    return `${RNFS.CachesDirectoryPath}/${fileName}`;
  }, []);

  const navigate = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleFactCheck = async () => {
    setResult(null);
    setDownloadError(null);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadPath(null);
    setIsAnalyzing(false);
    navigate('analyzing');

    try {
      // Use PC's actual IP address for physical device (not emulator)
      const base = 'http://192.168.124.130:3001';
      const resp = await fetch(`${base}/api/fetch-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });
      if (!resp.ok) throw new Error(`Resolver error ${resp.status}`);
      const data = await resp.json();
      if (!data.downloadUrl) throw new Error('No downloadUrl in response');

      // Some hosts require specific User-Agent/Referer headers; pass through if provided
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
    } catch (e) {
      console.error('Download error:', e);
      setDownloadError(e instanceof Error ? e.message : 'Download failed');
      setDownloadPath(null);
    } finally {
      setIsDownloading(false);
    }

    // Check if file actually exists, regardless of downloadPath state
    const fileExists = await RNFS.exists(localFilePath);
    if (!fileExists) {
      // Download failed, show error state
      return;
    }

    setIsAnalyzing(true);
    try {
      // Call real Gemini analysis
      const base = 'http://192.168.124.130:3001';
      const analysisResp = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoUrl: data.downloadUrl, 
          originalUrl: videoUrl 
        }),
      });
      
      if (!analysisResp.ok) {
        throw new Error(`Analysis error ${analysisResp.status}`);
      }
      
      const analysisResult = await analysisResp.json();
      setResult(analysisResult);
      navigate('results');
    } catch (e) {
      console.error('Analysis error:', e);
      // Fallback to mock if Gemini fails
      const mock: AnalysisResult = {
        mainClaim: 'Drinking lemon water prevents viral infections',
        verdict: 'Misleading',
        explanation:
          'There is no strong clinical evidence that lemon water prevents viral infections. Hydration is helpful, and vitamin C supports immunity, but it does not prevent infection.',
        confidence: 0.62,
        sources: [
          { title: 'WHO: Nutrition and immunity', url: 'https://www.who.int/', publisher: 'WHO' },
          { title: 'CDC: Preventing Viral Infections', url: 'https://www.cdc.gov/', publisher: 'CDC' },
        ],
      };
      setResult(mock);
      navigate('results');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen onNavigate={navigate} />;
      case 'factCheck':
        return (
          <FactCheckScreen
            onBack={() => navigate('home')}
            onFactCheck={handleFactCheck}
            videoUrl={videoUrl}
            setVideoUrl={setVideoUrl}
          />
        );
      case 'labelCheck':
        return <LabelCheckScreen onBack={() => navigate('home')} />;
      case 'analyzing':
        return (
          <AnalyzingScreen
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            isAnalyzing={isAnalyzing}
            downloadError={downloadError}
            onRetry={handleFactCheck}
          />
        );
      case 'results':
        return (
          <ResultsScreen
            onBack={() => navigate('home')}
            result={result}
          />
        );
      default:
        return <HomeScreen onNavigate={navigate} />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>{renderScreen()}</SafeAreaView>
    </SafeAreaProvider>
  );
};

const HomeScreen = ({ onNavigate }: { onNavigate: (screen: Screen) => void }) => (
  <View style={styles.screenContainer}>
    <Text style={styles.title}>CureFact</Text>
    <Text style={styles.subtitle}>Select a feature to get started</Text>

    <TouchableOpacity
      style={styles.card}
      onPress={() => onNavigate('factCheck')}>
      <Text style={styles.cardTitle}>Social Media Fact Check</Text>
      <Text style={styles.cardDescription}>
        Verify health claims in social media videos.
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.card}
      onPress={() => onNavigate('labelCheck')}>
      <Text style={styles.cardTitle}>Product Label Analyzer</Text>
      <Text style={styles.cardDescription}>
        Analyze ingredients and nutrition from product labels.
      </Text>
    </TouchableOpacity>
  </View>
);

const FactCheckScreen = ({
  onBack,
  onFactCheck,
  videoUrl,
  setVideoUrl,
}: {
  onBack: () => void;
  onFactCheck: () => void;
  videoUrl: string;
  setVideoUrl: (url: string) => void;
}) => (
  <View style={styles.screenContainer}>
    <TouchableOpacity onPress={onBack} style={styles.backButton}>
      <Text style={styles.backButtonText}>{'< Back'}</Text>
    </TouchableOpacity>
    <Text style={styles.title}>Fact-Check Video</Text>
    <Text style={styles.subtitle}>
      Paste the video URL below to verify its health claims.
    </Text>
    <TextInput
      style={styles.input}
      value={videoUrl}
      onChangeText={setVideoUrl}
      placeholder="e.g., https://www.instagram.com/reel/..."
    />
    <TouchableOpacity style={styles.actionButton} onPress={onFactCheck}>
      <Text style={styles.actionButtonText}>Fact Check this Video</Text>
    </TouchableOpacity>
  </View>
);

const LabelCheckScreen = ({ onBack }: { onBack: () => void }) => (
  <View style={styles.screenContainer}>
    <TouchableOpacity onPress={onBack} style={styles.backButton}>
      <Text style={styles.backButtonText}>{'< Back'}</Text>
    </TouchableOpacity>
    <Text style={styles.title}>Product Label Check</Text>
    <Text style={styles.subtitle}>Feature coming soon!</Text>
  </View>
);

const AnalyzingScreen = ({
  isDownloading,
  downloadProgress,
  isAnalyzing,
  downloadError,
  onRetry,
}: {
  isDownloading: boolean;
  downloadProgress: number;
  isAnalyzing: boolean;
  downloadError: string | null;
  onRetry: () => void;
}) => (
  <View style={[styles.screenContainer, styles.center]}>
    <ActivityIndicator size="large" color="#007AFF" />
    {isDownloading ? (
      <>
        <Text style={[styles.title, { marginTop: 20 }]}>Downloading video…</Text>
        <Text style={styles.subtitle}>{Math.round(downloadProgress * 100)}% complete</Text>
      </>
    ) : isAnalyzing ? (
      <>
        <Text style={[styles.title, { marginTop: 20 }]}>Analyzing…</Text>
        <Text style={styles.subtitle}>Extracting claims & checking sources.</Text>
      </>
    ) : downloadError ? (
      <>
        <Text style={[styles.title, { marginTop: 20, color: '#ef4444' }]}>Download Failed</Text>
        <Text style={[styles.subtitle, { color: '#ef4444' }]}>{downloadError}</Text>
        <TouchableOpacity style={[styles.actionButton, { marginTop: 20 }]} onPress={onRetry}>
          <Text style={styles.actionButtonText}>Retry Download</Text>
        </TouchableOpacity>
      </>
    ) : (
      <>
        <Text style={[styles.title, { marginTop: 20 }]}>Preparing…</Text>
        <Text style={styles.subtitle}>Please wait</Text>
      </>
    )}
  </View>
);

const ResultsScreen = ({ onBack, result }: { onBack: () => void; result: AnalysisResult | null }) => (
  <View style={styles.screenContainer}>
    <TouchableOpacity onPress={onBack} style={styles.backButton}>
      <Text style={styles.backButtonText}>{'< Back'}</Text>
    </TouchableOpacity>
    <Text style={styles.title}>Analysis Complete</Text>
    {result ? (
      <View style={styles.resultsCard}>
        <Text style={styles.resultsTitle}>Verdict: {result.verdict.toUpperCase()}</Text>
        <Text style={[styles.resultsDescription, { marginTop: 8 }]}>Main claim: {result.mainClaim}</Text>
        <Text style={[styles.resultsDescription, { marginTop: 8 }]}>{result.explanation}</Text>
        <View style={{ marginTop: 12 }}>
          {result.sources.map((s, i) => (
            <Text key={i} style={styles.resultsDescription}>
              {(s.publisher ? s.publisher + ' — ' : '') + s.title}
            </Text>
          ))}
        </View>
      </View>
    ) : (
      <Text style={styles.subtitle}>No result available.</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  screenContainer: {
    flex: 1,
    padding: 24,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#64748B',
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FBBF24',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#B45309',
    marginBottom: 8,
  },
  resultsDescription: {
    fontSize: 16,
    color: '#D97706',
  },
});

export default App;
