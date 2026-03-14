import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, MicOff, Send, Trash2, MessageSquare,
  ChefHat, Play, AlertCircle, Sparkles
} from 'lucide-react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ── Static Data ────────────────────────────────────────────────
const SUGGESTIONS = [
  { emoji: '🍛', text: 'How do I make chicken biryani?' },
  { emoji: '🥚', text: 'Substitute eggs in baking?' },
  { emoji: '🧄', text: 'What pairs well with garlic?' },
  { emoji: '🍝', text: 'Perfect al-dente pasta tips?' },
  { emoji: '🔥', text: 'How to season a cast iron pan?' },
  { emoji: '🥗', text: 'Quick healthy weeknight meals?' },
];

const RECIPES = [
  { emoji: '🍛', name: 'Butter Chicken', time: '45 min', diff: 'Medium' },
  { emoji: '🍕', name: 'Margherita Pizza', time: '30 min', diff: 'Easy' },
  { emoji: '🍜', name: 'Ramen from Scratch', time: '3 hrs', diff: 'Hard' },
  { emoji: '🥘', name: 'Dal Tadka', time: '40 min', diff: 'Easy' },
  { emoji: '🫔', name: 'Street Tacos', time: '25 min', diff: 'Easy' },
  { emoji: '🎂', name: 'Chocolate Cake', time: '1.5 hrs', diff: 'Medium' },
];

