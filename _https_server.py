#!/usr/bin/env python3
# Minimal HTTPS static server for asset-lab.
# Why: Tencent Cloud DPI drops plain HTTP to non-ICP hosts. TLS bypasses it.
# Self-signed cert -> mobile browser will warn "not private", click through.
#
# Also exposes /api/control for the PC remote console (console.html) to
# drive the mobile preview runtime. Single-tenant in-memory relay; see
# console.html / preview/main.js for the protocol. Threaded so 50ms polls
# from the phone don't queue behind static-file requests.
import http.server
import json
import ssl
import os
from threading import Lock

PORT = 443  # security group only opens 443 / 22940 / 18789; 443 = clean URL (needs sudo)
CERT = os.path.join(os.path.dirname(__file__), 'cert.pem')
KEY = os.path.join(os.path.dirname(__file__), 'key.pem')
ROOT = os.path.dirname(os.path.abspath(__file__))

_state = {}
_state_lock = Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/control':
            with _state_lock:
                body = json.dumps(_state).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/control':
            length = int(self.headers.get('Content-Length', 0) or 0)
            try:
                update = json.loads(self.rfile.read(length))
                if not isinstance(update, dict):
                    raise ValueError('expected JSON object')
            except Exception:
                self.send_response(400)
                self.end_headers()
                return
            with _state_lock:
                _state.update(update)
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()


os.chdir(ROOT)
httpd = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=CERT, keyfile=KEY)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f'serving https://0.0.0.0:{PORT}/ from {ROOT}', flush=True)
httpd.serve_forever()
