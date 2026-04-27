import { describe, it, expect, vi } from "vitest";
import {
  processIncomingMessage,
  extractMessages,
  type MemoryClient,
} from "./handlers.js";
import { verifyMetaSignature } from "./signature.js";
import { createHmac } from "node:crypto";

function makeDeps(searchResult: unknown[] = []) {
  const memory: MemoryClient = {
    add: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(searchResult),
  } as MemoryClient;
  const whatsapp = { sendText: vi.fn().mockResolvedValue(undefined) };
  return { memory, whatsapp };
}

describe("processIncomingMessage", () => {
  it("ignores empty text", async () => {
    const deps = makeDeps();
    const r = await processIncomingMessage(
      { from: "111", text: "  ", messageId: "m1" },
      deps,
    );
    expect(r).toBe("ignored:empty");
    expect(deps.memory.add).not.toHaveBeenCalled();
  });

  it("saves plain text and replies", async () => {
    const deps = makeDeps();
    const r = await processIncomingMessage(
      { from: "+15551234567", text: "remember this", messageId: "m1" },
      deps,
    );
    expect(r).toBe("remember:ok");
    expect(deps.memory.add).toHaveBeenCalledWith("remember this", {
      metadata: {
        source: "whatsapp",
        threadId: "+15551234567",
        userId: "+15551234567",
        messageId: "m1",
      },
    });
    expect(deps.whatsapp.sendText).toHaveBeenCalledWith(
      "+15551234567",
      "Saved to memory.",
    );
  });

  it("handles /recall with hits", async () => {
    const deps = makeDeps([
      { id: "a", content: "alpha" },
      { id: "b", content: "beta" },
    ]);
    const r = await processIncomingMessage(
      { from: "+1", text: "/recall something", messageId: "m1" },
      deps,
    );
    expect(r).toBe("recall:ok");
    expect(deps.memory.search).toHaveBeenCalledWith("something", { limit: 3 });
    const sentBody = (deps.whatsapp.sendText as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(sentBody).toContain("alpha");
    expect(sentBody).toContain("id: a");
    expect(deps.memory.add).not.toHaveBeenCalled();
  });

  it("handles /recall with no hits", async () => {
    const deps = makeDeps([]);
    const r = await processIncomingMessage(
      { from: "+1", text: "/recall nothing", messageId: "m1" },
      deps,
    );
    expect(r).toBe("recall:empty");
    expect(deps.whatsapp.sendText).toHaveBeenCalledWith(
      "+1",
      'No matches for "nothing".',
    );
  });
});

describe("extractMessages", () => {
  it("pulls text messages out of a webhook body", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "+1",
                    id: "wamid.A",
                    type: "text",
                    text: { body: "hi" },
                  },
                  { from: "+1", id: "wamid.B", type: "image" },
                ],
              },
            },
          ],
        },
      ],
    };
    const out = extractMessages(body);
    expect(out).toEqual([{ from: "+1", text: "hi", messageId: "wamid.A" }]);
  });

  it("returns empty list for empty body", () => {
    expect(extractMessages({})).toEqual([]);
  });
});

describe("verifyMetaSignature", () => {
  it("accepts a valid signature", () => {
    const secret = "shh";
    const body = Buffer.from('{"x":1}');
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
  });

  it("rejects bad signature", () => {
    const secret = "shh";
    const body = Buffer.from('{"x":1}');
    expect(verifyMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "garbage", secret)).toBe(false);
  });
});
