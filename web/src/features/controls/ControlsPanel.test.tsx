// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createAppStore } from '../../app/store';
import { ActionContext } from '../../app/ActionContext';
import type { ActionPort } from '../../app/ActionContext';
import { ControlsPanel } from './ControlsPanel';
import { controlsReceived } from './controlsSlice';

afterEach(cleanup);
it('shows model settings and a retryable error while conversation controls are unavailable', () => {
  const retry = vi.fn(), store = createAppStore();
  const actions = { conversationId: 'c', capabilities: {}, execute: vi.fn() } as unknown as ActionPort;
  const fields = [{ key: 'provider.model' as const, label: '模型', surface: 'composer' as const, role: 'model' as const, kind: 'choice' as const, choices: [{ value: 'model', label: '当前模型' }], defaultValue: 'model' }];
  const view = (error: string) => <Provider store={store}><ActionContext.Provider value={actions}><ControlsPanel fields={fields} error={error} onRetry={retry} /></ActionContext.Provider></Provider>;
  const { rerender } = render(view('读取会话设置失败'));
  expect(screen.getByText('设置读取失败：读取会话设置失败')).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '当前聊天模型' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '重试' })); expect(retry).toHaveBeenCalledOnce();
  store.dispatch(controlsReceived({ conversationId: 'c', status: 'idle', activeRunId: null, queue: [], queueCount: 0, queueRevision: 0, questions: [], approvals: [], answered: [], goal: null, settings: { 'provider.model': 'model' } }));
  rerender(view(''));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '当前聊天模型' }).disabled).toBe(false);
  expect(screen.getByText('当前模型')).toBeTruthy();
});
