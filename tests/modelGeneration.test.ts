import { describe, expect, it } from 'vitest';
import { latestGenerationModels, type GenerationModel } from '../src/modelGeneration';

const now = Date.parse('2026-10-24');
const model = (
  id: string,
  family = 'gpt',
  extra: Partial<GenerationModel> = {},
): GenerationModel => ({
  id,
  family,
  release_date: '2026-01-01',
  modalities: { input: ['text'], output: ['text'] },
  ...extra,
});

describe('latest conversation generation policy', () => {
  it('compares numeric generations, not spelling or the latest listing date', () => {
    expect(
      latestGenerationModels(
        [
          model('qwen2.9-32b', 'qwen2.9', { release_date: '2026-10-23' }),
          model('qwen2.10-32b', 'qwen2.10'),
          model('qwen2.10-8b', 'qwen2.10'),
        ],
        now,
      ),
    ).toEqual(['qwen2.10-32b', 'qwen2.10-8b']);
  });
  it('keeps current capability tiers including compound tiers and open-weight models', () => {
    expect(
      latestGenerationModels(
        [
          model('gpt-6.1-sol'),
          model('gpt-6-sol'),
          model('gpt-6.1-sol-pro'),
          model('gpt-5.4-mini'),
          model('gpt-4o-mini'),
          model('gpt-5.4-nano'),
          model('gpt-oss-20b', 'gpt-oss'),
          model('gpt-oss-120b', 'gpt-oss'),
          model('o3-mini', 'o3'),
          model('o4-mini', 'o4'),
          model('o3-pro', 'o3'),
        ],
        now,
      ),
    ).toEqual([
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-6.1-sol',
      'gpt-6.1-sol-pro',
      'gpt-oss-120b',
      'gpt-oss-20b',
      'o3-pro',
      'o4-mini',
    ]);
  });
  it('normalizes Claude and Kimi generation families while preserving separate tiers', () => {
    expect(
      latestGenerationModels(
        [
          model('claude-3-5-sonnet-latest', 'claude-sonnet'),
          model('claude-sonnet-4-5', 'claude-sonnet'),
          model('claude-sonnet-5-5', 'claude-sonnet'),
          model('claude-haiku-4-5', 'claude-haiku'),
          model('moonshotai/kimi-k2-thinking', 'kimi-k2'),
          model('moonshotai/kimi-k3-thinking', 'kimi-k3'),
        ],
        now,
      ),
    ).toEqual(['claude-haiku-4-5', 'claude-sonnet-5-5', 'moonshotai/kimi-k3-thinking']);
  });
  it('does not confuse parameter counts, snapshots, dates or aliases with generations', () => {
    expect(
      latestGenerationModels(
        [
          model('gpt-6.1'),
          model('gpt-6.1-20261001'),
          model('gpt-6.1-latest'),
          model('mistral-large-2512', 'mistral-large'),
          model('mistral-large-4', 'mistral-large'),
          model('llama-3.3-70b', 'llama'),
          model('llama-4-8b', 'llama'),
        ],
        now,
      ),
    ).toEqual(['gpt-6.1', 'llama-4-8b', 'mistral-large-4']);
  });
  it('uses release metadata for reviewed unversioned families and rejects incompatible tasks', () => {
    expect(
      latestGenerationModels(
        [
          model('mistral-large-old', 'mistral-large', { release_date: '2025-01-01' }),
          model('mistral-large-new', 'mistral-large'),
          model('gpt-oss-safeguard-20b', 'gpt-oss', { release_date: '2026-10-01' }),
          model('gpt-6-image'),
          model('gpt-6-audio'),
          model('gpt-7', 'gpt', { type: 'embedding' }),
          model('gpt-8', 'gpt', { status: 'deprecated' }),
          model('gpt-9', 'gpt', { status: 'retired' }),
        ],
        now,
      ),
    ).toEqual(['mistral-large-new']);
  });
  it('leaves unknown, malformed, missing-metadata and future models to exact-ID entry', () => {
    expect(
      latestGenerationModels(
        [
          model('unreviewed-99', 'unreviewed'),
          model('~gpt-latest', 'gpt'),
          model('gpt-9', 'gpt', { family: undefined }),
          model('gpt-9', 'gpt', { release_date: '2026-02-30' }),
          model('gpt-9', 'gpt', { release_date: '2027-01-01' }),
          model('gpt-9', 'gpt', { release_date: undefined }),
          model('gpt-9', 'gpt', { modalities: { input: ['text'], output: ['image'] } }),
        ],
        now,
      ),
    ).toEqual([]);
  });
});
