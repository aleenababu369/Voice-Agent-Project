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

// Deterministic language-switch acknowledgments: used when the LLM fails to produce a reply in the target
// language (e.g. outputs Chinese instead of Malayalam). The phrase acknowledges the switch and prompts the
// caller to continue, so the conversation keeps flowing even without a valid LLM reply.
const SWITCH_ACK: Record<LanguageCode, string> = {
  "en-IN": "Sure, I'll continue in English.",
  "hi-IN": "ज़रूर, मैं हिंदी में बात करता हूँ।",
  "kn-IN": "ಖಂಡಿತ, ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತೇನೆ.",
  "ta-IN": "சரி, நான் தமிழில் பேசுகிறேன்.",
  "ml-IN": "ശരി, ഞാൻ മലയാളത്തിൽ സംസാരിക്കാം."
};

export function switchAcknowledgmentPhrase(language: LanguageCode): string {
  return SWITCH_ACK[language];
}

const ACCEPTED: Record<LanguageCode, string> = {
  "en-IN": "Got it, thank you.",
  "hi-IN": "ठीक है, धन्यवाद।",
  "kn-IN": "ಸರಿ, ಧನ್ಯವಾದಗಳು.",
  "ta-IN": "சரி, நன்றி.",
  "ml-IN": "ശരി, നന്ദി."
};

const GENERIC_NEXT_PROMPT: Record<LanguageCode, string> = {
  "en-IN": "Please tell me the next detail.",
  "hi-IN": "कृपया अगली जानकारी बताइए।",
  "kn-IN": "ದಯವಿಟ್ಟು ಮುಂದಿನ ವಿವರವನ್ನು ತಿಳಿಸಿ.",
  "ta-IN": "தயவுசெய்து அடுத்த விவரத்தைச் சொல்லுங்கள்.",
  "ml-IN": "ദയവായി അടുത്ത വിവരം പറയൂ."
};

