import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { LedgerMem } from "@ledgermem/memory";
import { loadConfig } from "./config.js";
import { verifyMetaSignature } from "./signature.js";
import { WhatsAppClient } from "./whatsapp.js";
import {
  extractMessages,
  processIncomingMessage,
  type WhatsAppWebhookBody,
} from "./handlers.js";

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function buildApp(): express.Express {
  const cfg = loadConfig();
  const memory = new LedgerMem({
    apiKey: cfg.ledgermemApiKey,
    workspaceId: cfg.ledgermemWorkspaceId,
  });
  const whatsapp = new WhatsAppClient({
    phoneNumberId: cfg.phoneNumberId,
    accessToken: cfg.accessToken,
    graphApiVersion: cfg.graphApiVersion,
  });

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // Bounded dedup of inbound message ids — Meta retries deliveries for up to
  // ~15 minutes when our 200 doesn't reach them quickly.
  const seenMessages = new Set<string>();
  const SEEN_MAX = 5000;
  const isDuplicate = (id: string): boolean => {
    if (seenMessages.has(id)) return true;
    seenMessages.add(id);
    if (seenMessages.size > SEEN_MAX) {
      const oldest = seenMessages.values().next().value;
      if (oldest !== undefined) seenMessages.delete(oldest);
    }
    return false;
  };

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    // Use constant-time comparison so the verify token can't be discovered
    // via response-timing.
    if (
      mode === "subscribe" &&
      typeof token === "string" &&
      safeEqualString(token, cfg.verifyToken)
    ) {
      return res.status(200).send(String(challenge ?? ""));
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", async (req: Request, res: Response) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (
      !raw ||
      !verifyMetaSignature(
        raw,
        req.header("x-hub-signature-256"),
        cfg.webhookSecret,
      )
    ) {
      return res.sendStatus(401);
    }
    const body = req.body as WhatsAppWebhookBody;
    const messages = extractMessages(body);
    // Ack fast — process async to keep webhook latency low.
    res.sendStatus(200);
    for (const msg of messages) {
      if (isDuplicate(msg.messageId)) continue;
      if (!cfg.allowedSenders.size || cfg.allowedSenders.has(msg.from)) {
        try {
          await processIncomingMessage(msg, { memory, whatsapp });
        } catch (err) {
          console.error("processIncomingMessage failed:", err);
        }
      } else {
        console.warn("ignoring message from non-allowlisted sender:", msg.from);
      }
    }
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const app = buildApp();
  const server = app.listen(cfg.port, () => {
    // eslint-disable-next-line no-console
    console.log(`LedgerMem WhatsApp connector listening on :${cfg.port}`);
  });

  // Graceful shutdown — stop accepting new webhook deliveries but let
  // in-flight processIncomingMessage calls finish so we don't drop a
  // memory.add mid-write on SIGTERM.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, draining HTTP server…`);
    const force = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn("Shutdown timed out, forcing exit.");
      process.exit(1);
    }, 15_000);
    force.unref();
    server.close(() => {
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
