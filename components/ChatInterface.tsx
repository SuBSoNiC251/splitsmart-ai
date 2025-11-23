import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  className?: string;
  onClose?: () => void; // Optional: For mobile closing
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isProcessing, className, onClose }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  const handleMicClick = () => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Voice input is not supported in this browser. Please use Chrome or Safari.");
        return;
    }

    if (isListening) {
      return; 
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const handleSpeak = (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1;
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`flex flex-col h-full bg-white md:rounded-xl shadow-none md:shadow-lg border-0 md:border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-4">
        <div className="flex items-center gap-3">
             <div className="bg-indigo-50 p-2 rounded-full">
                 <span className="material-icons text-indigo-600">chat_bubble</span>
             </div>
            <div>
                <h2 className="text-lg font-bold text-slate-800 leading-none">Smart Assistant</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                Ask me to split costs or assign items
                </p>
            </div>
        </div>
        {onClose && (
            <button 
                onClick={onClose}
                className="md:hidden text-slate-500 hover:text-slate-700 bg-slate-100 p-2 rounded-full active:scale-95 transition-all"
                aria-label="Close chat"
            >
                <span className="material-icons">close</span>
            </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-10 text-sm px-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <span className="material-icons text-3xl text-slate-300">gesture</span>
            </div>
            <p>Start by assigning items to people.</p>
            <p className="mt-2 text-xs font-medium bg-white inline-block px-3 py-1 rounded-full shadow-sm border border-slate-100">Try: "Divide the nachos between Tom and Jerry"</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}
          >
            <div
              className={`max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm relative group transition-all ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
              }`}
            >
              {msg.text}
              
              {/* Speak Button (Only for Model) */}
              {msg.role === 'model' && (
                  <button 
                    onClick={() => handleSpeak(msg.text)}
                    className="absolute -right-9 top-1 text-slate-300 hover:text-indigo-500 p-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
                    title="Read aloud"
                  >
                      <span className="material-icons text-lg">volume_up</span>
                  </button>
              )}
            </div>
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-200 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isProcessing}
            className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center shrink-0 ${
              isListening 
                ? 'bg-red-50 text-red-600 animate-pulse border border-red-200' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
            title="Speak your command"
          >
            <span className="material-icons">{isListening ? 'mic' : 'mic_none'}</span>
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : "Message..."}
            disabled={isProcessing}
            className="flex-1 px-5 py-3 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-full outline-none text-slate-800 text-sm transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center shrink-0 active:scale-95"
          >
            <span className="material-icons text-xl">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;