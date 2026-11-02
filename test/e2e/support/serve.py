"""Serve the Primal checkout for the browser tests.

Same handler as `python -m http.server` (README.md), so content types and HEAD behaviour are
identical; only the listen backlog is raised: the default of 5 makes parallel test workers'
connections reset.
Usage: python3 serve.py <port> <directory>
"""
import functools
import http.server
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


port, directory = int(sys.argv[1]), sys.argv[2]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
with Server(("127.0.0.1", port), handler) as httpd:
    httpd.serve_forever()
