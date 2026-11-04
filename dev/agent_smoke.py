"""Real Windows DSH deployment/health smoke test. Never calls a model or QQ."""
import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import agent
import services
from store import State


def main():
    with tempfile.TemporaryDirectory(prefix="zhiling-agent-") as tmp:
        root = Path(tmp)
        state = State.load(root)
        engine = agent.Engine(root, state, print)
        try:
            engine.prepare()
            bridge = root / "astrbot" / "data" / "plugins" / "astrbot_plugin_dsh"
            assert (bridge / "main.py").is_file(), "IM-side bridge missing"
            config = json.loads((root / "astrbot/data/config/astrbot_plugin_dsh_config.json").read_text())
            assert config["private_passthrough"] is False
            assert config["allow_users"] == config["allow_groups"] == []
            assert config["session_scope"] == "user"
            engine.start()
            engine.wait_ready(240)
            assert engine.status()["ready"], "Authenticated bridge not ready"
            print("PASS: real DSH install, plugin boot, IM payload and authenticated health check")
        finally:
            services.stop(state, "dsh")
            # Do not expose auth beacons, environment, sessions or raw logs.
            if (root / "logs/dsh.log").exists():
                text = (root / "logs/dsh.log").read_text(encoding="utf-8", errors="replace")
                beacon = engine.home / "astrbot-ingress.json"
                if beacon.exists():
                    value = json.loads(beacon.read_text()).get("token", "")
                    text = text.replace(value, "***") if value else text
                text = re.sub(r"([?&]token=)[^\s&]+", r"\1***", text)
                print(text[-10000:])


if __name__ == "__main__":
    main()
