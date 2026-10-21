"""Serves .maestro/fixtures to the simulator's Safari for the import E2E flow.

Usage: python3 scripts/e2e-fixture-server.py <port> <directory>

Every response carries Content-Disposition: attachment, so Safari offers
"Download" instead of rendering the JSON: only a real Safari download shows up
in the document picker's On My iPhone > Downloads (see .maestro/README.md).

Threaded and dual-stack on purpose. The single-threaded TCPServer it replaces
blocked on any connection that sent nothing (Safari opens spare ones), so the
real download queued behind it and sat at 0% (run 39645448024, mezzanine-import).
Safari also tries ::1 before 127.0.0.1, which an IPv4-only bind refuses.
tests/unit/e2e-fixture-server.test.mjs reproduces both.
"""
import functools
import http.server
import socket
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    timeout = 10  # drop connections that never send a request

    def end_headers(self):
        self.send_header('Content-Disposition', 'attachment; filename="mezzanine-import.json"')
        super().end_headers()


class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class IPv4Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


def main():
    port, directory = int(sys.argv[1]), sys.argv[2]
    handler = functools.partial(Handler, directory=directory)
    try:
        httpd = DualStackServer(('::', port), handler)
    except OSError:  # host without IPv6 (some Linux containers)
        httpd = IPv4Server(('0.0.0.0', port), handler)
    with httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    main()
