import type { Draft, PRPayload, SubmitResult, SubmitTarget } from "./types.ts";

export async function fetchPR(): Promise<PRPayload> {
  const resp = await fetch("/api/pr");
  if (!resp.ok) throw new Error(`fetch PR failed (${resp.status})`);
  return resp.json();
}

export async function fetchDraft(): Promise<Draft> {
  const resp = await fetch("/api/draft");
  if (!resp.ok) throw new Error(`fetch draft failed (${resp.status})`);
  return resp.json();
}

export async function saveDraft(draft: Draft): Promise<Draft> {
  const resp = await fetch("/api/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!resp.ok) throw new Error(`save draft failed (${resp.status})`);
  return resp.json();
}

export async function submitReview(
  body: string,
  target: SubmitTarget,
): Promise<SubmitResult> {
  const resp = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, target }),
  });
  return resp.json();
}