const LOCALIZED_SLOT_PROMPTS: Partial<Record<LanguageCode, Record<string, string>>> = {
  "hi-IN": {
    caller_name: "कृपया अपना नाम बताइए।",
    patient_name: "कृपया मरीज का नाम बताइए।",
    visitor_name: "कृपया अपना नाम बताइए।",
    program_interest: "आप किस कोर्स या कार्यक्रम में रुचि रखते हैं?",
    inquiry_topic: "आप किस बारे में सहायता चाहते हैं?",
    contact_number: "फॉलो-अप के लिए आपका संपर्क नंबर क्या है?",
    callback_number: "कृपया फॉलो-अप के लिए संपर्क नंबर बताइए।",
    purpose: "आपके कॉल या विज़िट का उद्देश्य क्या है?",
    department: "आपको किस विभाग या टीम से बात करनी है?",
    age: "कृपया मरीज की उम्र बताइए।",
    issue: "कृपया समस्या या लक्षण संक्षेप में बताइए।",
    doctor_name: "आप किस डॉक्टर या विभाग के बारे में पूछ रहे हैं?",
    preferred_date: "आप किस तारीख़ को पसंद करेंगे?",
    preferred_time: "आप किस समय को पसंद करेंगे?",
    patient_id: "कृपया मरीज आईडी बताइए।",
    student_id: "कृपया छात्र आईडी या आवेदन संख्या बताइए।",
    acknowledgement_status: "क्या आपने यह रिमाइंडर नोट कर लिया है?",
    confirmation_status: "क्या आप अगले चरण या फॉलो-अप के लिए उपलब्ध हैं?"
  },
  "ml-IN": {
    caller_name: "ദയവായി നിങ്ങളുടെ പേര് പറയാമോ?",
    patient_name: "ദയവായി രോഗിയുടെ പേര് പറയാമോ?",
    visitor_name: "ദയവായി നിങ്ങളുടെ പേര് പറയാമോ?",
    program_interest: "ഏത് കോഴ്സിലോ പ്രോഗ്രാമിലോ ആണ് നിങ്ങൾക്ക് താൽപ്പര്യം?",
    inquiry_topic: "എന്ത് കാര്യത്തിലാണ് നിങ്ങൾക്ക് സഹായം വേണ്ടത്?",
    contact_number: "തുടർബന്ധത്തിനായി ഏത് ഫോൺ നമ്പർ ഉപയോഗിക്കണം?",
    callback_number: "തിരിച്ചുബന്ധപ്പെടാൻ ഏത് നമ്പർ ഉപയോഗിക്കണം?",
    purpose: "നിങ്ങളുടെ കോളിന്റെയോ സന്ദർശനത്തിന്റെയോ ഉദ്ദേശ്യം എന്താണ്?",
    department: "ഏത് വിഭാഗത്തെയോ ടീമിനെയോ ആണ് നിങ്ങൾ തേടുന്നത്?",
    age: "രോഗിയുടെ പ്രായം പറയാമോ?",
    issue: "പ്രശ്നമോ ലക്ഷണമോ ചുരുക്കത്തിൽ പറയാമോ?",
    doctor_name: "ഏത് ഡോക്ടറെയോ വിഭാഗത്തെയോ കുറിച്ചാണ് ചോദിക്കുന്നത്?",
    preferred_date: "ഏത് തീയതിയാണ് നിങ്ങൾക്ക് സൗകര്യം?",
    preferred_time: "ഏത് സമയമാണ് നിങ്ങൾക്ക് ഇഷ്ടം?",
    patient_id: "ദയവായി രോഗിയുടെ ഐഡി പറയാമോ?",
    student_id: "ദയവായി വിദ്യാർത്ഥിയുടെ ഐഡിയോ അപേക്ഷ നമ്പറോ പറയാമോ?",
    acknowledgement_status: "ഈ റിമൈൻഡർ നിങ്ങൾ ശ്രദ്ധിച്ചോ?",
    confirmation_status: "അടുത്ത ഘട്ടത്തിനോ ഫോളോ-അപ്പിനോ നിങ്ങൾക്ക് സാധിക്കുമോ?"
  },
  "kn-IN": {
    caller_name: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ತಿಳಿಸುವಿರಾ?",
    patient_name: "ದಯವಿಟ್ಟು ರೋಗಿಯ ಹೆಸರನ್ನು ತಿಳಿಸಿ.",
    visitor_name: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ತಿಳಿಸುವಿರಾ?",
    program_interest: "ನೀವು ಯಾವ ಕೋರ್ಸ್ ಅಥವಾ ಕಾರ್ಯಕ್ರಮದಲ್ಲಿ ಆಸಕ್ತಿ ಹೊಂದಿದ್ದೀರಿ?",
    inquiry_topic: "ನಿಮಗೆ ಯಾವ ವಿಷಯದಲ್ಲಿ ಸಹಾಯ ಬೇಕು?",
    contact_number: "ಮುಂದಿನ ಸಂಪರ್ಕಕ್ಕಾಗಿ ಯಾವ ಸಂಖ್ಯೆಯನ್ನು ಬಳಸಬೇಕು?",
    callback_number: "ಮತ್ತೆ ಸಂಪರ್ಕಿಸಲು ಯಾವ ಸಂಖ್ಯೆಯನ್ನು ಬಳಸಬೇಕು?",
    purpose: "ನಿಮ್ಮ ಕರೆ ಅಥವಾ ಭೇಟಿ ಉದ್ದೇಶವೇನು?",
    department: "ನೀವು ಯಾವ ವಿಭಾಗ ಅಥವಾ ತಂಡವನ್ನು ಬೇಕೆಂದುಕೊಳ್ಳುತ್ತಿದ್ದೀರಿ?",
    age: "ದಯವಿಟ್ಟು ರೋಗಿಯ ವಯಸ್ಸನ್ನು ತಿಳಿಸಿ.",
    issue: "ದಯವಿಟ್ಟು ಸಮಸ್ಯೆ ಅಥವಾ ಲಕ್ಷಣವನ್ನು ಸಂಕ್ಷಿಪ್ತವಾಗಿ ತಿಳಿಸಿ.",
    doctor_name: "ಯಾವ ವೈದ್ಯರು ಅಥವಾ ವಿಭಾಗ ಬೇಕು?",
    preferred_date: "ನಿಮಗೆ ಯಾವ ದಿನಾಂಕ ಸೂಕ್ತ?",
    preferred_time: "ನಿಮಗೆ ಯಾವ ಸಮಯ ಸೂಕ್ತ?",
    patient_id: "ದಯವಿಟ್ಟು ರೋಗಿಯ ಐಡಿಯನ್ನು ತಿಳಿಸಿ.",
    student_id: "ದಯವಿಟ್ಟು ವಿದ್ಯಾರ್ಥಿ ಐಡಿ ಅಥವಾ ಅರ್ಜಿ ಸಂಖ್ಯೆಯನ್ನು ತಿಳಿಸಿ.",
    acknowledgement_status: "ಈ ನೆನಪುಗಳನ್ನು ನೀವು ಗಮನಿಸಿದ್ದೀರಾ?",
    confirmation_status: "ಮುಂದಿನ ಹಂತ ಅಥವಾ ಫಾಲೋ-ಅಪ್‌ಗೆ ನೀವು ಬರಬಹುದೇ?"
  },
  "ta-IN": {
    caller_name: "தயவுசெய்து உங்கள் பெயரைச் சொல்ல முடியுமா?",
    patient_name: "தயவுசெய்து நோயாளியின் பெயரைச் சொல்லுங்கள்.",
    visitor_name: "தயவுசெய்து உங்கள் பெயரைச் சொல்ல முடியுமா?",
    program_interest: "எந்தப் பாடநெறி அல்லது திட்டத்தில் ஆர்வமாக உள்ளீர்கள்?",
    inquiry_topic: "எந்த விஷயத்தில் உதவி வேண்டும்?",
    contact_number: "தொடர்புக்கு எந்த எண்ணைப் பயன்படுத்தலாம்?",
    callback_number: "மீண்டும் தொடர்புக்கு எந்த எண்ணைப் பயன்படுத்தலாம்?",
    purpose: "உங்கள் அழைப்பு அல்லது வருகையின் நோக்கம் என்ன?",
    department: "எந்த துறை அல்லது அணியைத் தொடர்புகொள்ள விரும்புகிறீர்கள்?",
    age: "நோயாளியின் வயதைச் சொல்லுங்கள்.",
    issue: "பிரச்சனை அல்லது அறிகுறியைச் சுருக்கமாகச் சொல்லுங்கள்.",
    doctor_name: "எந்த மருத்துவர் அல்லது துறையைப் பற்றி கேட்கிறீர்கள்?",
    preferred_date: "உங்களுக்கு ஏற்ற தேதி எது?",
    preferred_time: "உங்களுக்கு ஏற்ற நேரம் எது?",
    patient_id: "தயவுசெய்து நோயாளி ஐடியைச் சொல்லுங்கள்.",
    student_id: "தயவுசெய்து மாணவர் ஐடி அல்லது விண்ணப்ப எண்ணைச் சொல்லுங்கள்.",
    acknowledgement_status: "இந்த நினைவூட்டலை நீங்கள் கவனித்தீர்களா?",
    confirmation_status: "அடுத்த படி அல்லது பின்தொடர்வுக்கு நீங்கள் வர முடியுமா?"
  }
};

