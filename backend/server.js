const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 5000;

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // Vite preview
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// ── Gemini: transcribe audio ────────────────────────────────────
// Gemini 1.5 Flash can understand audio inline via base64
async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const audioPart = {
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType,
      },
    };
    const result = await model.generateContent([
      audioPart,
      'Transcribe this audio exactly as spoken. Return only the transcription text, nothing else.',
    ]);
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini transcription error:', error.message);
    throw new Error('Failed to transcribe audio');
  }
}

// ── Gemini: generate cooking response ──────────────────────────
async function generateCookingResponse(userQuery) {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are Rasoi, a knowledgeable and friendly AI kitchen assistant.
You specialise in cooking, recipes, ingredient substitutions, cooking techniques, and culinary advice.
Keep responses conversational, practical, and informative. Use helpful formatting (bullet points, steps) where it adds clarity.
If asked about unrelated topics, politely redirect to cooking assistance.`,
    });

    const result = await model.generateContent(userQuery);
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini chat error:', error.message);
    throw new Error('Failed to generate response');
  }
}

// ── Vapi AI: Text-to-Speech (unchanged, optional) ──────────────
async function generateVapiSpeech(text) {
  if (!process.env.VAPI_API_KEY) {
    return { success: false, audioUrl: null };
  }
  try {
    const response = await axios.post('https://api.vapi.ai/call', {
      assistant: {
        voice: { provider: 'eleven-labs', voiceId: 'your-voice-id' },
      },
      message: text,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    return { success: true, audioUrl: response.data.audioUrl || null };
  } catch (error) {
    console.error('Vapi AI error:', error.response?.data || error.message);
    return { success: false, audioUrl: null };
  }
}

// ── Route: process voice ────────────────────────────────────────
app.post('/api/process-voice', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioBuffer = req.file.buffer;
    // Detect MIME from original upload (fallback to webm)
    const mimeType = req.file.mimetype || 'audio/webm';
    console.log(`Processing audio: ${audioBuffer.length} bytes (${mimeType})`);

    // Step 1: Transcribe
    console.log('Transcribing with Gemini…');
    const transcript = await transcribeAudio(audioBuffer, mimeType);
    console.log('Transcript:', transcript);

    // Step 2: Generate response
    console.log('Generating cooking response with Gemini…');
    const cookingResponse = await generateCookingResponse(transcript);

    // Step 3: Optional TTS
    const speechResult = await generateVapiSpeech(cookingResponse);

    res.json({
      success: true,
      transcript,
      response: cookingResponse,
      audioUrl: speechResult.audioUrl || null,
      vapiReady: speechResult.success,
    });
  } catch (error) {
    console.error('Error processing voice:', error.message);
    res.status(500).json({ error: 'Failed to process voice input', details: error.message });
  }
});

// ── Route: text chat ────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'No message provided' });

    console.log('Chat query:', message);
    const cookingResponse = await generateCookingResponse(message);
    const speechResult = await generateVapiSpeech(cookingResponse);

    res.json({
      success: true,
      response: cookingResponse,
      audioUrl: speechResult.audioUrl || null,
      vapiReady: speechResult.success,
    });
  } catch (error) {
    console.error('Error processing chat:', error.message);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

// ── Global error handler ────────────────────────────────────────
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not set in .env');
  }
  if (!process.env.VAPI_API_KEY) {
    console.warn('ℹ️  VAPI_API_KEY not set — TTS disabled');
  }
});