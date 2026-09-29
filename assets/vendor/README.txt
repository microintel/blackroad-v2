Offline PDF support - drop these files here:

  jspdf.umd.min.js   from https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
  (later) NotoSans-Regular.ttf  for the Stocks PDF report

The app uses these local copies first and falls back to the CDN if they are missing.
The service worker caches them automatically after the first successful load.
