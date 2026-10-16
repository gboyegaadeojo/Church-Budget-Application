import { describe, expect, it } from "vitest";
import { matchDepartments, type MatchableDepartment } from "@/domain/users/ministry-departments";

const MEDIA: MatchableDepartment = { id: "m", name: "Media Team", pcoValue: null };
const YOUTH: MatchableDepartment = { id: "y", name: "Youth", pcoValue: "Youth Ministry" };
const DRAMA: MatchableDepartment = { id: "d", name: "Drama Team", pcoValue: null };
const ALL = [MEDIA, YOUTH, DRAMA];

const ids = (values: string[]) => matchDepartments(values, ALL).map((d) => d.id);

describe("matchDepartments (Ministry Department field)", () => {
  it("matches names ignoring case and spacing", () => {
    expect(ids(["media team"])).toEqual(["m"]);
    expect(ids(["  Media   Team "])).toEqual(["m"]);
  });

  it("matches the Planning Center value instead of the name when one is set", () => {
    expect(ids(["Youth Ministry"])).toEqual(["y"]);
    expect(ids(["Youth"])).toEqual([]);
  });

  it("gives several departments for several values, and none for unknown ones", () => {
    expect(ids(["Drama Team", "Media Team", "Choir"])).toEqual(["m", "d"]);
    expect(ids([])).toEqual([]);
    expect(ids(["Choir"])).toEqual([]);
  });
});
