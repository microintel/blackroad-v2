# BlackRoad

> A modular, local-first personal dashboard built for simplicity, privacy, and future scalability.

BlackRoad is a personal dashboard application designed to keep useful information, tools, and personal data in one place.

The project currently uses **HTML, CSS, and Vanilla JavaScript**, with a modular architecture designed so that it can later migrate to **React, Next.js, TypeScript, and Material UI** without completely rebuilding the application's core concepts.

---

# 🏗️ Architecture

BlackRoad follows a **layered and modular architecture**.

```text
                         BLACKROAD
                             │
                             ▼
                    ┌─────────────────┐
                    │   User / UI     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   View Layer    │
                    │    view.js      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Application     │
                    │     Layer       │
                    │     app.js      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  Storage   │ │   Data     │ │   Utility  │
       │   Layer    │ │   Layer    │ │   Layer    │
       └─────┬──────┘ └─────┬──────┘ └────────────┘
             │              │
             ▼              ▼
       ┌────────────┐ ┌────────────┐
       │ IndexedDB  │ │    JSON    │
       │ Local Data │ │ Static Data│
       └────────────┘ └────────────┘
```

The architecture separates **UI, application logic, data, storage, and static assets** instead of putting everything inside one JavaScript file.

---

# 📂 Project Structure

```text
BlackRoad/
│
├── assets/
│   │
│   ├── icons/
│   │   ├── logo/
│   │   └── ui/
│   │
│   ├── images/
│   │
│   └── other/
│
├── src/
│   │
│   ├── app.js
│   ├── view.js
│   │
│   ├── components/
│   │   └── ...
│   │
│   ├── modules/
│   │   └── ...
│   │
│   └── utils/
│       └── ...
│
├── storage/
│   │
│   ├── storage.js
│   ├── database.js
│   └── ...
│
├── data/
│   │
│   └── *.json
│
├── pages/
│   └── ...
│
├── index.html
│
├── manifest.json
├── service-worker.js
│
├── .gitignore
└── README.md
```

> Some folders may be introduced gradually as the project grows. The architecture is designed around these responsibilities rather than requiring every folder to exist immediately.

---

# 🧱 Architecture Layers

## 1. Presentation Layer

The presentation layer is responsible for what the user sees and interacts with.

```text
User
 │
 ▼
index.html
 │
 ▼
UI
 │
 ├── Navigation
 ├── Sidebar
 ├── Dashboard
 ├── Cards
 ├── Forms
 └── Content Views
```

### Responsibilities

* Display application interfaces
* Handle user interaction
* Display application state
* Provide responsive layouts
* Update the interface when application data changes

The presentation layer should **not directly manage database operations**.

---

# 2. View Layer

Main file:

```text
src/view.js
```

The View Layer controls how application content is rendered.

Example responsibility:

```text
Application State
       │
       ▼
    view.js
       │
       ▼
     DOM
```

It handles things such as:

* Rendering dashboard content
* Switching views
* Updating sections
* Creating UI elements
* Showing empty states
* Updating displayed data

The goal is to keep UI rendering separate from application logic.

---

# 3. Application Layer

Main file:

```text
src/app.js
```

The Application Layer acts as the coordinator of BlackRoad.

```text
User Action
     │
     ▼
   app.js
     │
 ┌───┼────────┐
 ▼   ▼        ▼
View Storage Data
```

### Responsibilities

* Initialize the application
* Connect modules together
* Handle application events
* Manage navigation
* Coordinate data operations
* Request storage operations
* Update views

`app.js` should act as the **orchestrator**, rather than becoming a large file containing every feature.

---

# 4. Storage Layer

Directory:

```text
storage/
```

The storage layer abstracts browser storage from the rest of the application.

```text
Application
     │
     ▼
Storage API
     │
     ▼
IndexedDB
```

Instead of doing this throughout the application:

```javascript
indexedDB.open(...)
```

the application should communicate with a storage module:

```javascript
storage.save(...)
storage.get(...)
storage.update(...)
storage.delete(...)
```

This makes the storage implementation replaceable.

### Current Direction

```text
BlackRoad
    │
    ▼
Storage Layer
    │
    ▼
IndexedDB
```

