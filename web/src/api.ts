import type {
  AgentTranscript,
  Draft,
  PRPayload,
  SubmitResult,
  SubmitTarget,
} from "./types.ts";

export async function fetchPR(): Promise<PRPayload> {
  const resp = await fetch("/api/pr");
  if (!resp.ok) throw new Error(`fetch PR failed (${resp.status})`);
  return resp.json();
}

export async function refetchContent(paths: string[]): Promise<PRPayload> {
  const resp = await fetch("/api/refetch-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!resp.ok) throw new Error(`refetch failed (${resp.status})`);
  return resp.json();
}

export async function fetchAgentTranscript(): Promise<AgentTranscript> {
  const resp = await fetch("/api/agent-transcript");
  if (!resp.ok) throw new Error(`fetch agent transcript failed (${resp.status})`);
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
  finish: boolean,
): Promise<SubmitResult> {
  const resp = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, target, finish }),
  });
  return resp.json();
}

export async function sendAgentQuestion(body: string): Promise<SubmitResult> {
  const resp = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body,
      target: "agent",
      finish: false,
      intent: "question",
    }),
  });
  return resp.json();
}
