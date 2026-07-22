export type CareVoiceState = "idle" | "listening" | "processing" | "speaking" | "unsupported";

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{ 0: { transcript: string; confidence: number }; isFinal: boolean }>;
};

type SpeechRecognitionErrorEventLike = Event & { error: string; message?: string };

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as SpeechWindow;
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition || null;
}

export function canRecognizeSpeech(): boolean {
  return Boolean(recognitionConstructor());
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function installedCareVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const label = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  let score = 0;
  if (/samantha|ava|zoe|allison|serena|siri/.test(label)) score += 70;
  if (/enhanced|premium|natural|neural/.test(label)) score += 55;
  if (/google us english|microsoft aria|microsoft jenny/.test(label)) score += 45;
  if (/en-us/i.test(voice.lang)) score += 25;
  if (voice.localService) score += 8;
  if (voice.default) score += 4;
  return score;
}

export function bestCareVoice(preferredName = ""): SpeechSynthesisVoice | null {
  const voices = installedCareVoices();
  if (!voices.length) return null;
  const preferred = preferredName
    ? voices.find((voice) => voice.name === preferredName || voice.voiceURI === preferredName)
    : null;
  return preferred || [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}

export function speakCareReply(text: string, preferredName = "", onEnd?: () => void): () => void {
  if (!canSpeak() || !text.trim()) {
    onEnd?.();
    return () => undefined;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/\n+/g, ". "));
  const voice = bestCareVoice(preferredName);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = 0.96;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}

export function startCareListening(options: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): (() => void) | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript || "";
      if (result?.isFinal) final += transcript;
      else interim += transcript;
    }
    if (interim.trim()) options.onInterim(interim.trim());
    if (final.trim()) options.onFinal(final.trim());
  };
  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      "not-allowed": "Microphone permission is off. Allow it in the browser address bar, then try again.",
      "audio-capture": "No microphone was available.",
      "no-speech": "I did not hear anything. Try again when you are ready.",
      network: "Speech recognition could not connect. You can type the same request.",
    };
    options.onError(messages[event.error] || event.message || "Voice input stopped unexpectedly.");
  };
  recognition.onend = options.onEnd;
  recognition.start();
  return () => {
    try {
      recognition.stop();
    } catch {
      recognition.abort();
    }
  };
}
