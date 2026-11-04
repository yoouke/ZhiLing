"""Managed DSH deployment and lifecycle for the installed desktop application."""
import hashlib
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

import services

NODE_VERSION = "24.11.1"
DSH_VERSION = "0.2.1-rc.5"
PNPM_VERSION = "10.28.2"
BRIDGE_VERSION = "0.3.23"
BRIDGE_NAME = "dsh-astrbot-ingress"


class Engine:
    def __init__(self, root, state, log=lambda _: None):
        self.root, self.state, self.log = Path(root), state, log
        self.layout = services.Layout(self.root)
        self.runtime = self.root / "runtime" / "agent"
        self.node_dir = self.runtime / "node"
        self.node = self.node_dir / "node.exe"
        self.packages = self.runtime / "packages"
        self.cli = self.packages / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
        self.home = self.root / "engines" / "dsh" / "home"
        self.workspace = self.root / "agent-workspace"
        self.patch = self.home / "zhiling.patch.json"

    def env(self, credentials=False):
        env = dict(os.environ)
        env.update(DSH_HOME=str(self.home), DSH_TELEMETRY_DISABLED="1",
                   PATH=os.pathsep.join([str(self.node_dir), str(self.packages / "node_modules" / ".bin"),
                                         env.get("PATH", "")]))
        # No key in command lines, profile files or install logs.
        if credentials:
            env["DEEPSEEK_API_KEY"] = self.state.get_secret("deepseek")
        return env

    def run(self, argv, timeout=1800):
        result = subprocess.run(list(map(str, argv)), cwd=self.root, env=self.env(),
                                capture_output=True, encoding="utf-8", errors="replace", timeout=timeout,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            self.log(result.stdout + "\n" + result.stderr)
            raise RuntimeError("Agent 组件准备失败，请查看安装日志后重试")

    def install_node(self):
        if self.node.exists():
            version = subprocess.run([str(self.node), "--version"], capture_output=True, text=True,
                                     check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout.strip()
            if version == f"v{NODE_VERSION}":
                return
        self.log("下载独立 Agent 运行环境")
        name = f"node-v{NODE_VERSION}-win-x64.zip"
        base = f"https://nodejs.org/dist/v{NODE_VERSION}/"
        with urllib.request.urlopen(base + "SHASUMS256.txt", timeout=60) as r:
            hashes = dict((line.split()[1], line.split()[0]) for line in r.read().decode().splitlines() if line.split())
        expected = hashes[name]
        self.runtime.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=self.runtime) as tmp:
            archive = Path(tmp) / name
            with urllib.request.urlopen(base + name, timeout=120) as r, archive.open("wb") as out:
                shutil.copyfileobj(r, out)
            if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
                raise RuntimeError("Node 运行环境校验失败，请重试下载")
            with zipfile.ZipFile(archive) as z:
                for entry in z.infolist():
                    dest = (Path(tmp) / entry.filename).resolve()
                    if not dest.is_relative_to(Path(tmp).resolve()):
                        raise RuntimeError("运行环境压缩包路径无效")
                z.extractall(tmp)
            # Downloads are verified before replacing an existing runtime.
            if self.node_dir.exists():
                shutil.rmtree(self.node_dir)
            shutil.move(str(Path(tmp) / name[:-4]), self.node_dir)

    def prepare(self):
        self.root.mkdir(parents=True, exist_ok=True)
        self.install_node()
        npm = self.node_dir / "node_modules" / "npm" / "bin" / "npm-cli.js"
        self.log("安装 Agent 引擎和桥接组件")
        self.run([self.node, npm, "install", "--prefix", self.packages, "--no-audit", "--no-fund",
                  f"@deepseek-ai/dsh@{DSH_VERSION}", f"pnpm@{PNPM_VERSION}"])
        self.home.mkdir(parents=True, exist_ok=True)
        self.run([self.node, self.cli, "plugin", "--profile", "web", "add",
                  f"{BRIDGE_NAME}@{BRIDGE_VERSION}"])
        source = self.home / "profiles" / "web" / "node_modules" / BRIDGE_NAME / "astrbot_plugin_dsh"
        if not (source / "main.py").is_file():
            raise RuntimeError("消息桥接组件不完整")
        target = self.layout.astrbot_data / "plugins" / "astrbot_plugin_dsh"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target, dirs_exist_ok=True)
        # Reconfigure before restarting the existing IM gateway.
        conf_path = self.layout.astrbot_data / "config" / "astrbot_plugin_dsh_config.json"
        conf_path.parent.mkdir(parents=True, exist_ok=True)
        schema = json.loads((source / "_conf_schema.json").read_text(encoding="utf-8"))
        conf = {k: v["default"] for k, v in schema.items() if "default" in v}
        conf.update(enabled=True, ingress_url="", token="", private_passthrough=False,
                    allow_users=[], allow_groups=[], session_scope="user")
        self._json(conf_path, conf)
        self.configure()

    @staticmethod
    def _json(path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp, path)

    def configure(self):
        ports = self.state.data.setdefault("agent_ports", {})
        for name in ("web", "bridge"):
            if name not in ports:
                with socket.socket() as sock:
                    sock.bind(("127.0.0.1", 0))
                    ports[name] = sock.getsockname()[1]
        self.state.save()
        self.workspace.mkdir(parents=True, exist_ok=True)
        # JSON is valid YAML and avoids interpolating Windows paths into YAML.
        self._json(self.patch, [{"id": BRIDGE_NAME, "config": {
            "host": "127.0.0.1", "port": ports["bridge"], "cwd": str(self.workspace),
            "reasoningMode": "off", "progressMode": "digest", "beacon": True}}])

    def start(self):
        if not self.cli.exists() or not self.patch.exists():
            raise RuntimeError("Agent 尚未安装，请先完成部署")
        self.state.reload_pids()
        if services.is_running(self.state.data.get("pids", {}).get("dsh")):
            return
        ports = self.state.data["agent_ports"]
        services._spawn("dsh", [str(self.node), str(self.cli), "--profile", "web", "--patch", str(self.patch),
                                "--host", "127.0.0.1", "--port", str(ports["web"]), "--no-open"],
                        self.workspace, self.env(credentials=True), self.layout, self.state)

    def status(self):
        ports = self.state.data.get("agent_ports", {})
        result = {"installed": self.cli.exists() and self.patch.exists(),
                  "enabled": bool(self.state.data.get("agent_enabled")), "ready": False,
                  "console_url": f"http://127.0.0.1:{ports['web']}" if ports.get("web") else "",
                  "message": "Agent 尚未启动"}
        if not result["installed"]:
            result["message"] = "Agent 尚未部署"
            return result
        try:
            base = f"http://127.0.0.1:{ports['bridge']}"
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(base + "/health", timeout=2) as r:
                health = json.load(r)
            if health.get("plugin") != BRIDGE_NAME or health.get("ok") is not True:
                raise RuntimeError("桥接端口被其他服务占用")
            beacon = json.loads((self.home / "astrbot-ingress.json").read_text(encoding="utf-8"))
            if beacon.get("url", "").rstrip("/") != base or time.time() - (self.home / "astrbot-ingress.json").stat().st_mtime > 90:
                raise RuntimeError("消息桥接认证信息尚未就绪")
            req = urllib.request.Request(base + "/binding?umo=zhiling-health",
                                         headers={"Authorization": "Bearer " + str(beacon.get("token", ""))})
            with opener.open(req, timeout=2) as r:
                auth = json.load(r)
            if auth.get("ok") is not True:
                raise RuntimeError("消息桥接认证失败")
            result.update(ready=True, message="引擎与消息桥接服务就绪")
        except Exception as e:
            result["message"] = "Agent 未就绪：" + type(e).__name__
        return result

    def wait_ready(self, timeout=180):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.status()["ready"]:
                return
            time.sleep(1)
        raise RuntimeError("Agent 启动超时，请检查 logs/dsh.log 后重试")
