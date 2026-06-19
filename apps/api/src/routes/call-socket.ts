import type { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { agentProfileService } from "../services/agent-profile.service.ts";
import { persistenceService } from "../services/persistence.service.ts";
import { processCallTurn } from "../services/call-runner.ts";

interface WebSocket {
  send(data: string): void;
  close(): void;
  on(event: "message", handler: (data: Buffer) => void): void;
  on(event: "close", handler: () => void): void;
}

type Role = "agent" | "softphone";

interface Room {
  sessionId: string;
  sockets: Map<Role, WebSocket>;
}

const rooms = new Map<string, Room>();

function getRoom(sessionId: string): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    room = { sessionId, sockets: new Map() };
    rooms.set(sessionId, room);
  }
  return room;
}

function send(socket: WebSocket, message: unknown) {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // socket may have closed mid-send; ignore.
  }
}

function broadcast(room: Room, message: unknown) {
  for (const socket of room.sockets.values()) send(socket, message);
}

export function registerCallSocketRoutes(app: FastifyInstance) {
  app.register(async (scope) => {
    await scope.register(websocket);

    scope.get("/v1/calls/ws", { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
      const query = request.query as { session?: string; role?: string };
      const sessionId = query.session;
      if (!sessionId) {
        socket.close();
        return;
      }
      const role: Role = query.role === "agent" ? "agent" : "softphone";
      const room = getRoom(sessionId);
      room.sockets.set(role, socket);

      void persistenceService.getSession(sessionId).then(async (session) => {
        if (!session) {
          send(socket, { type: "error", error: "Session not found" });
          return;
        }
        send(socket, { type: "joined", role, session });
        // When the prospect answers an outbound (or starts an inbound) call, the agent greets and asks for consent.
        if (role === "softphone") {
          const profile = session.agentProfileId ? agentProfileService.get(session.agentProfileId, session.tenantId) : null;
          if (profile) {
            send(socket, { type: "agent_reply", reply: profile.welcomeMessage, needsConsent: !session.consentCaptured });
          }
        }
      });

      socket.on("message", async (raw: Buffer) => {
        let message: { type?: string; text?: string; granted?: boolean };
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }

        let session = await persistenceService.getSession(sessionId);
        if (!session) return;
        const profile = session.agentProfileId ? agentProfileService.get(session.agentProfileId, session.tenantId) : null;
        if (!profile) return;

        if (message.type === "consent") {
          session = (await persistenceService.captureConsent(sessionId, message.granted !== false)) ?? session;
          broadcast(room, { type: "session_update", session });
          if (session.consentCaptured) {
            const firstSlot = profile.slots.find((slot) => slot.required && !session!.slotState.collected[slot.key]);
            broadcast(room, { type: "agent_reply", reply: firstSlot?.prompt ?? "How can I help you today?", needsConsent: false });
          } else {
            broadcast(room, { type: "agent_reply", reply: profile.escalationMessage, done: true });
          }
          return;
        }

        if (message.type === "prospect_utterance" && typeof message.text === "string" && message.text.trim()) {
          if (!session.consentCaptured) {
            session = (await persistenceService.captureConsent(sessionId, true)) ?? session;
          }
          broadcast(room, { type: "caller_said", text: message.text });
          const result = await processCallTurn({ session, profile, transcript: message.text });
          const done = result.decision.action === "complete_call" || result.decision.action === "escalate_to_human";
          broadcast(room, { type: "agent_reply", reply: result.decision.responseText, decision: result.decision, session: result.session, operation: result.operation, done });
          return;
        }

        if (message.type === "end") {
          broadcast(room, { type: "ended" });
        }
      });

      socket.on("close", () => {
        room.sockets.delete(role);
        if (room.sockets.size === 0) rooms.delete(sessionId);
      });
    });
  });
}