### Future Possibility

```text
BlackRoad
    │
    ▼
Storage Interface
    │
    ├── IndexedDB
    ├── SQLite
    ├── Cloud Storage
    └── Backup Service
```

This means the application does not need to depend directly on one database technology.

---

# 5. Data Layer

Directory:

```text
data/
```

Static application data can be stored in JSON files.

Example:

```text
data/
├── settings.json
├── categories.json
├── default-data.json
└── ...
```

The data flow can be:

```text
JSON
 │
 ▼
Data Module
 │
 ▼
Application
 │
 ▼
View
```

JSON is useful for static/default information that does not require a database.

---

# 6. Assets Layer

Directory:

```text
assets/
```

The assets directory contains static resources.

```text
assets/
│
├── icons/
├── images/
├── logos/
└── other/
```

Assets should remain separate from application logic.

For example:

```text
HTML
 └── references → assets/

JavaScript
 └── references → assets/

CSS
 └── references → assets/
```

This makes it easier to replace icons, images, and other visual resources later.

---

# 7. Utility Layer

Directory:

```text
src/utils/
```

Utilities contain reusable functions that do not belong to a particular screen.

Examples:

```text
utils/
├── date.js
├── format.js
├── validation.js
├── helpers.js
└── ...
```

Example:

```text
Application
     │
     ├── formatDate()
     ├── validateInput()
     ├── generateId()
     └── formatCurrency()
```

This prevents the same logic from being duplicated throughout the project.

---

# 🔄 Application Data Flow

The basic application flow is:

```text
             USER
               │
               ▼
          UI / DOM
               │
               ▼
           view.js
               │
               ▼
            app.js
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
    Storage   Data    Utils
       │       │
       ▼       ▼
  IndexedDB   JSON
       │       │
       └───────┴───────┐
                       ▼
                  Application
                       │
                       ▼
                    view.js
                       │
                       ▼
                       UI
```

---

# 🧭 Navigation Architecture

BlackRoad uses a central application navigation system.

```text
Sidebar / Navigation
          │
          ▼
     Navigation Event
          │
          ▼
        app.js
          │
          ▼
      Route / View
          │
          ▼
       view.js
          │
          ▼
     Render Content
```

This means navigation should not require completely reloading the website for every section.

---

# 💾 Local-First Architecture

BlackRoad follows a **local-first approach**.

The basic principle is:

```text
User
 │
 ▼
BlackRoad
 │
 ▼
Local Storage
 │
 ▼
User's Device
```

The application can continue functioning without requiring a permanent backend connection for core local functionality.

### Advantages

* Fast access
* Reduced server dependency
* Offline capability
* Better privacy
* Simple deployment
* No mandatory account
* No mandatory database server

---

# 🔐 Privacy Architecture

The current architecture does not require authentication for basic usage.

```text
User
 │
 ▼
BlackRoad
 │
 ▼
Browser
 │
 ▼
Local Data
```

There is no requirement for:

```text
User
 │
 ▼
Authentication Server
 │
 ▼
Backend
 │
 ▼
Database
```

for the basic local application.

---

# 📱 PWA Architecture

BlackRoad is designed to support Progressive Web App functionality.

```text
                 BLACKROAD PWA
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     Browser       Manifest      Service Worker
        │             │             │
        │             │             ▼
        │             │        Cache / Offline
        │             │
        ▼             ▼
       Application Installation
```

Important files:

```text
manifest.json
service-worker.js
```

The PWA layer can provide:

* Installability
* Offline caching
* Application-like experience
* Cached static resources

---

# 🧩 Module Dependency Direction

The architecture follows a controlled dependency direction.

```text
             UI
              │
              ▼
            View
              │
              ▼
        Application
        /    |     \
       ▼     ▼      ▼
   Storage  Data   Utils
```

The storage layer should not depend on the UI.

For example:

```text
❌ storage.js → view.js
```

should generally be avoided.

Instead:

```text
✅ app.js → storage.js
✅ app.js → view.js
```

This keeps the system modular.

---

# 🏗️ Future React Architecture

The current architecture is intentionally designed to make migration easier.

