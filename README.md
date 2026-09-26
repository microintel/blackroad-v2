# BlackRoad

> 🚧 **Status: Currently Under Development**

## About

BlackRoad is a personal finance management web application being developed by **Microintel**. It is designed with a modular frontend architecture and local data storage, with a planned migration toward a modern React-based stack.

## Architecture & Development Flow

### Overall Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         BLACKROAD                           │
│                    Web Application                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         index.html                          │
│                       Application Entry                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                            src/                             │
├──────────────┬──────────────┬──────────────┬────────────────┤
│              │              │              │                │
▼              ▼              ▼              ▼                ▼
┌────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────┐
│  app/  │  │  views/  │  │ components/│  │ storage/ │  │ utils/ │
│        │  │          │  │            │  │          │  │        │
│ Logic  │  │ Screens  │  │ UI         │  │ IndexedDB│  │Helpers │
└───┬────┘  └────┬─────┘  └─────┬──────┘  └────┬─────┘  └───┬────┘
    │             │              │              │             │
    └─────────────┴──────────────┴──────────────┴─────────────┘
                                  │
                                  ▼
                       ┌────────────────────┐
                       │   Application      │
                       │   State & Logic    │
                       └─────────┬──────────┘
                                 │
                                 ▼
                       ┌────────────────────┐
                       │     IndexedDB      │
                       │    Local Storage   │
                       └────────────────────┘
```

### User → Data → UI Flow

```text
┌──────────┐
│   USER   │
└────┬─────┘
     │
     ▼
┌──────────────┐
│ UI / Views   │
│              │
│ Dashboard    │
│ Transactions │
│ Analytics    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Components   │
│ & Actions    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Application  │
│ Logic / State│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Storage Layer│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  IndexedDB   │
│ Local Data   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Data Process │
│ & Calculation│
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ Updated Application State│
└──────────────┬───────────┘
               │
               ▼
        ┌──────────────┐
        │ Updated View │
        └──────┬───────┘
               │
               ▼
          ┌──────────┐
          │   USER   │
          └──────────┘
```

### Application Startup

```text
┌──────────────┐
│ Open Website │
└──────┬───────┘
       ▼
┌──────────────┐
│ index.html   │
└──────┬───────┘
       ▼
┌──────────────┐
│ Load Assets  │
│ CSS + JS     │
└──────┬───────┘
       ▼
┌──────────────┐
│ Initialize   │
│ Application  │
└──────┬───────┘
       ▼
┌──────────────┐
│ Initialize   │
│ IndexedDB    │
└──────┬───────┘
       ▼
┌──────────────┐
│ Load Local   │
│ Data         │
└──────┬───────┘
       ▼
┌──────────────┐
│ Initialize   │
│ State        │
└──────┬───────┘
       ▼
┌──────────────┐
│ Load View    │
└──────┬───────┘
       ▼
┌──────────────┐
│  Dashboard   │
└──────────────┘
```

### Feature Flow

```text
                         ┌─────────────┐
                         │ BLACKROAD   │
                         └──────┬──────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │  Dashboard  │       │ Transactions│       │  Analytics  │
   └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
          │                     │                     │
          └─────────────────────┼─────────────────────┘
                                ▼
                       ┌─────────────────┐
                       │ Application     │
                       │ Logic & State   │
                       └────────┬────────┘
                                ▼
                       ┌─────────────────┐
                       │ Storage Layer   │
                       └────────┬────────┘
                                ▼
                       ┌─────────────────┐
                       │    IndexedDB    │
                       └─────────────────┘
```

### Transaction Data Flow

```text
┌───────────────┐
│ Add / Edit    │
│ Transaction   │
└───────┬───────┘
        ▼
┌───────────────┐
│ Form Input    │
└───────┬───────┘
        ▼
┌───────────────┐
│ Validation    │
└───────┬───────┘
        ▼
┌───────────────┐
│ Business      │
│ Logic         │
└───────┬───────┘
        ▼
┌───────────────┐
│ Storage Layer │
└───────┬───────┘
        ▼
┌───────────────┐
│   IndexedDB   │
└───────┬───────┘
        ▼
┌───────────────┐
│ Update State  │
└───────┬───────┘
        ▼
┌──────────────────────────┐
│ Dashboard + Analytics + │
│ Transactions Updated     │
└──────────────────────────┘
```

### Development Roadmap

```text
┌───────────────────────────┐
│       CURRENT STAGE       │
│                           │
│ HTML + CSS + JavaScript   │
│ Modular Architecture      │
│ IndexedDB                 │
│ PWA                       │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│     DEVELOPMENT & TESTING │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│       STABLE VERSION      │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│       FUTURE STACK        │
│                           │
│ React.js                  │
│ Next.js                   │
│ TypeScript                │
│ Material UI               │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│    NATIVE MOBILE APP      │
└───────────────────────────┘
```

### Project Structure

```text
blackroad-v2/
│
├── assets/
│   ├── icons/
│   └── images/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── storage/
│   ├── views/
│   └── utils/
│
├── index.html
└── README.md
```

## Technology

```text
HTML
  │
  ▼
CSS
  │
  ▼
JavaScript
  │
  ▼
IndexedDB
  │
  ▼
PWA
  │
  ▼
Future → React + Next.js + TypeScript + Material UI
```

## Developer

**Microintel**

