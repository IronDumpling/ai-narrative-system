import OpenAI from "openai";

import { ENV } from "../config/env";
import type { BridgerPayload } from "../services/contextRouterService";

export interface BridgerResult {
  bridging_steps: { step: number; action: string }[];
}

const BRIDGER_SYSTEM_PROMPT = `You are a narrative writer. Given a character, world rules, and two events (start/end), generate bridging storyline steps in first-person POV that connect the events while staying consistent with the character's traits and world rules.

Output MUST be valid JSON only, no markdown or extra text:
{"bridging_steps": [{"step": 1, "action": "..."}, {"step": 2, "action": "..."}, ...]}`;

function buildUserPrompt(payload: BridgerPayload): string {
  const worldRules = (payload.world_context as { description?: string }[]) ?? [];
  const worldSection = worldRules
    .map((r) => `- ${r.description ?? String(r)}`)
    .join("\n");

  let user = `Task: ${payload.task}

Character context:
${JSON.stringify(payload.character_context, null, 2)}

World rules:
${worldSection}

Start event: ${payload.start_event}
End event: ${payload.end_event}`;

  if (payload.existing_content) {
    user += `\n\nExisting content to extend:\n${payload.existing_content}`;
  }

  user += "\n\nGenerate bridging steps as JSON.";
  return user;
}

function parseBridgerResponse(content: string): BridgerResult {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as { bridging_steps?: unknown };

  if (!parsed.bridging_steps || !Array.isArray(parsed.bridging_steps)) {
    throw new Error("LLM response missing or invalid bridging_steps array");
  }

  const steps = parsed.bridging_steps.map((s: unknown, i: number) => {
    const item = s as Record<string, unknown>;
    return {
      step: typeof item.step === "number" ? item.step : i + 1,
      action: typeof item.action === "string" ? item.action : String(item.action ?? ""),
    };
  });

  return { bridging_steps: steps };
}

async function callBridgerWithLLM(payload: BridgerPayload): Promise<BridgerResult> {
  const openai = new OpenAI({ apiKey: ENV.openaiApiKey });
  const userPrompt = buildUserPrompt(payload);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: BRIDGER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty completion");
  }

  return parseBridgerResponse(content);
}

function mockBridger(_payload: BridgerPayload): BridgerResult {
  return {
    bridging_steps: [
      { step: 1, action: "Character evaluates the situation and prepares to act." },
      { step: 2, action: "Character moves toward the next anchor event with clear intent." },
    ],
  };
}

export async function callBridger(payload: BridgerPayload): Promise<BridgerResult> {
  if (!ENV.openaiApiKey) {
    return mockBridger(payload);
  }

  try {
    return await callBridgerWithLLM(payload);
  } catch (err) {
    console.error("[bridgerClient] LLM call failed:", err);
    throw err;
  }
}
