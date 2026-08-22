/**
 * Test-runner import hook: maps the "@/alias" to the project's src directory
 * AND remaps .js → .ts for relative imports where the .js file no longer exists.
 *
 * The Next.js app resolves `@/lib/x` via its bundler, but plain `node --test`
 * never sees that alias. Loading this file (`--import ./tests/register-aliases.js`)
 * registers a resolve hook so tests can import real app modules — e.g.
 * `src/lib/policy.js` — without a copy-paste test double.
 *
 * For incremental TypeScript adoption: when a .js import fails because the
 * file doesn't exist, tries .ts (and .tsx) as fallback.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(projectRoot, "src");

/**
 * App imports are extensionless — the Next resolver adds .js, plain Node does not.
 * For incremental TypeScript adoption, tries .ts first, then .js.
 */
function resolveWithExtension(filePath) {
  if (path.extname(filePath)) return filePath;
  if (existsSync(filePath + ".ts")) return filePath + ".ts";
  if (existsSync(filePath + ".tsx")) return filePath + ".tsx";
  return filePath + ".js";
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // @/ alias → src/
    if (specifier.startsWith("@/")) {
      return nextResolve(
        pathToFileURL(resolveWithExtension(path.join(srcDir, specifier.slice(2)))),
        context
      );
    }

    // Relative imports: remap .js → .ts, or resolve extensionless to .ts/.tsx
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      if (context?.parentURL) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL));

        if (specifier.endsWith(".js")) {
          // Explicit .js import — check if a .ts exists instead
          const candidate = path.resolve(parentDir, specifier);
          const tsCandidate = path.resolve(parentDir, specifier.slice(0, -3) + ".ts");
          if (!existsSync(candidate) && existsSync(tsCandidate)) {
            return nextResolve(pathToFileURL(tsCandidate), context);
          }
        } else if (!path.extname(specifier)) {
          // Extensionless import like "./grading" — try .ts, .tsx first
          const base = path.resolve(parentDir, specifier);
          if (existsSync(base + ".ts")) {
            return nextResolve(pathToFileURL(base + ".ts"), context);
          }
          if (existsSync(base + ".tsx")) {
            return nextResolve(pathToFileURL(base + ".tsx"), context);
          }
          // No .ts/.tsx found — fall through to nextResolve (likely CJS .js)
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
