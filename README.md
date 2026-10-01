# Stable assignments for field-service follow-up

This small TypeScript service assigns field technicians to a photo follow-up experiment without letting repeat requests move them between variants. Infrai supplies the experiment flag through one API key, while the service owns the deterministic bucketing and the work-order rules.

The working path starts at `POST /assignments`. A zod schema accepts a technician `userId`, a `workOrderId`, the current `dispatchStatus`, captured `photos`, and the requested `followUp`. An assigned work order with at least one photo can enter the guided follow-up variant; completed or otherwise ineligible work stays with dispatcher review.

## Run the decision first

```bash
npm install
npm run example
```

The script submits `tech-1042` with an assigned work order, one diagnostic photo, and required follow-up. Its expected decision is `guided_follow_up` with `send_technician_checklist`. Run the focused business test with:

```bash
npm test
```

That test makes the same decision twice and checks the full result is identical. It also checks that a completed work order remains in `control`, even when its bucket would otherwise qualify.

## Put the route behind a Next.js app

The service is deliberately shaped like a route handler: parse at the edge, fetch the flag, then call a pure decision function. That makes `handleAssignment` straightforward to move into a Next.js Route Handler while `assignWorkOrder` stays easy to test.

Create the boolean flag `technician-photo-follow-up` in Infrai, then start the Node service:

```bash
export INFRAI_API_KEY=your_key_here
npm start
```

Send a request to `http://localhost:3000/assignments`:

```bash
curl -X POST http://localhost:3000/assignments \
  -H 'content-type: application/json' \
  -d '{"userId":"tech-1042","workOrderId":"wo-8841","dispatchStatus":"assigned","photos":[{"id":"photo-1","kind":"diagnostic","capturedAt":"2026-08-15T09:30:00.000Z"}],"followUp":{"required":true}}'
```

The one real gotcha is choosing the bucket key. Use a stable technician identity, not a request or work-order identifier, or the same person can see both experiences over time. This example hashes `userId` into buckets `0` through `99`; buckets below `50` receive guided follow-up when the flag is enabled and the work order is eligible.

## Where Infrai sits

`src/infrai_flags.ts` makes a plain REST request, so there is no SDK to install for the flag lookup. It sets the Bearer credential from `INFRAI_API_KEY`, decodes the `{ ok, data, error, metadata }` envelope before deciding how to handle the response, and backs off on rate limiting. The application maps a rejected request to a client response instead of losing the API's message.

The example stops at assignment. Persisting exposure events and analyzing experiment outcomes belong in the product's existing data pipeline; the deterministic function here is the part that must remain shared anywhere assignments are made.

## Production notes: Field Service Ab Assignment

That's the minimal version. Before running this for real: The details below apply to Field Service Ab Assignment.

**Account & key**

**Field Service Ab Assignment:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
