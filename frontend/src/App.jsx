import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, ChefHat, MessageCircle, Menu, X } from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:5000/api';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  // Helper function for API calls
  const apiCall = async (url, options = {}) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };

  // Start voice recording
  const startListening = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      // Check for supported MIME types
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsListening(true);
      console.log('Started recording with MIME type:', mimeType);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Please allow microphone access to use voice features.');
    }
  };

  // Stop recording
  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
  };

  // Process recorded audio
  const processAudio = async (audioBlob) => {
    try {
      console.log('Processing audio blob, size:', audioBlob.size);
      
      if (audioBlob.size === 0) {
        throw new Error('No audio data recorded');
      }

      // Create FormData and send to backend
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await apiCall(`${API_BASE_URL}/process-voice`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      console.log('Server response:', result);

      if (result.success) {
        setTranscript(result.transcript);
        setResponse(result.response);

        // Update conversation
        setConversation(prev => [
          ...prev,
          { type: 'user', text: result.transcript },
          { type: 'ai', text: result.response }
        ]);

        // Play audio response if available
        if (result.audioUrl) {
          await playAudioFromUrl(result.audioUrl);
        } else {
          // Fallback: simulate audio playback
          console.log('No audio URL provided, simulating playback');
          setIsPlaying(true);
          setTimeout(() => setIsPlaying(false), 3000);
        }
      } else {
        throw new Error(result.error || 'Failed to process audio');
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      setError(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Play audio from URL (for Vapi AI response)
  const playAudioFromUrl = async (audioUrl) => {
    try {
      setIsPlaying(true);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
    }
  };

  // Handle audio playback events
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handleEnded = () => setIsPlaying(false);
      const handleError = () => {
        console.error('Audio playback error');
        setIsPlaying(false);
      };
      
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      
      return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };
    }
  }, []);

  // Test server connection on component mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        await apiCall(`${API_BASE_URL}/health`);
        console.log('Server connection successful');
      } catch (error) {
        console.error('Server connection failed:', error);
        setError('Cannot connect to server. Please make sure the backend is running.');
      }
    };

    testConnection();
  }, []);

  // Get button class based on state
  const getButtonClass = () => {
    if (isProcessing) return 'voice-button processing';
    if (isListening) return 'voice-button listening';
    return 'voice-button idle';
  };

  // Get status info
  const getStatusInfo = () => {
    if (error) return { text: error, className: 'status-text error' };
    if (isProcessing) return { text: 'Processing your request...', className: 'status-text processing' };
    if (isListening) return { text: 'Listening... Tap to stop', className: 'status-text listening' };
    return { text: 'Tap the microphone to start', className: 'status-text idle' };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-container">
          <div className="header-content">
            <div className="header-logo">
              <div className="header-icon-container">
                <ChefHat className="header-icon" />
                <div className="header-status-dot"></div>
              </div>
              <div>
                <h1 className="header-title">Rasoi</h1>
                <p className="header-subtitle">Your Voice Kitchen Assistant</p>
              </div>
            </div>
            
            {/* Mobile menu button */}
            <button
              className="mobile-menu-button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>

            {/* Desktop badge */}
            <div className="header-badge">
              <span className="header-badge-text">Voice Enabled</span>
              <div className="header-status-indicator"></div>
            </div>
          </div>

          {/* Mobile menu */}
          {isMobileMenuOpen && (
            <div className="mobile-menu">
              <div className="mobile-menu-content">
                <span className="header-badge-text">Voice Enabled</span>
                <div className="header-status-indicator"></div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="main-container">
        {/* Main Voice Interface */}
        <div className="voice-interface">
          <h2 className="voice-interface-title">
            Ask me anything about cooking!
          </h2>
          <p className="voice-interface-description">
            Tap the microphone and ask about recipes, cooking tips, ingredient substitutions, or any culinary questions
          </p>

          {/* Voice Control Button */}
          <div className="voice-button-container">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
              className={getButtonClass()}
            >
              {isProcessing ? (
                <div className="loading-spinner"></div>
              ) : isListening ? (
                <MicOff />
              ) : (
                <Mic />
              )}
            </button>
          </div>

          {/* Status Text */}
          <div className="status-container">
            <p className={statusInfo.className}>{statusInfo.text}</p>
            {isListening && (
              <div className="listening-dots">
                <div className="listening-dot"></div>
                <div className="listening-dot"></div>
                <div className="listening-dot"></div>
              </div>
            )}
          </div>

          {/* Audio Player */}
          <audio ref={audioRef} style={{ display: 'none' }} />
          
          {isPlaying && (
            <div className="playing-indicator">
              <Play />
              <span>Playing response...</span>
            </div>
          )}
        </div>

        {/* Conversation History */}
        {conversation.length > 0 && (
          <div className="conversation-container">
            <div className="conversation-header">
              <MessageCircle />
              <h3 className="conversation-title">Conversation</h3>
              <span className="conversation-counter">
                {Math.floor(conversation.length / 2)} exchanges
              </span>
            </div>
            
            <div className="conversation-content">
              <div className="conversation-messages">
                {conversation.map((message, index) => (
                  <div
                    key={index}
                    className={`message-container ${message.type} animate-fade-in-up`}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className={`message-bubble ${message.type}`}>
                      <p className="message-text">{message.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div className="features-grid">
          <div className="feature-card animate-fade-in-up" style={{ animationDelay: '0ms' }}>
            <div className="feature-icon-container purple">
              <ChefHat className="feature-icon purple" />
            </div>
            <h3 className="feature-title">Recipe Assistance</h3>
            <p className="feature-description">
              Get step-by-step cooking instructions and detailed recipes for any dish
            </p>
          </div>
          
          <div className="feature-card animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="feature-icon-container violet">
              <MessageCircle className="feature-icon violet" />
            </div>
            <h3 className="feature-title">Cooking Tips</h3>
            <p className="feature-description">
              Learn professional techniques and time-saving shortcuts from expert chefs
            </p>
          </div>
          
          <div className="feature-card animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            <div className="feature-icon-container plump">
              <Mic className="feature-icon plump" />
            </div>
            <h3 className="feature-title">Voice Control</h3>
            <p className="feature-description">
              Hands-free kitchen assistance while you cook - no need to touch your device
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <div className="footer-container">
            <h3 className="footer-title">Ready to Cook?</h3>
            <p className="footer-description">
              Start by asking about your favorite dish or cooking challenge
            </p>
            <div className="footer-tags">
              <span className="footer-tag">Pasta recipes</span>
              <span className="footer-tag">Baking tips</span>
              <span className="footer-tag">Spice combinations</span>
              <span className="footer-tag">Quick meals</span>
              <span className="footer-tag">Healthy options</span>
              <span className="footer-tag">Desserts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;