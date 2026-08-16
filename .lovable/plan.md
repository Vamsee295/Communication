# Ghostline — UI Completion + Real WebRTC Calling

Two stages. Stage A finishes the "must do" UI list and the navigation/settings architecture. Stage B builds real 1:1 voice and video calling on top of the existing realtime infrastructure. No fake call UI, no simulated timers.

One note first: the floating bar at the bottom of the screen with the sparkle / T / pencil / square icons is not part of Ghostline — it is the Lovable preview's own editing toolbar and it never appears in the published app. Nothing to remove in code.

## Stage A — Finish the messaging UI

### 1. Conversation header (already partly there, gets a proper identity block)
Avatar, display name, then a status line: `@username · Active now` / `Last seen 5m ago` (derived from presence plus the existing `last_seen` field). Right side: search, voice call, video call, overflow menu. Below the name, a small `End-to-end encrypted` lock chip; clicking it opens a short sheet explaining that only the two participants can read the messages.

### 2. Chat list upgrades
- Unread count as a small yellow circular badge (the count already comes from the server).
- Last message preview line with sender tick state.
- Green dot on the avatar for online contacts, muted/pinned icons on the row.
- Hover reveals a `⋮` menu: Mark as unread, Pin, Mute, Archive, Delete, Block. Destructive items get a confirm dialog.
- `PINNED` and `RECENT` section headers when any chat is pinned.

### 3. Navigation restructure
Sidebar becomes **Chats · Calls · Profile**. Stories and Camera are removed from primary navigation (Camera/media moves inside the chat composer later). Each screen gets its own layout rather than reusing the chats template: chats = list + conversation two-pane, profile = centered, settings = settings nav, calls = history list.

### 4. Profile → Settings
Profile becomes a centered card (avatar, name, @username) leading into a settings list: Account, Privacy & Security, Notifications, Appearance, Devices, Blocked Users, About Ghostline, then Log out. Privacy & Security gets real controls where the data already supports it (read receipts, last-seen visibility, blocked list, devices); anything not backed by real behaviour is not shown.

### 5. Composer + motion polish
Composer gets attachment / emoji / voice affordances in one row with the send button, reply and edit modes inline. Message list gets a small staggered entry, send animation, animated typing dots, and a subtle 3–4s breathing glow on the empty-state ghost mark.

### 6. Keyboard shortcuts + Ctrl/Cmd+K search
Global palette with sections (Chats, Messages, People) and recent searches. Shortcuts: `Ctrl+K` search, `Ctrl+N` new chat, `Esc` close, `Enter` send, `Shift+Enter` newline, `Ctrl+,` settings.

## Stage B — Real WebRTC voice & video calls

### Signaling
Uses the existing Supabase Realtime infrastructure — no new backend. A per-user private channel carries `call-offer`, `call-answer`, `ice-candidate`, `call-accept`, `call-decline`, `call-end`. Media never touches the database; only SDP/ICE metadata passes through signaling, and only between users who are already accepted friends.

### Data
New `calls` table: caller, callee, conversation, type (voice/video), status (ringing/accepted/declined/missed/ended/failed), started/ended timestamps, duration. Owner-scoped access so only the two participants can read a call row. Completed and missed calls also render as a distinct system-style event in the conversation timeline (not a normal bubble).

### Call flow
Caller requests mic/camera, creates the peer connection and offer, sends it through signaling, exchanges ICE. Receiver gets a **global** incoming-call dialog (works on any page, not only inside the conversation), with caller name, avatar, call type, Accept / Decline. Explicit state machine: IDLE, OUTGOING, RINGING, CONNECTING, CONNECTED, RECONNECTING, DECLINED, MISSED, ENDED, FAILED — the UI text follows the state ("Calling Sanjith…", "Reconnecting…", "00:42").

### Call UI
- Voice: large avatar, name, status, duration, Mute / Speaker / End.
- Video: remote video fills the view, local camera as a floating picture-in-picture, Mute / End / Camera, switch camera where supported.
- End-call button visually distinct; controls touch-sized on mobile with safe-area padding.

### Reliability
STUN configured through `VITE_STUN_SERVER_URL`, with TURN slots (`VITE_TURN_URL`, plus credentials) so TURN can be enabled without rewriting anything. Nothing hard-coded. Outgoing calls time out and are recorded as missed. On end: peer connection closed, all local tracks stopped, remote streams cleared, signaling listeners removed, ICE buffer flushed — so the browser mic/camera indicator disappears. Permission denials show a clear message with retry instead of crashing.

### Calls page
Real call history from the `calls` table: contact, avatar, incoming/outgoing/missed, voice/video icon, timestamp, duration, search, and quick call-back actions.

## Technical notes

- Calling lives in modular pieces following existing conventions: a call context/provider mounted at the root, a WebRTC service, a signaling service built on the existing Supabase channel setup, and separate components for incoming, outgoing, active voice, active video, controls, and history.
- Server functions for call lifecycle (create, accept, decline, end) go in a new `src/lib/calls.functions.ts` using the existing authenticated middleware; authorization checks that the caller is a participant and the two users are friends.
- Chat actions (pin/mute/archive/mark unread) extend `conversation_members` (`muted` already exists); block extends the existing friendship model.
- Existing auth, messaging, deletion, reactions, pins, stars, search, devices, and routing stay intact.
- No new third-party calling platform.

## Order of work

1. Conversation header, unread badges, online/last-seen, chat hover actions, composer, encryption indicator.
2. Navigation restructure + Profile/Settings.
3. Calls: schema, signaling, WebRTC, incoming/active UI, history page, timeline events.
4. Pinned chats, Ctrl+K palette, keyboard shortcuts, empty-state animation, final QA pass.
