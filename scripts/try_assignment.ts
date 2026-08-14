import { assignmentRequestSchema, assignWorkOrder } from "../src/dispatch_experiment_service";

const request = assignmentRequestSchema.parse({
  userId: "tech-1042",
  workOrderId: "wo-8841",
  dispatchStatus: "assigned",
  photos: [
    { id: "photo-1", kind: "diagnostic", capturedAt: "2026-08-15T09:30:00.000Z" },
  ],
  followUp: { required: true, note: "Confirm the replacement valve model" },
});

console.log(JSON.stringify(assignWorkOrder(request, true), null, 2));
