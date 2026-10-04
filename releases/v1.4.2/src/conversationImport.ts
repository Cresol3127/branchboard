import type { Board, Message } from './types';

type RecordValue = Record<string, unknown>;
export type ConversationImport = { boards: Board[]; warnings: string[]; format: string };
const object = (value: unknown): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a conversation object.');
  return value as RecordValue;
};
const uid = () => crypto.randomUUID();
const hasPayload = (value: unknown) =>
  value !== undefined && value !== null && !(Array.isArray(value) && !value.length);

/** Text only. Never stringify attachments, tools, or unknown provider payloads into AI context. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        const block = object(part);
        if (block.type !== 'text' || typeof block.text !== 'string')
          throw new Error('Unsupported non-text content. Import a text-only conversation instead.');
        return block.text;
      })
      .join('\n');
  throw new Error('Message content must be text or text blocks.');
}

function message(role: unknown, content: unknown): Message {
  if (role !== 'user' && role !== 'assistant' && role !== 'system')
    throw new Error('Only user, assistant, and system messages are supported (no tool messages).');
  const value = text(content);
  if (!value.trim() || value.length > 100_000)
    throw new Error('Each message must contain 1–100,000 characters of text.');
  return { id: uid(), role, content: value };
}

function chatGPT(conversation: RecordValue, warnings: Set<string>): Message[] {
  const mapping = object(conversation.mapping);
  if (Object.keys(mapping).length > 10_000) throw new Error('Conversation tree is too large.');
  if (typeof conversation.current_node !== 'string')
    throw new Error(
      'ChatGPT conversation has no current_node; choose an export with an active path.',
    );
  const seen = new Set<string>();
  const path: RecordValue[] = [];
  let id: unknown = conversation.current_node;
  while (id !== null && id !== undefined) {
    if (typeof id !== 'string' || seen.has(id) || !Object.hasOwn(mapping, id))
      throw new Error('Invalid or cyclic ChatGPT conversation path.');
    seen.add(id);
    const node = object(mapping[id]);
    path.push(node);
    id = node.parent;
  }
  if (seen.size < Object.keys(mapping).length)
    warnings.add(
      'ChatGPT: only the active conversation path is imported; alternate branches are excluded.',
    );
  const messages: Message[] = [];
  for (const node of path.reverse()) {
    if (node.message === null || node.message === undefined) continue;
    const turn = object(node.message);
    const metadata = turn.metadata == null ? {} : object(turn.metadata);
    if (
      hasPayload(metadata.attachments) ||
      hasPayload(turn.tool_calls) ||
      hasPayload(turn.function_call) ||
      (turn.recipient != null && turn.recipient !== 'all')
    )
      throw new Error('ChatGPT export contains attachments or tool calls. Use a text-only export.');
    const content = object(turn.content);
    if (content.content_type !== 'text')
      throw new Error(
        'ChatGPT export contains non-text content. Import a text-only conversation instead.',
      );
    const parts = text(content.parts);
    const role = object(turn.author).role;
    // ChatGPT exports commonly include an empty root system message.
    if (!parts.trim() && role === 'system') continue;
    messages.push(message(role, parts));
  }
  return messages;
}

export function parseConversations(input: unknown): ConversationImport {
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.length > 100)
    throw new Error('Import between 1 and 100 conversations at a time.');
  const warnings = new Set<string>();
  const formats = new Set<string>();
  let total = 0;
  const boards = values.map((value, index): Board => {
    try {
      const conversation = object(value);
      let messages: Message[];
      if (conversation.mapping !== undefined) {
        formats.add('ChatGPT');
        messages = chatGPT(conversation, warnings);
      } else if (Array.isArray(conversation.chat_messages)) {
        formats.add('Claude');
        messages = conversation.chat_messages.map((value) => {
          const turn = object(value);
          if (hasPayload(turn.attachments) || hasPayload(turn.files))
            throw new Error(
              'Claude export contains attachments. Import a text-only conversation instead.',
            );
          const role = turn.sender === 'human' ? 'user' : turn.sender;
          // Validate structured blocks even when a legacy text field is also present.
          const content =
            Array.isArray(turn.content) && turn.content.length ? turn.content : turn.text;
          return message(role, content);
        });
      } else if (Array.isArray(conversation.messages)) {
        formats.add('Messages JSON');
        messages = conversation.messages.map((value) => {
          const turn = object(value);
          if (
            hasPayload(turn.tool_calls) ||
            hasPayload(turn.function_call) ||
            hasPayload(turn.attachments)
          )
            throw new Error(
              'Tool calls and attachments are not supported. Use a text-only export.',
            );
          return message(turn.role, turn.content);
        });
      } else {
        throw new Error(
          'Unrecognized format. Expected ChatGPT, Claude, or an object with messages.',
        );
      }
      total += messages.length;
      if (!messages.length || total > 5000)
        throw new Error('Import must contain text messages, with at most 5,000 messages in total.');
      const title = conversation.title ?? conversation.name ?? `Imported conversation ${index + 1}`;
      if (typeof title !== 'string' || !title.trim() || title.length > 500)
        throw new Error('Conversation title must contain 1–500 characters.');
      return {
        id: uid(),
        name: title.trim(),
        updatedAt: Date.now(),
        edges: [],
        nodes: [
          {
            id: uid(),
            type: 'chat',
            position: { x: 80, y: 100 },
            dragHandle: '.node-heading',
            style: { width: 420, height: 560 },
            data: { title: title.trim(), color: 'purple', note: '', messages },
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Conversation ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data.'}`,
      );
    }
  });
  return { boards, warnings: [...warnings], format: [...formats].join(', ') };
}
