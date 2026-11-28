import { describe, expect, it, vi } from 'vitest'
import data from '../src/data/gunja.json'
import { locationCatalog } from '../src/locate/catalog'
import type { Station } from '../src/station/types'
import { handleLocate } from './handler'
import { buildPrompt, parseAnswer } from './locateWithClaude'

const catalog = locationCatalog(data as Station)

describe('LLM locate (no real API calls)', () => {
  it('lists only nodes that exist in the station data', () => {
    const ids = new Set((data as Station).nodes.map((n) => n.id))
    expect(catalog.length).toBeGreaterThan(15)
    for (const c of catalog) expect(ids.has(c.id), c.id).toBe(true)
    expect(buildPrompt(catalog)).toContain('x4_bot')
  })

  it('accepts a valid answer and rejects ids outside the list', () => {
    expect(parseAnswer('{"nodeId":"x4_bot","confidence":0.9,"reason":"4 출입구"}', catalog)).toEqual({ nodeId: 'x4_bot', confidence: 0.9, reason: '4 출입구' })
    expect(parseAnswer('Here: {"nodeId":"gate_7","confidence":2,"reason":"타는 곳 7"}', catalog)!.confidence).toBe(1)
    expect(parseAnswer('{"nodeId":"seoul_station","confidence":0.9}', catalog)).toBeNull()
    expect(parseAnswer('{"nodeId":"unknown","confidence":0}', catalog)).toBeNull()
    expect(parseAnswer('not json', catalog)).toBeNull()
  })

  it('is switched off (501) without an API key and never calls the model', async () => {
    const locate = vi.fn()
    const r = await handleLocate({ image: 'abc', mediaType: 'image/jpeg' }, {}, locate)
    expect(r.status).toBe(501)
    expect(locate).not.toHaveBeenCalled()
  })

  it('validates input before calling the model', async () => {
    const locate = vi.fn()
    expect((await handleLocate({ mediaType: 'image/jpeg' }, { ANTHROPIC_API_KEY: 'k' }, locate)).status).toBe(400)
    expect((await handleLocate({ image: 'abc', mediaType: 'image/gif' }, { ANTHROPIC_API_KEY: 'k' }, locate)).status).toBe(400)
    expect(locate).not.toHaveBeenCalled()
  })

  it('returns the model answer, or 422 when it is not confident', async () => {
    const ok = vi.fn().mockResolvedValue({ nodeId: 'gate_7', confidence: 0.8, reason: '타는 곳 7' })
    expect((await handleLocate({ image: 'abc', mediaType: 'image/jpeg' }, { ANTHROPIC_API_KEY: 'k' }, ok)).body).toMatchObject({ nodeId: 'gate_7' })
    const none = vi.fn().mockResolvedValue(null)
    expect((await handleLocate({ image: 'abc', mediaType: 'image/jpeg' }, { ANTHROPIC_API_KEY: 'k' }, none)).status).toBe(422)
  })
})
