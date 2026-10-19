Offline PDF support - drop these files here:

  jspdf.umd.min.js   from https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
  (later) NotoSans-Regular.ttf  for the Stocks PDF report

The app uses these local copies first and falls back to the CDN if they are missing.
The service worker caches them automatically after the first successful load.

Angel One Profit & Loss reader (Brokerage Report Readers) also uses these, optional, for offline use:

  xlsx.full.min.js               from https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
  jspdf.plugin.autotable.min.js  from https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js
  (jspdf.umd.min.js is shared with the other PDF exports)

Toast messages use SweetAlert2 (optional local copy for offline use):

  sweetalert2.all.min.js         from https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js

The .all.min.js build already contains its own CSS. Without it (and without internet) the app falls back to its built-in toast.
