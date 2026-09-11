import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GroupInfoSheet, type GroupMember } from "@/components/group/group-info-sheet";
import { UserProfileSheet } from "@/components/chat/user-profile-sheet";
import { MessageBubble } from "@/components/chat/message-bubble";
import { PinnedMessagesPanel } from "@/components/chat/pinned-messages-panel";
import { AttachmentActionMenu } from "@/components/chat/attachment-action-menu";
import { VoiceRecorder } from "@/components/chat/voice-recorder";
import { CameraCaptureModal } from "@/components/chat/camera-capture-modal";
import { MediaPreviewBar, type StagedFile } from "@/components/chat/media-preview-bar";
import { MediaViewerModal } from "@/components/chat/media-viewer-modal";
import { EmojiPickerPopover } from "@/components/chat/emoji-picker-popover";
import {
  ArrowLeft,
  Send,
  Check,
  CheckCheck,
  Phone,
  Video,
  MoreVertical,
  Reply,
  Copy,
  Forward,
  Trash2,
  Info,
  Smile,
  Pencil,
  Pin,
  PinOff,
  Star,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Lock,
  UserPlus,
  LogOut,
  Loader2,
  Moon,
  UsersRound,
  User,
  Bell,
  BellOff,
  Archive,
  ArchiveRestore,
  ShieldBan,
  Mic,
  Plus,
  Paperclip,
  FileText,
  Download,
  Image as ImageIcon,
  Sparkles,
  Palette,
  MapPin,
  Languages,
} from "lucide-react";
import {
  downloadAuthenticatedAttachment,
  copyImageToClipboard,
  getAuthenticatedAttachment,
} from "@/lib/authenticated-media";
import { optimizeImageBeforeUpload } from "@/lib/image-optimizer";
import type { Attachment } from "@/lib/domain/types";
import { ContactPickerModal, formatContactPayload } from "@/components/chat/contact-picker-modal";
import { LocationPickerModal, formatLocationPayload } from "@/components/chat/location-picker-modal";
import { ChatAppearanceModal } from "@/components/chat/chat-appearance-modal";
import {
  CHAT_THEMES,
  CHAT_WALLPAPERS,
  getConversationAppearance,
  saveConversationAppearance,
  type ChatAppearanceSettings,
} from "@/lib/chat-themes";
import { formatStickerPayload, type Sticker } from "@/lib/stickers";
import { formatGifPayload, type GifItem } from "@/components/chat/gif-picker";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  listMyMessageReceipts,
  hideMessageForMe,
  deleteMessageForEveryone,
  editMessage,
  toggleReaction,
  listReactions,
  listPins,
  pinMessage,
  unpinMessage,
  toggleStar,
  listMyStarIds,
  listConversations,
  forwardMessages,
  getMessagesByIds,
  getMessageInfo,
  searchMessagesInConversation,
  addGroupMember,
  removeGroupMember,
  updateGroupMemberRole,
  updateGroupTitle,
  leaveConversation,
  clearConversationHistory,
  deleteConversation,
  finalizeVanishSession,
  toggleDisappearingMessages,
  setConversationFlags,
  blockContact,
  startAttachmentUpload,
  confirmAttachmentUpload,
  getAttachmentAccessUrl,
  sendAttachmentMessage,
  type MessageRow,
  type ChatProfile,
  type ConversationSummary,
  type GroupMemberRole,
} from "@/lib/chat.functions";
import { listFriendships, type FriendshipRow } from "@/lib/friendships.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { usePresence } from "@/components/presence-provider";
import { useCalls } from "@/components/calls/call-provider";
import { useVanishMode } from "@/hooks/use-vanish-mode";
import { EphemeralMessageBubble } from "@/components/chat/ephemeral-message-bubble";

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  validateSearch: (search: Record<string, unknown>) => ({
    jumpToMsg: typeof search.jumpToMsg === "string" ? search.jumpToMsg : undefined,
  }),
  component: ChatRoom,
});

type OptimisticMsg = MessageRow & { pending?: boolean; failed?: boolean };
type MenuState = { id: string; mine: boolean; x: number; y: number; msg: MessageRow } | null;

const QUICK_EMOJI = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

