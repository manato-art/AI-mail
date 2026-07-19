"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X as XIcon } from "@phosphor-icons/react";

interface ToastProps {
  message: string | null;
  duration?: number;
  onDone: () => void;
}

export function Toast({ message, duration = 2500, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 400);
    }, duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, duration, onDone]);

  if (!message) return null;

  const isError = message.includes("失敗") || message.includes("エラー");

  return (
    <div
      className={`toast-container ${visible ? "toast-in" : "toast-out"}`}
    >
      <span className={`toast-icon ${isError ? "toast-icon-error" : "toast-icon-ok"}`}>
        {isError ? (
          <XIcon size={14} weight="bold" color="#fff" />
        ) : (
          <Check size={14} weight="bold" color="#fff" />
        )}
      </span>
      <span className="toast-text">{message}</span>
      <span
        className="toast-bar"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}
