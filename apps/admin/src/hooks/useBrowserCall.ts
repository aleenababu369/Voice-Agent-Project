import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  commitAgentReply,
  fetchSessionEvents,
  grantConsent,
  replacePendingAgentMessage,
  seedDemoRecords,
  sendUtterance,
  setCallPhase,
  setVoiceState,
  startDemoSession
} from "../features/demo/demoSlice";
import { fetchAnalytics, fetchOperations, fetchDailyReport, fetchSessions } from "../features/platform/platformSlice";

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function useBrowserCall() {
  const dispatch = useAppDispatch();
  const demo = useAppSelector((state) => state.demo);
  const selectedScenario = demo.config?.scenarios.find((scenario) => scenario.id === demo.selectedScenarioId) ?? null;
  const [input, setInput] = useState("");
  const [micStatus, setMicStatus] = useState("Checking");
  const recognitionRef = useRef<InstanceType<RecognitionCtor> | null>(null);

  useEffect(() => {
    if (!demo.session) return;
    void dispatch(fetchSessionEvents());
  }, [dispatch, demo.session]);

  useEffect(() => {
    if (!demo.pendingAgentReply) return;
    let cursor = 0;
    dispatch(setCallPhase("speaking"));
    dispatch(replacePendingAgentMessage({ text: "", pending: true }));
    const interval = window.setInterval(() => {
      cursor = Math.min(cursor + 4, demo.pendingAgentReply.length);
      const nextText = demo.pendingAgentReply.slice(0, cursor);
      const done = cursor >= demo.pendingAgentReply.length;
      dispatch(replacePendingAgentMessage({ text: nextText, pending: !done }));
      if (done) {
        window.clearInterval(interval);
        dispatch(commitAgentReply(demo.pendingAgentReply));
      }
    }, 22);
    return () => window.clearInterval(interval);
  }, [dispatch, demo.pendingAgentReply]);

  useEffect(() => {
    if (!demo.lastAgentReply) return;
    if (!("speechSynthesis" in window)) {
      dispatch(setVoiceState("unsupported"));
      return;
    }
    window.speechSynthesis.cancel();
    dispatch(setVoiceState("speaking"));
    const utterance = new SpeechSynthesisUtterance(demo.lastAgentReply);
    utterance.lang = demo.selectedLanguage;
    utterance.rate = 1;
    utterance.onend = () => {
      dispatch(setVoiceState("ready"));
      dispatch(setCallPhase(demo.session?.status === "completed" ? "completed" : demo.session?.status === "escalated" ? "escalated" : "listening"));
    };
    window.speechSynthesis.speak(utterance);
  }, [dispatch, demo.lastAgentReply, demo.selectedLanguage, demo.session?.status]);

  useEffect(() => {
    const Recognition = (window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;
    if (!Recognition) {
      setMicStatus("Unsupported");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = demo.selectedLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setMicStatus("Listening"); dispatch(setCallPhase("listening")); };
    recognition.onend = () => setMicStatus("Ready");
    recognition.onerror = () => setMicStatus("Error");
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognitionRef.current = recognition;
    setMicStatus("Ready");
  }, [dispatch, demo.selectedLanguage]);

  async function refreshPlatformData() {
    await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics()), dispatch(fetchOperations())]);
  }

  async function startCall() {
    await dispatch(startDemoSession()).unwrap();
    window.setTimeout(() => dispatch(setCallPhase("consent")), 650);
  }

  async function grant() {
    await dispatch(grantConsent()).unwrap();
  }

  async function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    await dispatch(sendUtterance(text)).unwrap();
    await refreshPlatformData();
  }

  async function runGuidedSample() {
    if (!selectedScenario) return;
    const shouldStartFresh = !demo.session || demo.session.status === "completed" || demo.session.status === "escalated" || demo.session.status === "failed";
    if (shouldStartFresh) await dispatch(startDemoSession()).unwrap();
    if (shouldStartFresh || !demo.session?.consentCaptured) await dispatch(grantConsent()).unwrap();
    setInput("");
    await dispatch(sendUtterance(selectedScenario.sampleUtterance)).unwrap();
    await refreshPlatformData();
    void dispatch(fetchDailyReport(undefined));
  }

  async function seedRecords() {
    await dispatch(seedDemoRecords()).unwrap();
    await refreshPlatformData();
    void dispatch(fetchDailyReport(undefined));
  }

  function startMic() {
    recognitionRef.current?.start();
  }

  return {
    demo,
    selectedScenario,
    input,
    setInput,
    micStatus,
    micAvailable: Boolean(recognitionRef.current),
    startCall,
    grant,
    send,
    runGuidedSample,
    seedRecords,
    startMic,
    useSample: () => setInput(selectedScenario?.sampleUtterance ?? "")
  };
}
