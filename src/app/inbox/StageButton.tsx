"use client";
import { useState } from "react";
import { btn } from "@/components/ui";

const LABEL: Record<string, string> = { screening: "Move to Screening", interview: "Move to Interview", offer: "Mark as Offer", rejected: "Mark as Closed" };

export default function StageButton({ applicationId, stage }: { applicationId: string; stage: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const go = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stage", id: applicationId, stage }) });
      setState(res.ok ? "done" : "error");
    } catch { setState("error"); }
  };
  if (state === "done") return <span className="text-good">Updated</span>;
  return (
    <>
      <button type="button" className={btn} onClick={go} disabled={state === "busy"}>{state === "busy" ? "Saving…" : LABEL[stage] ?? "Update"}</button>
      {state === "error" && <span role="alert" className="text-warn">Couldn&apos;t update. Try again.</span>}
    </>
  );
}