The future React structure can become:

```text
BlackRoad
│
├── public/
│   ├── assets/
│   ├── icons/
│   └── manifest.json
│
├── src/
│   │
│   ├── app/
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── dashboard/
│   │   └── common/
│   │
│   ├── pages/
│   │
│   ├── features/
│   │
│   ├── services/
│   │
│   ├── storage/
│   │
│   ├── hooks/
│   │
│   ├── types/
│   │
│   ├── utils/
│   │
│   └── data/
│
├── package.json
└── ...
```

The current concepts map naturally:

```text
Current                  Future

view.js           →      React Components
app.js            →      Application / Feature Logic
storage.js        →      Storage Services
utils/            →      Utility Functions
JSON              →      Data / API Layer
assets/           →      public/assets
```

---

# ⚛️ React Architecture

The future React architecture can follow:

```text
                  App
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
     Layout     Routing    Providers
        │
        ▼
   Application
    Features
        │
 ┌──────┼─────────┐
 ▼      ▼         ▼
UI    Services   Hooks
        │
        ▼
     Storage
```

Components should remain reusable and independent where possible.

---

# ▲ Next.js Architecture

The long-term web architecture can move toward Next.js.

```text
                    Next.js
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      Pages         Components      API Layer
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                  Application
                       │
              ┌────────┴────────┐
              ▼                 ▼
          Local Data         Cloud Data
```

Next.js can eventually provide:

* Routing
* Application structure
* Server-side capabilities where needed
* API routes / server functions
* Better production architecture
* Optimized deployment

However, the application should remain modular rather than tightly coupling every feature to Next.js.

---

# 🔷 TypeScript Architecture

TypeScript will eventually replace JavaScript for application logic.

Current:

```text
app.js
view.js
storage.js
```

Future:

```text
app.ts
view.ts
storage.ts
```

And application models can become strongly typed:

```text
types/
├── user.ts
├── settings.ts
├── transaction.ts
├── dashboard.ts
└── storage.ts
```

This provides better:

* Type safety
* IDE support
* Refactoring
* Maintainability
* Large-project scalability

---

# 🎨 Material UI

The future interface can use Material UI.

```text
Next.js
   │
   ▼
React
   │
   ▼
Material UI
   │
   ├── Navigation
   ├── Cards
   ├── Dialogs
   ├── Forms
   ├── Tables
   └── Layout
```

The current UI architecture should therefore focus on **separation of structure and behavior**, making future component migration easier.

---

# ☁️ Future Backup Architecture

The local-first system can later support optional backups.

```text
                    BlackRoad
                        │
                        ▼
                 Storage Layer
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
        Local Storage         Backup Layer
             │                     │
             ▼              ┌──────┼──────┐
          IndexedDB         ▼      ▼      ▼
                         Drive  Firestore Supabase
```

The backup system should be treated as a separate layer rather than making cloud storage mandatory.

---

# 🗄️ Future Database Architecture

If BlackRoad grows beyond browser storage, the storage layer can be extended.

```text
Application
     │
     ▼
Storage Interface
     │
 ┌───┼───────────────┐
 ▼   ▼               ▼
IDB SQLite       Cloud DB
```

Possible future technologies include:

* IndexedDB
* SQLite
* Firebase Firestore
* Supabase
* Other compatible storage systems

The exact database can be selected based on future application requirements.

---

# 📱 Future Native Application

The architecture can eventually support a native mobile application.

```text
                 BlackRoad
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Web          PWA         Native App
        │            │            │
        └────────────┼────────────┘
                     ▼
              Shared Concepts
                     │
             ┌───────┴───────┐
             ▼               ▼
          Storage           Data
```

The goal is to keep application concepts independent enough that they can be reused across platforms.

---

# 🚀 Development Roadmap

## Phase 1 — Current Foundation

```text
HTML
CSS
JavaScript
Local Storage
IndexedDB
JSON
PWA
```

## Phase 2 — Architecture Improvement

```text
Modular JavaScript
        ↓
Separate Views
        ↓
Separate Services
        ↓
Storage Abstraction
        ↓
Reusable Components
```

## Phase 3 — React

