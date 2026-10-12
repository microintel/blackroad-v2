<div align="center">

<img src="assets/icons/icon512_rounded.png" alt="BlackRoad logo" width="140" />

# BlackRoad

**Your entire financial life. One private app.**

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JavaScript-blue)
![Storage](https://img.shields.io/badge/storage-on--device-orange)
![PWA](https://img.shields.io/badge/PWA-installable-purple)
![Developed by](https://img.shields.io/badge/developed%20by-Microintel-black)

### 🌐 [Open the Live App → microintel.github.io/blackroad-v2](https://microintel.github.io/blackroad-v2/)

</div>

---

## What is BlackRoad?

BlackRoad is a **digital diary for all your money**.

You record what you earn, spend, own and lend. BlackRoad adds it all up and shows you how much you are worth today, how healthy your finances are, and what changed.

Your data stays **on your own phone or computer**, not on someone else's server. That keeps it private and lets the app work even without internet.

## The Problem

- Money details are scattered across many apps, bank portals and notebooks.
- There is no single place to see your real net worth.
- Most finance apps upload your private data to the cloud.
- Broker reports come as hard-to-read PDFs.
- Raw numbers are shown, but no simple guidance.

## The Solution

BlackRoad puts income, stocks, mutual funds, fixed deposits, loans and accounting into **one app**, with one clean design, local-first privacy, offline support, and a built-in assistant called **Rover** that answers questions from your own data.

---

## Layered Architecture

BlackRoad is built as a stack of layers. Each layer talks only to the layer below it, so the app stays clean, easy to fix and easy to grow.

```mermaid
flowchart TB
    U(["👤 User"])

    L1["<b>Layer 1 · User Interface</b><br/>Screens · Forms · Charts · Light and Dark themes · Rover chat"]
    L2["<b>Layer 2 · App Core</b><br/>Navigation · Sign in, Register, Guest · Preferences"]
    L3["<b>Layer 3 · Finance Modules</b><br/>Income · Stocks · Mutual Funds · Fixed Deposits<br/>Lending · Accounting · Calculators · Net Worth"]
    L4["<b>Layer 4 · Intelligence</b><br/>Financial health · Risk · Goals · What-if · Rover assistant"]
    L5["<b>Layer 5 · Data Services</b><br/>Calculations · Business rules · Backup and Restore · Import and Export"]
    L6["<b>Layer 6 · On-Device Storage</b><br/>IndexedDB · localStorage · Service Worker for offline use"]
    EXT["<b>Optional outside services (read-only)</b><br/>Mutual fund NAV · Live stock prices · Broker connection"]

    U --> L1 --> L2 --> L3 --> L4 --> L5 --> L6
    L3 -. fetches .-> EXT
```

**In simple words**

- **Layer 1** is what you see and tap.
- **Layer 2** moves you between screens and knows who you are.
- **Layer 3** holds the real money features.
- **Layer 4** turns numbers into easy advice and answers.
- **Layer 5** does the maths and keeps your data safe and portable.
- **Layer 6** stores everything on your own device.

---

## System Architecture

A closer look at how everything connects inside the app.

```mermaid
flowchart TB
    USER(["👤 User<br/>Mobile · Tablet · Desktop"])

    subgraph CLIENT["BlackRoad Client (runs fully in the browser / PWA)"]
        direction TB

        subgraph PRESENT["Presentation"]
            direction LR
            SITE["Public Site<br/>Landing · Download"]
            SHELL["App Shell<br/>Sidebar · Topbar · Mobile Nav"]
            ROVERUI["Rover Chat UI"]
            DESIGN["Design System<br/>Themes · Icons · Charts"]
        end

        subgraph APP["Application Core"]
            direction LR
            ROUTER["Router"]
            AUTH["Auth and Session"]
            PREF["Preferences"]
        end

        subgraph FEATURES["Finance Modules"]
            direction LR
            DASH["Dashboard<br/>Net Worth"]
            INC["Income"]
            STK["Stocks"]
            MF["Mutual Fund"]
            FD["Deposits"]
            LEND["Lending"]
            ACC["Accounting"]
            CALC["Calculators"]
        end

        subgraph INTEL["Intelligence"]
            direction LR
            FI["Financial Intelligence"]
            ENGINE["Rules Engine"]
            ROVERENG["Rover Engine"]
        end

        subgraph BROKER["Broker Integration"]
            direction LR
            CONNECT["Connect Broker"]
            PNL["Report Readers"]
        end

        subgraph DATA["Data Layer"]
            direction LR
            SERVICES["Module Services"]
            STORES["Stores"]
            BACKUP["Backup and Restore"]
        end

        subgraph STORAGE["On-Device Storage"]
            direction LR
            IDB[("IndexedDB")]
            LS[("localStorage")]
            SS[("sessionStorage")]
        end

        SW["Service Worker<br/>Offline and Install"]
    end

    subgraph EXTERNAL["Outside Services (optional)"]
        direction LR
        MFAPI["Mutual Fund NAV API"]
        LTP["Live Price API"]
        ANGEL["Broker API"]
    end

    USER --> PRESENT --> APP --> FEATURES
    FEATURES --> DATA
    FEATURES --> INTEL
    INTEL --> DATA
    ROVERUI --> ROVERENG
    BROKER --> DATA
    DATA --> STORAGE
    SW -. caches .-> CLIENT

    MF -.-> MFAPI
    STK -.-> LTP
    CONNECT -.-> ANGEL
```

### How data moves

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Screen
    participant S as Service
    participant DB as Local Storage
    participant R as Dashboard / Rover

    U->>UI: Add or edit a record
    UI->>S: Check and calculate
    S->>DB: Save on the device
    DB-->>UI: Updated data
    UI-->>U: Screen refreshes
    R->>S: Read when needed
    S-->>R: Totals, net worth, answers
```

### How the modules connect

```mermaid
flowchart LR
    INC["Income and Expenses"] --> NW
    STK["Stocks"] --> NW
    MF["Mutual Funds"] --> NW
    FD["Fixed Deposits"] --> NW
    LEND["Lending"] --> NW

    NW{{"Net Worth and Dashboard"}}

    NW --> FI["Financial Intelligence"]
    NW --> ROVER["Rover Assistant"]
    NW --> NOTIF["Notifications and Dues"]
```

---

## Future Architecture

Today BlackRoad is a fast, private, local-first web app. As it grows, Microintel plans to build it with a modern stack: **React** for the interface, a **backend** with **APIs**, and **native apps**.

```mermaid
flowchart TB
    subgraph CLIENTS["Clients"]
        direction LR
        WEB["Web App<br/>React · Next.js · TypeScript"]
        MOBILE["Native Mobile<br/>Android · iOS"]
        DESKTOP["Desktop<br/>Windows · macOS · Linux"]
    end

    subgraph SHARED["Shared Layer"]
        direction LR
        UIKIT["UI Component Library<br/>Material UI · Design Tokens"]
        SDK["API Client / SDK"]
    end

    GATEWAY["API Gateway<br/>REST / GraphQL · Auth · Rate limiting"]

    subgraph BACKEND["Backend Services"]
        direction LR
        AUTHS["Auth Service"]
        FINS["Finance Service"]
        INTELS["Intelligence Service<br/>Insights · AI Assistant"]
        BROKERS["Broker Service<br/>Multi-broker connect"]
        SYNC["Optional Encrypted Sync"]
        NOTIFS["Notification Service"]
    end

    subgraph DATA2["Data"]
        direction LR
        DB[("Database")]
        CACHE[("Cache")]
        FILES[("File Storage")]
    end

    subgraph OUT["Third-party APIs"]
        direction LR
        MARKET["Market and NAV Data"]
        BROKERAPI["Broker APIs"]
    end

    CLIENTS --> SHARED --> GATEWAY --> BACKEND
    BACKEND --> DATA2
    BACKEND --> OUT
    CLIENTS -. "local-first: on-device data stays available offline" .-> CLIENTS
```

**Planned direction**

- **Frontend:** React, Next.js, TypeScript and Material UI.
- **Backend and APIs:** secure services and APIs for sign-in, optional encrypted sync and broker connections.
- **Native apps:** Android, iOS and desktop apps for a faster, smoother experience, with biometric lock, notifications and widgets.
- **Privacy stays first:** local-first design remains. Cloud sync will be optional and encrypted.

---

## Privacy

- Financial records are saved on your device, separately for each user.
- No financial data is uploaded to a BlackRoad server.
- The broker connection is read-only, and its login is cleared when you log out.
- Rover answers offline from your own data.
- You can back up and restore everything at any time.

## Getting Started

The app uses ES modules, so serve it over HTTP instead of opening the file directly.

```bash
git clone https://github.com/microintel/blackroad-v2.git
cd blackroad-v2

python serve.py                  # http://localhost:8080
# or
python -m http.server 8080
# or
npx serve
```

Or just use the live app: **https://microintel.github.io/blackroad-v2/**

---

## Vision

> To make every person financially aware and in control, by giving them one simple, private and intelligent home for their entire financial life, on every device.

## Mission

- Bring all personal finance tracking into one place.
- Keep user data private and in the user's hands.
- Turn raw numbers into clear insights anyone can understand.
- Keep tools fast, offline-ready and free of clutter.
- Grow from a web app into a native experience on every platform.

---

<div align="center">

### Developed by Microintel

Building simple, private and intelligent software.

[Live App](https://microintel.github.io/blackroad-v2/)

</div>
