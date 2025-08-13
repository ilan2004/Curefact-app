/* Simple Express server to resolve direct media URL for Instagram Reels using yt-dlp */
require('dotenv').config();
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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
// Use v1 for gemini-2.x models; fallback to v1beta for older models
const GEMINI_API_VERSION = GEMINI_MODEL.startsWith('gemini-2') ? 'v1' : 'v1beta';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';
const FILES_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

async function analyzeVideoWithGemini(videoUrl, originalUrl, cdnHeaders = {}) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured');
  }

  const prompt = `You are analyzing short-form social media video content.

Context:
- Original URL: ${originalUrl}
- Direct Media URL: ${videoUrl}

Task:
1) First, understand what the video says and summarize its content clearly (key topics, statements, notable mentions).
2) If the content contains explicit health-related claims (about treatments, cures, disease prevention, nutrition effects, etc.), perform a concise fact check.
3) If there are no explicit health claims, return an informative content summary and mark verdict as "Unverified".

Output strictly in this JSON format (no extra text):
{
  "mainClaim": "If a health claim exists, state it concisely. If not, provide a 1-2 sentence content summary.",
  "verdict": "Accurate|Misleading|False|Unverified",
  "explanation": "If claim exists, give a brief rationale and context. If not, provide a clear 2-4 sentence content summary of the video.",
  "confidence": 0.85,
  "sources": [
    {
      "title": "Source title",
      "url": "https://source-url.com",
      "publisher": "WHO|CDC|NIH|etc"
    }
  ]
}

Notes:
- Only include sources if you made a health-claim assessment. If no claim, return an empty sources array.
- Keep the output JSON-valid and minimal. Do not include Markdown or commentary outside the JSON.`;

  // Attempt to download and upload the media so Gemini can access it
  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const localPath = path.join(tmpDir, `video_${Date.now()}.mp4`);

  let uploadedFileName = null;
  let uploadedFileUri = null;
  let usedFileMime = 'video/mp4';
  try {
    console.log('Downloading media for Gemini upload:', videoUrl);
    // Ensure critical headers for Instagram/CDN requests
    const dlHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://www.instagram.com/',
      ...cdnHeaders,
    };
    const mediaResp = await fetch(videoUrl, { method: 'GET', headers: dlHeaders });
    if (!mediaResp.ok) throw new Error(`Failed to download media: ${mediaResp.status}`);
    // In Node.js fetch, body is a Web ReadableStream; use arrayBuffer instead of pipe
    const arr = await mediaResp.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(arr));

    // Upload to Gemini Files API
    const stats = fs.statSync(localPath);
    console.log(`Uploading to Gemini Files API (${(stats.size/1024/1024).toFixed(2)} MB)...`);
    // Use the upload endpoint with uploadType=media
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GOOGLE_API_KEY}&uploadType=media`;
    const uploadBody = fs.readFileSync(localPath);
    let uploadResp;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        uploadResp = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'video/mp4',
            'x-goog-upload-file-name': path.basename(localPath),
            'x-goog-upload-protocol': 'raw',
          },
          body: uploadBody,
        });
        break;
      } catch (e) {
        console.warn(`Upload fetch failed (attempt ${attempt}):`, e.message);
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!uploadResp.ok) {
      const t = await uploadResp.text().catch(() => '');
      throw new Error(`Gemini upload failed: ${uploadResp.status} ${t}`);
    }
    const uploadJson = await uploadResp.json();
    uploadedFileName = uploadJson.name || (uploadJson.file && uploadJson.file.name) || null;
    uploadedFileUri = uploadJson.uri || (uploadJson.file && uploadJson.file.uri) || null;
    if (!uploadedFileName) throw new Error('Upload response missing file name');
    console.log('Uploaded file name:', uploadedFileName);
    if (uploadedFileUri) console.log('Uploaded file uri:', uploadedFileUri);

    // Poll until ACTIVE
    const resourcePath = uploadedFileName.startsWith('files/') ? uploadedFileName : `files/${uploadedFileName}`;
    const fileGetUrl = `${FILES_API_BASE}/${resourcePath}?key=${GOOGLE_API_KEY}`;
    const start = Date.now();
    while (Date.now() - start < 60000) { // up to 60s
      await new Promise(r => setTimeout(r, 1500));
      const stResp = await fetch(fileGetUrl);
      if (!stResp.ok) break;
      const st = await stResp.json();
      const state = st.state || (st.file && st.file.state);
      if (state === 'ACTIVE') {
        console.log('Gemini file is ACTIVE');
        break;
      }
    }
  } catch (e) {
    console.warn('Video upload flow failed, will fall back to URL-only prompt:', e.message);
  } finally {
    // Cleanup local temp file
    try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
  }

  // Build request body. Prefer file reference when available using correct schema.
  const parts = [];
  if (uploadedFileName) {
    const fallbackNameUri = uploadedFileName.startsWith('files/') ? uploadedFileName : `files/${uploadedFileName}`;
    const fileUri = uploadedFileUri || fallbackNameUri;
    parts.push({ file_data: { file_uri: fileUri, mime_type: usedFileMime } });
  }
  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  };

  // Helper to call a specific model and API version
  const callModel = async (model) => {
    const version = model.startsWith('gemini-2') ? 'v1' : 'v1beta';
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    return { resp, version, model };
  };

  let response, usedVersion, usedModel;
  if (uploadedFileName && GEMINI_FALLBACK_MODEL) {
    // Prefer the v1beta-capable model when sending file_data
    const fb = await callModel(GEMINI_FALLBACK_MODEL);
    response = fb.resp;
    usedVersion = fb.version;
    usedModel = fb.model;
    if (!response.ok && response.status >= 400 && response.status < 500) {
      const fbErr = await response.text().catch(() => '');
      console.warn(`File-based analyze failed on fallback model (${GEMINI_FALLBACK_MODEL}, api ${fb.version}) -> ${response.status}: ${fbErr}`);
      const pri = await callModel(GEMINI_MODEL);
      response = pri.resp;
      usedVersion = pri.version;
      usedModel = pri.model;
    }
  } else {
    // Try primary model first (no file)
    const pri = await callModel(GEMINI_MODEL);
    response = pri.resp;
    usedVersion = pri.version;
    usedModel = pri.model;
    if (!response.ok && response.status >= 400 && response.status < 500 && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
      const primaryErr = await response.text().catch(() => '');
      console.warn(`Primary model failed (${GEMINI_MODEL}, api ${GEMINI_API_VERSION}) -> ${response.status}: ${primaryErr}`);
      const fb = await callModel(GEMINI_FALLBACK_MODEL);
      response = fb.resp;
      usedVersion = fb.version;
      usedModel = fb.model;
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Gemini API non-OK response (after fallback if any):', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from Gemini API');
  }

  // Safely extract the model text
  let analysisText = '';
  try {
    const cand = data.candidates && data.candidates[0];
    const content = cand && cand.content;
    const parts = content && content.parts;
    if (Array.isArray(parts)) {
      const textPart = parts.find(p => typeof p.text === 'string');
      if (textPart && typeof textPart.text === 'string') {
        analysisText = textPart.text;
      }
    }
  } catch {}
  if (!analysisText || typeof analysisText !== 'string') {
    console.error('Gemini response missing text content. Raw payload:', JSON.stringify(data).slice(0, 2000));
    throw new Error('Gemini response missing text content');
  }
  console.log(`Gemini success using model ${usedModel} (api ${usedVersion})`);
  
  // Try to extract JSON from the response
  try {
    // Clean common formatting like Markdown fences
    const cleaned = analysisText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // Look for JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);
    // Attach model info
    return { ...parsed, modelUsed: usedModel, apiVersionUsed: usedVersion };
  } catch (parseError) {
    console.error('Failed to parse Gemini response as JSON:', analysisText);
    // Synthesize a useful content summary instead of a hard failure
    const cleaned = analysisText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    // Take first 2-3 sentences for explanation
    const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
    const mainClaimOrSummary = cleaned.split(/(?<=[.!?])\s+/).slice(0, 1).join(' ');

    return {
      mainClaim: mainClaimOrSummary || 'Video content summary unavailable',
      verdict: 'Unverified',
      explanation: sentences || 'The AI provided a content summary but no explicit health claims were identified.',
      confidence: 0.0,
      sources: [],
      modelUsed: usedModel,
      apiVersionUsed: usedVersion,
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
    
    // Re-resolve URL and headers using yt-dlp to ensure correct CDN headers
    let resolvedUrl = videoUrl;
    let resolvedHeaders = {};
    try {
      const resolved = await runYtDlpGetUrl(originalUrl);
      resolvedUrl = resolved.downloadUrl || videoUrl;
      resolvedHeaders = resolved.headers || {};
      console.log('Re-resolved for analysis. URL:', resolvedUrl);
    } catch (e) {
      console.warn('Re-resolve via yt-dlp failed, using provided videoUrl:', e.message);
    }

    console.log('Analyzing video with Gemini:', resolvedUrl);
    const analysis = await analyzeVideoWithGemini(resolvedUrl, originalUrl, resolvedHeaders);
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
  console.log(`Gemini model: ${GEMINI_MODEL} (api ${GEMINI_API_VERSION})`);
});
