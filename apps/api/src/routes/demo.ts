import type { FastifyInstance } from "fastify";

export function registerDemoRoutes(app: FastifyInstance) {
  app.get("/v1/demo/config", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    const tenant = app.services.agentProfiles.getTenant(tenantId);
    const profiles = app.services.agentProfiles.list(tenant.id);
    return {
      appName: "Multilingual Voice Agent Demo",
      mode: "browser-simulator",
      zeroCost: true,
      tenant,
      supportedLanguages: ["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"],
      aiAdapters: {
        asr: process.env.ASR_PROVIDER ?? "mock",
        llm: process.env.LLM_PROVIDER ?? "mock",
        tts: process.env.TTS_PROVIDER ?? "mock"
      },
      scenarios: profiles.map((profile) => ({
        id: profile.id,
        tenantId: profile.tenantId,
        title: profile.name,
        domain: profile.domain,
        workflow: profile.workflow,
        language: profile.languages[0],
        starterPrompt: profile.description,
        sampleUtterance: profile.workflow === "appointment_booking"
          ? "I am Asha age 42 issue fever doctor Dr Rao tomorrow 10 am"
          : profile.workflow === "frontdesk_reception"
            ? "My name is Ravi purpose meeting department sales callback 9876543210"
            : profile.workflow === "institution_reception"
              ? "My name is Nisha interested in M.Tech inquiry admissions contact 9876543210"
              : "Student ID S123 haan received"
      })),
      notes: [
        "Uses your existing backend session flow.",
        "Uses browser speech synthesis for free voice output.",
        "Uses browser speech recognition only when supported by the browser.",
        "No phone numbers or telephony providers are required for the demo.",
        "The backend now runs through provider-neutral ASR, LLM, and TTS adapter interfaces.",
        "Each tenant workspace keeps its own profiles, admins, records, and analytics isolated for demo presentation."
      ]
    };
  });
}
