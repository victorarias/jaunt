import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { readLocalBlob } from "../src/git.ts";

// These run against the jaunt repo itself — HEAD is always present.
describe("readLocalBlob", () => {
  test("reads a file at HEAD via git show", async () => {
    const headSha = (await $`git rev-parse HEAD`.quiet().text()).trim();
    const result = await readLocalBlob(process.cwd(), headSha, "package.json");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.content).toContain(`"name"`);
  });

  test("returns ok:false with a reason when the path is absent at that rev", async () => {
    const headSha = (await $`git rev-parse HEAD`.quiet().text()).trim();
    const result = await readLocalBlob(
      process.cwd(),
      headSha,
      "this/does/not/exist.ts",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/git exit/);
  });

  test("returns ok:false when cwd is not a git repo", async () => {
    const result = await readLocalBlob("/tmp", "deadbeef", "whatever");
    expect(result.ok).toBe(false);
  });
});
