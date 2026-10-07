"use client";
import { useId, useState } from "react";
import { PrimaryAction } from "./primitives";
export function CommandInput({
  label = "Your objective",
  placeholder,
  onSubmit,
  disabled = false,
}: {
  label?: string;
  placeholder?: string;
  onSubmit: (objective: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <form
      className="command-form"
      onSubmit={(event) => {
        event.preventDefault();
        const objective = value.trim();
        if (!disabled && objective) onSubmit(objective);
      }}
    >
      <label className="section-label" htmlFor={id}>
        {label}
      </label>
      <div className="command-field">
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={2000}
          autoComplete="off"
        />
        <PrimaryAction
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Submit objective"
        >
          <span aria-hidden="true">↗</span>
        </PrimaryAction>
      </div>
    </form>
  );
}
