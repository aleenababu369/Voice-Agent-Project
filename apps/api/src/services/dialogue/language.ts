/**
 * In-call language identification. The agent starts in one language, but the caller may answer in
 * another; we detect that from their utterance and switch the whole call (agent replies, TTS, and the
 * browser recognizer) to the caller's language — restricted to the languages the agent supports.
 *
 * Three signals, in order of reliability:
 *   1. Native script (Unicode block) — definitive, e.g. Malayalam text typed or recognized in ml-IN.
 *   2. The LLM's own language judgment — handles romanized/Latin transliteration the recognizer emits.
 *   3. A romanized keyword heuristic — a zero-cost backstop for the rule-engine fallback.
 */

import type { LanguageCode } from "../../../../../packages/contracts/src/index.ts";

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "kn-IN": "Kannada",
  "ta-IN": "Tamil",
  "ml-IN": "Malayalam"
};

interface ScriptRange {
  code: LanguageCode;
  pattern: RegExp;
}

// Unicode blocks for the Indic scripts we support.
const SCRIPTS: ScriptRange[] = [
  { code: "ml-IN", pattern: /[ഀ-ൿ]/g },
  { code: "ta-IN", pattern: /[஀-௿]/g },
  { code: "kn-IN", pattern: /[ಀ-೿]/g },
  { code: "hi-IN", pattern: /[ऀ-ॿ]/g }
];

// Distinctive romanized (Latin-script) words per language. Kept conservative to avoid switching on English.
const ROMAN_KEYWORDS: Array<{ code: LanguageCode; pattern: RegExp }> = [
  { code: "ml-IN", pattern: /\b(njan|ente|enikku|enikk|aanu|veno|venam|undu|cheyy|sheri|pere|peru|alla|samsarikk|samsarikkamo|samsarichu|samsarikkan|parayamo|parayo|parayoo|paranju|parayuka|malayalathil|malayalath|engane|enthu|ningal|ningalkku|athu|avar|ivide|evide|ariyamo|ariyilla|mathi|pore|kollam|adipoli|aaranu|enthanu|onnu|randu|orennam|vendaam|pinne|eppol|ini|angane|ingane|evideyanu)\b/gi },
  { code: "hi-IN", pattern: /\b(mera|naam|hai|kya|nahi|nahin|haan|chahiye|mujhe|hoon|aap|kaise|theek|boliye|bataiye|batao|samajh|samjha|suniye|suno|accha|bilkul|zaroor|dhanyavaad|shukriya|namaste|ji|sahab|madam|dijiye|karo|kariye|hindime|hindi\s?me|hindi\s?mein)\b/gi },
  { code: "kn-IN", pattern: /\b(nanna|hesaru|beku|beda|maadi|hege|illa|namaskara|chennagide|kannadalli|kannadada|helthini|heli|heliri|barthini|gottu|gottilla|haudi|swalpa|yenu|yelli|yaaru|idu|adu|naanu|neevu|aaguttha|hogi|banni)\b/gi },
  { code: "ta-IN", pattern: /\b(enaku|enakku|peyar|illai|venum|irukku|epdi|enna|nandri|seri|sollunga|sollungo|sollu|pesunga|pesu|puriyala|puriyuthu|tamilile|tamilil|tamilla|vanakkam|naan|neenga|ange|inge|enna|ethu|yaar|evalavu|eppothu|konjam|romba)\b/gi }
];

export interface LanguageDetection {
  language: LanguageCode;
  source: "script" | "keyword";
}

