#!/usr/bin/env python3
# Minimal HTTPS static server for asset-lab.
# Why: Tencent Cloud DPI drops plain HTTP to non-ICP hosts. TLS bypasses it.
# Self-signed cert -> mobile browser will warn "not private", click through.
import http.server
import ssl
import os

PORT = 443  # security group only opens 443 / 22940 / 18789; 443 = clean URL (needs sudo)
CERT = os.path.join(os.path.dirname(__file__), 'cert.pem')
KEY = os.path.join(os.path.dirname(__file__), 'key.pem')
ROOT = os.path.dirname(os.path.abspath(__file__))

os.chdir(ROOT)
httpd = http.server.HTTPServer(('0.0.0.0', PORT), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=CERT, keyfile=KEY)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f'serving https://0.0.0.0:{PORT}/ from {ROOT}', flush=True)
httpd.serve_forever()
