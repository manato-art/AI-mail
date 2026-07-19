"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X as XIcon } from "@phosphor-icons/react";

interface ToastProps {
  message: string | null;
  duration?: number;
  onDone: () => void;
}

const EXIT_ANIMATION_MS = 400;

export function Toast({ message, duration = 2500, onDone }: ToastProps) {
  if (!message) return null;
  // key を付けて、メッセージが変わるたびに作り直す。
  // こうすると「表示中」を effect 内の setState で作らずに済む（入場は初期状態）
  return <ToastBody key={message} message={message} duration={duration} onDone={onDone} />;
}

function ToastBody({
  message,
  duration,
  onDone,
}: {
  message: string;
  duration: number;
  onDone: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  // onDone は呼び出し側でインライン関数として渡されるため、
  // 依存に入れると親の再レンダーごとにタイマーが再起動してしまう
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const hideTimer = setTimeout(() => setExiting(true), duration);
    const doneTimer = setTimeout(() => onDoneRef.current(), duration + EXIT_ANIMATION_MS);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [duration]);

  const isError = message.includes("失敗") || message.includes("エラー");

  return (
    <div className={`toast-container ${exiting ? "toast-out" : "toast-in"}`}>
      <span className={`toast-icon ${isError ? "toast-icon-error" : "toast-icon-ok"}`}>
        {isError ? (
          <XIcon size={14} weight="bold" color="#fff" />
        ) : (
          <Check size={14} weight="bold" color="#fff" />
        )}
      </span>
      <span className="toast-text">{message}</span>
      <span className="toast-bar" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