// ── Helpers ────────────────────────────────────────────────────
const formatTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Component ──────────────────────────────────────────────────
function App() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isProcessing]);

  // Test backend on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then(r => { if (!r.ok) throw new Error(); })
      .catch(() => setError('Cannot connect to server. Make sure the backend is running.'));
  }, []);

  // Audio playback events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => setIsPlaying(false);
    const onErr = () => setIsPlaying(false);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    return () => {
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [textInput]);

  // ── API helpers ──────────────────────────────────────────────
  const addMessages = (userText, aiText) => {
    const ts = formatTime();
    setConversation(prev => [
      ...prev,
      { type: 'user', text: userText, time: ts },
      { type: 'ai', text: aiText, time: ts },
    ]);
  };

  const sendTextMessage = useCallback(async (msg) => {
    if (!msg.trim() || isProcessing) return;
    setError('');
    setIsProcessing(true);
    setTextInput('');
    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        addMessages(msg.trim(), data.response);
        if (data.audioUrl) {
          setIsPlaying(true);
          audioRef.current.src = data.audioUrl;
          audioRef.current.play().catch(() => setIsPlaying(false));
        }
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  // ── Voice recording ──────────────────────────────────────────
  const startListening = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/wav';
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach(t => t.stop());
        await processAudio(blob);
      };
      recorder.start(500);
      setIsListening(true);
    } catch {
      setError('Microphone access denied. Please allow microphone permissions.');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (blob) => {
    try {
      if (blob.size === 0) throw new Error('No audio data recorded');
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      const res = await fetch(`${API_BASE_URL}/process-voice`, { method: 'POST', body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        addMessages(data.transcript, data.response);
        if (data.audioUrl) {
          setIsPlaying(true);
          audioRef.current.src = data.audioUrl;
          audioRef.current.play().catch(() => setIsPlaying(false));
        }
      } else throw new Error(data.error);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── UI helpers ───────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(textInput);
    }
  };

  const handleSuggestion = (text) => {
    sendTextMessage(text);
  };

  const handleRecipeClick = (recipe) => {
    sendTextMessage(`Tell me how to make ${recipe.name}`);
  };

  const clearConversation = () => {
    setConversation([]);
    setError('');
  };

  const voiceBtnClass = isProcessing ? 'processing' : isListening ? 'listening' : 'idle';

  // ══════════════════════════════════════════════════════════════
  return (
    <div className="app-root">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-icon-wrap">
              <ChefHat />
              <span className="brand-dot" />
            </div>
            <div>
              <div className="brand-name">Rasoi</div>
              <div className="brand-tagline">AI Kitchen Assistant</div>
            </div>
          </div>
          <div className="header-status">
            <span className="status-dot" />
            AI Online
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          {/* Quick Suggestions */}
          <div className="sidebar-card" style={{ animationDelay: '0.1s' }}>
            <div className="sidebar-card-title">✨ Quick Ask</div>
            <div className="suggestions-list">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => handleSuggestion(s.text)}
                  disabled={isProcessing}
                >
                  <span className="chip-emoji">{s.emoji}</span>
                  {s.text}
                </button>
              ))}
            </div>
          </div>

          {/* Recipe Quick Links */}
          <div className="sidebar-card" style={{ animationDelay: '0.2s' }}>
            <div className="sidebar-card-title">🍽️ Popular Recipes</div>
            <div className="recipe-cards-list">
              {RECIPES.slice(0, 4).map((r, i) => (
                <div key={i} className="recipe-mini-card" onClick={() => handleRecipeClick(r)}>
                  <span className="recipe-emoji">{r.emoji}</span>
                  <div className="recipe-info">
                    <div className="recipe-name">{r.name}</div>
                    <div className="recipe-meta">{r.time} · {r.diff}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="content-area">

          {/* Voice + Text Input Card */}
          <div className="assistant-card">
            <h1 className="assistant-title">Ask me anything about cooking</h1>
            <p className="assistant-subtitle">
              Use your voice or type — I'm here to help in the kitchen
            </p>

            {/* Voice Button */}
            <div className="voice-btn-wrap">
              <button
                className={`voice-btn ${voiceBtnClass}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isProcessing}
                title={isListening ? 'Stop recording' : 'Start voice input'}
              >
                {isProcessing
                  ? <div className="spinner" />
                  : isListening
                    ? <MicOff />
                    : <Mic />
                }
                {isListening && <span className="voice-btn-ring" />}
              </button>

              <div>
                <p className={`voice-status ${isProcessing ? 'processing' : isListening ? 'listening' : 'idle'}`}>
                  {isProcessing
                    ? 'Processing…'
                    : isListening
                      ? 'Listening — tap to stop'
                      : 'Tap mic to speak'}
                </p>
                {isListening && (
                  <div className="listen-dots">
                    <span className="listen-dot" />
                    <span className="listen-dot" />
                    <span className="listen-dot" />
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="or-divider">or type a message</div>

            {/* Text input */}
            <div className="chat-input-row">
              <textarea
                ref={textareaRef}
                className="chat-input"
                placeholder="Ask anything about cooking, recipes, ingredients…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing || isListening}
                rows={1}
              />
              <button
                className="send-btn"
                onClick={() => sendTextMessage(textInput)}
                disabled={!textInput.trim() || isProcessing || isListening}
                title="Send"
              >
                <Send />
              </button>
            </div>
          </div>

          {/* Recipe Inspiration Cards */}
          <div className="recipe-section">
            <div className="section-title">🍳 Recipe Inspiration</div>
            <div className="recipe-scroll">
              {RECIPES.map((r, i) => (
                <div key={i} className="recipe-card" onClick={() => handleRecipeClick(r)}>
                  <div className="recipe-card-emoji">{r.emoji}</div>
                  <div className="recipe-card-name">{r.name}</div>
                  <div className="recipe-card-meta">{r.time} · {r.diff}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Conversation Panel */}
          {(conversation.length > 0 || isProcessing || error) && (
            <div className="conversation-panel">
              <div className="conv-header">
                <div className="conv-header-left">
                  <MessageSquare />
                  <span className="conv-title">Conversation</span>
                  {conversation.length > 0 && (
                    <span className="conv-count">{Math.ceil(conversation.length / 2)}</span>
                  )}
                </div>
                <button className="clear-btn" onClick={clearConversation} title="Clear chat">
                  <Trash2 /> Clear
                </button>
              </div>

              {/* Error banner */}
              {error && (
                <div className="error-banner">
                  <AlertCircle />
                  {error}
                </div>
              )}

              {/* Playing indicator */}
              {isPlaying && (
                <div className="playing-bar">
                  <Play /> Playing response…
                </div>
              )}

              <div className="conv-messages">
                {conversation.length === 0 && !isProcessing ? (
                  <div className="empty-state">
                    <span className="empty-icon">💬</span>
                    <span className="empty-text">Your conversation will appear here</span>
                  </div>
                ) : (
                  conversation.map((msg, i) => (
                    <div key={i} className={`msg-row ${msg.type}`}>
                      <div className={`msg-avatar ${msg.type === 'user' ? 'user-av' : 'ai-av'}`}>
                        {msg.type === 'user' ? '👤' : '🤖'}
                      </div>
                      <div className="msg-bubble-wrap">
                        <div className={`msg-bubble ${msg.type}`}>{msg.text}</div>
                        <span className="msg-time">{msg.time}</span>
                      </div>
                    </div>
                  ))
                )}

                {/* Typing indicator */}
                {isProcessing && !isListening && (
                  <div className="msg-row ai typing-indicator">
                    <div className="msg-avatar ai-av">🤖</div>
                    <div className="typing-dots">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

        </div>
      </main>

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
