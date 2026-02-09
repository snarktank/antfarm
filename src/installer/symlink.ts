import { existsSync, mkdirSync, symlinkSync, unlinkSync, readlinkSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const BINARY_NAME = "antfarm";

/**
 * Ensure `antfarm` is available on PATH by symlinking into ~/.local/bin.
 * Safe to call repeatedly — skips if already correct, updates if stale.
 */
export function ensureCliSymlink(): void {
  const home = process.env.HOME;
  if (!home) return;

  const localBin = join(home, ".local", "bin");
  const linkPath = join(localBin, BINARY_NAME);

  // Resolve the actual CLI entry point (dist/cli/cli.js)
  const cliEntry = join(
    fileURLToPath(import.meta.url),
    "..",
    "..",
    "cli",
    "cli.js",
  );

  try {
    mkdirSync(localBin, { recursive: true });
  } catch {
    // already exists
  }

  // Check existing symlink
  if (existsSync(linkPath)) {
    try {
      const current = readlinkSync(linkPath);
      if (current === cliEntry) return; // already correct
    } catch {
      // not a symlink or unreadable — replace it
    }
    try {
      unlinkSync(linkPath);
    } catch {
      console.warn(`  ⚠ Could not update symlink at ${linkPath}`);
      return;
    }
  }

  try {
    symlinkSync(cliEntry, linkPath);
    console.log(`  ✓ Symlinked ${BINARY_NAME} → ${localBin}`);
  } catch (err) {
    console.warn(`  ⚠ Could not create symlink: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Remove the CLI symlink (used during uninstall).
 */
export function removeCliSymlink(): void {
  const home = process.env.HOME;
  if (!home) return;

  const linkPath = join(home, ".local", "bin", BINARY_NAME);
  if (existsSync(linkPath)) {
    try {
      unlinkSync(linkPath);
      console.log(`  ✓ Removed symlink ${linkPath}`);
    } catch {
      console.warn(`  ⚠ Could not remove symlink at ${linkPath}`);
    }
  }
}
