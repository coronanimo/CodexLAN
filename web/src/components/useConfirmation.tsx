import { useCallback, useState } from "react";
import { Modal } from "./Modal";
type Request = { title: string; kicker?: string; message: string; confirmLabel: string };
export function useConfirmation() {
  const [request, setRequest] = useState<(Request & { resolve(value: boolean): void }) | null>(null);
  const confirm = useCallback((value: Request) => new Promise<boolean>((resolve) => setRequest({ ...value, resolve })), []);
  const finish = (value: boolean) => { request?.resolve(value); setRequest(null); };
  const dialog = request && <Modal kicker={request.kicker || "确认操作"} title={request.title} className="confirm-dialog" onClose={() => finish(false)}><div className="dialog-content"><p className="dialog-intro">{request.message}</p><div className="dialog-actions"><span /><span /><button className="quiet-button" onClick={() => finish(false)}>取消</button><button className="danger-button" onClick={() => finish(true)}>{request.confirmLabel}</button></div></div></Modal>;
  return { confirm, dialog };
}
