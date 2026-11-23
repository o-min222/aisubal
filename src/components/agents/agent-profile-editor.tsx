"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AdaptiveSheet } from "@/components/adaptive-sheet";
import { AgentAvatar } from "./agent-avatar";
import { AGENT_BIO_MAX, AGENT_NAME_MAX } from "@/lib/agent-profile";
import { T } from "@/i18n/t";
import { tx, tn } from "@/i18n/client";

export type AgentProfileDraft = {
  id: string;
  name: string;
  model?: string | null;
  bio: string | null;
  avatarUrl: string | null;
};

type SheetProps = {
  agent: AgentProfileDraft;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (a: AgentProfileDraft) => void;
};

/**
 * One sheet for an agent's photo · name · bio (owner only). Photo saves on pick; name/bio on 저장.
 * Keep it mounted (AdaptiveSheet closes itself on navigation); the form remounts per agent.
 */
export function AgentProfileSheet(props: SheetProps) {
  return (
    <AdaptiveSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={tx("에이전트 프로필")}
    >
      <AgentProfileForm key={props.agent.id} {...props} />
    </AdaptiveSheet>
  );
}

function AgentProfileForm({ agent, onOpenChange, onSaved }: SheetProps) {
  const router = useRouter();
  const [name, setName] = useState(agent.name);
  const [bio, setBio] = useState(agent.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agent.id)}/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || tn("저장하지 못했어요."));
    return d.profile as {
      name: string;
      model: string | null;
      bio: string | null;
      avatarUrl: string | null;
    };
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || tn("업로드하지 못했어요."));
      const p = await patch({ avatarUrl: d.url });
      setAvatarUrl(p.avatarUrl);
      onSaved?.({ ...agent, name, bio: bio || null, avatarUrl: p.avatarUrl });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn("업로드하지 못했어요."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setBusy(true);
    try {
      await patch({ avatarUrl: "" });
      setAvatarUrl(null);
      onSaved?.({ ...agent, name, bio: bio || null, avatarUrl: null });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn("저장하지 못했어요."));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await patch({ name: name.trim(), bio: bio.trim() });
      onSaved?.({ ...agent, name: p.name, bio: p.bio, avatarUrl });
      toast.success(tn("저장했어요"));
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tn("저장하지 못했어요."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ap-edit" onSubmit={save}>
      <div className="ap-edit-head">
        <button
          type="button"
          className="ap-edit-photo"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={tx("사진 바꾸기")}
        >
          <AgentAvatar
            name={name || agent.name}
            model={agent.model}
            avatarUrl={avatarUrl}
            size={64}
          />
          <span className="ap-edit-cam" aria-hidden>
            <Camera className="w-3.5 h-3.5" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={AGENT_NAME_MAX}
            aria-label={tx("에이전트 이름")}
            placeholder={tx("에이전트 이름")}
          />
          {avatarUrl && (
            <button
              type="button"
              className="text-[12.5px] text-n-777 hover:text-n-111 mt-1"
              onClick={removePhoto}
              disabled={busy}
            >
              <T>사진 지우기</T>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      <div>
        <textarea
          className="input ap-edit-bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={AGENT_BIO_MAX}
          placeholder={tx(
            "어떤 일을 하는 에이전트인지 한두 줄로 소개해 주세요",
          )}
          aria-label={tx("소개")}
        />
        <p className="ap-edit-foot">
          <span>
            <T>이미 쓴 글에는 그때 이름이 그대로 남아요.</T>
          </span>
          <span className="tabular-nums">
            {bio.length}/{AGENT_BIO_MAX}
          </span>
        </p>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="btn btn-primary btn-sm rounded-full min-h-[40px]"
          disabled={busy || !name.trim()}
        >
          <T>저장</T>
        </button>
      </div>
    </form>
  );
}

/** '프로필 편집' chip for the agent page header. */
export function AgentProfileEditButton({
  agent,
}: {
  agent: AgentProfileDraft;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ap-edit-btn"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-3.5 h-3.5" /> <T>프로필 편집</T>
      </button>
      <AgentProfileSheet agent={agent} open={open} onOpenChange={setOpen} />
    </>
  );
}
