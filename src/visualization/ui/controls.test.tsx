import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CommandInput } from "./command-input";
import { ConfidenceIndicator, PrimaryAction } from "./primitives";

it("prevents blank objectives and submits trimmed input", () => {
  const submit = vi.fn();
  render(<CommandInput onSubmit={submit} />);
  const button = screen.getByRole("button", {
    name: "Submit objective",
  }) as HTMLButtonElement;
  const input = screen.getByRole("textbox", { name: "Your objective" });
  expect(button.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.submit(input.closest("form")!);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "  Compare approaches  " } });
  expect(button.disabled).toBe(false);
  fireEvent.submit(input.closest("form")!);
  expect(submit).toHaveBeenCalledExactlyOnceWith("Compare approaches");
});

it("keeps disabled objective entry inert", () => {
  const submit = vi.fn();
  render(<CommandInput disabled onSubmit={submit} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(input.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "An objective" } });
  fireEvent.submit(input.closest("form")!);
  expect(submit).not.toHaveBeenCalled();
});

it("does not accidentally submit a surrounding form from a primary action", () => {
  const submit = vi.fn();
  render(
    <form onSubmit={submit}>
      <PrimaryAction>Inspect</PrimaryAction>
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  expect(submit).not.toHaveBeenCalled();
});

it("communicates confidence in text with the probability limitation", () => {
  render(
    <ConfidenceIndicator
      level="moderate"
      description="Evidence is incomplete."
    />,
  );
  expect(screen.getByText("Model confidence · moderate")).toBeDefined();
  expect(
    screen.getByText("Model assessment, not a probability."),
  ).toBeDefined();
});
