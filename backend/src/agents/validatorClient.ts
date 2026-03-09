import OpenAI from "openai";

import { ENV } from "../config/env";
import type { ValidatorPayload } from "../services/contextRouterService";

export interface ValidatorViolation {
  type: string;
  severity: string;
  reason: string;
}

export interface ValidatorResult {
  pass: boolean;
  violations: ValidatorViolation[];
}

const VALIDATOR_SYSTEM_PROMPT = `You are a narrative consistency checker. Given character traits, world rules, and a text excerpt, determine if the text violates any traits or rules.

Output MUST be valid JSON only:
{"pass": true/false, "violations": [{"type": "trait"|"rule", "severity": "low"|"medium"|"high", "reason": "..."}]}
If pass is true, violations must be empty array.`;

function buildUserPrompt(payload: ValidatorPayload): string {
  const worldRulesSection = payload.world_rules
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  return `Task: ${payload.task}

Character traits: ${payload.character_traits.join(", ")}

World rules:
${worldRulesSection}

Text to verify:
---
${payload.text_to_verify}
---

Output JSON only.`;
}

function parseValidatorResponse(content: string): ValidatorResult {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as { pass?: boolean; violations?: unknown[] };

  const pass = parsed.pass === true;
  const rawViolations = Array.isArray(parsed.violations) ? parsed.violations : [];
  const violations: ValidatorViolation[] = rawViolations.map((v: unknown) => {
    const item = v as Record<string, unknown>;
    return {
      type: typeof item.type === "string" ? item.type : "unknown",
      severity: typeof item.severity === "string" ? item.severity : "medium",
      reason: typeof item.reason === "string" ? item.reason : String(item.reason ?? ""),
    };
  });

  return { pass, violations };
}

async function callValidatorWithLLM(payload: ValidatorPayload): Promise<ValidatorResult> {
  const openai = new OpenAI({ apiKey: ENV.openaiApiKey });
  const userPrompt = buildUserPrompt(payload);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: VALIDATOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty completion");
  }

  return parseValidatorResponse(content);
}

function mockValidator(_payload: ValidatorPayload): ValidatorResult {
  return {
    pass: true,
    violations: [],
  };
}

export async function callValidator(payload: ValidatorPayload): Promise<ValidatorResult> {
  if (!ENV.openaiApiKey) {
    return mockValidator(payload);
  }

  try {
    return await callValidatorWithLLM(payload);
  } catch (err) {
    console.error("[validatorClient] LLM call failed:", err);
    throw err;
  }
}
