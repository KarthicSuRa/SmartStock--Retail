// /src/components/count/VoiceCountInput.tsx

'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  knownSkus: Array<{ sku: string; description: string; keywords: string[] }>;
  onCount: (sku: string, qty: number, method: 'voice') => void;
}

export function VoiceCountInput({ knownSkus, onCount }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<{ sku: string; description: string; qty: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice recognition not supported on this browser/device');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setParsed(null);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(finalTranscript);
        handleParse(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      setError(`Voice error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [knownSkus]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleParse = (text: string) => {
    const normalized = text.toLowerCase().replace(/[.,]/g, '');
    const words = normalized.split(' ');

    let qty = 1;
    for (let i = words.length - 1; i >= 0; i--) {
      const num = parseInt(words[i], 10);
      if (!isNaN(num) && num > 0 && num < 10000) {
        qty = num;
        break;
      }
    }

    let bestMatch: any = null;
    let bestScore = 0;

    for (const item of knownSkus) {
      const itemWords = item.description.toLowerCase().split(' ');
      const matchCount = itemWords.filter((w: string) => words.includes(w)).length;
      const keywordMatch = (item.keywords || []).filter((k: string) => words.includes(k.toLowerCase())).length;
      const score = matchCount + (keywordMatch * 2);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && bestScore >= 1) {
      setParsed({
        sku: bestMatch.sku,
        description: bestMatch.description,
        qty,
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    } else {
      setError(`Could not match "${text}" to any item. Speak description + quantity.`);
    }
  };

  const confirmCount = () => {
    if (parsed) {
      onCount(parsed.sku, parsed.qty, 'voice');
      setParsed(null);
      setTranscript('');
    }
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 border rounded-2xl">
      <div className="flex items-center justify-center">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            isListening 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200' 
              : 'bg-slate-900 text-white shadow-md'
          }`}
        >
          {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">
        {isListening ? 'Listening... Say: "Coca Cola 330ml 24"' : 'Tap microphone to count by voice'}
      </p>

      {transcript && !parsed && !error && (
        <div className="text-center text-sm text-slate-600 font-medium italic">"{transcript}"</div>
      )}

      {parsed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-5 h-5" />
            <span className="font-bold">Voice Match Confirmed</span>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-mono">SKU: {parsed.sku}</p>
            <p className="font-semibold text-slate-900 text-sm">{parsed.description}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{parsed.qty} units</p>
          </div>
          <div className="flex gap-2">
            <button onClick={confirmCount} className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm">
              Confirm Count
            </button>
            <button onClick={() => { setParsed(null); setTranscript(''); }} className="py-2 px-4 border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold rounded-lg text-sm">
              Retry
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
