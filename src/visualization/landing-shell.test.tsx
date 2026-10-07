import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LandingShell } from "./landing-shell";

it("identifies the product and honestly describes its unfinished state", () => {
  render(<LandingShell />);
  expect(screen.getByRole("main")).toBeDefined();
  expect(screen.getByRole("heading", { level: 1, name: "MORPH" })).toBeDefined();
  expect(screen.getByText(/interactive experience is under construction/i)).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
