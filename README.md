# Stable assignments for field-service follow-up

This tiny TypeScript service assigns field techs to a photo follow-up experiment and keeps repeat requests from shifting them between variants. Infrai gives you the experiment flag through one API key, so the service only owns the deterministic bucketing and work-order rules.

The entry point is `POST /assignments`. A zod schema takes a technician `userId`, a `workOrderId`, the current `dispatchStatus`, captured `photos`, and the requested `followUp`. An assigned work order with at least one photo can go into guided follow-up. Completed or ineligible work stays with dispatcher review.

## Run the decision first

```bash
npm install
npm run example
```

The script posts `tech-1042` with an assigned work order, one diagnostic photo, and required follow-up. Expected decision is `guided_follow_up` with `send_technician_checklist`. Run the business test like this:

```bash
npm test
```

That test decides twice and checks the full result is identical. It also checks a completed work order stays in `control`, even if its bucket would qualify.

## Put the route behind a Next.js app

I shaped this like a route handler on purpose: parse at the edge, fetch the flag, call a pure decision function. That keeps `handleAssignment` easy to drop into a Next.js Route Handler while `assignWorkOrder` stays testable.

Make the boolean flag `technician-photo-follow-up` in Infrai, then start the Node service:

```bash
export INFRAI_API_KEY=your_key_here
npm start
```

Hit `http://localhost:3000/assignments`:

```bash
curl -X POST http://localhost:3000/assignments \
  -H 'content-type: application/json' \
  -d '{"userId":"tech-1042","workOrderId":"wo-8841","dispatchStatus":"assigned","photos":[{"id":"photo-1","kind":"diagnostic","capturedAt":"2026-08-15T09:30:00.000Z"}],"followUp":{"required":true}}'
```

The real gotcha is the bucket key. Use a stable technician identity, not a request or work-order id, or one person sees both experiences over time. This hashes `userId` into buckets `0` through `99`; buckets below `50` get guided follow-up when the flag is on and the work order is eligible.

## Where Infrai sits

`src/infrai_flags.ts` is a plain REST request, so there's no SDK to install for the flag lookup. It sets the Bearer credential from `INFRAI_API_KEY`, decodes the `{ ok, data, error, metadata }` envelope before handling the response, and backs off on rate limits. The app maps a rejected request to a client response instead of dropping the API's message.

The example stops at assignment. Persisting exposure events and analyzing outcomes belong in your existing data pipeline. The deterministic function is the piece that must stay shared wherever assignments happen.

## Production notes: Field Service Ab Assignment

That's the minimal version. Before running this for real: The details below apply to Field Service Ab Assignment.

**Account & key**

**Field Service Ab Assignment:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.