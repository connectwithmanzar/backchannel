import { test } from "node:test";
import assert from "node:assert/strict";
import { oneTapApply, outcomeLine, type ApplicationsCall } from "../src/lib/one-tap-apply";

/** A fake server: each action answers from a table, and every call is recorded. */
const server = (answers: Record<string, { status?: number; data: Record<string, unknown> }>) => {
  const calls: string[] = [];
  const call: ApplicationsCall = async (body) => {
    const a = String(body.action);
    calls.push(a);
    const r = answers[a];
    if (!r) throw new Error(`unexpected action ${a}`);
    return { status: r.status ?? 200, data: r.data };
  };
  return { call, calls };
};

test("prepared and sent straight to the company's job system", async () => {
  const s = server({ prepare: { data: { ok: true, id: "app1", status: "awaiting_approval" } }, direct_auto_apply: { data: { ok: true, method: "Greenhouse" } } });
  const o = await oneTapApply("job1", s.call);
  assert.deepEqual(o, { kind: "submitted", id: "app1", how: "Greenhouse" });
  assert.deepEqual(s.calls, ["prepare", "direct_auto_apply"]);
});

test("a sensitive question with no answer stops everything: nothing is sent", async () => {
  const s = server({ prepare: { data: { ok: true, id: "app2", status: "needs_answer" } } });
  const o = await oneTapApply("job2", s.call);
  assert.equal(o.kind, "needs_you");
  assert.deepEqual(s.calls, ["prepare"]);
  assert.match(outcomeLine(o), /visa, salary or notice period/);
});

test("when direct sending is not supported, the robot queue is tried", async () => {
  const s = server({
    prepare: { data: { id: "app3", status: "awaiting_approval" } },
    direct_auto_apply: { status: 422, data: { ok: false, error: "ATS submission requires browser." } },
    queue_auto: { data: { ok: true } },
  });
  const o = await oneTapApply("job3", s.call);
  assert.deepEqual(o, { kind: "queued", id: "app3" });
  assert.deepEqual(s.calls, ["prepare", "direct_auto_apply", "queue_auto"]);
});

test("when the robot is switched off, the reason is shown and you are asked", async () => {
  const s = server({
    prepare: { data: { id: "app4", status: "awaiting_approval" } },
    direct_auto_apply: { status: 422, data: { ok: false, error: "needs browser" } },
    queue_auto: { status: 400, data: { error: "Auto-apply is switched off. Turn it on in Applications → Settings." } },
  });
  const o = await oneTapApply("job4", s.call);
  assert.equal(o.kind, "needs_you");
  assert.match(outcomeLine(o), /switched off/);
});

test("a failed preparation (no CV, role gone) is reported and nothing else runs", async () => {
  const s = server({ prepare: { status: 400, data: { error: "Upload your CV on your profile first." } } });
  const o = await oneTapApply("job5", s.call);
  assert.deepEqual(o, { kind: "failed", message: "Upload your CV on your profile first." });
  assert.deepEqual(s.calls, ["prepare"]);
});

test("a dropped connection is a plain message, not a crash", async () => {
  const o = await oneTapApply("job6", async () => { throw new Error("network"); });
  assert.equal(o.kind, "failed");
  assert.match(outcomeLine(o), /connection/);
  const o2 = await oneTapApply("job7", async (b) => {
    if (b.action === "prepare") return { status: 200, data: { id: "a", status: "awaiting_approval" } };
    throw new Error("network");
  });
  assert.equal(o2.kind, "failed");
});

test("a prepare answer without an application id is not trusted", async () => {
  const s = server({ prepare: { data: { ok: true } } });
  assert.equal((await oneTapApply("job8", s.call)).kind, "failed");
});
