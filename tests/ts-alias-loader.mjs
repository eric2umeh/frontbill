import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function resolveExistingPath(absPath) {
  const candidates = path.extname(absPath)
    ? [absPath]
    : [`${absPath}.ts`, `${absPath}.tsx`, `${absPath}.js`, path.join(absPath, 'index.ts')]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next extension candidate.
    }
  }

  return absPath
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const absPath = await resolveExistingPath(path.join(root, specifier.slice(2)))
    return {
      url: pathToFileURL(absPath).href,
      shortCircuit: true,
    }
  }

  return nextResolve(specifier, context)
}
