"""Local dev server for BlackRoad V2 with single-page fallback.

    python serve.py          -> http://localhost:8080

Unknown paths (/dashboard, /income ...) are answered with index.html, so
refreshing or typing a route directly works instead of giving a 404.
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if path != "/" and not os.path.isfile(os.path.join(ROOT, path.lstrip("/"))):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


print(f"BlackRoad V2 on http://localhost:{PORT}  (Ctrl+C to stop)")
http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
