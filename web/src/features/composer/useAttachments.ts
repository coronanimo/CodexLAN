import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useActions } from "../../app/ActionContext";
import type { Attachment } from "../../app/controllers/Attachments";
import "../../platform/android";

const EMPTY: Attachment[] = [];
const subscribeEmpty = () => () => {};
const getEmpty = () => EMPTY;
export function useAttachments(conversationId: string) {
  const actions = useActions(), input = useRef<HTMLInputElement>(null);
  const subscribe = useCallback((listener: () => void) => actions ? actions.attachments.subscribe(conversationId, listener) : subscribeEmpty(), [actions, conversationId]);
  const get = useCallback(() => actions ? actions.attachments.get(conversationId) : getEmpty(), [actions, conversationId]);
  const items = useSyncExternalStore(subscribe, get, getEmpty);
  useEffect(() => {
    if (!actions?.capabilities.attachments) return;
    const receive = () => { input.current?.click(); return "picker-opened"; };
    window.codexReceiveAndroidShare = receive;
    window.CodexAndroid?.readyForSharedFiles();
    return () => { if (window.codexReceiveAndroidShare === receive) delete window.codexReceiveAndroidShare; };
  }, [actions]);
  return { items, input,
    add: (files: File[]) => actions?.attachments.add(conversationId, files),
    remove: (id: string) => actions?.attachments.remove(conversationId, id),
    upload: (items: Attachment[]) => actions!.attachments.upload(actions!.selection, items),
    clearSent: (items: Attachment[]) => actions?.attachments.clearSent(conversationId, items),
  };
}
