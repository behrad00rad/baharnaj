import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ReorderList from "./ReorderList";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../shared/api", () => ({ api: { post } }));
const items = [{ id: 1, name: "اول", category_name: "مو" }, { id: 2, name: "دوم", category_name: "مو" }];

beforeEach(() => { post.mockReset(); });
it("moves with keyboard friendly buttons and saves once", async () => {
  post.mockResolvedValue({ data: {} });
  const done = vi.fn();
  render(<ReorderList items={items} endpoint="admin/services/reorder/" categoryId={4} onDone={done} />);
  fireEvent.click(screen.getByRole("button", { name: "بالا بردن دوم" }));
  fireEvent.click(screen.getByRole("button", { name: "ذخیره ترتیب" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(true));
  expect(post).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledWith("admin/services/reorder/", { category_id: 4, items: [{ id: 2, display_order: 0 }, { id: 1, display_order: 1 }] });
});
it("cancels locally and retains draft after failed save", async () => {
  post.mockRejectedValue(new Error("network"));
  const done = vi.fn();
  render(<ReorderList items={items} endpoint="admin/services/reorder/" onDone={done} />);
  fireEvent.click(screen.getByRole("button", { name: "پایین بردن اول" }));
  fireEvent.click(screen.getByRole("button", { name: "ذخیره ترتیب" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ذخیره ترتیب انجام نشد");
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
  expect(done).toHaveBeenCalledWith(false);
});