```text
Vanilla JavaScript
        ↓
React
        ↓
Reusable Components
```

## Phase 4 — TypeScript

```text
JavaScript
        ↓
TypeScript
        ↓
Typed Application
```

## Phase 5 — Next.js + Material UI

```text
React
  +
TypeScript
  +
Next.js
  +
Material UI
```

## Phase 6 — Advanced Storage

```text
IndexedDB
    ↓
Storage Abstraction
    ↓
SQLite / Cloud Backup
```

## Phase 7 — Native Application

```text
BlackRoad Web
      +
BlackRoad PWA
      +
BlackRoad Native App
```

---

# ⚙️ Running BlackRoad Locally

Clone the repository:

```bash
git clone <repository-url>
cd BlackRoad
```

Run a local server:

```bash
python3 -m http.server 5500
```

Open:

```text
http://127.0.0.1:5500
```

A local server is recommended because modules, service workers, and browser storage features can behave differently when opening `index.html` directly with `file://`.

---

# 📦 Deployment

The current architecture can be deployed using static hosting services.

Possible deployment platforms include:

* GitHub Pages
* Vercel
* Netlify
* Other static hosting providers

The current frontend does not require a dedicated backend server for its basic operation.

---

# 🔄 Git Workflow

The recommended development flow is:

```text
Local Development
       │
       ▼
Git
       │
       ▼
GitHub Repository
       │
       ▼
Deployment
       │
       ▼
BlackRoad
```

Before committing:

```bash
git status
```

Add changes:

```bash
git add .
```

Commit:

```bash
git commit -m "Update BlackRoad"
```

Push:

```bash
git push
```

---

# 🔒 Important Git Notes

Generated and dependency folders should not normally be committed.

For example:

```gitignore
node_modules/
.env
dist/
build/
.cache/
```

Application source code and required assets should remain tracked.

Empty directories are not tracked by Git. If an empty directory must exist in the repository, a `.gitkeep` file can be used.

---

# 📊 Architecture Principles

BlackRoad follows these principles:

### 1. Modular

Each part of the application should have a clear responsibility.

### 2. Local-first

Core functionality should not unnecessarily depend on a remote server.

### 3. Storage abstraction

Application logic should not be tightly coupled to IndexedDB or a particular database.

### 4. Separation of concerns

UI, application logic, storage, data, and utilities should remain separate.

### 5. Migration-friendly

The current architecture should make future migration to React, Next.js, TypeScript, and Material UI easier.

### 6. Privacy-focused

The application should minimize unnecessary external data dependencies.

### 7. Progressive development

New technologies should be introduced when they solve an actual architectural requirement rather than simply replacing working code.

---

# 🛠️ Current Technology Stack

| Layer           | Current Technology          |
| --------------- | --------------------------- |
| Structure       | HTML5                       |
| Styling         | CSS3                        |
| Application     | Vanilla JavaScript          |
| Data            | JSON                        |
| Local Storage   | IndexedDB / Browser Storage |
| PWA             | Manifest + Service Worker   |
| Version Control | Git                         |
| Repository      | GitHub                      |
| Hosting         | Static Hosting              |

---

# 🔮 Planned Technology Stack

| Layer           | Planned Technology        |
| --------------- | ------------------------- |
| UI              | React                     |
| Framework       | Next.js                   |
| Language        | TypeScript                |
| UI Library      | Material UI               |
| Local Database  | SQLite / IndexedDB        |
| Backup          | Cloud storage             |
| Mobile          | Native application        |
| Version Control | Git + GitHub              |
| Deployment      | Vercel / suitable hosting |

---

# 📌 Current Status

**Status: Active Development**

BlackRoad is currently being developed as a modular Vanilla JavaScript application.

The architecture is intentionally being prepared for future migration to:

```text
React
   ↓
TypeScript
   ↓
Next.js
   ↓
Material UI
   ↓
Advanced Storage
   ↓
Native Application
```

---

# 👨‍💻 Development

Developed by **Microintel**.

---

# 📄 License

No license has currently been specified for this project.

---

## BlackRoad

**A modular, local-first personal dashboard built for the present and designed for the future.**

