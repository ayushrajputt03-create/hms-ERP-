import { describe, expect, it } from 'vitest'
import { isStaleChunkError } from './ErrorBoundary'

describe('stale deployment chunk recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/PharmacyPage-old.js',
    'Importing a module script failed.',
    'Loading chunk 123 failed',
    'ChunkLoadError: Loading chunk 8 failed.',
  ])('recognises a recoverable chunk error: %s', (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true)
  })

  it('does not reload for an ordinary application error', () => {
    expect(isStaleChunkError(new Error('Patient record was not found'))).toBe(false)
  })
})
