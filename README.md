<div align="center">

<img src="blackroad.png" alt="BlackRoad logo" width="140" />

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

**Today, BlackRoad is a tracker.** You add your records (or bring in your reports), and the app reads them from your device and shows the full picture. **Next, it will connect to your real accounts**: your banks through an Account Aggregator like **Finvu**, your **brokers** and the **exchanges**, so your data can flow in on its own, with your consent.

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
%%{init: {"theme":"base","themeVariables":{"fontSize":"16px","primaryColor":"#EEF2FF","primaryTextColor":"#1E293B","primaryBorderColor":"#6366F1","lineColor":"#64748B","secondaryColor":"#F1F5F9","tertiaryColor":"#F8FAFC","clusterBkg":"#F8FAFC","clusterBorder":"#94A3B8","edgeLabelBackground":"#FFFFFF","noteBkgColor":"#FEF3C7","noteTextColor":"#1E293B","actorBkg":"#EEF2FF","actorBorder":"#6366F1","actorTextColor":"#1E293B","signalColor":"#64748B","signalTextColor":"#E2E8F0"},"flowchart":{"padding":18,"nodeSpacing":35,"rankSpacing":45,"curve":"basis"}}}%%
flowchart TB
    U(["👤 User"])

    L1["<b>Layer 1 · User Interface</b><br/>Screens · Forms · Charts<br/>Light and Dark themes<br/>Rover chat"]
    L2["<b>Layer 2 · App Core</b><br/>Navigation<br/>Sign in · Register · Guest<br/>Preferences"]
    L3["<b>Layer 3 · Finance Modules</b><br/>Income · Stocks · Mutual Funds<br/>Fixed Deposits · Lending<br/>Accounting · Calculators<br/>Net Worth"]
    L4["<b>Layer 4 · Intelligence</b><br/>Financial health · Risk<br/>Goals · What-if<br/>Rover assistant"]
    L5["<b>Layer 5 · Data Services</b><br/>Calculations · Business rules<br/>Backup and Restore<br/>Import and Export"]
    L6["<b>Layer 6 · On-Device Storage</b><br/>IndexedDB · localStorage<br/>Service Worker (offline use)"]
    EXT["<b>Optional outside services</b><br/>(read-only)<br/>Mutual fund NAV<br/>Live stock prices<br/>Broker connection"]

    U --> L1 --> L2 --> L3 --> L4 --> L5 --> L6
    L3 -. fetches .-> EXT

    class U person
    class L1 ui
    class L2 core
    class L3 fin
    class L4 intel
    class L5 data
    class L6 store
    class EXT ext
    classDef ui fill:#E0E7FF,stroke:#6366F1,stroke-width:1.5px,color:#1E293B
    classDef core fill:#DBEAFE,stroke:#3B82F6,stroke-width:1.5px,color:#1E293B
    classDef fin fill:#D1FAE5,stroke:#10B981,stroke-width:1.5px,color:#1E293B
    classDef intel fill:#FEF3C7,stroke:#F59E0B,stroke-width:1.5px,color:#1E293B
    classDef data fill:#FCE7F3,stroke:#EC4899,stroke-width:1.5px,color:#1E293B
    classDef store fill:#E2E8F0,stroke:#64748B,stroke-width:1.5px,color:#1E293B
    classDef ext fill:#FFFFFF,stroke:#94A3B8,stroke-dasharray:5 4,stroke-width:1.5px,color:#1E293B
    classDef person fill:#1E293B,stroke:#1E293B,color:#F8FAFC
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
%%{init: {"theme":"base","themeVariables":{"fontSize":"16px","primaryColor":"#EEF2FF","primaryTextColor":"#1E293B","primaryBorderColor":"#6366F1","lineColor":"#64748B","secondaryColor":"#F1F5F9","tertiaryColor":"#F8FAFC","clusterBkg":"#F8FAFC","clusterBorder":"#94A3B8","edgeLabelBackground":"#FFFFFF","noteBkgColor":"#FEF3C7","noteTextColor":"#1E293B","actorBkg":"#EEF2FF","actorBorder":"#6366F1","actorTextColor":"#1E293B","signalColor":"#64748B","signalTextColor":"#E2E8F0"},"flowchart":{"padding":18,"nodeSpacing":35,"rankSpacing":45,"curve":"basis"}}}%%
flowchart TB
    USER(["👤 User<br/>Mobile · Tablet · Desktop"])

    subgraph CLIENT["BlackRoad Client (runs fully in the browser / PWA)"]
        direction TB

        subgraph PRESENT["Presentation"]
            direction LR
            SITE["Public Site<br/>Landing · Download"]
            SHELL["App Shell<br/>Sidebar · Topbar<br/>Mobile Nav"]
            ROVERUI["Rover<br/>Chat UI"]
            DESIGN["Design System<br/>Themes · Icons<br/>Charts"]
        end

        subgraph APP["Application Core"]
            direction LR
            ROUTER["Router"]
            AUTH["Auth and<br/>Session"]
            PREF["Preferences"]
        end

        subgraph FEATURES["Finance Modules"]
            direction TB
            subgraph FROW1[" "]
                direction LR
                DASH["Dashboard<br/>Net Worth"]
                INC["Income"]
                STK["Stocks"]
                MF["Mutual<br/>Fund"]
            end
            subgraph FROW2[" "]
                direction LR
                FD["Deposits"]
                LEND["Lending"]
                ACC["Accounting"]
                CALC["Calculators"]
            end
        end

        subgraph INTEL["Intelligence"]
            direction LR
            FI["Financial<br/>Intelligence"]
            ENGINE["Rules<br/>Engine"]
            ROVERENG["Rover<br/>Engine"]
        end

        subgraph BROKER["Broker Integration"]
            direction LR
            CONNECT["Connect<br/>Broker"]
            PNL["Report<br/>Readers"]
        end

        subgraph DATA["Data Layer"]
            direction LR
            SERVICES["Module<br/>Services"]
            STORES["Stores"]
            BACKUP["Backup and<br/>Restore"]
        end

        subgraph STORAGE["On-Device Storage"]
            direction LR
            IDB[("IndexedDB")]
            LS[("local<br/>Storage")]
            SS[("session<br/>Storage")]
        end

        SW["Service Worker<br/>Offline and Install"]
    end

    subgraph EXTERNAL["Outside Services (optional)"]
        direction LR
        MFAPI["Mutual Fund<br/>NAV API"]
        LTP["Live Price<br/>API"]
        ANGEL["Broker<br/>API"]
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

    class USER person
    class SITE,SHELL,ROVERUI,DESIGN ui
    class ROUTER,AUTH,PREF core
    class DASH,INC,STK,MF,FD,LEND,ACC,CALC fin
    class FI,ENGINE,ROVERENG intel
    class CONNECT,PNL core
    class SERVICES,STORES,BACKUP data
    class IDB,LS,SS,SW store
    class MFAPI,LTP,ANGEL ext
    style FROW1 fill:none,stroke:none
    style FROW2 fill:none,stroke:none
    classDef ui fill:#E0E7FF,stroke:#6366F1,stroke-width:1.5px,color:#1E293B
    classDef core fill:#DBEAFE,stroke:#3B82F6,stroke-width:1.5px,color:#1E293B
    classDef fin fill:#D1FAE5,stroke:#10B981,stroke-width:1.5px,color:#1E293B
    classDef intel fill:#FEF3C7,stroke:#F59E0B,stroke-width:1.5px,color:#1E293B
    classDef data fill:#FCE7F3,stroke:#EC4899,stroke-width:1.5px,color:#1E293B
    classDef store fill:#E2E8F0,stroke:#64748B,stroke-width:1.5px,color:#1E293B
    classDef ext fill:#FFFFFF,stroke:#94A3B8,stroke-dasharray:5 4,stroke-width:1.5px,color:#1E293B
    classDef person fill:#1E293B,stroke:#1E293B,color:#F8FAFC