export function acceptedPhrase(language: LanguageCode): string {
  return ACCEPTED[language];
}

export function localizedSlotPrompt(language: LanguageCode, slotKey: string | undefined, englishFallback: string): string {
  if (language === "en-IN") return englishFallback;
  return (slotKey ? LOCALIZED_SLOT_PROMPTS[language]?.[slotKey] : undefined) ?? GENERIC_NEXT_PROMPT[language];
}

const COMPLETION: Record<LanguageCode, string> = {
  "en-IN": "Thank you. I have noted your details. Our team will contact you shortly.",
  "hi-IN": "धन्यवाद। मैंने आपकी जानकारी दर्ज कर ली है। हमारी टीम जल्द ही आपसे संपर्क करेगी।",
  "kn-IN": "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ವಿವರಗಳನ್ನು ದಾಖಲಿಸಿದ್ದೇನೆ. ನಮ್ಮ ತಂಡವು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
  "ta-IN": "நன்றி. உங்கள் விவரங்களை பதிவு செய்துள்ளேன். எங்கள் குழு விரைவில் தொடர்புகொள்ளும்.",
  "ml-IN": "നന്ദി. നിങ്ങളുടെ വിവരങ്ങൾ ഞാൻ രേഖപ്പെടുത്തി. ഞങ്ങളുടെ ടീം ഉടൻ നിങ്ങളെ ബന്ധപ്പെടും."
};

export function completionPhrase(language: LanguageCode): string {
  return COMPLETION[language];
}

// A warm sign-off appended to the completion message so the call ends with a proper wish, never on a dangling question.
const FAREWELL: Record<LanguageCode, string> = {
  "en-IN": "Have a great day. Goodbye!",
  "hi-IN": "आपका दिन शुभ हो। नमस्ते!",
  "kn-IN": "ಶುಭ ದಿನ. ನಮಸ್ಕಾರ!",
  "ta-IN": "இனிய நாள். வணக்கம்!",
  "ml-IN": "നല്ലൊരു ദിവസം നേരുന്നു. വിട!"
};

export function farewellPhrase(language: LanguageCode): string {
  return FAREWELL[language];
}

