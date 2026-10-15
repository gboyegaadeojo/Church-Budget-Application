import { describe, expect, it } from "vitest";
import { daysWaiting, getMyTasks, type Task, type TaskProvider } from "@/domain/tasks";
import type { Viewer } from "@/lib/roles";

const viewer: Viewer = {
  id: "u1",
  name: "Sam Lee",
  email: "sam@example.org",
  roles: ["accountant", "requester"],
  departments: [{ id: "media", name: "Media", representativeType: "primary" }],
};

function task(id: string, waitingSince: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    area: "annual",
    action: "Review",
    item: id,
    waitingSince: new Date(waitingSince),
    href: `/annual/${id}`,
    buttonLabel: "Open",
    ...overrides,
  };
}

const provider =
  (...tasks: Task[]): TaskProvider =>
  async () =>
    tasks;

describe("getMyTasks", () => {
  it("is empty when nothing is waiting", async () => {
    expect(await getMyTasks(viewer, [])).toEqual([]);
    expect(await getMyTasks(viewer, [provider(), provider()])).toEqual([]);
  });

  it("is empty with the registered providers while none exist yet", async () => {
    expect(await getMyTasks(viewer)).toEqual([]);
  });

  it("merges every provider and lists the oldest first", async () => {
    const tasks = await getMyTasks(viewer, [
      provider(task("b", "2026-10-03T10:00:00Z"), task("d", "2026-10-09T10:00:00Z")),
      provider(task("a", "2026-10-01T10:00:00Z"), task("c", "2026-10-05T10:00:00Z")),
    ]);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("lists an item reached through two roles once, at its earliest wait", async () => {
    const tasks = await getMyTasks(viewer, [
      provider(task("exp-42", "2026-10-06T10:00:00Z", { action: "Later" })),
      provider(task("exp-42", "2026-10-02T10:00:00Z", { action: "Earlier" })),
      provider(task("other", "2026-10-04T10:00:00Z")),
    ]);
    expect(tasks.map((t) => t.id)).toEqual(["exp-42", "other"]);
    expect(tasks[0]).toMatchObject({ action: "Earlier" });
  });

  it("orders ties by id so the list is stable", async () => {
    const same = "2026-10-02T10:00:00Z";
    const tasks = await getMyTasks(viewer, [provider(task("z", same), task("m", same))]);
    expect(tasks.map((t) => t.id)).toEqual(["m", "z"]);
  });

  it("passes the viewer to each provider", async () => {
    const seen: Viewer[] = [];
    await getMyTasks(viewer, [
      async (v) => {
        seen.push(v);
        return [];
      },
    ]);
    expect(seen).toEqual([viewer]);
  });
});

describe("daysWaiting", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("counts whole days", () => {
    expect(daysWaiting(new Date("2026-10-14T08:00:00Z"), now)).toBe(0);
    expect(daysWaiting(new Date("2026-10-13T12:00:00Z"), now)).toBe(1);
    expect(daysWaiting(new Date("2026-10-11T13:00:00Z"), now)).toBe(2);
  });

  it("never goes below zero", () => {
    expect(daysWaiting(new Date("2026-10-15T12:00:00Z"), now)).toBe(0);
  });
});
