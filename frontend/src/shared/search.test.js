import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch, serviceSearchFields, employeeSearchFields } from "./search";

describe("Persian browse search", () => {
  it("normalizes Arabic letters, digits, half spaces and Latin case", () => {
    expect(normalizeSearch("  كوتاه‌ي   ۱۲٣  HAIR  ")).toBe("کوتاه ی 123 hair");
  });
  it("matches service and employee fields", () => {
    expect(matchesSearch({ persian_name: "کوتاهی مو", name: "Hair Cut", category_name: "مو" }, "كوتاهي", serviceSearchFields)).toBe(true);
    expect(matchesSearch({ name: "مریم", specialty: "ناخن", services: [{ name: "مانیکور" }] }, "مانيكور", employeeSearchFields)).toBe(true);
    expect(matchesSearch({ persian_name: "کوتاهی" }, "ناخن", serviceSearchFields)).toBe(false);
  });
});
