import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BlogContent, RichText } from "../components/BlogContent";

describe("structured blog rendering", () => {
  it("renders supported blocks, media metadata, and a real service CTA", () => {
    render(<MemoryRouter><BlogContent
      blocks={[
        { type: "heading", level: 2, text: "راهنمای انتخاب" },
        { type: "paragraph", text: "متن **مهم** و [رزرو](/book)" },
        { type: "image", media_id: 4 },
        { type: "service", service_id: 8 },
      ]}
      media={[{ id: 4, image_url: "/media/blog/content/photo.webp", alt_text: "نمای نزدیک مو", caption: "نتیجه نهایی" }]}
      services={[{ id: 8, slug: "hair-care", persian_name: "مراقبت مو", short_description: "توضیح سرویس", images: [] }]}
    /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "راهنمای انتخاب" })).toBeInTheDocument();
    expect(screen.getByText("مهم").tagName).toBe("STRONG");
    expect(screen.getByRole("img", { name: "نمای نزدیک مو" })).toBeInTheDocument();
    expect(screen.getByText("نتیجه نهایی")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /رزرو این سرویس/ })).toHaveAttribute("href", "/book?service=8");
  });

  it("does not create an executable link from an unsafe protocol", () => {
    render(<MemoryRouter><RichText text="[خطر](javascript:alert(1))" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "خطر" })).toHaveAttribute("href", "#");
  });
});
