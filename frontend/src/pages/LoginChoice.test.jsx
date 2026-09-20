import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LoginChoice from "./LoginChoice";

describe("login choice", () => {
  it("offers separate, discoverable customer and staff routes", () => {
    render(<MemoryRouter><LoginChoice /></MemoryRouter>);

    expect(screen.getByRole("link", { name: /ورود مشتری/ })).toHaveAttribute("href", "/account/login");
    expect(screen.getByRole("link", { name: /ورود کارکنان/ })).toHaveAttribute("href", "/staff/login");
  });
});