/** Detect the language of a caller utterance, limited to the agent's supported languages. Returns null when uncertain. */
export function detectLanguage(transcript: string, supported: LanguageCode[]): LanguageDetection | null {
  const text = transcript.trim();
  if (text.length < 2) return null;
  const allow = new Set(supported);

  // 1) Native script — the strongest signal.
  let scriptBest: { code: LanguageCode; count: number } | null = null;
  for (const script of SCRIPTS) {
    if (!allow.has(script.code)) continue;
    const count = (text.match(script.pattern) ?? []).length;
    if (count >= 2 && (!scriptBest || count > scriptBest.count)) scriptBest = { code: script.code, count };
  }
  if (scriptBest) return { language: scriptBest.code, source: "script" };

  // 2) Romanized keyword heuristic.
  let kwBest: { code: LanguageCode; score: number } | null = null;
  for (const entry of ROMAN_KEYWORDS) {
    if (!allow.has(entry.code)) continue;
    const score = (text.match(entry.pattern) ?? []).length;
    if (score > 0 && (!kwBest || score > kwBest.score)) kwBest = { code: entry.code, score };
  }
  if (kwBest) return { language: kwBest.code, source: "keyword" };

  return null;
}

interface GroundingPhrases {
  confirm: (value: string) => string;
  reprompt: string;
  retry: string;
}

// Localized grounding prompts so confirmation / re-prompt stay in the caller's language deterministically,
// independent of the LLM (which doesn't know our confidence thresholds).
const GROUNDING: Record<LanguageCode, GroundingPhrases> = {
  "en-IN": {
    confirm: (value) => `Just to confirm — ${value}. Is that correct?`,
    reprompt: "Sorry, I didn't catch that clearly. Could you say it once more?",
    retry: "No problem — please tell me that once more."
  },
  "hi-IN": {
    confirm: (value) => `पुष्टि के लिए — ${value}. क्या यह सही है?`,
    reprompt: "माफ़ कीजिए, मैं ठीक से समझ नहीं पाया। क्या आप दोबारा बता सकते हैं?",
    retry: "कोई बात नहीं — कृपया एक बार फिर बताइए।"
  },
  "kn-IN": {
    confirm: (value) => `ಖಚಿತಪಡಿಸಲು — ${value}. ಇದು ಸರಿಯೇ?`,
    reprompt: "ಕ್ಷಮಿಸಿ, ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.",
    retry: "ಪರವಾಗಿಲ್ಲ — ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ."
  },
  "ta-IN": {
    confirm: (value) => `உறுதிப்படுத்த — ${value}. இது சரிதானா?`,
    reprompt: "மன்னிக்கவும், தெளிவாகக் கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?",
    retry: "பரவாயில்லை — தயவுசெய்து மீண்டும் சொல்லுங்கள்."
  },
  "ml-IN": {
    confirm: (value) => `ഉറപ്പിക്കാൻ — ${value}. ഇത് ശരിയാണോ?`,
    reprompt: "ക്ഷമിക്കണം, വ്യക്തമായില്ല. ഒന്നുകൂടി പറയാമോ?",
    retry: "കുഴപ്പമില്ല — ദയവായി ഒന്നുകൂടി പറയൂ."
  }
};

export function confirmPhrase(language: LanguageCode, value: string): string {
  return GROUNDING[language].confirm(value);
}

export function repromptPhrase(language: LanguageCode): string {
  return GROUNDING[language].reprompt;
}

export function retryPhrase(language: LanguageCode): string {
  return GROUNDING[language].retry;
}

const CODE_ALIASES: Array<{ code: LanguageCode; names: string[] }> = [
  { code: "en-IN", names: ["en", "english"] },
  { code: "hi-IN", names: ["hi", "hindi"] },
  { code: "kn-IN", names: ["kn", "kannada"] },
  { code: "ta-IN", names: ["ta", "tamil"] },
  { code: "ml-IN", names: ["ml", "malayalam"] }
];

const FULL_LANGUAGE_NAMES: Array<{ code: LanguageCode; name: string }> = [
  { code: "en-IN", name: "english" },
  { code: "hi-IN", name: "hindi" },
  { code: "kn-IN", name: "kannada" },
  { code: "ta-IN", name: "tamil" },
  { code: "ml-IN", name: "malayalam" }
];

