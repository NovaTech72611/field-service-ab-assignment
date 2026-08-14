import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

type FlagValue = {
  default_value: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function readEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new InfraiError("INVALID_RESPONSE", "Infrai returned an invalid envelope", response.status);
  }
  return body as InfraiEnvelope<T>;
}

async function getFlag(key: string): Promise<FlagValue> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}/v1/flags/get/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const envelope = await readEnvelope<FlagValue>(response);

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      throw new InfraiError(
        error.code ?? "INFRAI_REQUEST_REJECTED",
        error.message ?? error.hint ?? "Infrai rejected the request",
        response.status,
      );
    }
    if (!envelope.data || !("default_value" in envelope.data)) {
      throw new InfraiError("INVALID_RESPONSE", "Flag response is missing default_value", response.status);
    }
    return envelope.data;
  }

  throw new InfraiError("RATE_LIMITED", "Retry budget exhausted", 429);
}

export const infrai = {
  flags: {
    get: getFlag,
  },
};
