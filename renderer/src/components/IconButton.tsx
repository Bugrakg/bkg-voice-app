import type { ReactNode } from "react";

type IconButtonProps = {
  label: string;
  onClick: () => void | Promise<void>;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

export function IconButton({
  label,
  onClick,
  children,
  active = false,
  danger = false,
  disabled = false
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "icon-button--active" : ""} ${danger ? "icon-button--danger" : ""}`}
      onClick={() => void onClick()}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
