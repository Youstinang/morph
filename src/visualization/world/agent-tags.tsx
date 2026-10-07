import type { RefObject } from "react";
import { AGENTS, AGENT_ORDER } from "./sim/roster";
import type { AgentId } from "./sim/types";

export interface TagElements {
  root: HTMLDivElement | null;
  state: HTMLSpanElement | null;
}

export type TagRegistry = Partial<Record<AgentId, TagElements>>;

export function AgentTags({
  registry,
  selected,
}: {
  registry: RefObject<TagRegistry>;
  selected: AgentId | null;
}) {
  const bind = (id: AgentId, key: keyof TagElements) => (node: HTMLElement | null) => {
    const entry = (registry.current[id] ??= { root: null, state: null });
    (entry[key] as HTMLElement | null) = node;
  };
  return (
    <div className="agent-tags" aria-hidden="true">
      {AGENT_ORDER.map((id) => (
        <div
          key={id}
          ref={bind(id, "root")}
          className={`agent-tag ${selected === id ? "agent-tag--selected" : ""}`}
        >
          <div className="agent-tag__row">
            <span className="agent-tag__name">{AGENTS[id].name}</span>
            <span ref={bind(id, "state")} className="agent-tag__state" />
          </div>
        </div>
      ))}
    </div>
  );
}
