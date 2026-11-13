// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PreviewContext } from '../content/PreviewContext';
import { AttachmentCard } from './AttachmentCard';

afterEach(cleanup);
it('opens the selected attachment without uploading and keeps removal as a separate action', () => {
  const preview = vi.fn(), remove = vi.fn();
  const file = new File(['local draft'], 'draft.txt', { type: 'text/plain' });
  render(<PreviewContext.Provider value={preview}><AttachmentCard item={{ id: 'draft-file', file, progress: 0 }} pending={false} onRemove={remove} /></PreviewContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: '预览 draft.txt' }));
  expect(preview).toHaveBeenCalledWith({ kind: 'attachment', id: 'draft-file', file }); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '移除 draft.txt' }));
  expect(remove).toHaveBeenCalledTimes(1); expect(preview).toHaveBeenCalledTimes(1);
});
