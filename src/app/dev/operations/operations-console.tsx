"use client";

import { useEffect, useState } from "react";
import { createEventBus } from "@/events/bus";
import type { WorkspaceEvent } from "@/events/schema";
import type { Provenance } from "@/state/domain";
import { createUaeWorkspace } from "@/state/fixtures/uae-market";
import { createOperationGate } from "@/state/gate";
import type { OperationResult } from "@/state/operations";
import { createWorkspaceStore } from "@/state/store";
import { createWorld, reactToEvent } from "@/visualization/world/sim/world";

type Channel = "model" | "demo" | "user";
const CHANNELS: Record<Channel, Provenance> = {
  model: { kind: "model", label: "AI model" },
  demo: { kind: "demo" },
  user: { kind: "user" },
};

interface Sample {
  label: string;
  broken: boolean;
  make: (id: string, lastId: string | null) => unknown;
}

const why = { reason: "Sent from the operation checker." };
const fixture = { kind: "fixture", label: "Checker sample", verified: false } as const;

const SAMPLES: Sample[] = [
  { label: "Open a market station", broken: false, make: (id) => ({ operation: "add_module", id, module: { id: "market", title: "Market demand", kind: "market", group: "research" }, why }) },
  { label: "Add a fact", broken: false, make: (id) => ({ operation: "add_evidence", id, evidence: { id: `ev-${id}`, statement: "UAE companies buy AI software.", kind: "fact", moduleId: null, foundBy: "orion", source: fixture } }) },
  { label: "Emphasize market", broken: false, make: (id) => ({ operation: "emphasize_module", id, moduleId: "market", why }) },
  { label: "Ask the user a question", broken: false, make: (id) => ({ operation: "request_human_input", id, requestId: "budget", question: "What's your budget?", askedBy: "nova" }) },
  { label: "Answer the question", broken: false, make: (id) => ({ operation: "answer_human_input", id, requestId: "budget", answer: "USD 500,000" }) },
  { label: "Skip the reason", broken: true, make: (id) => ({ operation: "add_module", id, module: { id: "risk", title: "Risks", kind: "risk", group: "analysis" } }) },
  { label: "Made-up command", broken: true, make: (id) => ({ operation: "run_code", id, code: "fetch('/secrets')" }) },
  { label: "Smuggle in a script", broken: true, make: (id) => ({ operation: "add_module", id, module: { id: "x", title: "X", kind: "x", group: "research" }, why, html: "<script>alert(1)</script>" }) },
  { label: "Mark its own claim verified", broken: true, make: (id) => ({ operation: "add_evidence", id, evidence: { id: `ev-${id}`, statement: "Trust me.", kind: "fact", moduleId: null, foundBy: "sage", source: { kind: "model", label: "LLM", verified: true } } }) },
  { label: "Pretend to be the user", broken: true, make: (id) => ({ operation: "answer_human_input", id, source: { kind: "user" }, requestId: "budget", answer: "USD 1" }) },
  { label: "Remove a station that isn't there", broken: true, make: (id) => ({ operation: "remove_module", id, moduleId: "ghost", why }) },
  { label: "Send the last request again", broken: true, make: (_id, lastId) => ({ operation: "focus_camera", id: lastId ?? "none", target: { kind: "overview" } }) },
  { label: "Way too long", broken: true, make: (id) => ({ operation: "add_assumption", id, assumptionId: "a", statement: "blah ".repeat(5000), raisedBy: "sage" }) },
];

interface Verdict {
  label: string;
  channel: Channel;
  result: OperationResult;
}

function createLab() {
  const bus = createEventBus({ clock: () => ({ at: 0, cycle: 0 }) });
  const store = createWorkspaceStore(createUaeWorkspace());
  const gate = createOperationGate(store, bus, () => 0);
  const world = createWorld();
  bus.subscribe((event) => reactToEvent(world, event, () => {}));
  return { bus, store, gate, world };
}

