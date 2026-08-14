import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_flags";

export const assignmentRequestSchema = z.object({
  userId: z.string().min(1),
  workOrderId: z.string().min(1),
  dispatchStatus: z.enum(["queued", "assigned", "en_route", "on_site", "completed"]),
  photos: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["arrival", "diagnostic", "completion"]),
      capturedAt: z.string().datetime(),
    }),
  ),
  followUp: z.object({
    required: z.boolean(),
    note: z.string().max(500).optional(),
  }),
});

export type AssignmentRequest = z.infer<typeof assignmentRequestSchema>;
export type Assignment = {
  experiment: "technician-photo-follow-up";
  variant: "control" | "guided_follow_up";
  bucket: number;
  workOrderId: string;
  nextAction: "dispatcher_review" | "send_technician_checklist";
};

export function stableBucket(userId: string): number {
  let hash = 2166136261;
  for (const byte of Buffer.from(userId, "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function assignWorkOrder(input: AssignmentRequest, experimentEnabled: boolean): Assignment {
  const bucket = stableBucket(input.userId);
  const eligible = input.dispatchStatus === "assigned" && input.photos.length > 0 && input.followUp.required;
  const guided = experimentEnabled && eligible && bucket < 50;

  return {
    experiment: "technician-photo-follow-up",
    variant: guided ? "guided_follow_up" : "control",
    bucket,
    workOrderId: input.workOrderId,
    nextAction: guided ? "send_technician_checklist" : "dispatcher_review",
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function handleAssignment(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/assignments") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = assignmentRequestSchema.parse(await readJson(request));
    const flag = await infrai.flags.get("technician-photo-follow-up");
    const enabled = flag.default_value === true;
    sendJson(response, 200, assignWorkOrder(input, enabled));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid assignment request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.message, code: error.code });
      return;
    }
    sendJson(response, 500, { error: "Unexpected service error" });
  }
}

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer((request, response) => {
    void handleAssignment(request, response);
  });
  return server.listen(port, () => {
    console.log(`Field-service assignment service listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