```

### How data moves

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontSize":"16px","primaryColor":"#EEF2FF","primaryTextColor":"#1E293B","primaryBorderColor":"#6366F1","lineColor":"#64748B","secondaryColor":"#F1F5F9","tertiaryColor":"#F8FAFC","clusterBkg":"#F8FAFC","clusterBorder":"#94A3B8","edgeLabelBackground":"#FFFFFF","noteBkgColor":"#FEF3C7","noteTextColor":"#1E293B","actorBkg":"#EEF2FF","actorBorder":"#6366F1","actorTextColor":"#1E293B","signalColor":"#64748B","signalTextColor":"#E2E8F0"},"flowchart":{"padding":18,"nodeSpacing":35,"rankSpacing":45,"curve":"basis"}}}%%
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
%%{init: {"theme":"base","themeVariables":{"fontSize":"16px","primaryColor":"#EEF2FF","primaryTextColor":"#1E293B","primaryBorderColor":"#6366F1","lineColor":"#64748B","secondaryColor":"#F1F5F9","tertiaryColor":"#F8FAFC","clusterBkg":"#F8FAFC","clusterBorder":"#94A3B8","edgeLabelBackground":"#FFFFFF","noteBkgColor":"#FEF3C7","noteTextColor":"#1E293B","actorBkg":"#EEF2FF","actorBorder":"#6366F1","actorTextColor":"#1E293B","signalColor":"#64748B","signalTextColor":"#E2E8F0"},"flowchart":{"padding":18,"nodeSpacing":35,"rankSpacing":45,"curve":"basis"}}}%%
flowchart LR
    INC["Income and<br/>Expenses"] --> NW
    STK["Stocks"] --> NW
    MF["Mutual<br/>Funds"] --> NW
    FD["Fixed<br/>Deposits"] --> NW
    LEND["Lending"] --> NW

    NW{"Net Worth<br/>and Dashboard"}

    NW --> FI["Financial<br/>Intelligence"]
    NW --> ROVER["Rover<br/>Assistant"]
    NW --> NOTIF["Notifications<br/>and Dues"]

    class INC,STK,MF,FD,LEND fin
    class NW ui
    class FI,ROVER intel
    class NOTIF core
    classDef ui fill:#E0E7FF,stroke:#6366F1,stroke-width:1.5px,color:#1E293B
    classDef core fill:#DBEAFE,stroke:#3B82F6,stroke-width:1.5px,color:#1E293B
    classDef fin fill:#D1FAE5,stroke:#10B981,stroke-width:1.5px,color:#1E293B
    classDef intel fill:#FEF3C7,stroke:#F59E0B,stroke-width:1.5px,color:#1E293B
    classDef data fill:#FCE7F3,stroke:#EC4899,stroke-width:1.5px,color:#1E293B
    classDef store fill:#E2E8F0,stroke:#64748B,stroke-width:1.5px,color:#1E293B
    classDef ext fill:#FFFFFF,stroke:#94A3B8,stroke-dasharray:5 4,stroke-width:1.5px,color:#1E293B
    classDef person fill:#1E293B,stroke:#1E293B,color:#F8FAFC
```

