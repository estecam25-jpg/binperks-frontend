/**
 * One way to call a GoHighLevel webhook.
 *
 * GHL is comms only (CLAUDE.md rule 4) — nothing here decides loyalty or
 * commission outcomes, so a failed call must never fail the request that
 * triggered it. What it must not do is silently vanish, which is what the
 * previous `void fetch(...)` calls were doing.
 *
 * WHY AWAITING MATTERS ON VERCEL: once a handler returns its response, the
 * serverless instance can be frozen or torn down immediately. A fetch that
 * hasn't settled is suspended mid-connection and its socket dies — the request
 * is never delivered, and the failure surfaces (if at all) as an ETIMEDOUT
 * logged after the response. That is exactly how merchant sign-in codes were
 * being lost. Awaiting keeps the instance alive until the call completes.
 *
 * The timeout is the other half: awaiting an unbounded call would trade a
 * dropped webhook for a stalled request, so a hung GHL can't run the function
 * into Vercel's own limit.
 */

/** Ceiling on a GHL call. Long enough for a healthy round trip, short enough
 *  that a hung GHL doesn't run the function into Vercel's own timeout. */
export const GHL_TIMEOUT_MS = 5000

/**
 * May this member be messaged through GHL at all?
 *
 * STRICTLY TRUE, matching the stamp notification: null, undefined and false
 * all mean no. A member whose opt-in was never recorded has not opted in.
 *
 * WHY THIS STOPS THE WHOLE WEBHOOK, EMAIL INCLUDED. A GHL workflow is one
 * inbound webhook that sends the SMS and the email itself; there is no way
 * from here to ask for the email half alone. Firing it anyway to save the
 * email would text someone who asked not to be texted, so the call is dropped
 * and logged. Splitting a workflow in GHL into SMS and email branches, both
 * keyed on a flag in the payload, is what would let the email through — and
 * this helper is the one place that decision would be relaxed.
 *
 * Alerts inside the app are unaffected: lib/member-alerts writes those to the
 * member's own account and never goes near GHL.
 *
 * @returns true when the caller should send.
 */
export function memberOptedIntoSms(
  member: { id?: string | null; sms_opt_in?: boolean | null } | null | undefined,
  label: string,
): boolean {
  if (member?.sms_opt_in === true) return true
  // Logged so "why didn't they get a text?" has an answer in the logs.
  console.info(`[${label}] skipped for member ${member?.id ?? 'unknown'}: SMS opt-in is off`)
  return false
}

/**
 * POST a payload to a GHL webhook. Resolves to whether it was delivered.
 *
 * Never throws — network errors, non-2xx responses and timeouts are all
 * logged and reported as `false`. Callers that surface a channel to the user
 * ("code sent to your phone") should branch on the return value rather than
 * assume success; callers that just want best-effort delivery can ignore it.
 *
 * @param url     Webhook URL. Callers check their env var is set first, so a
 *                missing URL is a caller bug rather than a silent no-op here.
 * @param payload JSON-serialisable merge values for the GHL workflow. Message
 *                copy lives in the workflow, not in application code.
 * @param label   Log prefix identifying the call site, e.g. '/api/join/create'.
 */
export async function postToGhl(
  url: string,
  payload: unknown,
  label: string,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[${label}] GHL webhook returned ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[${label}] GHL webhook error:`, err)
    return false
  }
}
