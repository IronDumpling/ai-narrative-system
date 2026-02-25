import { ValidatorPayload } from "../services/contextRouterService";

export interface ValidatorViolation {
  type: string;
  severity: string;
  reason: string;
}

export interface ValidatorResult {
  pass: boolean;
  violations: ValidatorViolation[];
}

export async function callValidator(_payload: ValidatorPayload): Promise<ValidatorResult> {
  // Phase 1: mock implementation that always passes
  return {
    pass: true,
    violations: [],
  };
}

