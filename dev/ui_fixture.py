"""Serve the real frontend for UI tests; no services, credentials or real accounts."""
import argparse
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
import server


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--connection", type=Path, required=True)
    args = ap.parse_args()
    with tempfile.TemporaryDirectory(prefix="zhiling-ui-") as temporary:
        app = server.App("install", boot=ROOT, home=Path(temporary))
        httpd = server.make_server(app, 0)
        args.connection.write_text(json.dumps({"port": httpd.server_address[1], "token": app.token}), encoding="utf-8")
        try:
            httpd.serve_forever()
        finally:
            httpd.server_close()


if __name__ == "__main__":
    main()