function ChatRoom() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchConv = useServerFn(getConversation);
  const fetchMessages = useServerFn(listMessages);
  const fetchReceipts = useServerFn(listMyMessageReceipts);
  const fetchProfile = useServerFn(getMyProfile);
  const fetchReactions = useServerFn(listReactions);
  const fetchPins = useServerFn(listPins);
  const fetchStarIds = useServerFn(listMyStarIds);
  const fetchConversationsList = useServerFn(listConversations);
  const fetchMsgsByIds = useServerFn(getMessagesByIds);
  const fetchMessageInfo = useServerFn(getMessageInfo);
  const doSend = useServerFn(sendMessage);
  const doMarkRead = useServerFn(markRead);
  const doHide = useServerFn(hideMessageForMe);
  const doDeleteAll = useServerFn(deleteMessageForEveryone);
  const doEdit = useServerFn(editMessage);
  const doReact = useServerFn(toggleReaction);
  const doPin = useServerFn(pinMessage);
  const doUnpin = useServerFn(unpinMessage);
  const doStar = useServerFn(toggleStar);
  const doForward = useServerFn(forwardMessages);
  const doSearch = useServerFn(searchMessagesInConversation);
  const doBlock = useServerFn(blockContact);
  const doFlags = useServerFn(setConversationFlags);
  const doLeave = useServerFn(leaveConversation);
  const doClearHistory = useServerFn(clearConversationHistory);
  const doDeleteConversation = useServerFn(deleteConversation);
  const doFinalizeVanishSession = useServerFn(finalizeVanishSession);
  const doStartAttachmentUpload = useServerFn(startAttachmentUpload);
  const doConfirmAttachmentUpload = useServerFn(confirmAttachmentUpload);
  const doGetAttachmentAccessUrl = useServerFn(getAttachmentAccessUrl);
  const doSendAttachmentMessage = useServerFn(sendAttachmentMessage);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  useEffect(() => {
    return () => {
      // Explicitly clean up vanish mode session when navigating away
      doFinalizeVanishSession({ data: { conversation_id: conversationId } }).catch(console.error);
    };
  }, [conversationId, doFinalizeVanishSession]);

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { conversation_id: conversationId } }),
    staleTime: 30_000,
  });

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversation_id: conversationId, limit: 50 } }),
  });

  const receipts = useQuery({
    queryKey: ["receipts", conversationId],
    queryFn: () => fetchReceipts({ data: { conversation_id: conversationId } }),
  });

  const reactions = useQuery({
    queryKey: ["reactions", conversationId],
    queryFn: () => fetchReactions({ data: { conversation_id: conversationId } }),
    staleTime: 15_000,
  });

  const pins = useQuery({
    queryKey: ["pins", conversationId],
    queryFn: () => fetchPins({ data: { conversation_id: conversationId } }),
    staleTime: 30_000,
  });

  const stars = useQuery({
    queryKey: ["stars-in-conv", conversationId],
    queryFn: () => fetchStarIds({ data: { conversation_id: conversationId } }),
    staleTime: 30_000,
  });

  const searchParams = Route.useSearch();
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; at: number }>>(new Map());
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [locallyGone, setLocallyGone] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; mine: boolean } | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [forwardFrom, setForwardFrom] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectMode = selected.size > 0;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<string[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const [pinsCollapsed, setPinsCollapsed] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"clear" | "block" | "leave" | null>(null);

  // ── Scroll & Unread state ───────────────────────────────────────────────
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  // ── Attachment / media state ──────────────────────────────────────────────
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [attachCaption, setAttachCaption] = useState("");
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ messageId?: string; attachments?: Attachment[]; index: number } | null>(null);
  const [activePinIndex, setActivePinIndex] = useState(0);
  const [pinPanelOpen, setPinPanelOpen] = useState(false);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [appearanceSettings, setAppearanceSettings] = useState<ChatAppearanceSettings>(() =>
    getConversationAppearance(conversationId)
  );
  const [viewContactUserId, setViewContactUserId] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const keyboardInset = useKeyboardInset();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const handleJumpToMessage = (messageId: string) => {
    const el = bubbleRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2500);
    }
  };

  const meId = me.data?.id;
  const otherId = conv.data?.other?.id;
  const otherProfile = conv.data?.other ?? null;
  const { setActiveConversationId, isUserOnline, getUserStatusLabel } = usePresence();
  const { startCall } = useCalls();

  // ── Desktop Keyboard Shortcuts (Ctrl/Cmd+K, Ctrl/Cmd+Shift+F, ArrowUp) ────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchQ("");
        setSearchHits([]);
        setSearchOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        setSearchQ("");
        setSearchHits([]);
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setShowAttachMenu(false);
        setShowEmojiPicker(false);
        setShowContactPicker(false);
        setShowLocationPicker(false);
        setShowAppearanceModal(false);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isGroup = conv.data?.conversation?.kind === "group";
  const isMuted = Boolean(conv.data?.my_flags?.muted);
  const isArchived = Boolean(conv.data?.my_flags?.archived);

  const handleViewPins = () => {
    const pinList = pins.data?.pins ?? [];
    if (pinList.length === 0) {
      import("sonner").then((m) => m.toast(isGroup ? "No pinned messages in this group" : "No pinned messages in this chat"));
      return;
    }
    setPinsCollapsed(false);
    const targetId = pinList[0]?.message_id;
    if (targetId) {
      const el = bubbleRefs.current.get(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
      }
    }
    import("sonner").then((m) =>
      m.toast.success(`Showing ${pinList.length} pinned message${pinList.length === 1 ? "" : "s"}`),
    );
  };

  const handleToggleMute = async () => {
    try {
      await doFlags({
        data: {
          conversation_id: conversationId,
          muted: !isMuted,
        },
      });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success(isMuted ? "Notifications unmuted" : "Notifications muted"));
    } catch (e) {
      import("sonner").then((m) =>
        m.toast.error(e instanceof Error ? e.message : "Failed to update notification settings"),
      );
    }
  };

  const handleArchive = async () => {
    try {
      await doFlags({
        data: {
          conversation_id: conversationId,
          archived: true,
        },
      });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success(isGroup ? "Group archived" : "Chat archived"));
      navigate({ to: "/chats" });
    } catch (e) {
      import("sonner").then((m) =>
        m.toast.error(e instanceof Error ? e.message : "Failed to archive conversation"),
      );
    }
  };

  const handleUnarchive = async () => {
    try {
      await doFlags({
        data: {
          conversation_id: conversationId,
          archived: false,
        },
      });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success(isGroup ? "Group unarchived" : "Chat unarchived"));
    } catch (e) {
      import("sonner").then((m) =>
        m.toast.error(e instanceof Error ? e.message : "Failed to unarchive conversation"),
      );
    }
  };

  const handleClearChat = async () => {
    try {
      await doClearHistory({ data: { conversation_id: conversationId } });
      qc.setQueryData(["messages", conversationId], []);
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["pins", conversationId] });
      qc.invalidateQueries({ queryKey: ["stars-in-conv", conversationId] });
      qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setPinsCollapsed(true);
      setPinPanelOpen(false);
      import("sonner").then((m) => m.toast.success("Chat history cleared"));
    } catch (e) {
      import("sonner").then((m) =>
        m.toast.error(e instanceof Error ? e.message : "Failed to clear chat history"),
      );
    } finally {
      setConfirmAction(null);
    }
  };

  const handleDeleteChat = async () => {
    try {
      await doDeleteConversation({ data: { conversation_id: conversationId } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success("Chat deleted"));
      navigate({ to: "/chats" });
    } catch (e) {
      import("sonner").then((m) =>
        m.toast.error(e instanceof Error ? e.message : "Failed to delete conversation"),
      );
    } finally {
      setConfirmAction(null);
    }
  };

  const handleBlockUser = async () => {
    if (!otherId) return;
    try {
      await doBlock({ data: { user_id: otherId } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success("Contact blocked"));
      navigate({ to: "/chats" });
    } catch (e) {
      import("sonner").then((m) => m.toast.error(e instanceof Error ? e.message : "Failed to block user"));
    } finally {
      setConfirmAction(null);
    }
  };

  const handleLeaveGroup = async () => {
    try {
      await doLeave({ data: { conversation_id: conversationId } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      import("sonner").then((m) => m.toast.success("Left group"));
      navigate({ to: "/chats" });
    } catch (e) {
      import("sonner").then((m) => m.toast.error(e instanceof Error ? e.message : "Failed to leave group"));
    } finally {
      setConfirmAction(null);
    }
  };

  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId, setActiveConversationId]);

  // Preview cache for reply targets outside window
  const [previewCache, setPreviewCache] = useState<Map<string, MessageRow>>(new Map());

  const rendered = useMemo(() => {
    const server = (messages.data ?? []).filter((m) => !locallyGone.has(m.id));
    const seen = new Set(server.map((m) => m.client_id).filter(Boolean) as string[]);
    const pending = optimistic.filter((m) => !(m.client_id && seen.has(m.client_id)));
    return [...server, ...pending].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
  }, [messages.data, optimistic, locallyGone]);

  const messageById = useMemo(() => {
    const m = new Map<string, MessageRow>();
    for (const r of rendered) m.set(r.id, r);
    for (const [k, v] of previewCache) if (!m.has(k)) m.set(k, v);
    return m;
  }, [rendered, previewCache]);

  // Fetch missing reply-target previews
  useEffect(() => {
    const missing = new Set<string>();
    for (const m of rendered) {
      if (m.reply_to_id && !messageById.has(m.reply_to_id)) missing.add(m.reply_to_id);
    }
    if (missing.size === 0) return;
    fetchMsgsByIds({ data: { ids: Array.from(missing) } })
      .then((rows) => {
        setPreviewCache((prev) => {
          const n = new Map(prev);
          for (const r of rows) n.set(r.id, r);
          return n;
        });
      })
      .catch(() => {});
  }, [rendered, messageById, fetchMsgsByIds]);

  const receiptByMsg = useMemo(() => {
    const map = new Map<string, { delivered_at: string | null; read_at: string | null }>();
    for (const r of receipts.data ?? []) {
      map.set(r.message_id, { delivered_at: r.delivered_at, read_at: r.read_at });
    }
    return map;
  }, [receipts.data]);

  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
    for (const r of reactions.data ?? []) {
      const bucket = map.get(r.message_id) ?? [];
      const found = bucket.find((b) => b.emoji === r.emoji);
      if (found) {
        found.count += 1;
        if (r.user_id === meId) found.mine = true;
      } else {
        bucket.push({ emoji: r.emoji, count: 1, mine: r.user_id === meId });
      }
      map.set(r.message_id, bucket);
    }
    return map;
  }, [reactions.data, meId]);

  const starSet = useMemo(() => new Set(stars.data ?? []), [stars.data]);
  const pinnedIds = useMemo(
    () => new Set((pins.data?.pins ?? []).map((p) => p.message_id)),
    [pins.data],
  );

  const collapseAndForget = useCallback(
    (id: string) => {
      setRemovingIds((s) => new Set(s).add(id));
      setTimeout(() => {
        setLocallyGone((s) => new Set(s).add(id));
        setRemovingIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }, 260);
    },
    [conversationId, qc],
  );

  // Realtime
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [channelReady, setChannelReady] = useState(false);

  // ── Vanish Mode (ephemeral messaging — zero Neon writes) ──────────────
  const myDisplayName = me.data
    ? ((me.data as { display_name?: string | null; username?: string | null }).display_name ??
       (me.data as { username?: string | null }).username ??
       "Ghost")
    : "Ghost";

  const {
    vanishActive,
    enterVanishMode,
    exitVanishMode,
    touchHandlers,
  } = useVanishMode({
    conversationId,
    disappearingMessagesEnabled: Boolean(conv.data?.conversation?.disappearing_messages_enabled),
  });
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!meId) return;
    setChannelReady(false);
    const channel = supabase
      .channel(`chat:conv:${conversationId}`, {
        config: { presence: { key: meId }, broadcast: { self: false } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => {
          const newConv = payload.new as { disappearing_messages_enabled?: boolean } | undefined;
          if (newConv && newConv.disappearing_messages_enabled === false) {
            // Optimistically purge vanish messages immediately on remote disable
            qc.setQueryData(["messages", conversationId], (old: any[] | undefined) => {
              if (!old) return old;
              return old.filter((m: any) => !m.is_vanish);
            });
            qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
          qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const oldId = (payload.old as { id?: string } | undefined)?.id;
          if (oldId) collapseAndForget(oldId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_receipts" },
        () => {
          if (receiptsTimer) clearTimeout(receiptsTimer);
          receiptsTimer = setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["receipts", conversationId] });
          }, 150);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          if (reactionsTimer) clearTimeout(reactionsTimer);
          reactionsTimer = setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
          }, 150);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pinned_messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["pins", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["conv", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_permissions", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["group-permissions", conversationId] });
          qc.invalidateQueries({ queryKey: ["conv", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_restrictions", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["member-restrictions", conversationId] });
          qc.invalidateQueries({ queryKey: ["conv", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_hidden", filter: `user_id=eq.${meId}` },
        (payload) => {
          const mid = (payload.new as { message_id?: string } | undefined)?.message_id;
          if (mid) collapseAndForget(mid);
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const p = payload.payload as { user_id?: string; name?: string; typing?: boolean };
        if (!p.user_id || p.user_id === meId) return;
        setTypingUsers((prev) => {
          const next = new Map(prev);
          if (p.typing === false) {
            next.delete(p.user_id!);
          } else {
            next.set(p.user_id!, {
              name: p.name || conv.data?.members.find((mb) => mb.id === p.user_id)?.display_name || otherProfile?.display_name || "Someone",
              at: Date.now(),
            });
          }
          return next;
        });
      })
      // Vanish Mode uses Postgres changes on the conversation row now
      // ────────────────────────────────────────────────────────────────────────
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        setPresentIds(new Set(Object.keys(state).filter((k) => k !== meId)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: meId, at: Date.now() });
          setChannelReady(true);
        }
      });

    let receiptsTimer: ReturnType<typeof setTimeout> | null = null;
    let reactionsTimer: ReturnType<typeof setTimeout> | null = null;

    channelRef.current = channel;
    return () => {
      if (receiptsTimer) clearTimeout(receiptsTimer);
      if (reactionsTimer) clearTimeout(reactionsTimer);
      channelRef.current = null;
      setChannelReady(false);
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId, qc, collapseAndForget, conv.data?.members, otherProfile?.display_name]);

  // Clean up stale typing indicators (after 3.5s of silence)
  useEffect(() => {
    if (typingUsers.size === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, item] of next.entries()) {
          if (now - item.at > 3500) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingUsers.size]);

  // Format typing indicator label
  const typingLabel = useMemo(() => {
    const names = Array.from(typingUsers.values()).map((u) => u.name);
    if (names.length === 0) return null;
    if (!isGroup) return "typing...";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return "Several people are typing...";
  }, [typingUsers, isGroup]);

  // Auto-scroll on initial load or non-scrolled state
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || searchOpen || isScrolledUp) return;
    el.scrollTop = el.scrollHeight;
  }, [rendered.length, searchOpen, isScrolledUp]);

  // Unread messages calculation
  const myLastReadAt = useMemo(() => {
    const myMember = conv.data?.members.find((mb) => mb.id === meId);
    return myMember?.last_read_at ?? null;
  }, [conv.data?.members, meId]);

  const firstUnreadMsgId = useMemo(() => {
    if (!myLastReadAt) return null;
    const lastReadDate = new Date(myLastReadAt).getTime();
    const unreadMsg = rendered.find(
      (m) => m.sender_id !== meId && new Date(m.created_at).getTime() > lastReadDate,
    );
    return unreadMsg?.id ?? null;
  }, [rendered, myLastReadAt, meId]);

  // Track incoming new messages when user is scrolled up
  const prevRenderedLength = useRef(rendered.length);
  useEffect(() => {
    if (rendered.length > prevRenderedLength.current) {
      if (isScrolledUp) {
        setNewBelowCount((c) => c + (rendered.length - prevRenderedLength.current));
      }
    }
    prevRenderedLength.current = rendered.length;
  }, [rendered.length, isScrolledUp]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder) return;
    const serverMessages = messages.data ?? [];
    if (serverMessages.length === 0) return;
    const oldest = serverMessages[0];
    if (!oldest?.created_at) return;

    const scroller = scrollerRef.current;
    const previousScrollHeight = scroller ? scroller.scrollHeight : 0;
    const previousScrollTop = scroller ? scroller.scrollTop : 0;

    setLoadingOlder(true);
    try {
      const older = await fetchMessages({
        data: {
          conversation_id: conversationId,
          before: oldest.created_at,
          limit: 50,
        },
      });

      if (!older || older.length === 0) {
        setHasMoreOlder(false);
      } else {
        if (older.length < 50) {
          setHasMoreOlder(false);
        }
        qc.setQueryData<MessageRow[]>(["messages", conversationId], (existing) => {
          const current = existing ?? [];
          const existingIds = new Set(current.map((m) => m.id));
          const newOlder = older.filter((m) => !existingIds.has(m.id));
          return [...newOlder, ...current];
        });

        requestAnimationFrame(() => {
          if (scroller) {
            const newScrollHeight = scroller.scrollHeight;
            scroller.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
          }
        });
      }
    } catch (err) {
      console.error("[Ghostline] Failed to load older messages", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMoreOlder, messages.data, fetchMessages, conversationId, qc]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = distFromBottom > 240;
    setIsScrolledUp(scrolledUp);
    if (!scrolledUp) {
      setNewBelowCount(0);
    }

    if (el.scrollTop < 100 && hasMoreOlder && !loadingOlder) {
      loadOlderMessages();
    }
  };

  useEffect(() => {
    qc.setQueryData<ConversationSummary[]>(["conversations"], (old) => {
      if (!old) return old;
      return old.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c));
    });

    const last = rendered.length ? rendered[rendered.length - 1] : null;
    const upTo = last?.created_at
      ? (!isNaN(Date.parse(last.created_at)) ? new Date(last.created_at).toISOString() : new Date().toISOString())
      : new Date().toISOString();

    doMarkRead({ data: { conversation_id: conversationId, up_to_created_at: upTo } })
      .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
      .catch((err) => console.error("[Ghostline] markRead error:", err));
  }, [rendered.length, conversationId, doMarkRead, qc]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const client_id = crypto.randomUUID();
      const pending: OptimisticMsg = {
        id: client_id,
        conversation_id: conversationId,
        sender_id: meId!,
        body,
        client_id,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyTo?.id ?? null,
        forwarded_from_id: null,
        is_vanish: vanishActive,
        pending: true,
      };
      setOptimistic((prev) => [...prev, pending]);
      const parentId = replyTo?.id ?? null;
      setReplyTo(null);
      try {
        const row = await doSend({
          data: {
            conversation_id: conversationId,
            body,
            client_id,
            reply_to_id: parentId,
            is_vanish: vanishActive,
          },
        });
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        setOptimistic((prev) => prev.filter((m) => m.client_id !== client_id));
        return row;
      } catch (err) {
        setOptimistic((prev) =>
          prev.map((m) => (m.client_id === client_id ? { ...m, pending: false, failed: true } : m)),
        );
        throw err;
      }
    },
  });

  const commitEdit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      await doEdit({ data: { message_id: id, body } });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onSuccess: () => setEditing(null),
    onError: () => showToast("Couldn't save edit"),
  });

  const lastTypingAt = useRef(0);
  const notifyTyping = useCallback((typing = true) => {
    const ch = channelRef.current;
    if (!ch || !channelReady || !meId) return;
    const now = Date.now();
    if (typing && now - lastTypingAt.current < 1500) return;
    lastTypingAt.current = now;
    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: meId, name: myDisplayName, typing },
    });
  }, [channelReady, meId, myDisplayName]);

  const [text, setText] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // ── Draft message persistence ───────────────────────────────────────────
  const draftKey = `ghostline:draft:${conversationId}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && !editing) {
        setText(saved);
      }
    } catch {}
  }, [conversationId, draftKey, editing]);

  useEffect(() => {
    if (typeof window === "undefined" || vanishActive || editing) return;
    try {
      if (text.trim()) {
        localStorage.setItem(draftKey, text);
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {}
  }, [text, conversationId, draftKey, vanishActive, editing]);

  useEffect(() => {
    if (editing) {
      setText(editing.body);
      composerRef.current?.focus();
    }
  }, [editing]);

  // Reset the auto-grown composer height once it is emptied
  useEffect(() => {
    if (text === "" && composerRef.current) composerRef.current.style.height = "";
  }, [text]);

  // Auto-send voice messages the moment they are staged by VoiceRecorder
  useEffect(() => {
    if (
      stagedFiles.length === 1 &&
      stagedFiles[0].file.name.startsWith("voice_") &&
      stagedFiles[0].progress === 0 &&
      !isSendingAttachment
    ) {
      uploadAndSendAttachments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedFiles]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;

    if (editing) {
      commitEdit.mutate({ id: editing.id, body });
      setText("");
      return;
    }
    setText("");
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    notifyTyping(false);
    send.mutate(body);
  };


  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const doDeleteForMe = async (ids: string[]) => {
    for (const id of ids) collapseAndForget(id);
    try {
      await Promise.all(ids.map((id) => doHide({ data: { message_id: id } })));
    } catch {
      showToast("Couldn't delete — try again");
    }
  };

  const doDeleteForAll = async (id: string) => {
    collapseAndForget(id);
    try {
      await doDeleteAll({ data: { message_id: id } });
    } catch {
      showToast("Couldn't delete for everyone");
    }
  };

  const highlightBubble = (el: HTMLLIElement) => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate(
      [
        { boxShadow: "0 0 0 3px oklch(0.72 0.19 240 / 0.55)" },
        { boxShadow: "0 0 0 0 transparent" },
      ],
      { duration: 1600, easing: "ease-out" },
    );
  };

  const scrollToMessage = useCallback(async (id: string) => {
    // 1. Already in DOM — instant
    const el = bubbleRefs.current.get(id);
    if (el) { highlightBubble(el); return; }

    // 2. Not in DOM — fetch the message, merge into query cache, then highlight
    try {
      const fetched = await fetchMsgsByIds({ data: { ids: [id] } });
      if (fetched.length === 0) { showToast("Message not found"); return; }
      // Merge fetched message into the existing message list cache
      qc.setQueryData<MessageRow[]>(["messages", conversationId], (old) => {
        if (!old) return fetched;
        if (old.some((m) => m.id === id)) return old;
        return [...old, ...fetched].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
      // Wait a frame for the DOM to update, then highlight
      requestAnimationFrame(() => {
        const rendered = bubbleRefs.current.get(id);
        if (rendered) highlightBubble(rendered);
        else showToast("Scroll up to see message");
      });
    } catch {
      showToast("Message not in view — scroll up");
    }
  }, [conversationId, fetchMsgsByIds, qc]);

  const stageFiles = async (files: File[]) => {
    const processedFiles: File[] = [];
    for (const f of files) {
      if (f.type.startsWith("image/")) {
        const optimized = await optimizeImageBeforeUpload(f);
        processedFiles.push(optimized);
      } else {
        processedFiles.push(f);
      }
    }
    const newStaged: StagedFile[] = processedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
    }));
    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const uploadAndSendAttachments = async () => {
    if (stagedFiles.length === 0) return;
    setIsSendingAttachment(true);
    try {
      const attachmentIds: string[] = [];
      for (const sf of stagedFiles) {
        try {
          const { attachment, upload_url } = await doStartAttachmentUpload({
            data: {
              conversation_id: conversationId,
              filename: sf.file.name,
              mime_type: sf.file.type || "application/octet-stream",
              file_size: sf.file.size,
            },
          });
          const attachment_id = attachment.id;


          // 2. Upload directly to R2 or Neon fallback
          setStagedFiles((prev) =>
            prev.map((s) => (s.id === sf.id ? { ...s, progress: 0.1 } : s)),
          );
          
          const uploadTarget = upload_url === "neon" ? `/api/attachments/${attachment_id}` : upload_url;
          const session = (await supabase.auth.getSession()).data.session;
          const uploadHeaders: Record<string, string> = {};
          if (upload_url === "neon" && session?.access_token) {
            uploadHeaders["Authorization"] = `Bearer ${session.access_token}`;
          } else if (upload_url !== "neon") {
            uploadHeaders["Content-Type"] = sf.file.type || "application/octet-stream";
          }

          const res = await fetch(uploadTarget, {
            method: "PUT",
            body: sf.file,
            headers: uploadHeaders,
          });
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          setStagedFiles((prev) =>
            prev.map((s) => (s.id === sf.id ? { ...s, progress: 0.9 } : s)),
          );

          // 3. Confirm upload
          await doConfirmAttachmentUpload({ data: { attachment_id } });
          setStagedFiles((prev) =>
            prev.map((s) => (s.id === sf.id ? { ...s, progress: 1, attachmentId: attachment_id } : s)),
          );
          attachmentIds.push(attachment_id);
        } catch (err) {
          setStagedFiles((prev) =>
            prev.map((s) => (s.id === sf.id ? { ...s, error: "Upload failed" } : s)),
          );
          console.error("[Ghostline] Attachment upload error:", err);
        }
      }

      if (attachmentIds.length === 0) {
        showToast("Upload failed — please try again");
        return;
      }

      // 4. Send message with attachment IDs + optional caption
      const msg = await doSendAttachmentMessage({
        data: {
          conversation_id: conversationId,
          body: attachCaption.trim(),
          attachment_ids: attachmentIds,
        },
      });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      setStagedFiles([]);
      setAttachCaption("");
    } catch (err) {
      console.error("[Ghostline] sendAttachmentMessage error:", err);
      showToast("Failed to send — please try again");
    } finally {
      setIsSendingAttachment(false);
    }
  };

  const openMenu = (e: React.MouseEvent, m: MessageRow) => {
    e.preventDefault();
    if (selectMode) {
      toggleSelect(m.id);
      return;
    }
    setMenu({ id: m.id, mine: m.sender_id === meId, x: e.clientX, y: e.clientY, msg: m });
  };

  const longPress = (m: MessageRow) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        timer = setTimeout(() => {
          if (selectMode) {
            toggleSelect(m.id);
          } else {
            setMenu({ id: m.id, mine: m.sender_id === meId, x: t.clientX, y: t.clientY, msg: m });
          }
        }, 450);
      },
      onTouchEnd: () => { if (timer) clearTimeout(timer); },
      onTouchMove: () => { if (timer) clearTimeout(timer); },
    };
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchHits([]);
      setSearchIdx(0);
      return;
    }
    try {
      const hits = await doSearch({ data: { conversation_id: conversationId, q } });
      const ids = hits.map((h) => h.id);
      setSearchHits(ids);
      setSearchIdx(0);
      if (ids[0]) scrollToMessage(ids[0]);
    } catch {
      showToast("Search failed");
    }
  };

  const nextHit = () => {
    if (searchHits.length === 0) return;
    const n = (searchIdx + 1) % searchHits.length;
    setSearchIdx(n);
    scrollToMessage(searchHits[n]);
  };
  const prevHit = () => {
    if (searchHits.length === 0) return;
    const n = (searchIdx - 1 + searchHits.length) % searchHits.length;
    setSearchIdx(n);
    scrollToMessage(searchHits[n]);
  };

  const isOnline = isUserOnline(otherId);
  const pinnedMessages = pins.data?.messages ?? [];

  const ring = (type: "voice" | "video") => {
    if (!otherId || otherId === meId) return;
    void startCall({
      conversationId,
      peerId: otherId,
      peer: otherProfile
        ? {
            id: otherProfile.id,
            username: otherProfile.username,
            display_name: otherProfile.display_name,
            avatar_url: otherProfile.avatar_url,
          }
        : null,
      type,
    });
  };


  const currentTheme = (appearanceSettings?.themeId && CHAT_THEMES[appearanceSettings.themeId]) || CHAT_THEMES.default;
  const currentWallpaper = (appearanceSettings?.wallpaperId && CHAT_WALLPAPERS[appearanceSettings.wallpaperId]) || CHAT_WALLPAPERS.plain;

  return (
    <div
      className={[
        "relative flex flex-col overscroll-none transition-colors",
        currentTheme.backgroundClass,
      ].join(" ")}
      style={{ height: `calc(100dvh - ${keyboardInset}px)` }}
      {...touchHandlers}
    >
      {appearanceSettings?.wallpaperId !== "plain" && currentWallpaper && (
        <div
          className="pointer-events-none absolute inset-0 z-0 select-none transition-opacity"
          style={{
            backgroundImage: currentWallpaper.patternCss,
            backgroundSize: "24px 24px",
            opacity: appearanceSettings?.wallpaperOpacity ?? 0.05,
          }}
        />
      )}
      <header className="glass sticky top-0 z-30 flex items-center gap-1 px-2 py-2.5 sm:gap-2 sm:px-3">
        <button
          onClick={() => navigate({ to: "/chats" })}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
          onClick={() => {
            if (isGroup) setShowGroupInfo(true);
            else setShowProfile(true);
          }}
        >
          <div className="relative shrink-0">
            {isGroup ? (
              conv.data?.conversation?.avatar_url ? (
                <img
                  src={conv.data.conversation.avatar_url}
                  alt={conv.data?.conversation?.title ?? "Group"}
                  className="h-10 w-10 rounded-xl object-cover ring-1 ring-border shadow-sm"
                />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 font-bold text-primary ring-1 ring-border/50 shadow-sm">
                  <UsersRound className="h-5 w-5 text-primary" aria-label="Group chat" />
                </div>
              )
            ) : (
              otherProfile?.avatar_url ? (
                <img
                  src={otherProfile.avatar_url}
                  alt={otherProfile.display_name ?? "User"}
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-border shadow-sm"
                />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/12 font-bold text-primary ring-1 ring-border/50 shadow-sm">
                  {(otherProfile?.display_name ?? otherProfile?.username ?? "?").charAt(0).toUpperCase()}
                </div>
              )
            )}
            {!isGroup && isOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold">
              {isGroup && (
                <UsersRound className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
              )}
              <span className="truncate">
                {isGroup
                  ? (conv.data?.conversation?.title ?? "Group chat")
                  : (otherProfile?.display_name ?? otherProfile?.username ?? "Ghost")}
              </span>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isGroup ? (
                <span>{(conv.data?.members ?? []).length} member{(conv.data?.members ?? []).length === 1 ? "" : "s"}</span>
              ) : (
                <>
                  {otherProfile?.username && <span>@{otherProfile.username} · </span>}
                  <span className={isOnline ? "text-emerald-400" : ""}>
                    {getUserStatusLabel(otherId, conversationId, otherProfile?.last_seen)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => setPrivacyOpen((v) => !v)}
          className="press hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground sm:flex"
          aria-label="Privacy information"
        >
          <Lock className="h-3 w-3 text-primary" /> Private
        </button>
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            setSearchQ("");
            setSearchHits([]);
          }}
          className="hidden h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-foreground/10 sm:grid"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => ring("voice")}
          disabled={!otherId || otherId === meId}
          title={otherProfile ? `Call ${otherProfile.display_name ?? otherProfile.username}` : "Voice call"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-foreground/10 active:bg-foreground/10 disabled:opacity-40"
          aria-label="Voice call"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          onClick={() => ring("video")}
          disabled={!otherId || otherId === meId}
          title={otherProfile ? `Video call with ${otherProfile.display_name ?? otherProfile.username}` : "Video call"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-foreground/10 active:bg-foreground/10 disabled:opacity-40"
          aria-label="Video call"
        >
          <Video className="h-4 w-4" />
        </button>
        {/* Vanish Mode toggle button (desktop / quick access) */}
        <button
          onClick={() => (vanishActive ? exitVanishMode() : enterVanishMode())}
          title={vanishActive ? "Exit Vanish Mode" : "Enter Vanish Mode"}
          aria-label={vanishActive ? "Exit Vanish Mode" : "Enter Vanish Mode"}
          aria-pressed={vanishActive}
          className={[
            "grid h-11 w-11 shrink-0 place-items-center rounded-full transition",
            vanishActive
              ? "text-[#7cb9ff] bg-[rgba(37,135,245,0.2)]"
              : "hover:bg-foreground/10",
          ].join(" ")}
        >
          <Moon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setHeaderMenu((v) => !v)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
          aria-label="More"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {privacyOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPrivacyOpen(false)} />
            <div className="glass absolute right-3 top-14 z-50 w-72 rounded-xl p-4 text-[12px] leading-relaxed text-muted-foreground shadow-2xl">
              <p className="mb-1 text-[13px] font-bold text-foreground">How this chat is protected</p>
              Voice and video calls connect peer-to-peer and are encrypted in transit (DTLS-SRTP) — they
              are never recorded. Messages are encrypted in transit and only members of this
              conversation can read them. End-to-end encryption for messages is not enabled yet.
            </div>
          </>
        )}

        {headerMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(false)} />
            <div className="glass animate-scale-in absolute right-3 top-14 z-50 w-56 overflow-hidden rounded-2xl border border-border bg-popover/95 py-1.5 shadow-2xl backdrop-blur-xl">
              {isGroup ? (
                <>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setShowGroupInfo(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-foreground hover:bg-surface-2 transition"
                  >
                    <Info className="h-4 w-4 text-primary" /> Group Info & Members
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setSearchQ("");
                      setSearchHits([]);
                      setSearchOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" /> Search in Group
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      handleViewPins();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Pin className="h-4 w-4 text-muted-foreground" /> Pinned Messages
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      handleToggleMute();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    {isMuted ? (
                      <BellOff className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    )}
                    {isMuted ? "Unmute Notifications" : "Notifications"}
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      if (vanishActive) {
                        exitVanishMode();
                      } else {
                        enterVanishMode();
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    {vanishActive ? "Exit Vanish Mode" : "Vanish Mode"}
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setPrivacyOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Lock className="h-4 w-4 text-muted-foreground" /> Privacy & Security
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      if (isArchived) {
                        handleUnarchive();
                      } else {
                        handleArchive();
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition cursor-pointer"
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4 text-muted-foreground" /> Unarchive Group
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 text-muted-foreground" /> Archive Group
                      </>
                    )}
                  </button>
                  <div className="my-1.5 h-px bg-border/60" />
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setConfirmAction("leave");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/10 transition"
                  >
                    <LogOut className="h-4 w-4" /> Leave Group
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setShowProfile(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-foreground hover:bg-surface-2 transition"
                  >
                    <User className="h-4 w-4 text-primary" /> View Profile
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setSearchQ("");
                      setSearchHits([]);
                      setSearchOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" /> Search in Chat
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      handleViewPins();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Pin className="h-4 w-4 text-muted-foreground" /> Pinned Messages
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      handleToggleMute();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    {isMuted ? (
                      <BellOff className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    )}
                    {isMuted ? "Unmute Notifications" : "Notifications"}
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      if (vanishActive) {
                        exitVanishMode();
                      } else {
                        enterVanishMode();
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    {vanishActive ? "Exit Vanish Mode" : "Vanish Mode"}
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setPrivacyOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition"
                  >
                    <Lock className="h-4 w-4 text-muted-foreground" /> Privacy & Security
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      if (isArchived) {
                        handleUnarchive();
                      } else {
                        handleArchive();
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-surface-2 transition cursor-pointer"
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4 text-muted-foreground" /> Unarchive Chat
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 text-muted-foreground" /> Archive Chat
                      </>
                    )}
                  </button>
                  <div className="my-1.5 h-px bg-border/60" />
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setConfirmAction("clear");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="h-4 w-4" /> Clear Chat
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setConfirmAction("delete");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Chat
                  </button>
                  <button
                    onClick={() => {
                      setHeaderMenu(false);
                      setConfirmAction("block");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/10 transition"
                  >
                    <ShieldBan className="h-4 w-4" /> Block User
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </header>

      {searchOpen && (
        <div className="glass sticky top-[68px] z-20 flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(searchQ);
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Search in chat"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchHits.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {searchIdx + 1}/{searchHits.length}
            </span>
          )}
          <button onClick={prevHit} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10" aria-label="Prev">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={nextHit} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10" aria-label="Next">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={() => setSearchOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(pins.data?.pins ?? []).length > 0 && !pinsCollapsed && (
        <PinnedMessagesPanel
          pins={pins.data?.pins ?? []}
          messages={pins.data?.messages ?? []}
          activePinIndex={activePinIndex}
          onSetActiveIndex={setActivePinIndex}
          onJump={(id) => scrollToMessage(id)}
          onUnpin={async (messageId) => {
            await doUnpin({ data: { conversation_id: conversationId, message_id: messageId } });
            qc.invalidateQueries({ queryKey: ["pins", conversationId] });
            const newLen = (pins.data?.pins ?? []).length - 1;
            if (newLen === 0) { setPinsCollapsed(true); setPinPanelOpen(false); }
            else setActivePinIndex((prev) => Math.min(prev, newLen - 1));
          }}
          onCollapse={() => { setPinsCollapsed(true); setPinPanelOpen(false); }}
          onOpenPanel={() => setPinPanelOpen((v) => !v)}
          isPanelOpen={pinPanelOpen}
        />
      )}


      {selectMode && (
        <div className="glass sticky top-[68px] z-20 flex items-center gap-2 border-b border-border px-3 py-2">
          <button onClick={() => setSelected(new Set())} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10">
            <X className="h-4 w-4" />
          </button>
          <p className="flex-1 text-sm font-semibold">{selected.size} selected</p>
          <button
            onClick={() => setForwardFrom(Array.from(selected))}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10"
            aria-label="Forward"
          >
            <Forward className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await Promise.all(Array.from(selected).map((id) => doStar({ data: { message_id: id } })));
              qc.invalidateQueries({ queryKey: ["stars-in-conv", conversationId] });
              setSelected(new Set());
              showToast("Starred");
            }}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10"
            aria-label="Star"
          >
            <Star className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const text = Array.from(selected)
                .map((id) => messageById.get(id)?.body ?? "")
                .filter(Boolean)
                .join("\n");
              navigator.clipboard.writeText(text).then(() => showToast("Copied")).catch(() => {});
              setSelected(new Set());
            }}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10"
            aria-label="Copy"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              doDeleteForMe(Array.from(selected));
              setSelected(new Set());
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-destructive hover:bg-foreground/10"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}


      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        <ul className="mx-auto flex max-w-md flex-col gap-1.5">
          {rendered.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = rendered[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id;
            const receipt = mine ? receiptByMsg.get(m.id) : undefined;
            const removing = removingIds.has(m.id);
            const rlist = reactionsByMsg.get(m.id) ?? [];
            const isPinned = pinnedIds.has(m.id);
            const isStarred = starSet.has(m.id);
            const isSelected = selected.has(m.id);
            const parent = m.reply_to_id ? messageById.get(m.reply_to_id) : null;
            const isSearchHit = searchHits[searchIdx] === m.id;
            const isFirstVanish = m.is_vanish && (!prev || !prev.is_vanish);

            return (
              <Fragment key={m.id}>
                {isFirstVanish && (
                  <li className="my-4 flex items-center justify-center gap-4 text-[11px] font-medium tracking-wide text-primary/70 uppercase select-none">
                    <span className="h-px w-8 bg-primary/20" />
                    <span className="flex items-center gap-1.5"><Moon className="h-3 w-3" /> Vanish Mode enabled</span>
                    <span className="h-px w-8 bg-primary/20" />
                  </li>
                )}
                {m.is_vanish ? (
                  <EphemeralMessageBubble
                    message={{ ...m, sender_name: conv.data?.members?.find((mb) => mb.id === m.sender_id)?.display_name ?? "User" }}
                    mine={mine}
                    showName={isGroup}
                  />
                ) : (
                  <MessageBubble
                    id={m.id}
                    body={m.body}
                    sender_id={m.sender_id}
                    created_at={m.created_at}
                    edited_at={m.edited_at}
                    forwarded_from_id={m.forwarded_from_id}
                    reply_to_id={m.reply_to_id}
                    mine={mine}
                    grouped={Boolean(grouped)}
                    removing={removing}
                    isSelected={isSelected}
                    selectMode={selectMode}
                    isPinned={isPinned}
                    isStarred={isStarred}
                    isSearchHit={isSearchHit}
                    pending={(m as OptimisticMsg).pending}
                    failed={(m as OptimisticMsg).failed}
                    receipt={receipt}
                    reactions={rlist}
                    parent={parent ? { id: parent.id, body: parent.body } : null}
                    attachments={m.attachments}
                    themeClass={mine ? (CHAT_THEMES[appearanceSettings?.themeId]?.bubbleClass || CHAT_THEMES.default.bubbleClass) : undefined}
                    onViewContact={(uid) => setViewContactUserId(uid)}
                    onSwipeReply={(msg) => setReplyTo(msg)}
                    onImageClick={(attachmentId) => {
                      if (!m.attachments) return;
                      const idx = m.attachments.findIndex((a) => a.id === attachmentId);
                      if (idx !== -1) setMediaViewer({ messageId: m.id, index: idx });
                    }}
                    onToggleSelect={toggleSelect}
                    onOpenMenu={(e, msgId) => {
                      const msg = messageById.get(msgId) ?? m;
                      openMenu(e as React.MouseEvent, msg);
                    }}
                    onScrollToParent={scrollToMessage}
                    onReact={async (msgId, emoji) => {
                      await doReact({ data: { message_id: msgId, emoji } });
                      qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
                    }}
                    bubbleRef={(el) => {
                      if (el) bubbleRefs.current.set(m.id, el);
                      else bubbleRefs.current.delete(m.id);
                    }}
                    longPressProps={longPress(m)}
                  />
                )}
              </Fragment>
            );
          })}
          {typingUsers.size > 0 && (
            <li className="flex justify-start">
              <div className="glass flex items-center gap-1 rounded-2xl rounded-bl-md px-3 py-2">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
                {typingLabel && <span className="ml-1.5 text-[11px] text-muted-foreground">{typingLabel}</span>}
              </div>
            </li>
          )}
        </ul>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); stagedFiles.length > 0 ? uploadAndSendAttachments() : submit(); }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) {
            stageFiles(files);
            showToast(`${files.length} file${files.length > 1 ? "s" : ""} added`);
          }
        }}
        className="sticky bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur relative"
      >
        {isDraggingOver && (
          <div className="pointer-events-none absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] top-2 z-30 flex items-center justify-center rounded-3xl bg-primary/15 backdrop-blur-sm border-2 border-dashed border-primary animate-fade-in">
            <p className="text-sm font-semibold text-primary">Drop files here to send</p>
          </div>
        )}
        <div className="mx-auto max-w-md">
          {!vanishActive && (replyTo || editing) && (
            <div className="glass mb-1.5 flex items-center gap-2 rounded-2xl border-l-2 border-primary px-3 py-2">
              {editing ? <Pencil className="h-3.5 w-3.5 text-primary" /> : <Reply className="h-3.5 w-3.5 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  {editing ? "Editing" : "Replying to"}
                </p>
                <p className="truncate text-xs">{(editing ?? replyTo)?.body}</p>
              </div>
              <button
                type="button"
                onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Staged media preview bar */}
          {stagedFiles.length > 0 && (
            <MediaPreviewBar
              stagedFiles={stagedFiles}
              caption={attachCaption}
              onCaptionChange={setAttachCaption}
              onRemove={(id) => setStagedFiles((prev) => prev.filter((s) => s.id !== id))}
              onCancel={() => {
                setStagedFiles([]);
                setAttachCaption("");
              }}
              onSend={uploadAndSendAttachments}
              onAddFiles={(files) => stageFiles(files)}
              isSending={isSendingAttachment}
            />
          )}

          {/* Voice recorder mode */}
          {showVoiceRecorder ? (
            <VoiceRecorder
              onSend={async (blob, mimeType) => {
                const ext = mimeType.split(";")[0].split("/")[1] ?? "webm";
                const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType.split(";")[0] });
                setStagedFiles([{ id: crypto.randomUUID(), file, progress: 0 }]);
                setShowVoiceRecorder(false);
              }}
              onCancel={() => setShowVoiceRecorder(false)}
            />
          ) : (
            <div className="relative flex items-end gap-2">
              {!editing && (
                <div className="relative flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu((v) => !v); setShowEmojiPicker(false); }}
                    className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Attach file"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  {showAttachMenu && (
                    <AttachmentActionMenu
                      onClose={() => setShowAttachMenu(false)}
                      onSelectImages={(files) => { stageFiles(files); setShowAttachMenu(false); }}
                      onSelectFile={(file) => { stageFiles([file]); setShowAttachMenu(false); }}
                      onOpenCamera={() => { setShowCamera(true); setShowAttachMenu(false); }}
                      onStartVoice={() => { setShowVoiceRecorder(true); setShowAttachMenu(false); }}
                      onShareContact={() => setShowContactPicker(true)}
                      onShareLocation={() => setShowLocationPicker(true)}
                      onOpenAppearance={() => setShowAppearanceModal(true)}
                    />
                  )}
                </div>
              )}
              <div className="relative flex min-w-0 flex-1 items-end rounded-2xl border border-border/80 bg-card/90 shadow-sm focus-within:border-primary/50 transition-colors">
                <textarea
                  ref={composerRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (!vanishActive) notifyTyping();
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    const files: File[] = [];
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i];
                      if (item.kind === "file") {
                        const file = item.getAsFile();
                        if (file) files.push(file);
                      }
                    }
                    if (files.length > 0) {
                      e.preventDefault();
                      stageFiles(files);
                      showToast(`${files.length} item${files.length > 1 ? "s" : ""} pasted from clipboard`);
                    }
                  }}
                  onFocus={() => {
                    setShowAttachMenu(false);
                    setShowEmojiPicker(false);
                    setTimeout(() => {
                      scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
                    }, 250);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                  }}
                  rows={1}
                  placeholder={vanishActive ? "Vanish message..." : editing ? "Edit message" : "Message"}
                  className="max-h-32 min-h-10 sm:min-h-11 flex-1 resize-none bg-transparent px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm outline-none"
                  aria-label={vanishActive ? "Type a vanish message" : "Type a message"}
                />
                {!vanishActive && (
                  <div className="relative shrink-0 self-end pb-1 pr-1">
                    <button
                      type="button"
                      onClick={() => { setShowEmojiPicker((v) => !v); setShowAttachMenu(false); }}
                      className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                      aria-label="Emoji"
                    >
                      <Smile className="h-[1.125rem] w-[1.125rem]" />
                    </button>
                    {showEmojiPicker && (
                      <EmojiPickerPopover
                        onSelectEmoji={(emoji) => {
                          setText((prev) => prev + emoji);
                          composerRef.current?.focus();
                        }}
                        onSelectSticker={async (sticker) => {
                          await doSend({
                            data: {
                              conversation_id: conversationId,
                              body: formatStickerPayload(sticker),
                            },
                          });
                          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
                        }}
                        onSelectGif={async (gif) => {
                          await doSend({
                            data: {
                              conversation_id: conversationId,
                              body: formatGifPayload(gif),
                            },
                          });
                          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
                        }}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    )}
                  </div>
                )}
              </div>
              {(text.trim() || stagedFiles.length > 0 || editing) ? (
                <button
                  type="submit"
                  disabled={isSendingAttachment || (!text.trim() && stagedFiles.length === 0 && !editing) || (!vanishActive && (send.isPending || commitEdit.isPending))}
                  className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
                  aria-label={editing ? "Save" : vanishActive ? "Send vanish message" : "Send"}
                >
                  {isSendingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : vanishActive ? <Moon className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowVoiceRecorder(true); setShowAttachMenu(false); setShowEmojiPicker(false); }}
                  className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Voice message"
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {showCamera && (
        <CameraCaptureModal
          onCapture={(file, caption) => {
            void stageFiles([file]);
            if (caption) setAttachCaption(caption);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {menu && (
        <ContextMenu
          menu={menu}
          isPinned={pinnedIds.has(menu.id)}
          isStarred={starSet.has(menu.id)}
          onClose={() => setMenu(null)}
          onShowToast={showToast}
          onReact={async (emoji) => {
            await doReact({ data: { message_id: menu.id, emoji } });
            qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
          }}
          onReply={() => setReplyTo(menu.msg)}
          onEdit={() => setEditing(menu.msg)}
          onCopy={async () => {
            try { await navigator.clipboard.writeText(menu.msg.body); showToast("Copied"); }
            catch { showToast("Copy failed"); }
          }}
          onForward={() => setForwardFrom([menu.id])}
          onSelect={() => toggleSelect(menu.id)}
          onDelete={() => setConfirmDelete({ id: menu.id, mine: menu.mine })}
          onInfo={() => setInfoFor(menu.id)}
          onPin={async () => {
            try {
              if (pinnedIds.has(menu.id)) {
                await doUnpin({ data: { conversation_id: conversationId, message_id: menu.id } });
                showToast("Unpinned");
              } else {
                await doPin({ data: { conversation_id: conversationId, message_id: menu.id } });
                showToast("Pinned");
                setPinsCollapsed(false);
              }
              qc.invalidateQueries({ queryKey: ["pins", conversationId] });
            } catch (e) {
              showToast(e instanceof Error ? e.message : "Pin failed");
            }
          }}
          onStar={async () => {
            const res = await doStar({ data: { message_id: menu.id } });
            qc.invalidateQueries({ queryKey: ["stars-in-conv", conversationId] });
            qc.invalidateQueries({ queryKey: ["starred"] });
            showToast(res.starred ? "Starred" : "Unstarred");
          }}
        />
      )}

      {showContactPicker && (
        <ContactPickerModal
          onClose={() => setShowContactPicker(false)}
          onSendContact={async (contact) => {
            await doSend({
              data: {
                conversation_id: conversationId,
                body: formatContactPayload(contact),
              },
            });
            qc.invalidateQueries({ queryKey: ["messages", conversationId] });
            showToast("Contact shared");
          }}
        />
      )}

      {showLocationPicker && (
        <LocationPickerModal
          onClose={() => setShowLocationPicker(false)}
          onSendLocation={async (loc) => {
            await doSend({
              data: {
                conversation_id: conversationId,
                body: formatLocationPayload(loc),
              },
            });
            qc.invalidateQueries({ queryKey: ["messages", conversationId] });
            showToast("Location shared");
          }}
        />
      )}

      {showAppearanceModal && (
        <ChatAppearanceModal
          currentSettings={appearanceSettings}
          onClose={() => setShowAppearanceModal(false)}
          onSave={(newSettings) => {
            setAppearanceSettings(newSettings);
            saveConversationAppearance(conversationId, newSettings);
            showToast("Appearance saved");
          }}
        />
      )}

      {viewContactUserId && (
        <UserProfileSheet
          userId={viewContactUserId}
          onClose={() => setViewContactUserId(null)}
          onStartCall={(kind) => {
            setViewContactUserId(null);
            startCall({
              conversationId,
              remoteUserId: viewContactUserId,
              remoteName: "Contact",
              isVideo: kind === "video",
            });
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          mine={confirmDelete.mine}
          onCancel={() => setConfirmDelete(null)}
          onDeleteForMe={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void doDeleteForMe([id]);
          }}
          onDeleteForEveryone={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void doDeleteForAll(id);
          }}
        />
      )}

      {infoFor && (
        <InfoDialog
          messageId={infoFor}
          fetchInfo={fetchMessageInfo}
          onClose={() => setInfoFor(null)}
        />
      )}

      {forwardFrom && (
        <ForwardSheet
          fetchConversations={fetchConversationsList}
          currentConversationId={conversationId}
          messageIds={forwardFrom}
          onClose={() => setForwardFrom(null)}
          onSend={async (convIds) => {
            try {
              const res = await doForward({ data: { message_ids: forwardFrom, conversation_ids: convIds } });
              setForwardFrom(null);
              setSelected(new Set());
              qc.invalidateQueries({ queryKey: ["conversations"] });
              showToast(`Forwarded to ${res.count} chat${res.count === 1 ? "" : "s"}`);
            } catch {
              showToast("Forward failed");
            }
          }}
          me={me.data as { id: string } | undefined}
          selfProfile={otherProfile}
        />
      )}

      {showGroupInfo && isGroup && conv.data?.conversation && (
        <GroupInfoSheet
          conversationId={conversationId}
          title={conv.data.conversation.title ?? "Group chat"}
          description={conv.data.conversation.description}
          avatar_url={conv.data.conversation.avatar_url}
          created_by={conv.data.conversation.created_by ?? null}
          members={(conv.data.members as unknown as GroupMember[]) ?? []}
          myRole={conv.data.my_role}
          meId={meId}
          onClose={() => setShowGroupInfo(false)}
          onOpenMedia={(id, allMedia) => {
            const idx = allMedia.findIndex((a) => a.id === id);
            setMediaViewer({ attachments: allMedia, index: Math.max(0, idx) });
          }}
        />
      )}

      {showProfile && conv.data?.other && (
        <UserProfileSheet
          user={conv.data.other}
          conversationId={conversationId}
          isOnline={isOnline}
          statusLabel={getUserStatusLabel(otherId, conversationId, otherProfile?.last_seen)}
          isMuted={isMuted}
          onClose={() => setShowProfile(false)}
          onVoiceCall={() => ring("voice")}
          onVideoCall={() => ring("video")}
          onSearch={() => {
            setSearchQ("");
            setSearchHits([]);
            setSearchOpen(true);
          }}
          onToggleMute={handleToggleMute}
          onClearChat={() => setConfirmAction("clear")}
          onBlock={() => setConfirmAction("block")}
          onOpenMedia={(id, allMedia) => {
            const idx = allMedia.findIndex((a) => a.id === id);
            setMediaViewer({ attachments: allMedia, index: Math.max(0, idx) });
          }}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction === "clear"
              ? "Clear chat history?"
              : confirmAction === "delete"
              ? "Delete chat?"
              : confirmAction === "block"
              ? `Block ${otherProfile?.display_name ?? otherProfile?.username ?? "this user"}?`
              : "Leave this group?"
          }
          body={
            confirmAction === "clear"
              ? "This will permanently delete all messages and shared media from this conversation."
              : confirmAction === "delete"
              ? "This will permanently delete this conversation and its message history."
              : confirmAction === "block"
              ? "They won't be able to message or call you until you unblock them."
              : "You will leave this group conversation. You will no longer receive new messages."
          }
          action={
            confirmAction === "clear"
              ? "Clear Chat"
              : confirmAction === "delete"
              ? "Delete Chat"
              : confirmAction === "block"
              ? "Block"
              : "Leave"
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction === "clear") handleClearChat();
            else if (confirmAction === "delete") handleDeleteChat();
            else if (confirmAction === "block") handleBlockUser();
            else if (confirmAction === "leave") handleLeaveGroup();
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <div className="glass rounded-full px-4 py-2 text-xs font-medium shadow-lg">{toast}</div>
        </div>
      )}

      {mediaViewer && (
        <MediaViewerModal
          attachments={
            mediaViewer.attachments ??
            (mediaViewer.messageId ? messageById.get(mediaViewer.messageId)?.attachments ?? [] : [])
          }
          startIndex={mediaViewer.index}
          onClose={() => setMediaViewer(null)}
          onRequestUrl={async (id) => {
            const media = await getAuthenticatedAttachment(id);
            return media.objectUrl;
          }}
        />
      )}
    </div>
  );
}

function ContextMenu({
  menu,
  isPinned,
  isStarred,
  onClose,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onForward,
  onSelect,
  onDelete,
  onInfo,
  onPin,
  onStar,
  onShowToast,
  onTranslate,
}: {
  menu: NonNullable<MenuState>;
  isPinned: boolean;
  isStarred: boolean;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onForward: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onPin: () => void;
  onStar: () => void;
  onTranslate?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const W = 220;
  const H = 430;
  const left = Math.max(12, Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 800) - W - 12));
  const top = Math.max(12, Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 600) - H - 12));

  const attachments = menu.msg.attachments ?? [];
  const firstImage = attachments.find((a) => a.mime_type.startsWith("image/"));
  const firstVideo = attachments.find((a) => a.mime_type.startsWith("video/"));
  const firstAudio = attachments.find((a) => a.mime_type.startsWith("audio/"));
  const firstFile = attachments.find((a) => !a.mime_type.startsWith("image/") && !a.mime_type.startsWith("video/") && !a.mime_type.startsWith("audio/"));

  const handleSaveMedia = async (att: { id: string; original_filename: string }) => {
    try {
      await downloadAuthenticatedAttachment(att.id, att.original_filename);
      onShowToast?.("Download started");
    } catch {
      onShowToast?.("Download failed");
    }
  };

  const handleCopyImage = async (attId: string) => {
    try {
      await copyImageToClipboard(attId);
      onShowToast?.("Image copied to clipboard");
    } catch {
      onShowToast?.("Could not copy image");
    }
  };

  const Item = ({
    icon: Icon,
    label,
    onClick,
    danger,
  }: {
    icon: any;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => { onClick(); onClose(); }}
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs sm:text-sm font-medium transition hover:bg-muted active:scale-[0.98]",
        danger ? "text-destructive hover:bg-destructive/10" : "text-foreground",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-start bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={isMobile ? undefined : { position: "absolute", left, top, width: W }}
        className={
          isMobile
            ? "w-full max-w-lg mx-auto bg-card text-card-foreground border-t border-border rounded-t-3xl p-4 shadow-2xl animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "bg-card text-card-foreground rounded-2xl border border-border p-1.5 shadow-2xl animate-scale-in"
        }
      >
        <div className="flex justify-around px-1 py-1">
          {QUICK_EMOJI.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => { onReact(e); onClose(); }}
              className="grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-muted active:scale-95"
            >
              {e}
            </button>
          ))}
        </div>

        <div className="my-1.5 h-px bg-border/60" />

        {/* Media-specific actions */}
        {firstImage && (
          <>
            <Item icon={Download} label="Save image" onClick={() => void handleSaveMedia(firstImage)} />
            <Item icon={Copy} label="Copy image" onClick={() => void handleCopyImage(firstImage.id)} />
          </>
        )}
        {firstVideo && (
          <Item icon={Download} label="Save video" onClick={() => void handleSaveMedia(firstVideo)} />
        )}
        {firstAudio && (
          <Item icon={Download} label="Save audio" onClick={() => void handleSaveMedia(firstAudio)} />
        )}
        {firstFile && (
          <Item icon={Download} label="Download file" onClick={() => void handleSaveMedia(firstFile)} />
        )}

        {/* Messaging actions */}
        <Item icon={Reply} label="Reply" onClick={onReply} />
        {menu.mine && !firstImage && !firstAudio && !firstFile && menu.msg.body && (
          <Item icon={Pencil} label="Edit" onClick={onEdit} />
        )}
        {menu.msg.body && (
          <Item icon={Copy} label={firstImage || firstFile || firstAudio ? "Copy caption" : "Copy text"} onClick={onCopy} />
        )}
        <Item icon={Forward} label="Forward" onClick={onForward} />
        <Item icon={isPinned ? PinOff : Pin} label={isPinned ? "Unpin" : "Pin"} onClick={onPin} />
        <Item icon={Star} label={isStarred ? "Unstar" : "Star"} onClick={onStar} />
        <Item icon={CheckSquare} label="Select" onClick={onSelect} />
        {menu.mine && <Item icon={Info} label="Info" onClick={onInfo} />}
        <div className="my-1.5 h-px bg-border/60" />
        <Item icon={Trash2} label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  mine,
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  mine: boolean;
  onCancel: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 animate-fade-in sm:items-center" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-sm rounded-3xl border border-border p-5 shadow-2xl animate-scale-in"
      >
        <h3 className="text-lg font-bold">Delete message?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {mine
            ? "Choose who to delete this message for. This can't be undone."
            : "This message will be removed from your chat history on all your devices."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {mine && (
            <button
              onClick={onDeleteForEveryone}
              className="h-11 rounded-full bg-destructive font-semibold text-destructive-foreground transition hover:opacity-90"
            >
              Delete for everyone
            </button>
          )}
          <button
            onClick={onDeleteForMe}
            className="h-11 rounded-full bg-primary font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Delete for me
          </button>
          <button onClick={onCancel} className="h-11 rounded-full border border-border font-semibold transition hover:bg-foreground/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoDialog({
  messageId,
  fetchInfo,
  onClose,
}: {
  messageId: string;
  fetchInfo: (args: { data: { message_id: string } }) => Promise<{
    message: { id: string; created_at: string; body: string; edited_at: string | null };
    receipts: Array<{ user_id: string; delivered_at: string | null; read_at: string | null }>;
    edits: Array<{ previous_body: string; edited_at: string }>;
  }>;
  onClose: () => void;
}) {
  const info = useQuery({
    queryKey: ["message-info", messageId],
    queryFn: () => fetchInfo({ data: { message_id: messageId } }),
  });

  const delivered = info.data?.receipts.find((r) => r.delivered_at)?.delivered_at ?? null;
  const read = info.data?.receipts.find((r) => r.read_at)?.read_at ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-sm rounded-3xl border border-border p-5 shadow-2xl animate-scale-in"
      >
        <h3 className="text-lg font-bold">Message info</h3>
        {!info.data ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="col-span-1 text-muted-foreground">Sent</dt>
              <dd className="col-span-2">{new Date(info.data.message.created_at).toLocaleString()}</dd>
              <dt className="col-span-1 text-muted-foreground">Delivered</dt>
              <dd className="col-span-2">{delivered ? new Date(delivered).toLocaleString() : "—"}</dd>
              <dt className="col-span-1 text-muted-foreground">Read</dt>
              <dd className="col-span-2">{read ? new Date(read).toLocaleString() : "—"}</dd>
              {info.data.message.edited_at && (
                <>
                  <dt className="col-span-1 text-muted-foreground">Edited</dt>
                  <dd className="col-span-2">{new Date(info.data.message.edited_at).toLocaleString()}</dd>
                </>
              )}
            </dl>
            {info.data.edits.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Edit history ({info.data.edits.length})
                </p>
                <ul className="mt-2 grid gap-1.5 max-h-40 overflow-y-auto">
                  {info.data.edits.map((e, i) => (
                    <li key={i} className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(e.edited_at).toLocaleString()}
                      </p>
                      <p className="mt-0.5 line-clamp-2">{e.previous_body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className="mt-5 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground">
          Close
        </button>
      </div>
    </div>
  );
}

function ForwardSheet({
  fetchConversations,
  currentConversationId,
  messageIds,
  onClose,
  onSend,
  me,
  selfProfile,
}: {
  fetchConversations: () => Promise<ConversationSummary[]>;
  currentConversationId: string;
  messageIds: string[];
  onClose: () => void;
  onSend: (convIds: string[]) => void;
  me: { id: string } | undefined;
  selfProfile: ChatProfile | null;
}) {
  const list = useQuery({ queryKey: ["conversations"], queryFn: () => fetchConversations() });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  void me;
  void selfProfile;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-t-3xl border border-border p-4 shadow-2xl animate-scale-in max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Forward to…</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Forwarding {messageIds.length} message{messageIds.length === 1 ? "" : "s"}
        </p>
        <ul className="mt-3 flex-1 overflow-y-auto grid gap-1.5 pb-2">
          {(list.data ?? [])
            .filter((c) => c.id !== currentConversationId)
            .map((c) => {
              const title = c.kind === "group"
                ? (c.title ?? "Group chat")
                : (c.other?.display_name ?? c.other?.username ?? "Ghost");
              const subtitle = c.kind === "group"
                ? `${c.member_count} members`
                : `@${c.other?.username ?? ""}`;
              const on = picked.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                      on ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-foreground/5",
                    ].join(" ")}
                  >
                    <div className="relative shrink-0">
                      {c.kind === "group" ? (
                        c.avatar_url ? (
                          <img
                            src={c.avatar_url}
                            alt={title}
                            className="h-10 w-10 rounded-xl object-cover ring-1 ring-border shadow-sm"
                          />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 font-bold text-primary ring-1 ring-border/50 shadow-sm">
                            <UsersRound className="h-5 w-5 text-primary" aria-label="Group chat" />
                          </div>
                        )
                      ) : (
                        c.other?.avatar_url ? (
                          <img
                            src={c.other.avatar_url}
                            alt={title}
                            className="h-10 w-10 rounded-full object-cover ring-1 ring-border shadow-sm"
                          />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/12 font-bold text-primary ring-1 ring-border/50 shadow-sm">
                            {title.charAt(0).toUpperCase()}
                          </div>
                        )
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {c.kind === "group" && (
                          <UsersRound className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
                        )}
                        <span className="truncate">{title}</span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
                    </div>
                    {on && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          {list.data && list.data.filter((c) => c.id !== currentConversationId).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No other conversations</p>
          )}
        </ul>
        <button
          onClick={() => onSend(Array.from(picked))}
          disabled={picked.size === 0}
          className="mt-3 h-11 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
        >
          Send to {picked.size || 0}
        </button>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}

function ConfirmDialog({
  title,
  body,
  action,
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="card-elevated animate-rise-in w-full max-w-sm rounded-2xl p-6 bg-card border border-border shadow-2xl">
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={[
              "h-10 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition",
              danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90",
            ].join(" ")}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

