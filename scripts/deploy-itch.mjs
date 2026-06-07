/**
 * Deploy `dist/` to itch.io (https://helloenjoy.itch.io/helloflower) via butler.
 *
 * Pushes the FOLDER (not the zip) so itch serves it as a play-in-browser HTML
 * build; the source map is ignored. Run after `vite build`.
 *
 * Prerequisites (one-time): install butler (https://itch.io/docs/butler/) and
 * authenticate with `butler login` (or set the BUTLER_API_KEY env var).
 */
import { spawnSync } from "node:child_process";

const TARGET = "helloenjoy/helloflower:html5";
const win = process.platform === "win32";

const version = spawnSync("butler", ["version"], { stdio: "ignore", shell: win });
if (version.status !== 0) {
  console.error(
    "butler not found.\n" +
      "  Install it: https://itch.io/docs/butler/installing.html\n" +
      "  Then run once: butler login",
  );
  process.exit(1);
}

const push = spawnSync(
  "butler",
  ["push", "dist", TARGET, "--ignore", "*.map"],
  { stdio: "inherit", shell: win },
);
process.exit(push.status ?? 1);
