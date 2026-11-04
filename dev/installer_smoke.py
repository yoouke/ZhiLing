"""Run the packaged installation host using its own embedded Python on Windows.

No QQ login, model credentials, or user installation is used. Reports and the
welcome-screen screenshot contain no authentication token.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def run(argv):
    subprocess.run([str(x) for x in argv], check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.STDOUT, timeout=300)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate", type=Path)
    ap.add_argument("--out", type=Path, default=Path("smoke-output"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    exe = args.candidate / "织灵.exe"
    expected = (args.candidate / "SHA256SUMS.txt").read_text(encoding="utf-8").split()[0]
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    assert digest == expected, "Installer checksum mismatch"
    seven = Path(shutil.which("7z") or r"C:\Program Files\7-Zip\7z.exe")
    assert seven.is_file(), "7-Zip is unavailable"
    with tempfile.TemporaryDirectory(prefix="zhiling-package-") as scratch:
        base = Path(scratch)
        boot, payload = base / "boot", base / "payload"
        run([seven, "t", exe])
        run([seven, "x", exe, "-o" + str(boot), "-y"])
        run([seven, "x", boot / "payload.7z", "-o" + str(payload), "-y"])
        manifest = json.loads((payload / "pack/settings/pack.json").read_text(encoding="utf-8"))
        assert manifest["persona"] == {"id": "zhiling-character", "file": "persona/character.md"}
        assert not (payload / "pack/persona/character.md").read_text(encoding="utf-8").strip()
        assert not list((payload / "pack").glob("*.bat"))
        assert not list((payload / "app/web/img").glob("*.jpg"))
        assert not (payload / "astrbot/data/cmd_config.json").exists()
        assert not (payload / "astrbot/data/config").exists()
        assert (payload / "THIRD_PARTY_NOTICES.md").is_file()
        assert (payload / "pack/LICENSE").is_file()
        # Exercise the exact executable runtime and source extracted from the
        # package, with a separate empty application home.
        env = dict(os.environ, LOCALAPPDATA=str(base / "home"), PYTHONUTF8="1")
        with open(base / "host.log", "wb") as log:
            proc = subprocess.Popen([str(boot / "runtime/python/python.exe"), "-X", "utf8",
                                     str(boot / "app/main.py"), "--no-window"],
                                    cwd=boot, env=env, stdout=log, stderr=log)
            try:
                lock = base / "home/ZhiLing/wizard-install.lock"
                deadline = time.monotonic() + 45
                while not lock.is_file():
                    if proc.poll() is not None:
                        raise RuntimeError("Packaged application exited before becoming ready")
                    if time.monotonic() > deadline:
                        raise TimeoutError("Packaged application did not become ready")
                    time.sleep(0.2)
                connection = json.loads(lock.read_text(encoding="utf-8"))
                url = "http://127.0.0.1:" + str(connection["port"])
                req = urllib.request.Request(url + "/api/info", headers={"X-Token": connection["token"]})
                with urllib.request.urlopen(req, timeout=10) as response:
                    info = json.load(response)
                assert info["mode"] == "install"
                assert info["profile"]["name"] == info["profile"]["persona"] == info["profile"]["voice"] == ""
                assert info["saved_keys"] == []
                try:
                    urllib.request.urlopen(url + "/api/info", timeout=10)
                    raise AssertionError("Unauthenticated API access was allowed")
                except urllib.error.HTTPError as error:
                    assert error.code == 403
                with urllib.request.urlopen(url + "/", timeout=10) as response:
                    html = response.read().decode("utf-8")
                assert "织灵" in html and "{{TOKEN}}" not in html
                with urllib.request.urlopen(url + "/app.js", timeout=10) as response:
                    script = response.read().decode("utf-8")
                assert "大肥鱼一键包" not in script and "复用 DSQQ" not in script
                edge = next((Path(os.environ.get(key, "")) / "Microsoft/Edge/Application/msedge.exe"
                             for key in ("ProgramFiles(x86)", "ProgramFiles")
                             if (Path(os.environ.get(key, "")) / "Microsoft/Edge/Application/msedge.exe").is_file()), None)
                assert edge, "Microsoft Edge is unavailable"
                picture = (args.out / "welcome.png").resolve()
                run([edge, "--headless", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
                     "--window-size=1280,900", "--virtual-time-budget=3000",
                     "--user-data-dir=" + str(base / "edge"), "--screenshot=" + str(picture), url])
                assert picture.is_file() and picture.stat().st_size > 10000, "Welcome screenshot missing"
            finally:
                if proc.poll() is None:
                    proc.terminate()
                proc.wait(timeout=15)
        report = {"installer_sha256": digest, "archive_integrity": True,
                  "embedded_runtime_boot": True, "blank_character": True,
                  "unauthenticated_api_rejected": True, "third_party_notices_preserved": True,
                  "scope": "安装包解压、内嵌运行时、首次启动及内容检查；未登录 QQ 或调用模型"}
        (args.out / "SMOKE_REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Packaged host, blank-character onboarding, API authentication and screenshot checks passed.")


if __name__ == "__main__":
    main()
