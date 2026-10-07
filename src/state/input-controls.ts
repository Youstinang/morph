import { z } from "zod";

/**
 * The trusted catalog of controls MORPH can show when the team needs something only the user knows. A
 * request declares one of these; the screen renders it from MORPH's own components, and every answer is
 * checked against it here, in the operation checker, and again on the server for live questions.
 */

export const INPUT_CONTROL_TYPES = ["text", "number", "currency", "percentage", "slider", "single_choice", "multi_choice", "confirmation"] as const;
export type InputControlType = (typeof INPUT_CONTROL_TYPES)[number];

const LIMIT = 1e12;
const Amount = z.number().finite().min(-LIMIT).max(LIMIT);
const Step = z.number().finite().positive().max(LIMIT);
const Choice = z.string().trim().min(1).max(40);
const Unit = z.string().trim().min(1).max(12);

const Range = { min: Amount, max: Amount, step: Step.optional(), initial: Amount.optional() };

export const InputControlSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("text"), maxLength: z.number().int().min(1).max(200) }).strict(),
    z.object({ type: z.literal("number"), ...Range, unit: Unit.optional() }).strict(),
    z.object({ type: z.literal("currency"), ...Range, currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
    z.object({ type: z.literal("percentage"), ...Range, min: z.number().min(0).max(100), max: z.number().min(0).max(100) }).strict(),
    z
      .object({
        type: z.literal("slider"),
        ...Range,
        unit: Unit.optional(),
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        /** Fixed stops the slider snaps to, in order; otherwise it moves in `step`s from `min` to `max`. */
        stops: z.array(Amount).min(2).max(7).optional(),
      })
      .strict(),
    z.object({ type: z.literal("single_choice"), options: z.array(Choice).min(2).max(5) }).strict(),
    z.object({ type: z.literal("multi_choice"), options: z.array(Choice).min(2).max(6) }).strict(),
    z.object({ type: z.literal("confirmation") }).strict(),
  ])
  .superRefine((control, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if ("min" in control) {
      if (control.min >= control.max) issue("min must be below max");
      if (control.initial !== undefined && (control.initial < control.min || control.initial > control.max)) issue("initial is out of range");
    }
    if (control.type === "slider" && control.stops) {
      const stops = control.stops;
      if (stops.some((stop, i) => i > 0 && stop <= stops[i - 1]!)) issue("stops must rise");
      if (stops[0] !== control.min || stops.at(-1) !== control.max) issue("stops must start at min and end at max");
      if (control.initial !== undefined && !stops.includes(control.initial)) issue("initial must be one of the stops");
    }
    if ("options" in control && new Set(control.options.map((option) => option.toLowerCase())).size !== control.options.length) {
      issue("options must differ");
    }
  });
export type InputControl = z.infer<typeof InputControlSchema>;

export const TEXT_CONTROL: InputControl = { type: "text", maxLength: 200 };

/** An answer's raw value: a number for numeric controls, text, the chosen options, or yes/no. */
export const InputValueSchema = z.union([z.number().finite(), z.string().max(200), z.array(Choice).max(6), z.boolean()]);
export type InputValue = z.infer<typeof InputValueSchema>;

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** How a value reads on screen and in the record: "USD 500,000", "15%", "Yes". */
export function formatValue(control: InputControl, value: InputValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value.trim();
  const amount = grouped.format(value);
  switch (control.type) {
    case "currency":
      return `${control.currency} ${amount}`;
    case "percentage":
      return `${amount}%`;
    case "slider":
      return control.currency ? `${control.currency} ${amount}` : control.unit ? `${amount} ${control.unit}` : amount;
    case "number":
      return control.unit ? `${amount} ${control.unit}` : amount;
    default:
      return amount;
  }
}

export type AnswerCheck = { ok: true; value: InputValue; display: string } | { ok: false; reason: string };

/** Whether a value answers this control; a clean copy of the value and how it reads if it does. */
export function checkAnswer(control: InputControl, value: unknown): AnswerCheck {
  const no = (reason: string): AnswerCheck => ({ ok: false, reason });
  const yes = (clean: InputValue): AnswerCheck => {
    const display = formatValue(control, clean);
    return display.length > 200 ? no("the answer is too long") : { ok: true, value: clean, display };
  };
  switch (control.type) {
    case "text": {
      if (typeof value !== "string") return no("the answer should be text");
      const text = value.trim();
      if (!text) return no("the answer is empty");
      return text.length > control.maxLength ? no(`the answer is longer than ${control.maxLength} characters`) : yes(text);
    }
    case "number":
    case "currency":
    case "percentage":
    case "slider": {
      if (typeof value !== "number" || !Number.isFinite(value)) return no("the answer should be a number");
      if (value < control.min || value > control.max) return no(`the answer should be between ${formatValue(control, control.min)} and ${formatValue(control, control.max)}`);
      if (control.type === "slider" && control.stops && !control.stops.includes(value)) return no("the answer should be one of the slider's stops");
      return yes(value);
    }
    case "single_choice":
      return typeof value === "string" && control.options.includes(value) ? yes(value) : no("the answer should be one of the options");
    case "multi_choice": {
      if (!Array.isArray(value) || value.length === 0) return no("pick at least one option");
      const picked = control.options.filter((option) => value.includes(option));
      return picked.length === value.length && new Set(value).size === value.length ? yes(picked) : no("the answer should only use the options");
    }
    case "confirmation":
      return typeof value === "boolean" ? yes(value) : no("the answer should be yes or no");
  }
}

/** The value a control starts at before the user touches it, if it has a sensible one. */
export function initialValue(control: InputControl): InputValue | null {
  switch (control.type) {
    case "number":
    case "currency":
    case "percentage":
      return control.initial ?? null;
    case "slider":
      return control.initial ?? control.stops?.[0] ?? control.min;
    case "multi_choice":
      return [];
    default:
      return null;
  }
}
