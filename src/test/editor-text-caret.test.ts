import { describe, expect, it } from 'vitest';
import { getEditorCaret, serializeEditor, setEditorCaret } from '@/lib/editor-text';

function editorWithChip() {
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.append('see ');
  const chip = document.createElement('span');
  chip.setAttribute('data-link-chip', 'true');
  chip.setAttribute('data-url', 'https://example.com/a');
  chip.contentEditable = 'false';
  chip.textContent = '🔗';
  editor.append(chip, ' after');
  document.body.append(editor);
  return editor;
}

describe('post editor caret', () => {
  it('counts a link chip as its full address', () => {
    const editor = editorWithChip();
    expect(serializeEditor(editor)).toBe('see https://example.com/a after');
  });

  it('puts the caret back after the link, not at the start of the post', () => {
    const editor = editorWithChip();
    const offset = 'see https://example.com/a after'.length;
    setEditorCaret(editor, offset);
    expect(getEditorCaret(editor)).toBe(offset);
    setEditorCaret(editor, 'see https://example.com/a'.length);
    const range = window.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(editor);
    expect(range.startOffset).toBe(2);
  });
});
