import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
export type Tone =
  | "neutral"
  | "active"
  | "success"
  | "warning"
  | "uncertain"
  | "error";
export function GlassPanel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-panel ${className}`} {...props}>
      {children}
    </div>
  );
}
export function SectionLabel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`section-label ${className}`} {...props}>
      {children}
    </p>
  );
}
export function StatusIndicator({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span className="status-indicator" data-tone={tone}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
export function AgentStatus({
  name,
  label,
  tone = "neutral",
}: {
  name: string;
  label: string;
  tone?: Tone;
}) {
  return (
    <div className="agent-status">
      <span>{name}</span>
      <StatusIndicator label={label} tone={tone} />
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="metric">
      <SectionLabel>{label}</SectionLabel>
      <p className="metric-value">{value}</p>
      {detail && <p className="muted">{detail}</p>}
    </div>
  );
}
/** Ordinal assessment display, never a calibrated probability. */
export function ConfidenceIndicator({
  level,
  description,
}: {
  level: "low" | "moderate" | "high";
  description: string;
}) {
  const strength = { low: 1, moderate: 2, high: 3 }[level];
  return (
    <div className="confidence">
      <div className="confidence-heading">
        <span>Model confidence · {level}</span>
        <span className="confidence-bars" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} data-filled={n <= strength} />
          ))}
        </span>
      </div>
      <p className="muted">{description}</p>
      <p className="caption">Model assessment, not a probability.</p>
    </div>
  );
}
type ActionProps = ButtonHTMLAttributes<HTMLButtonElement>;
export function PrimaryAction({
  children,
  className = "",
  type = "button",
  ...props
}: ActionProps) {
  return (
    <button
      className={`action action-primary ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
export function SecondaryAction({
  children,
  className = "",
  type = "button",
  ...props
}: ActionProps) {
  return (
    <button
      className={`action action-secondary ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
