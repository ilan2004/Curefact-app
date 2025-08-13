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
  FlatList,
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
  // Allow both video analysis and article analysis JSON structures
  const [result, setResult] = useState<any | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Store the resolved direct media URL from the server to use for analysis
  const [mediaDownloadUrl, setMediaDownloadUrl] = useState<string | null>(null);

  const localFilePath = useMemo(() => {
    const fileName = `video_${Date.now()}.mp4`;
    return `${RNFS.CachesDirectoryPath}/${fileName}`;
  }, []);

  const navigate = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleFactCheck = async () => {
    // Use a local variable to ensure we have the resolved URL during this run
    let resolvedDownloadUrl: string | null = null;
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
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Resolver error ${resp.status}${text ? `: ${text}` : ''}`);
      }
      const data = await resp.json();
      if (!data.downloadUrl) throw new Error('No downloadUrl in response');
      // Capture locally and persist to state
      resolvedDownloadUrl = data.downloadUrl;
      setMediaDownloadUrl(data.downloadUrl);

      // Some hosts require specific User-Agent/Referer headers; pass through if provided
      const download = RNFS.downloadFile({
        fromUrl: resolvedDownloadUrl!,
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

    // Ensure we have the resolved media URL for backend analysis
    if (!resolvedDownloadUrl) {
      setDownloadError('Failed to resolve media URL for analysis');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Call real Gemini analysis (proceed even if local file download failed)
      const base = 'http://192.168.124.130:3001';
      const analysisResp = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: resolvedDownloadUrl!,
          originalUrl: videoUrl,
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
      <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" />
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
      placeholderTextColor="#94A3B8"
      selectionColor="#2563EB"
      cursorColor="#2563EB"
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

const ResultsScreen = ({ onBack, result }: { onBack: () => void; result: any | null }) => {
  // Decide which schema we have
  const isArticle = !!(result && (result.relevanceScore !== undefined || result.ingredientsAnalysis));
  return (
    <View style={styles.screenContainer}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>{'< Back'}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Analysis Complete</Text>
      {!result ? (
        <Text style={styles.subtitle}>No result available.</Text>
      ) : isArticle ? (
        <View style={styles.resultsCard}>
          {typeof result.summary === 'string' && (
            <Text style={styles.resultsTitle}>Summary</Text>
          )}
          {typeof result.summary === 'string' && (
            <Text style={styles.resultsDescription}>{result.summary}</Text>
          )}

          <View style={{ marginTop: 12 }}>
            <Text style={styles.resultsTitle}>Scores</Text>
            <Text style={styles.resultsDescription}>Relevance: {result.relevanceScore ?? '—'}</Text>
            <Text style={styles.resultsDescription}>Credibility: {result.credibilityScore ?? '—'}</Text>
            {result.readingTime && (
              <Text style={styles.resultsDescription}>Reading time: {result.readingTime}</Text>
            )}
            {result.sentiment && (
              <Text style={styles.resultsDescription}>Sentiment: {result.sentiment}</Text>
            )}
            {result.complexity && (
              <Text style={styles.resultsDescription}>Complexity: {result.complexity}</Text>
            )}
          </View>

          {Array.isArray(result.tags) && result.tags.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Tags</Text>
              <View style={styles.tagRow}>
                {result.tags.map((t: string, i: number) => (
                  <React.Fragment key={`${t}-${i}`}>
                    <View style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{t}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {Array.isArray(result.keyPoints) && result.keyPoints.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Key Points</Text>
              {result.keyPoints.map((kp: string, idx: number) => (
                <React.Fragment key={`kp-${idx}`}>
                  <Text style={styles.resultsDescription}>• {kp}</Text>
                </React.Fragment>
              ))}
            </View>
          )}

          {result.opinion && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Opinion</Text>
              <Text style={styles.resultsDescription}>{result.opinion}</Text>
            </View>
          )}

          {result.recommendation && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Recommendation</Text>
              <Text style={styles.resultsDescription}>{result.recommendation}</Text>
            </View>
          )}

          {result.healthImpactStats && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Health Impact</Text>
              <Text style={styles.resultsDescription}>Overall rating: {result.healthImpactStats.overallHealthRating ?? '—'}</Text>
              <Text style={styles.resultsDescription}>Risk level: {result.healthImpactStats.riskLevel ?? '—'}</Text>
              <Text style={styles.resultsDescription}>Evidence: {result.healthImpactStats.evidenceStrength ?? '—'}</Text>
              {result.healthImpactStats.populationAffected && (
                <Text style={styles.resultsDescription}>Population affected: {result.healthImpactStats.populationAffected}</Text>
              )}
              {Array.isArray(result.healthImpactStats.potentialBenefits) && result.healthImpactStats.potentialBenefits.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.resultsTitle}>Potential Benefits</Text>
                  {result.healthImpactStats.potentialBenefits.map((b: any, i: number) => (
                    <React.Fragment key={`benefit-${i}`}>
                      <Text style={styles.resultsDescription}>• {b.benefit} ({b.likelihood || '—'}, {b.magnitude || '—'}, {b.timeframe || '—'})</Text>
                    </React.Fragment>
                  ))}
                </View>
              )}
              {Array.isArray(result.healthImpactStats.potentialRisks) && result.healthImpactStats.potentialRisks.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.resultsTitle}>Potential Risks</Text>
                  {result.healthImpactStats.potentialRisks.map((r: any, i: number) => (
                    <React.Fragment key={`risk-${i}`}>
                      <Text style={styles.resultsDescription}>• {r.risk} ({r.likelihood || '—'}, {r.severity || '—'}, {r.reversibility || '—'})</Text>
                    </React.Fragment>
                  ))}
                </View>
              )}
              {Array.isArray(result.healthImpactStats.statisticalOutcomes) && result.healthImpactStats.statisticalOutcomes.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.resultsTitle}>Statistical Outcomes</Text>
                  {result.healthImpactStats.statisticalOutcomes.map((o: any, i: number) => (
                    <React.Fragment key={`outcome-${i}`}>
                      <Text style={styles.resultsDescription}>• {o.outcome}: {o.statistic || '—'} (n={o.studySize || '—'}, {o.duration || '—'})</Text>
                    </React.Fragment>
                  ))}
                </View>
              )}
            </View>
          )}

          {Array.isArray(result.ingredientsAnalysis) && result.ingredientsAnalysis.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.resultsTitle}>Ingredients Analysis</Text>
              {result.ingredientsAnalysis.map((ing: any, i: number) => (
                <React.Fragment key={`ing-${i}`}>
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.resultsDescription}>
                      {ing.ingredient} — Score: {ing.healthImpactScore ?? '—'}
                    </Text>
                    {Array.isArray(ing.advantages) && ing.advantages.length > 0 && (
                      <Text style={styles.resultsDescription}>Advantages: {ing.advantages.join(', ')}</Text>
                    )}
                    {Array.isArray(ing.disadvantages) && ing.disadvantages.length > 0 && (
                      <Text style={styles.resultsDescription}>Disadvantages: {ing.disadvantages.join(', ')}</Text>
                    )}
                    {ing.stats && (
                      <Text style={styles.resultsDescription}>
                        Stats: {ing.stats.nutritionalValue || '—'} | Intake: {ing.stats.recommendedIntake || '—'} | Effects: {ing.stats.commonEffects || '—'} | Absorption: {ing.stats.absorptionRate || '—'} | Half-life: {ing.stats.halfLife || '—'} | Interaction risk: {ing.stats.interactionRisk || '—'}
                      </Text>
                    )}
                    {ing.healthMetrics && (
                      <Text style={styles.resultsDescription}>
                        Metrics: Cardio {ing.healthMetrics.cardiovascularImpact || '—'} | Metabolic {ing.healthMetrics.metabolicEffects || '—'} | Immune {ing.healthMetrics.immuneSystemImpact || '—'} | Cognitive {ing.healthMetrics.cognitiveEffects || '—'}
                      </Text>
                    )}
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Verdict: {String(result.verdict || '').toUpperCase()}</Text>
          {result.mainClaim && (
            <Text style={[styles.resultsDescription, { marginTop: 8 }]}>Main claim: {result.mainClaim}</Text>
          )}
          {result.explanation && (
            <Text style={[styles.resultsDescription, { marginTop: 8 }]}>{result.explanation}</Text>
          )}
          {Array.isArray(result.sources) && result.sources.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <FlatList
                data={result.sources}
                keyExtractor={(item, index) => `${item.url || item.title}-${index}`}
                renderItem={({ item }) => (
                  <Text style={styles.resultsDescription}>
                    {(item.publisher ? item.publisher + ' — ' : '') + item.title}
                  </Text>
                )}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9FF',
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
    color: '#0F172A',
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
    color: '#0F172A',
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
    color: '#2563EB',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D0D8E7',
    color: '#0F172A',
  },
  actionButton: {
    backgroundColor: '#2563EB',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 8,
  },
  resultsDescription: {
    fontSize: 16,
    color: '#1D4ED8',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  tagChip: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagChipText: {
    color: '#1E40AF',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default App;
