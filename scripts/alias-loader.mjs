/**
 * Resolves the project's "@/..." path alias, and the extensionless specifiers
 * that go with it, for scripts run under plain Node.
 *
 * tsconfig paths and extensionless imports are TypeScript/bundler conventions;
 * Node implements neither, so importing a lib module that uses "@/lib/x"
 * internally fails twice over — once on the alias, once on the missing ".ts".
 * This does what the bundler would: rewrite the prefix, then try the
 * extensions the project actually uses.
 */
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = pathToFileURL(process.cwd() + '/').href
const EXTS = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']

export function resolve(specifier, context, next) {
  let spec = specifier
  if (spec.startsWith('@/')) spec = ROOT + spec.slice(2)

  // Relative specifiers inside an aliased module resolve against its own URL,
  // which Node handles — they just arrive without an extension.
  const base = spec.startsWith('file:') ? spec
    : spec.startsWith('.') && context.parentURL ? new URL(spec, context.parentURL).href
    : null

  if (base && !/\.[a-z]+$/i.test(base)) {
    for (const ext of EXTS) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context)
    }
  }
  return next(spec, context)
}
