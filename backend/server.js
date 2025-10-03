const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Speech-to-Text using OpenAI Whisper API
async function transcribeAudio(audioBuffer, filename) {
  try {
    // Create form data for OpenAI Whisper API
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: filename,
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // You can make this dynamic

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      }
    });

    return response.data.text;
  } catch (error) {
    console.error('Transcription error:', error.response?.data || error.message);
    throw new Error('Failed to transcribe audio');
  }
}

// Generate cooking response using OpenAI
async function generateCookingResponse(userQuery) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `We are Rasoi, a helpful kitchen assistant AI. You specialize in cooking, recipes, ingredient substitutions, cooking techniques, and culinary advice. 
          Provide clear, practical, and helpful responses about cooking. Keep responses conversational but informative. 
          If asked about non-cooking topics, politely redirect to cooking-related assistance.`
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI response error:', error.response?.data || error.message);
    throw new Error('Failed to generate response');
  }
}

// VAPI AI Integration - Text-to-Speech
async function generateVapiSpeech(text) {
  try {
    const response = await axios.post('https://api.vapi.ai/call', {
      assistant: {
        voice: {
          provider: "eleven-labs", // or your preferred provider
          voiceId: "your-voice-id"
        }
      },
      message: text
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      audioUrl: response.data.audioUrl // Adjust based on Vapi's response format
    };
  } catch (error) {
    console.error('Vapi AI error:', error.response?.data || error.message);
    throw new Error('Failed to generate speech with Vapi AI');
  }
}

// Main endpoint to process voice input
app.post('/api/process-voice', upload.single('audio'), async (req, res) => {
  try {
    console.log('Received voice processing request');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioBuffer = req.file.buffer;
    const filename = `audio_${Date.now()}.webm`;
    
    console.log(`Processing audio file: ${filename}, size: ${audioBuffer.length} bytes`);

    // Step 1: Transcribe audio to text using OpenAI Whisper
    console.log('Transcribing audio...');
    const transcript = await transcribeAudio(audioBuffer, filename);
    console.log('Transcription result:', transcript);

    // Step 2: Generate cooking response using OpenAI
    console.log('Generating cooking response...');
    const cookingResponse = await generateCookingResponse(transcript);
    console.log('Cooking response generated');

    // Step 3: Convert response to speech using Vapi AI (placeholder)
    console.log('Generating speech with Vapi AI...');
    const speechResult = await generateVapiSpeech(cookingResponse);
    console.log('Speech generation result:', speechResult);

    // Return the complete response
    res.json({
      success: true,
      transcript: transcript,
      response: cookingResponse,
      audioUrl: speechResult.audioUrl || null, // Will be null until Vapi is configured
      vapiReady: speechResult.success
    });

  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({ 
      error: 'Failed to process voice input',
      details: error.message 
    });
  }
});

// Endpoint for text-only queries (optional)
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    console.log('Processing text query:', message);

    // Generate cooking response
    const cookingResponse = await generateCookingResponse(message);

    // Generate speech response using Vapi AI
    const speechResult = await generateVapiSpeech(cookingResponse);

    res.json({
      success: true,
      response: cookingResponse,
      audioUrl: speechResult.audioUrl || null,
      vapiReady: speechResult.success
    });

  } catch (error) {
    console.error('Error processing chat:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: error.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  
  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not found in environment variables');
  }
  if (!process.env.VAPI_API_KEY) {
    console.warn('⚠️  VAPI_API_KEY not found in environment variables');
  }
});