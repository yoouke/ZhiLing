"""Deployment boundaries; no real model or QQ account is needed."""
import json
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import agent
from store import State


class AgentTest(unittest.TestCase):
    def test_only_correct_bridge_and_token_are_ready(self):
        token = "integration-test-token-not-a-credential"

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == "/health":
                    payload = {"ok": True, "plugin": agent.BRIDGE_NAME}
                elif self.headers.get("Authorization") == "Bearer " + token:
                    payload = {"ok": True, "bound": False}
                else:
                    self.send_error(401)
                    return
                body = json.dumps(payload).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                state = State.load(Path(tmp))
                state.data["agent_ports"] = {"web": 3080, "bridge": server.server_port}
                engine = agent.Engine(tmp, state)
                engine.cli.parent.mkdir(parents=True)
                engine.cli.touch()
                engine.configure()
                beacon = engine.home / "astrbot-ingress.json"
                base = f"http://127.0.0.1:{server.server_port}"
                engine._json(beacon, {"url": base, "token": "wrong"})
                self.assertFalse(engine.status()["ready"])
                engine._json(beacon, {"url": base, "token": token})
                self.assertTrue(engine.status()["ready"])
                # A health response alone must not authenticate a foreign/stale service.
                import os
                os.utime(beacon, (time.time() - 120, time.time() - 120))
                self.assertFalse(engine.status()["ready"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_uninstalled_engine_cannot_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = agent.Engine(tmp, State.load(Path(tmp)))
            with self.assertRaisesRegex(RuntimeError, "尚未安装"):
                engine.start()
            self.assertFalse(engine.status()["installed"])
