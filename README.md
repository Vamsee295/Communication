# 👻 Ghostline — Private & Secure Communication Platform

Ghostline is a high-performance, private messaging and calling application built for real connections.

---

## 🏗️ System Architecture

Ghostline strictly separates identity authentication from application data and binary storage:

```
┌─────────────────────────────────────────────────────────────┐
│                       Ghostline Client                      │
│        (Web PWA · Android Capacitor · Desktop Web)          │
└──────────────┬──────────────────────────────┬───────────────┘
               │ (JWT Auth Only)              │ (REST / Realtime / Calls)
               ▼                              ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│        Supabase Auth         │ │    Ghostline App Server     │
│   (Identity & Credentials)   │ │  (TanStack Start / Nitro)   │
└──────────────────────────────┘ └──────────────┬──────────────┘
                                                │ (Pooled Queries)
                                                ▼
                                 ┌─────────────────────────────┐
                                 │       Neon PostgreSQL       │
                                 │   (Single Source of Truth)  │
                                 │ Messages · Profiles · Media │
                                 │ E2EE Relay · Calls · State  │
                                 └─────────────────────────────┘
```

* **Supabase**: Authentication and identity provider ONLY (JWT validation, sessions, OAuth).
* **Neon PostgreSQL**: Application source of truth for all structured data, conversations, contacts, reactions, and chunked binary media (`BYTEA`).
* **WebRTC**: Peer-to-peer end-to-end encrypted audio and video calling with DTLS-SRTP.
* **Signal Protocol (E2EE)**: Zero-knowledge relay transport supporting pre-key bundles and double-ratchet envelopes.

---

## 🚀 Key Features

* **Instant Realtime Messaging**: Low-latency message delivery, edit history, message deletion, forward/reply, pin/star, reactions, and seen/read receipts.
* **Rich Media & Attachments**: Fast photo/video compression, documents/files, voice notes with live waveforms, location sharing, contact sharing, camera capture, and animated GIFs/stickers.
* **P2P Audio & Video Calling**: Real-time WebRTC audio/video calls with incoming call overlays, mute/camera controls, and call history.
* **Private Vanish Mode**: Ephemeral disappearing conversations with countdown timers and automated client cleanup.
* **Multi-Device & Security**: Device registration, active session management, one-click remote device revocation, and brute-force protections.
* **Responsive Mobile UX**: Native bottom-sheet presentation on mobile, touch-manipulation optimizations (zero 300ms tap delay), safe-area insets, and keyboard-aware scroll stability.

---

## 🛠️ Technology Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Framer Motion.
* **Routing & SSR**: TanStack Router, TanStack Start (Nitro SSR).
* **Database & ORM**: Neon Serverless PostgreSQL (`postgres.js`).
* **Mobile Runtime**: Capacitor 7 (Android native permissions, push, camera, and audio).
* **Testing & QA**: Vitest (389+ unit & integration test suites).

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```bash
# Data Repository Driver (Neon is the canonical production driver)
DATA_REPOSITORY_DRIVER="neon"

# Neon PostgreSQL Database URL
DATABASE_URL="postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require"

# Supabase Auth Configuration
SUPABASE_URL="https://[project-id].supabase.co"
SUPABASE_PUBLISHABLE_KEY="[publishable-key]"
SUPABASE_PROJECT_ID="[project-id]"

# Vite Public Auth Configuration
VITE_SUPABASE_URL="https://[project-id].supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="[publishable-key]"
VITE_SUPABASE_PROJECT_ID="[project-id]"

# Web Push Notification Keys (VAPID)
VAPID_PUBLIC_KEY="[vapid-public-key]"
VAPID_PRIVATE_KEY="[vapid-private-key]"
VAPID_SUBJECT="mailto:security@ghostline.app"
```

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev
```

The application will be available at `http://localhost:8080`.

---

## 📱 Android Native Build (Capacitor)

Ghostline includes native Android support with full permissions for Camera, Microphone, Location, Media, and Notifications:

```bash
# 1. Build the production client
npm run build

# 2. Sync web assets and plugins to Android project
npx cap sync android

# 3. Open in Android Studio to build APK / AAB
npx cap open android
```

### Android Permissions Declared:
* `CAMERA`: Camera capture and video calling.
* `RECORD_AUDIO` & `MODIFY_AUDIO_SETTINGS`: Voice notes, microphone input, and voice calls.
* `POST_NOTIFICATIONS`: Native Android background push and call alerts.
* `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION`: Location sharing in chat.
* `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`: Gallery attachments.

---

## 🧪 Testing & Verification

Run the comprehensive test suite (389+ tests):

```bash
# Run unit and integration tests
npx vitest run

# Run production SSR build validation
npm run build
```

---

## 🔒 Security Model

* **Zero Plaintext Storage on Relays**: E2EE envelopes are buffered as opaque ciphertexts with delivery ACK disposal.
* **SSRF Defense**: Link preview scrapers strictly prohibit localhost, loopback (`127.0.0.1`), and private IPv4 ranges.
* **Strict Parameterized Queries**: All Neon queries are compiled via tagged template literals to eliminate SQL injection vulnerabilities.
* **Anti-Enumeration Auth**: Signup and password reset flows return generic neutral confirmations to protect user privacy.