---

## Future Architecture

Today BlackRoad is a fast, private, local-first **tracker**. You add your data, and the app reads, calculates and shows it. As it grows, it will move from *tracking what you type* to *connecting to where your money already lives*.

| | **Today** | **Planned next** |
|---|---|---|
| **Bank and account data** | Added by you | Fetched through an Account Aggregator (**Finvu**), only with your consent |
| **Stocks and holdings** | Added by you, or read from broker reports | Linked directly to your **brokers** |
| **Prices and market data** | Optional live price and NAV lookups | Direct feeds from the **exchanges** |
| **Where data lives** | On your device | On your device first, with optional encrypted sync |

Microintel also plans to build it with a modern stack: **React** for the interface, a **backend** with **APIs**, and **native apps**.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontSize":"16px","primaryColor":"#EEF2FF","primaryTextColor":"#1E293B","primaryBorderColor":"#6366F1","lineColor":"#64748B","secondaryColor":"#F1F5F9","tertiaryColor":"#F8FAFC","clusterBkg":"#F8FAFC","clusterBorder":"#94A3B8","edgeLabelBackground":"#FFFFFF","noteBkgColor":"#FEF3C7","noteTextColor":"#1E293B","actorBkg":"#EEF2FF","actorBorder":"#6366F1","actorTextColor":"#1E293B","signalColor":"#64748B","signalTextColor":"#E2E8F0"},"flowchart":{"padding":18,"nodeSpacing":35,"rankSpacing":45,"curve":"basis"}}}%%
flowchart TB
    subgraph CLIENTS["Clients"]
        direction LR
        WEB["Web App<br/>React · Next.js<br/>TypeScript"]
        MOBILE["Native Mobile<br/>Android · iOS"]
        DESKTOP["Desktop<br/>Windows · macOS<br/>Linux"]
    end

    subgraph SHARED["Shared Layer"]
        direction LR
        UIKIT["UI Component Library<br/>Material UI<br/>Design Tokens"]
        SDK["API Client<br/>/ SDK"]
    end

    GATEWAY["API Gateway<br/>REST / GraphQL<br/>Auth · Rate limiting"]

    subgraph BACKEND["Backend Services"]
        direction TB
        subgraph BROW1[" "]
            direction LR
            AUTHS["Auth<br/>Service"]
            FINS["Finance<br/>Service"]
            INTELS["Intelligence Service<br/>Insights · AI Assistant"]
        end
        subgraph BROW2[" "]
            direction LR
            AGGS["Aggregator Service<br/>Consent-based<br/>account data"]
            BROKERS["Broker Service<br/>Multi-broker connect"]
            EXCHS["Market Data<br/>Service"]
        end
        subgraph BROW3[" "]
            direction LR
            SYNC["Optional<br/>Encrypted Sync"]
            NOTIFS["Notification<br/>Service"]
        end
    end

    subgraph DATA2["Data"]
        direction LR
        DB[("Database")]
        CACHE[("Cache")]
        FILES[("File<br/>Storage")]
    end

    subgraph OUT["Connections (planned)"]
        direction LR
        FINVU["Finvu<br/>Account Aggregator"]
        BROKERAPI["Brokers"]
        EXCH["Exchanges"]
    end

    CLIENTS --> SHARED --> GATEWAY --> BACKEND
    BACKEND --> DATA2
    BACKEND --> OUT
    CLIENTS -. "local-first: on-device data<br/>stays available offline" .-> CLIENTS

    class WEB,MOBILE,DESKTOP ui
    class UIKIT,SDK core
    class GATEWAY intel
    class AUTHS,FINS,INTELS,AGGS,BROKERS,EXCHS,SYNC,NOTIFS fin
    class DB,CACHE,FILES store
    class FINVU,BROKERAPI,EXCH ext
    style BROW1 fill:none,stroke:none
    style BROW2 fill:none,stroke:none
    style BROW3 fill:none,stroke:none
    classDef ui fill:#E0E7FF,stroke:#6366F1,stroke-width:1.5px,color:#1E293B
    classDef core fill:#DBEAFE,stroke:#3B82F6,stroke-width:1.5px,color:#1E293B
    classDef fin fill:#D1FAE5,stroke:#10B981,stroke-width:1.5px,color:#1E293B
    classDef intel fill:#FEF3C7,stroke:#F59E0B,stroke-width:1.5px,color:#1E293B
    classDef data fill:#FCE7F3,stroke:#EC4899,stroke-width:1.5px,color:#1E293B
    classDef store fill:#E2E8F0,stroke:#64748B,stroke-width:1.5px,color:#1E293B
    classDef ext fill:#FFFFFF,stroke:#94A3B8,stroke-dasharray:5 4,stroke-width:1.5px,color:#1E293B
    classDef person fill:#1E293B,stroke:#1E293B,color:#F8FAFC
```

**Planned direction**

- **Frontend:** React, Next.js, TypeScript and Material UI.
- **Account Aggregator (Finvu):** pull your bank, deposit and investment data automatically, only after you give consent.
- **Brokers and exchanges:** connect your broker accounts and exchange data, so holdings and prices update without typing.
- **Backend and APIs:** secure services and APIs for sign-in, optional encrypted sync and all of the connections above.
- **Native apps:** Android, iOS and desktop apps for a faster, smoother experience, with biometric lock, notifications and widgets.
- **Privacy stays first:** local-first design remains. Every connection is read-only and consent-based, and cloud sync will be optional and encrypted.

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
