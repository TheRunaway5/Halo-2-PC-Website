"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function FriendTag({ tag }: { tag?: string | null }) {
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  if (!tag || !/^.+#[0-9]{8}$/u.test(tag)) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(tag!);
      setCopied(tag!);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return <div className="profile-friend-tag">
    <span className="friend-tag" aria-label={`Friend tag ${tag}`}>{tag}</span>
    <button type="button" onClick={copy} aria-label={`Copy friend tag ${tag}`} title="Copy friend tag">
      {copied === tag ? <Check size={14} /> : <Copy size={14} />}
    </button>
    <span className="friend-tag-feedback" role="status">{failed ? "Select the tag to copy it." : copied === tag ? "Copied" : ""}</span>
  </div>;
}
