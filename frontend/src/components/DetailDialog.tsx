import { useEffect, useRef, type ReactNode } from "react";

export function DetailDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-labelledby="detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Source transparency</p>
          <h2 id="detail-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