// Booking enforcement: when a caller asks for a doctor/program/department that the operational table says is
// unavailable or simply does not exist, the agent must not book it — it offers the live alternatives instead.
const BOOKING_PHRASES: Record<LanguageCode, {
  unknown: (label: string, requested: string, options: string) => string;
  unavailable: (requested: string, options: string) => string;
  none: (requested: string) => string;
}> = {
  "en-IN": {
    unknown: (label, requested, options) => `I'm sorry, I couldn't find ${requested} in our ${label} list. We currently have ${options}. Which would you like?`,
    unavailable: (requested, options) => `I'm sorry, ${requested} is not available right now. We currently have ${options}. Which would you prefer?`,
    none: (requested) => `I'm sorry, I couldn't find ${requested}. Could you please tell me another option?`
  },
  "hi-IN": {
    unknown: (label, requested, options) => `माफ़ कीजिए, मुझे हमारी ${label} सूची में ${requested} नहीं मिला। फ़िलहाल हमारे पास ${options} हैं। आप किसे चुनना चाहेंगे?`,
    unavailable: (requested, options) => `माफ़ कीजिए, ${requested} अभी उपलब्ध नहीं है। फ़िलहाल हमारे पास ${options} हैं। आप किसे पसंद करेंगे?`,
    none: (requested) => `माफ़ कीजिए, मुझे ${requested} नहीं मिला। क्या आप कोई और विकल्प बता सकते हैं?`
  },
  "kn-IN": {
    unknown: (label, requested, options) => `ಕ್ಷಮಿಸಿ, ನಮ್ಮ ${label} ಪಟ್ಟಿಯಲ್ಲಿ ${requested} ಸಿಗಲಿಲ್ಲ. ಸದ್ಯ ನಮ್ಮಲ್ಲಿ ${options} ಇದ್ದಾರೆ. ನೀವು ಯಾವುದನ್ನು ಬಯಸುತ್ತೀರಿ?`,
    unavailable: (requested, options) => `ಕ್ಷಮಿಸಿ, ${requested} ಸದ್ಯ ಲಭ್ಯವಿಲ್ಲ. ಸದ್ಯ ನಮ್ಮಲ್ಲಿ ${options} ಇದ್ದಾರೆ. ನೀವು ಯಾವುದನ್ನು ಬಯಸುತ್ತೀರಿ?`,
    none: (requested) => `ಕ್ಷಮಿಸಿ, ${requested} ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಬೇರೆ ಆಯ್ಕೆ ತಿಳಿಸುವಿರಾ?`
  },
  "ta-IN": {
    unknown: (label, requested, options) => `மன்னிக்கவும், எங்கள் ${label} பட்டியலில் ${requested} கிடைக்கவில்லை. தற்போது எங்களிடம் ${options} உள்ளனர். நீங்கள் எதை விரும்புகிறீர்கள்?`,
    unavailable: (requested, options) => `மன்னிக்கவும், ${requested} தற்போது கிடைக்கவில்லை. தற்போது எங்களிடம் ${options} உள்ளனர். நீங்கள் எதை விரும்புகிறீர்கள்?`,
    none: (requested) => `மன்னிக்கவும், ${requested} கிடைக்கவில்லை. வேறு ஒரு விருப்பத்தைச் சொல்ல முடியுமா?`
  },
  "ml-IN": {
    unknown: (label, requested, options) => `ക്ഷമിക്കണം, ഞങ്ങളുടെ ${label} പട്ടികയിൽ ${requested} കണ്ടെത്താനായില്ല. ഇപ്പോൾ ${options} ലഭ്യമാണ്. ഏതാണ് വേണ്ടത്?`,
    unavailable: (requested, options) => `ക്ഷമിക്കണം, ${requested} ഇപ്പോൾ ലഭ്യമല്ല. ഇപ്പോൾ ${options} ലഭ്യമാണ്. ഏതാണ് വേണ്ടത്?`,
    none: (requested) => `ക്ഷമിക്കണം, ${requested} കണ്ടെത്താനായില്ല. മറ്റൊരു ഓപ്ഷൻ പറയാമോ?`
  }
};

export function bookingOptionPhrase(language: LanguageCode, status: "unavailable" | "unknown", label: string, requested: string, alternatives: string[]): string {
  const phrases = BOOKING_PHRASES[language];
  const options = alternatives.join(", ");
  if (!options) return phrases.none(requested);
  return status === "unavailable" ? phrases.unavailable(requested, options) : phrases.unknown(label, requested, options);
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
 * Resolve the language for this turn conservatively. An explicit command or native script always wins.
 * With no language evidence, retain the session language: short answers and names are commonly written in Latin
 * characters even after a caller explicitly selected Hindi/Malayalam, and must not silently reset the call to English.
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
  const looksNonEnglish = [...opts.transcript].some((character) => character.charCodeAt(0) > 127) || opts.heuristic !== null;
  if (looksNonEnglish) return opts.heuristic?.language ?? opts.llm ?? opts.current;
  // No evidence of a new language: keep the caller's explicit/session choice.
  return opts.current;
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
