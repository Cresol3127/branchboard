import { describe, expect, it } from 'vitest';
import { searchWorkspace } from '../src/search';
import type { Board } from '../src/types';

const boards: Board[] = ['one', 'two'].map((id) => ({
  id,
  name: `Board ${id}`,
  updatedAt: 0,
  edges: [],
  nodes: [
    {
      id: `chat-${id}`,
      type: 'chat',
      position: { x: 0, y: 0 },
      data: {
        title: 'Planning',
        color: 'purple',
        note: '',
        collapsed: true,
        messages: [
          {
            id: `user-${id}`,
            role: 'user',
            content: `${'prefix '.repeat(80)}Find [literal].* here 🪻`,
          },
          { id: `assistant-${id}`, role: 'assistant', content: 'A helpful answer about orchids.' },
          { id: `system-${id}`, role: 'system', content: 'Keep private instructions local.' },
        ],
      },
    },
    {
      id: `note-${id}`,
      type: 'note',
      position: { x: 400, y: 0 },
      data: {
        title: 'References',
        color: 'amber',
        note: 'ORCHIDS need water.',
        messages: [],
      },
    },
  ],
}));

describe('saved workspace search', () => {
  it('finds message/note content across boards case-insensitively with precise message targets', () => {
    const { results, hasMore } = searchWorkspace(boards, ' ORCHIDS ');
    expect(results).toHaveLength(4);
    expect(hasMore).toBe(false);
    expect(results[0]).toMatchObject({
      boardId: 'one',
      nodeId: 'chat-one',
      messageId: 'assistant-one',
      source: 'assistant',
    });
    expect(results[1]).toMatchObject({ source: 'note', nodeId: 'note-one' });
    expect(results[2].boardId).toBe('two');
  });
  it('searches literal punctuation and deep history with bounded contextual snippets', () => {
    const { results } = searchWorkspace(boards, '[literal].*');
    expect(results).toHaveLength(2);
    expect(results[0].snippet).toContain('[literal].* here 🪻');
    expect(results[0].snippet.startsWith('…')).toBe(true);
    expect(results[0].snippet.length).toBeLessThan(180);
  });
  it('includes titles and system messages, ignores empty searches and limits results honestly', () => {
    expect(searchWorkspace(boards, 'planning').results[0].source).toBe('title');
    expect(searchWorkspace(boards, 'instructions').results[0].source).toBe('system');
    expect(searchWorkspace(boards, '  ')).toEqual({ results: [], hasMore: false });
    expect(searchWorkspace(boards, 'not present').results).toEqual([]);
    expect(searchWorkspace(boards, 'orchids', 2)).toMatchObject({
      results: expect.any(Array),
      hasMore: true,
    });
    expect(searchWorkspace(boards, 'orchids', 4).hasMore).toBe(false);
  });
});
