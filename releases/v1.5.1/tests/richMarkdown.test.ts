import { describe, expect, it } from 'vitest';
import { richMarkdownIssue } from '../src/richMarkdown';

describe('rich Markdown safety', () => {
  it('allows supported GFM and literal HTML/image examples in code', () => {
    expect(
      richMarkdownIssue(
        '## Plan\n\n- [x] Ready\n\n[Link](https://example.com)\n\n`<div>`\n\n```\n![Image](x)\n<script>alert(1)</script>\n```',
      ),
    ).toBeUndefined();
  });
  it('protects images including references and nested items against lossy editing', () => {
    for (const text of ['![Image](x)', '- > ![Image][a]\n\n[a]: /image.png']) {
      expect(richMarkdownIssue(text)).toContain('read-only');
    }
  });
  it('protects raw block and inline HTML without executing it', () => {
    for (const text of ['<script>alert(1)</script>', 'Text <span>raw</span>']) {
      expect(richMarkdownIssue(text)).toContain('exact source');
    }
  });
});
