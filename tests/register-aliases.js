/**
 * Test-runner import hook: maps the "@/" alias to the project's src directory.
 *
 * The Next.js app resolves `@/lib/x` via its bundler, but plain `node --test`
 * never sees that alias. Loading this file (`--import ./tests/register-aliases.js`)
 * registers a resolve hook so tests can import real app modules — e.g.
 * `src/lib/policy.js` — without a copy-paste test double.
 */
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(projectRoot, "src");

/** App imports are extensionless — the Next resolver adds .js, plain Node does not. */
function withExtension(filePath) {
  return path.extname(filePath) ? filePath : `${filePath}.js`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      // pathToFileURL: on Windows the resolver requires a file:// URL.
      return nextResolve(
        pathToFileURL(withExtension(path.join(srcDir, specifier.slice(2)))),
        context
      );
    }
    return nextResolve(specifier, context);
  },
});
