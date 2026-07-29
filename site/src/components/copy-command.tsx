"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "manual";

export function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("manual");
    }
  };

  return (
    <div className="command-control">
      <code>{command}</code>
      <button type="button" onClick={() => void copy()}>
        Copy command
      </button>
      {state === "copied" ? (
        <span role="status">Command copied</span>
      ) : null}
      {state === "manual" ? (
        <span role="status">Select and copy the command manually</span>
      ) : null}
    </div>
  );
}