// In-language speech-verb patterns: the caller asks to switch using their own language, not English.
// e.g. "malayalathil samsarikkamo" (Malayalam), "hindi me boliye" (Hindi), "kannadalli heliri" (Kannada), "tamilile pesunga" (Tamil).
const IN_LANGUAGE_REQUESTS: Array<{ code: LanguageCode; namePattern: RegExp; verbPattern: RegExp }> = [
  { code: "ml-IN", namePattern: /\b(malayal\w*)\b/i, verbPattern: /\b(samsarikk\w*|paray\w*|paranj\w*)\b/i },
  { code: "hi-IN", namePattern: /\b(hindi\w*)\b/i, verbPattern: /\b(bol\w*|bata\w*|sun\w*|kah\w*)\b/i },
  { code: "kn-IN", namePattern: /\b(kannad\w*)\b/i, verbPattern: /\b(hel\w*|maad\w*|bann\w*)\b/i },
  { code: "ta-IN", namePattern: /\b(tamil\w*)\b/i, verbPattern: /\b(pesu\w*|sollu\w*|sollung\w*)\b/i }
];

/** Detect an explicit caller request like "switch to English" / "speak in Hindi" / "talk in Tamil" / "malayalathil samsarikkamo". */
export function detectLanguageCommand(transcript: string, supported: LanguageCode[]): LanguageCode | null {
  const lower = transcript.toLowerCase();
  const allow = new Set(supported);

  // English-style commands: "speak in Malayalam", "switch to Hindi", "talk in Tamil"
  const hasVerb = /\b(switch|change|talk|speak|reply|respond|continue|say it|do it)\b/.test(lower) || /\bin\s+(english|hindi|kannada|tamil|malayalam)\b/.test(lower);
  if (hasVerb) {
    for (const entry of FULL_LANGUAGE_NAMES) {
      if (allow.has(entry.code) && new RegExp(`\\b${entry.name}\\b`).test(lower)) return entry.code;
    }
  }

  // In-language requests: the caller uses their own language's word for "speak" + the language name.
  // e.g. "malayalathil samsarikkamo?", "hindi me boliye", "kannadalli heliri", "tamilile pesunga"
  for (const entry of IN_LANGUAGE_REQUESTS) {
    if (!allow.has(entry.code)) continue;
    if (entry.namePattern.test(lower) && entry.verbPattern.test(lower)) return entry.code;
  }

  return null;
}

/**
 * Resolve the language for this turn conservatively. English is the safe default; we only switch AWAY from English
 * when there is real non-English evidence (native script or romanized keywords), so an over-eager LLM guess on plain
 * English text (e.g. "I am Arvind") never hijacks the call. An explicit command or native script always wins.
 */
export function resolveCallLanguage(opts: {
  current: LanguageCode;
  supported: LanguageCode[];
  transcript: string;
  heuristic: LanguageDetection | null;
  commanded: LanguageCode | null;
  llm?: LanguageCode | undefined;
}): LanguageCode {
  if (opts.commanded) return opts.commanded;
  if (opts.heuristic?.source === "script") return opts.heuristic.language;
  const looksNonEnglish = /[-￿]/.test(opts.transcript) || opts.heuristic !== null;
  if (looksNonEnglish) return opts.heuristic?.language ?? opts.llm ?? opts.current;
  // Plain ASCII English with no non-English markers: default to English (reverting if we had switched).
  return opts.supported.includes("en-IN") ? "en-IN" : opts.current;
}

/** Map a free-form language label the LLM might return ("Malayalam", "ml", "ml-IN") to a supported LanguageCode. */
export function resolveLanguageCode(raw: string | undefined, supported: LanguageCode[]): LanguageCode | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  const allow = new Set(supported);
  for (const entry of CODE_ALIASES) {
    if (!allow.has(entry.code)) continue;
    if (value === entry.code.toLowerCase() || entry.names.some((name) => value === name || value.includes(name))) return entry.code;
  }
  return undefined;
}
