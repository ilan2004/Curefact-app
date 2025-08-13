/* Simple Express server to resolve direct media URL for Instagram Reels using yt-dlp */
const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, 'bin');
const BIN_PATH = path.join(
  BIN_DIR,
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
);

// Gemini API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'your_gemini_api_key_here';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

let ensureBinaryPromise = null;
async function ensureBinaryPath() {
  if (!ensureBinaryPromise) {
    ensureBinaryPromise = (async () => {
      if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
      }
      if (!fs.existsSync(BIN_PATH)) {
        await YTDlpWrap.downloadFromGithub(BIN_PATH);
      }
      return BIN_PATH;
    })();
  }
  return ensureBinaryPromise;
}
const cors = require('cors');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

async function runYtDlpGetUrl(targetUrl) {
  const args = ['-j', '-f', 'best[ext=mp4]/best', '--no-playlist', '--no-warnings', '--', targetUrl];
  const tryExec = (bin) => new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    console.log('yt-dlp try:', bin);
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (!child) return reject(new Error(`Failed to spawn ${bin}`));
    if (!child.stdout || !child.stderr) return reject(new Error(`${bin} stdio not available`));
    child.on('error', (err) => reject(err));
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `${bin} exit ${code}`));
      resolve(stdout);
    });
  });

  let stdout;
  try {
    const binPath = await ensureBinaryPath();
    stdout = await tryExec(binPath);
  } catch (e) {
    console.warn('Bundled yt-dlp failed, falling back to system yt-dlp:', e.message);
    stdout = await tryExec('yt-dlp');
  }

  const lines = stdout.split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error('No output');
  const info = JSON.parse(lines[0]);
  const downloadUrl = info.url;
  const headers = info.http_headers || {};
  if (!downloadUrl) throw new Error('No URL found in yt-dlp output');
  return { downloadUrl, headers };
}

async function analyzeVideoWithGemini(videoUrl, originalUrl) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured');
  }

  const prompt = `Analyze this Instagram reel video for health claims and provide a fact-check assessment.

Original URL: ${originalUrl}
Video URL: ${videoUrl}

Please provide a comprehensive analysis in the following JSON format:

{
  "mainClaim": "The primary health claim made in the video (1-2 sentences)",
  "verdict": "Accurate|Misleading|False|Unverified",
  "explanation": "Detailed explanation of why this verdict was given (2-4 sentences)",
  "confidence": 0.85,
  "sources": [
    {
      "title": "Source title",
      "url": "https://source-url.com",
      "publisher": "WHO|CDC|NIH|etc"
    }
  ]
}

Guidelines:
- "Accurate": Claim is supported by credible scientific evidence
- "Misleading": Claim has some truth but is exaggerated or missing context
- "False": Claim contradicts established scientific evidence
- "Unverified": Insufficient evidence to determine accuracy

Focus on health, medical, and wellness claims. Provide 2-4 credible sources (WHO, CDC, NIH, peer-reviewed studies, etc.).`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from Gemini API');
  }

  const analysisText = data.candidates[0].content.parts[0].text;
  
  // Try to extract JSON from the response
  try {
    // Look for JSON in the response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('Failed to parse Gemini response as JSON:', analysisText);
    // Return a structured fallback
    return {
      mainClaim: "Unable to extract specific claim from video",
      verdict: "Unverified",
      explanation: "The AI analysis could not determine the specific health claims in this video. Please review manually.",
      confidence: 0.0,
      sources: []
    };
  }
}

app.post('/api/fetch-media', async (req, res) => {
  try {
    console.log('Received request body:', JSON.stringify(req.body));
    console.log('Request headers:', req.headers);
    
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      console.error('Invalid URL in request:', url);
      return res.status(400).json({ error: 'url is required' });
    }
    
    console.log('Processing URL:', url);
    const { downloadUrl, headers } = await runYtDlpGetUrl(url);
    console.log('Resolved downloadUrl:', downloadUrl);
    return res.json({ downloadUrl, headers });
  } catch (e) {
    console.error('Error in /api/fetch-media:', e);
    return res.status(422).json({ error: e.message || 'Failed to resolve media URL' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    console.log('Received analysis request:', JSON.stringify(req.body));
    
    const { videoUrl, originalUrl } = req.body || {};
    if (!videoUrl || !originalUrl) {
      return res.status(400).json({ error: 'videoUrl and originalUrl are required' });
    }
    
    console.log('Analyzing video with Gemini:', videoUrl);
    const analysis = await analyzeVideoWithGemini(videoUrl, originalUrl);
    console.log('Gemini analysis result:', analysis);
    
    return res.json(analysis);
  } catch (e) {
    console.error('Error in /api/analyze:', e);
    return res.status(422).json({ error: e.message || 'Failed to analyze video' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Media resolver server listening on http://localhost:${PORT}`);
  console.log(`Gemini API key configured: ${GOOGLE_API_KEY ? 'Yes' : 'No'}`);
});


