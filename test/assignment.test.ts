import assert from "node:assert/strict";
import test from "node:test";
import { assignmentRequestSchema, assignWorkOrder } from "../src/dispatch_experiment_service";

const eligibleWorkOrder = assignmentRequestSchema.parse({
  userId: "tech-1042",
  workOrderId: "wo-8841",
  dispatchStatus: "assigned",
  photos: [
    { id: "photo-1", kind: "diagnostic", capturedAt: "2026-08-15T09:30:00.000Z" },
  ],
  followUp: { required: true },
});

test("the same technician keeps the same experiment assignment", () => {
  const first = assignWorkOrder(eligibleWorkOrder, true);
  const second = assignWorkOrder(eligibleWorkOrder, true);

  assert.deepEqual(second, first);
  assert.equal(first.variant, "guided_follow_up");
  assert.equal(first.nextAction, "send_technician_checklist");
});

test("an ineligible work order stays in dispatcher review", () => {
  const result = assignWorkOrder({ ...eligibleWorkOrder, dispatchStatus: "completed" }, true);

  assert.equal(result.variant, "control");
  assert.equal(result.nextAction, "dispatcher_review");
});
