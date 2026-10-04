import { describe, expect, it } from 'vitest';
import { parseConversations } from '../src/conversationImport';
import { validateBoard } from '../src/store';

const generic = (content = 'Hello') => ({
  title: 'Imported chat',
  messages: [{ role: 'user', content }],
});
const chatGPT = () => ({
  title: 'Tree',
  current_node: 'answer',
  mapping: {
    root: { parent: null, message: null },
    empty: {
      parent: 'root',
      message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } },
    },
    question: {
      parent: 'empty',
      message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['Question'] } },
    },
    answer: {
      parent: 'question',
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Answer'] },
      },
    },
    alternative: {
      parent: 'question',
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Excluded'] },
      },
    },
  },
});

describe('external conversation imports', () => {
  it('creates valid independent boards and messages without retaining provider secrets', () => {
    const result = parseConversations([
      { ...generic(), apiKey: 'never-copy', model: 'unknown' },
      generic(),
    ]);
    expect(result.format).toBe('Messages JSON');
    expect(result.boards).toHaveLength(2);
    for (const board of result.boards) expect(validateBoard(board).nodes).toHaveLength(1);
    expect(result.boards[0].id).not.toBe(result.boards[1].id);
    expect(result.boards[0].nodes[0].data.messages[0].id).not.toBe(
      result.boards[1].nodes[0].data.messages[0].id,
    );
    expect(JSON.stringify(result)).not.toContain('never-copy');
    expect(result.boards[0].nodes[0].data.provider).toBeUndefined();
  });
  it('follows only the ChatGPT active path in parent-first order with an explicit warning', () => {
    const result = parseConversations(chatGPT());
    expect(result.boards[0].nodes[0].data.messages.map((m) => m.content)).toEqual([
      'Question',
      'Answer',
    ]);
    expect(result.warnings[0]).toContain('alternate branches');
    expect(result.format).toBe('ChatGPT');
  });
  it('rejects missing or cyclic ChatGPT paths and non-text payloads', () => {
    const value = chatGPT();
    value.mapping.question.parent = 'answer';
    expect(() => parseConversations(value)).toThrow('cyclic');
    expect(() => parseConversations({ ...chatGPT(), current_node: 'missing' })).toThrow('Invalid');
    expect(() => parseConversations({ mapping: {} })).toThrow('current_node');
    const image = chatGPT();
    image.mapping.answer.message.content.content_type = 'multimodal_text';
    expect(() => parseConversations(image)).toThrow('non-text');
    const attachment = chatGPT();
    Object.assign(attachment.mapping.question.message, {
      metadata: { attachments: [{ name: 'file.pdf' }] },
    });
    expect(() => parseConversations(attachment)).toThrow('attachments');
    const tool = chatGPT();
    Object.assign(tool.mapping.question.message, { recipient: 'python' });
    expect(() => parseConversations(tool)).toThrow('tool calls');
  });
  it('imports Claude legacy text and structured text blocks, preserving system turns in generic JSON', () => {
    const result = parseConversations({
      name: 'Claude chat',
      chat_messages: [
        { sender: 'human', text: 'Question' },
        {
          sender: 'assistant',
          content: [
            { type: 'text', text: 'First' },
            { type: 'text', text: 'Second' },
          ],
        },
      ],
    });
    expect(result.boards[0].nodes[0].data.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Question'],
      ['assistant', 'First\nSecond'],
    ]);
    expect(
      parseConversations({ messages: [{ role: 'system', content: 'Instructions' }] }).boards[0]
        .nodes[0].data.messages[0].role,
    ).toBe('system');
  });
  it('rejects tools, images, attachments, empty content and invalid roles instead of silently losing data', () => {
    for (const turn of [
      { role: 'tool', content: 'output' },
      { role: 'assistant', content: '', tool_calls: [{}] },
      { role: 'user', content: [{ type: 'image_url', image_url: 'https://example.com' }] },
      { role: 'user', content: 'text', attachments: [{}] },
      { role: 'user', content: ' ' },
    ])
      expect(() => parseConversations({ messages: [turn] })).toThrow();
    expect(() =>
      parseConversations({ chat_messages: [{ sender: 'human', text: 'text', attachments: [{}] }] }),
    ).toThrow('attachments');
    expect(() =>
      parseConversations({
        chat_messages: [{ sender: 'human', text: 'text', content: [{ type: 'image' }] }],
      }),
    ).toThrow('non-text');
  });
  it('validates the whole archive and enforces limits before returning any boards', () => {
    expect(() => parseConversations([generic(), { messages: [] }])).toThrow('Conversation 2');
    expect(() => parseConversations([])).toThrow('1 and 100');
    expect(() => parseConversations(Array.from({ length: 101 }, () => generic()))).toThrow(
      '1 and 100',
    );
    expect(() => parseConversations(generic('x'.repeat(100_001)))).toThrow('100,000');
    expect(() =>
      parseConversations({
        messages: Array.from({ length: 5001 }, () => ({ role: 'user', content: 'x' })),
      }),
    ).toThrow('5,000');
    expect(() => parseConversations({ ...generic(), title: '' })).toThrow('title');
    expect(() => parseConversations({ unknown: [] })).toThrow('Unrecognized');
  });
});
