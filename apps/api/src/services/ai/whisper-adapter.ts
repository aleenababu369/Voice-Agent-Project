/**
 * Pluggable server-side ASR via a local Whisper server (OpenAI-compatible /v1/audio/transcriptions).
 *
 * The browser's built-in Web Speech recognizer is mediocre for Indian-accented and multilingual speech.
 * When WHISPER_BASE_URL + WHISPER_MODEL are configured, the softphone records audio and posts it here, and
 * we proxy it to the Whisper server for a far more accurate transcript. Unconfigured -> the softphone falls
 * back to the browser recognizer, so this is fully opt-in and zero-cost/offline-friendly.
 *
 * Recommended local server (OpenAI-compatible, Docker): speaches (ghcr.io/speaches-ai/speaches).
 */

interface WhisperConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

function config(): WhisperConfig | null {
  const baseUrl = process.env.WHISPER_BASE_URL;
  const model = process.env.WHISPER_MODEL;
  if (!baseUrl || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    apiKey: process.env.WHISPER_API_KEY ?? "",
    timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS ?? 15000)
  };
}

export function isWhisperConfigured(): boolean {
  return config() !== null;
}

export interface AsrTranscription {
  text: string;
  confidence: number;
  /** Language Whisper auto-detected for this clip (BCP-47-ish, e.g. "en", "ml"). */
  detectedLanguage?: string;
}

function extForMime(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * Transcribe a recorded audio clip via the configured Whisper server. Returns null when unconfigured or on error.
 *
 * The language param is treated as a HINT only when forcing is enabled (WHISPER_FORCE_LANGUAGE=true). By default we
 * let Whisper AUTO-DETECT the language so the caller can speak Hindi/Tamil/Malayalam/etc. and get back native-script
 * text — the backend's conservative policy then decides whether to switch the call's language.
 */
export async function transcribeAudio(audio: Buffer, mimeType: string, language?: string): Promise<AsrTranscription | null> {
  const cfg = config();
  if (!cfg || audio.length === 0) return null;
  const forceLanguage = process.env.WHISPER_FORCE_LANGUAGE === "true";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const type = mimeType || "audio/webm";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type }), `audio.${extForMime(type)}`);
    form.append("model", cfg.model);
    if (forceLanguage && language) form.append("language", language.slice(0, 2)); // "en-IN" -> "en"
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    const response = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
      body: form,
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { text?: string; language?: string; segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }> };
    const text = (data.text ?? "").trim();
    if (!text) return null;
    // Derive a rough 0..1 confidence from Whisper's per-segment log-probabilities (closer to 0 = more confident).
    const segments = data.segments ?? [];
    let confidence = 0.9;
    if (segments.length > 0) {
      const avgLogprob = segments.reduce((sum, seg) => sum + (typeof seg.avg_logprob === "number" ? seg.avg_logprob : -0.3), 0) / segments.length;
      const noSpeech = segments.reduce((sum, seg) => sum + (typeof seg.no_speech_prob === "number" ? seg.no_speech_prob : 0), 0) / segments.length;
      confidence = Math.max(0.1, Math.min(1, Math.exp(avgLogprob) * (1 - Math.min(0.9, noSpeech))));
    }
    return { text, confidence, ...(data.language ? { detectedLanguage: data.language } : {}) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