/** Development-only: send good and deliberately broken AI-style requests through the real operation checker. */
export default function OperationsConsole() {
  const [lab, setLab] = useState(createLab);
  const [, setTick] = useState(0);
  const [channel, setChannel] = useState<Channel>("model");
  const [text, setText] = useState("");
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => lab.bus.subscribe(() => setTick((n) => n + 1)), [lab]);

  const submit = (label: string, input: unknown) => {
    const result = lab.gate.submit(input, { as: CHANNELS[channel] });
    setVerdicts((list) => [{ label, channel, result }, ...list].slice(0, 12));
  };
  const send = (sample: Sample) => {
    const id = `check-${count + 1}`;
    setCount(count + 1);
    const lastId = lab.store.getState().workspace.appliedOperationIds.at(-1) ?? null;
    submit(sample.label, sample.make(id, lastId));
  };
  const sendText = () => {
    let input: unknown = text;
    try {
      input = JSON.parse(text);
    } catch {
      // Sent as-is: the checker refuses anything that isn't an operation object.
    }
    submit("Pasted request", input);
  };

  const ws = lab.store.getState().workspace;
  const events: WorkspaceEvent[] = lab.bus.history().slice(-14).reverse();
  const shown = lab.world.moduleOrder.filter((id) => lab.world.modules[id]?.visible);
  const button = "rounded border px-2 py-1 text-left hover:bg-white/10";

  return (
    <main className="min-h-screen bg-[#05070d] p-6 text-xs text-white/90">
      <h1 className="text-base font-semibold">Operation checker (development only)</h1>
      <p className="mt-1 max-w-3xl text-white/60">
        Every change to the record goes through the same checker the demo uses. Pick who is sending, then send a request. Good ones change
        the record and the 3D world; broken ones are refused with a reason and change nothing.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-white/60">Sending as:</span>
        {(Object.keys(CHANNELS) as Channel[]).map((key) => (
          <button key={key} type="button" aria-pressed={channel === key} className={`${button} ${channel === key ? "border-cyan-300 text-cyan-200" : "border-white/20"}`} onClick={() => setChannel(key)}>
            {key === "model" ? "AI model" : key === "demo" ? "Demo script" : "You (the user)"}
          </button>
        ))}
        <button type="button" className={`${button} ml-auto border-white/20`} onClick={() => { setLab(createLab()); setVerdicts([]); }}>
          Start over
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-emerald-300">Good requests</h2>
          {SAMPLES.filter((sample) => !sample.broken).map((sample) => (
            <button key={sample.label} type="button" className={`${button} border-emerald-400/30`} onClick={() => send(sample)}>
              {sample.label}
            </button>
          ))}
          <h2 className="mt-2 font-semibold text-rose-300">Broken, AI-style requests</h2>
          {SAMPLES.filter((sample) => sample.broken).map((sample) => (
            <button key={sample.label} type="button" className={`${button} border-rose-400/30`} onClick={() => send(sample)}>
              {sample.label}
            </button>
          ))}
          <h2 className="mt-2 font-semibold">Paste your own (JSON)</h2>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            aria-label="Request to send"
            className="rounded border border-white/20 bg-black/40 p-2 font-mono"
            placeholder='{"operation":"add_scenario","id":"s1","scenario":{"id":"a","label":"Go alone","assessment":0.4}}'
          />
          <button type="button" className={`${button} border-white/20`} onClick={sendText}>
            Send pasted request
          </button>
        </section>

        <section>
          <h2 className="font-semibold">Verdicts</h2>
          <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
            {verdicts.map((verdict, i) => (
              <li key={verdicts.length - i} className={`rounded border p-2 ${verdict.result.ok ? "border-emerald-400/40" : "border-rose-400/40"}`}>
                <div className="font-semibold">
                  {verdict.result.ok ? "Accepted" : "Refused"} · {verdict.label} · as {verdict.channel}
                </div>
                {!verdict.result.ok && <div className="text-rose-200">{verdict.result.reason}</div>}
              </li>
            ))}
          </ul>
          <h2 className="mt-4 font-semibold">Event log (newest first)</h2>
          <ul className="mt-2 flex flex-col gap-0.5 font-mono text-white/70">
            {events.map((event) => (
              <li key={event.seq}>
                #{event.seq} {event.type}
                {event.operation ? ` ← ${event.operation.type} (${event.operation.id})` : ""}
                {event.type === "operation_rejected" ? ` — ${event.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-semibold">The record</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-white/50">Stations</dt>
            <dd>{ws.moduleOrder.map((id) => `${ws.modules[id]!.title} (${ws.modules[id]!.group}, ${ws.modules[id]!.emphasis})`).join(" · ") || "none"}</dd>
            <dt className="text-white/50">Findings</dt>
            <dd>{ws.evidence.map((item) => `${item.statement} [${item.source.verified ? "verified" : "unverified"}]`).join(" · ") || "none"}</dd>
            <dt className="text-white/50">Doubts</dt>
            <dd>{ws.assumptions.map((item) => `${item.statement} (${item.status})`).join(" · ") || "none"}</dd>
            <dt className="text-white/50">Scenarios</dt>
            <dd>{ws.scenarios.map((item) => `${item.label} ${item.assessment.toFixed(2)}`).join(" · ") || "none"}</dd>
            <dt className="text-white/50">Questions</dt>
            <dd>{ws.humanInputs.map((item) => `${item.question} → ${item.answer ?? "waiting"}`).join(" · ") || "none"}</dd>
            <dt className="text-white/50">Answer</dt>
            <dd>{ws.recommendation?.statement ?? ws.recommendation?.leaning ?? "none"}</dd>
            <dt className="text-white/50">Accepted</dt>
            <dd>{ws.appliedOperationIds.length} requests</dd>
          </dl>
          <h2 className="mt-4 font-semibold">What the 3D world would show</h2>
          <p className="mt-1 text-white/70">{shown.map((id) => lab.world.modules[id]!.spec.title).join(" · ") || "an empty deck"}</p>
        </section>
      </div>
    </main>
  );
}
