#!/usr/bin/env python3
"""Serve the bundled AquaTrace web build on this computer."""

from __future__ import annotations

import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "runtime"
HOST = "127.0.0.1"
SAFE_PATH = re.compile(r"^[A-Za-z0-9._/\-]+$")
DEM_PREFIXES = {
    "/dem/copernicus/": "https://copernicus-dem-30m.s3.amazonaws.com/",
    "/dem/srtm/": "https://s3.amazonaws.com/elevation-tiles-prod/",
}


class AquaTraceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RUNTIME), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[AquaTrace] {self.address_string()} - {fmt % args}")

    def do_HEAD(self) -> None:
        if self._proxy_dem("HEAD"):
            return
        super().do_HEAD()

    def do_GET(self) -> None:
        if self._proxy_dem("GET"):
            return
        super().do_GET()

    def _proxy_dem(self, method: str) -> bool:
        path = unquote(urlparse(self.path).path)
        for prefix, upstream in DEM_PREFIXES.items():
            if path.startswith(prefix):
                rel = path[len(prefix) :]
                if ".." in rel or not SAFE_PATH.fullmatch(rel):
                    self.send_error(400, "Invalid elevation path")
                    return True
                request = Request(upstream + rel, method=method)
                range_header = self.headers.get("Range")
                if range_header:
                    request.add_header("Range", range_header)
                request.add_header("User-Agent", "AquaTrace/1.0")
                try:
                    with urlopen(request, timeout=60) as response:
                        payload = b"" if method == "HEAD" else response.read()
                        self.send_response(response.status)
                        content_type = response.headers.get("Content-Type", "application/octet-stream")
                        self.send_header("Content-Type", content_type)
                        # Always forward Content-Length — for HEAD, use the upstream value
                        # so geotiff can learn the full file size without fetching the body.
                        if method == "HEAD":
                            cl = response.headers.get("Content-Length")
                            if cl:
                                self.send_header("Content-Length", cl)
                        else:
                            self.send_header("Content-Length", str(len(payload)))
                        content_range = response.headers.get("Content-Range")
                        if content_range:
                            self.send_header("Content-Range", content_range)
                        accept_ranges = response.headers.get("Accept-Ranges")
                        if accept_ranges:
                            self.send_header("Accept-Ranges", accept_ranges)
                        # Expose headers to the browser (CORS for fetch() from same origin
                        # is fine, but keep it explicit for the Range header round-trips).
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Access-Control-Expose-Headers",
                                         "Content-Range, Accept-Ranges, Content-Length")
                        self.end_headers()
                        if method != "HEAD":
                            self.wfile.write(payload)
                except HTTPError as error:
                    body = error.read() if method != "HEAD" else b""
                    self.send_response(error.code)
                    self.send_header("Content-Type", error.headers.get("Content-Type", "text/plain"))
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    if body:
                        self.wfile.write(body)
                except URLError:
                    self.send_error(502, "Elevation service unavailable")
                return True
        return False


def main() -> None:
    if not (RUNTIME / "index.html").is_file():
        raise SystemExit(
            "AquaTrace's bundled app files are missing. "
            "Extract the complete ZIP and keep the runtime/ folder beside this script."
        )

    try:
        port = int(os.environ.get("AQUATRACE_PORT", "8765"))
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit("AQUATRACE_PORT must be a port number from 1 to 65535.")

    server = ThreadingHTTPServer((HOST, port), AquaTraceHandler)
    print(f"AquaTrace is running at http://{HOST}:{port}")
    print("Press Ctrl+C to stop the local server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping AquaTrace.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
