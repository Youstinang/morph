import { useId, useState, type FormEvent, type Ref } from "react";
import type { HumanInputRequest } from "@/state/domain";
import { checkAnswer, formatValue, initialValue, type InputControl, type InputValue } from "@/state/input-controls";
import { AGENTS } from "./sim/roster";
import type { AgentId } from "./sim/types";

interface InputPanelProps {
  request: HumanInputRequest;
  /** "1 of 2" when the team asked more than one question. */
  position: { index: number; total: number } | null;
  /** Live questions can be skipped; the demo's question can't. */
  canSkip: boolean;
  anchorRef: Ref<HTMLElement>;
  onAnswer: (value: InputValue) => void;
  onSkip: () => void;
  /** The user has started answering. */
  onEngage: () => void;
}

/**
 * The team's question for the user, with its trusted control. It floats beside whoever asked (the scene
 * positions it), and docks at the bottom of the screen on phones. Every control is a real form element,
 * labelled and usable from the keyboard; the answer is checked against the control before it can be sent.
 */
export function InputPanel({ request, position, canSkip, anchorRef, onAnswer, onSkip, onEngage }: InputPanelProps) {
  const asker = AGENTS[request.askedBy as AgentId];
  const id = useId();
  const [value, setValue] = useState<InputValue | null>(() => initialValue(request.control));
  const checked = value === null ? null : checkAnswer(request.control, value);
  const ready = checked?.ok === true;
  const engage = () => onEngage();
  const change = (next: InputValue) => {
    engage();
    setValue(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (checked?.ok) onAnswer(checked.value);
  };

  return (
    <section
      ref={anchorRef}
      className="input-panel"
      aria-labelledby={`${id}-question`}
      onPointerDown={engage}
      onFocus={engage}
      style={{ ["--asker" as string]: asker?.look.accent ?? "#fff" }}
    >
      <form onSubmit={submit}>
        <p className="input-panel__who">
          <span className="lab-caption__dot" style={{ background: asker?.look.accent }} />
          {asker?.name ?? "The team"} asks you
          {position && position.total > 1 && (
            <span className="input-panel__count">
              {position.index + 1} of {position.total}
            </span>
          )}
        </p>
        <p id={`${id}-question`} className="input-panel__question">
          {request.question}
        </p>
        <Field control={request.control} value={value} onChange={change} labelId={`${id}-question`} onConfirm={(yes) => onAnswer(yes)} />
        {checked && !checked.ok && value !== "" && <p className="input-panel__hint">{sentence(checked.reason)}</p>}
        <div className="input-panel__actions">
          {request.control.type !== "confirmation" && (
            <button type="submit" className="action action-primary" disabled={!ready}>
              {ready ? `Send ${checked.display}` : "Send"}
            </button>
          )}
          {canSkip && (
            <button type="button" className="lab-btn" onClick={onSkip}>
              Skip
            </button>
          )}
        </div>
        {canSkip && <p className="input-panel__note">The team keeps working; Vex&apos;s review and the answer wait for you.</p>}
      </form>
    </section>
  );
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1) + ".";

interface FieldProps {
  control: InputControl;
  value: InputValue | null;
  onChange: (value: InputValue) => void;
  onConfirm: (yes: boolean) => void;
  labelId: string;
}

function Field({ control, value, onChange, onConfirm, labelId }: FieldProps) {
  switch (control.type) {
    case "text":
      return (
        <input
          className="input-panel__text"
          aria-labelledby={labelId}
          maxLength={control.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your answer"
        />
      );
    case "number":
    case "currency":
    case "percentage": {
      const prefix = control.type === "currency" ? control.currency : null;
      const suffix = control.type === "percentage" ? "%" : control.type === "number" ? (control.unit ?? null) : null;
      return (
        <label className="input-panel__number">
          {prefix && <span>{prefix}</span>}
          <input
            type="number"
            inputMode="decimal"
            aria-labelledby={labelId}
            min={control.min}
            max={control.max}
            step={control.step ?? "any"}
            value={typeof value === "number" ? value : ""}
            onChange={(event) => event.target.value !== "" && onChange(Number(event.target.value))}
          />
          {suffix && <span>{suffix}</span>}
        </label>
      );
    }
    case "slider": {
      const stops = control.stops;
      const current = typeof value === "number" ? value : control.min;
      const index = stops ? Math.max(0, stops.indexOf(current)) : 0;
      return (
        <div className="input-panel__slider">
          <output className="input-panel__value" aria-hidden="true">
            {formatValue(control, current)}
          </output>
          <input
            type="range"
            aria-labelledby={labelId}
            aria-valuetext={formatValue(control, current)}
            min={stops ? 0 : control.min}
            max={stops ? stops.length - 1 : control.max}
            step={stops ? 1 : (control.step ?? "any")}
            value={stops ? index : current}
            onChange={(event) => {
              const raw = Number(event.target.value);
              onChange(stops ? stops[raw]! : raw);
            }}
          />
          {stops && (
            <ol className="input-panel__stops" aria-hidden="true">
              {stops.map((stop) => (
                <li key={stop} data-active={stop === current}>
                  {formatValue(control, stop)}
                </li>
              ))}
            </ol>
          )}
        </div>
      );
    }
    case "single_choice":
    case "multi_choice": {
      const multi = control.type === "multi_choice";
      const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return (
        <div className="input-panel__choices" role={multi ? "group" : "radiogroup"} aria-labelledby={labelId}>
          {control.options.map((option) => (
            <label key={option} className="input-panel__choice" data-picked={picked.includes(option)}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={labelId}
                checked={picked.includes(option)}
                onChange={() => onChange(multi ? (picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]) : option)}
              />
              {option}
            </label>
          ))}
        </div>
      );
    }
    case "confirmation":
      return (
        <div className="input-panel__actions">
          <button type="button" className="action action-primary" onClick={() => onConfirm(true)}>
            Yes
          </button>
          <button type="button" className="lab-btn" onClick={() => onConfirm(false)}>
            No
          </button>
        </div>
      );
  }
}
