"""维护者用：组装并打出 dist/织灵.exe。需要联网、Windows，中间文件全在 .tmp/build/。

python build/build.py [--skip-download] [--out dist]
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

PYTHON = "3.12.10"
ASTRBOT = "4.29.3"
NAPCAT = "v4.18.41"
PYPI = "https://mirrors.aliyun.com/pypi/simple/"
URLS = {
    "python.zip": f"https://www.python.org/ftp/python/{PYTHON}/python-{PYTHON}-embed-amd64.zip",
    "get-pip.py": "https://bootstrap.pypa.io/get-pip.py",
    "7zr.exe": "https://www.7-zip.org/a/7zr.exe",
    "lzma.7z": "https://www.7-zip.org/a/lzma2501.7z",
    "astrbot-src.zip": f"https://api.github.com/repos/AstrBotDevs/AstrBot/zipball/v{ASTRBOT}",
    "astrbot.zip": f"https://github.com/AstrBotDevs/AstrBot/releases/download/v{ASTRBOT}/AstrBot-v{ASTRBOT}-dashboard.zip",
    "napcat-node.zip": f"https://github.com/NapNeko/NapCatQQ/releases/download/{NAPCAT}/NapCat.Shell.Windows.Node.zip",
}
DIGESTS = {
    "astrbot.zip": "a09f560c4140b930180f63a4929c885da80e24fb9bbda56619727bd25e985a11",
    "napcat-node.zip": "51fbb10e7bcd56b0c2a6de86c37811e7518330e48a137ac689ab1e4d8627d3f0",
}

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
WORK = ROOT / ".tmp" / "build"
DOWNLOADS = ROOT / "downloads"
sys.path.insert(0, str(ROOT / "app"))


def sfx_config_text() -> str:
    return (HERE / "sfx_config.txt").read_text(encoding="utf-8")


def scan_for_secrets(root: Path, needles: list[str]) -> list[Path]:
    """返回含任一敏感串的 json 文件。"""
    needles = [n for n in needles if n]
    return sorted(p for p in Path(root).rglob("*.json")
                  if any(n in p.read_text(encoding="utf-8", errors="ignore") for n in needles))


def download(dl: Path, skip: bool) -> None:
    dl.mkdir(parents=True, exist_ok=True)
    for name, url in URLS.items():
        existing = dl / name
        expected = DIGESTS.get(name)
        if existing.exists() and (not expected or hashlib.sha256(existing.read_bytes()).hexdigest() == expected):
            continue
        if skip:
            raise FileNotFoundError(f"构建输入缺失或校验失败：{name}，请取消 --skip-download 后重试")
        print("下载", url)
        tmp = dl / (name + ".part")
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        if expected and hashlib.sha256(tmp.read_bytes()).hexdigest() != expected:
            raise ValueError(f"下载校验失败：{name}")
        tmp.replace(dl / name)


def unzip(src: Path, dest: Path) -> None:
    """解压；压缩包只有一个顶层目录时去掉这一层。"""
    with zipfile.ZipFile(src) as z:
        names = [n for n in z.namelist() if n.strip("/")]
        tops = {n.split("/", 1)[0] for n in names}
        strip = len(tops) == 1 and all("/" in n for n in names)
        for info in z.infolist():
            rel = info.filename.split("/", 1)[1] if strip else info.filename
            if not rel or info.is_dir():
                continue
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as s, open(out, "wb") as d:
                shutil.copyfileobj(s, d)


def run(argv: list, **kw) -> None:
    print(">", " ".join(map(str, argv)))
    subprocess.run([str(a) for a in argv], check=True, **kw)


def stage_python(dl: Path, py_dir: Path) -> None:
    unzip(dl / "python.zip", py_dir)
    pth = next(py_dir.glob("python3*._pth"))
    lines = [l for l in pth.read_text(encoding="utf-8").splitlines() if l.strip() != "#import site"]
    # ._pth 模式下脚本所在目录不进 sys.path，AstrBot 的 main.py 要 import 同级模块
    pth.write_text("\n".join(lines + ["Lib\\site-packages", "..\\..\\astrbot", "import site"]) + "\n",
                   encoding="utf-8")
    # ._pth 也让 pip 的隔离构建环境找不到 setuptools；用户机器上 AstrBot 装插件依赖同样会撞上，所以写进 site 级 pip.ini
    # pip 对 no-* 选项的配置值是反的：false 才是「关掉隔离」
    (py_dir / "pip.ini").write_text("[global]\nno-build-isolation = false\n", encoding="utf-8")
    run([py_dir / "python.exe", dl / "get-pip.py", "-i", PYPI, "--no-warn-script-location", "setuptools", "wheel"])


def stage_pack(source: Path, dest: Path) -> None:
    """Assemble the application configuration, excluding the legacy standalone product."""
    import personalize
    shutil.copytree(source, dest)
    personalize.prepare_pack(dest, blank=True)
    notices = dest / "third-party"
    notices.mkdir(exist_ok=True)
    if (dest / "README.md").exists():
        shutil.move(str(dest / "README.md"), notices / "config-pack-README.md")
    for path in dest.glob("*.bat"):
        path.unlink()
    for path in (dest / "voice").glob("*.mp3"):
        path.unlink()
    (dest / "voice" / "README.md").write_text(
        "# 声音资源\n\n请配置自己的声音描述或经授权的声音素材；程序不附带固定角色声音示例。\n", encoding="utf-8")
    script = dest / "tools" / "import_dafeiyu.py"
    script.rename(dest / "tools" / "import_character.py")
    (dest / "README.md").write_text(
        "# 织灵运行配置\n\n请通过织灵主程序创建角色、配置能力并运行服务。\n"
        "此目录不提供预设人格；组件许可保留在 LICENSE、third-party 及各插件目录。\n", encoding="utf-8")


def assemble(stage: Path, dl: Path) -> None:
    import services
    layout = services.Layout(stage)
    stage_python(dl, layout.python.parent)
    unzip(dl / "astrbot-src.zip", layout.astrbot)
    unzip(dl / "astrbot.zip", layout.astrbot / "data" / "dist")
    unzip(dl / "napcat-node.zip", layout.napcat)
    stage_pack(ROOT / "vendor" / "dafeiyu-config-pack", layout.pack)
    shutil.copytree(ROOT / "app", layout.app,
                    ignore=lambda directory, names: [n for n in names if n == "__pycache__" or
                        (Path(directory).name == "img" and n.lower().endswith(".jpg"))])
    for name in ("THIRD_PARTY_NOTICES.md", "README.md"):
        shutil.copy2(ROOT / name, stage / name)
    run([layout.python, "-m", "pip", "install", "-i", PYPI, "-r", layout.astrbot / "requirements.txt",
         "--no-warn-script-location"])


def prewarm(stage: Path) -> list[str]:
    """构建期跑一次导入工具：插件、插件依赖、表情包都下进 stage。返回要扫的敏感串。"""
    import configs
    import personalize
    import services
    from store import State
    layout = services.Layout(stage)
    state = State.load(WORK / "state")
    ports, secrets = configs.pick_ports(), configs.new_secrets()
    configs.write_astrbot_config(layout.astrbot_data, ports=ports, secrets=secrets, deepseek_key="sk-build")
    services.start_astrbot(layout, state)
    try:
        url = f"http://127.0.0.1:{ports['dashboard']}"
        if not services.wait_http(url, 300):
            raise SystemExit("AstrBot 没起来，看 " + str(layout.logs))
        work = WORK / "import"
        answers, result = work / "answers.json", work / "result.json"
        work.mkdir(parents=True, exist_ok=True)
        personalize.write_answers(answers, base_url=url, username=configs.DASHBOARD_USER,
                                  password=secrets["dashboard_password"], owner_qq="10000",
                                  secrets_dir=work / "s", sf_key="", app_id="build-app", token="build-token")
        data = json.loads(answers.read_text(encoding="utf-8"))
        data.update(memory="0", voice="3")
        answers.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        run([layout.python, "-X", "utf8", personalize.import_tool(layout.pack),
             "--answers", answers, "--result-json", result])
        res = json.loads(result.read_text(encoding="utf-8"))
        # 语音要真实的豆包凭据试念，构建期必然失败；插件本身已装好就够了
        bad = [x["name"] for x in res.get("results", []) if not x["ok"] and x["name"] != "语音"]
        if res.get("fatal") or bad:
            raise SystemExit(f"导入工具失败：{res.get('fatal') or bad}")
    finally:
        services.stop(state, "astrbot")
    return ["sk-build", "build-app", "build-token", *secrets.values()]


def clean(stage: Path, needles: list[str]) -> None:
    data = stage / "astrbot" / "data"
    (data / "cmd_config.json").unlink(missing_ok=True)
    # -wal/-shm 是 SQLite 的伴生文件，里头留着还没并回主库的页，同样是预热期的数据
    for p in list(data.glob("*.db")) + list(data.glob("*.db-wal")) + list(data.glob("*.db-shm")):
        p.unlink()
    for d in ("temp", "logs"):
        shutil.rmtree(data / d, ignore_errors=True)
    for p in list(stage.rglob("__pycache__")):
        shutil.rmtree(p, ignore_errors=True)
    shutil.rmtree(stage / "logs", ignore_errors=True)
    leaks = scan_for_secrets(stage, needles)
    if leaks:
        raise SystemExit("stage 里还有敏感串：\n" + "\n".join(map(str, leaks)))


def stamp_executable(exe: Path, icon: Path) -> None:
    """Stamp the actual Windows executable, not only the desktop shortcut."""
    from PyInstaller.utils.win32 import icon as icons, versioninfo as vi
    icons.CopyIcons(str(exe), str(icon))
    info = vi.VSVersionInfo(
        ffi=vi.FixedFileInfo(filevers=(0, 1, 0, 0), prodvers=(0, 1, 0, 0), flags=2, fileType=1),
        kids=[vi.StringFileInfo([vi.StringTable("080404B0", [
            vi.StringStruct("CompanyName", "ZhiLing"),
            vi.StringStruct("FileDescription", "织灵 AI 虚拟人格应用"),
            vi.StringStruct("FileVersion", "0.1.0-dev"),
            vi.StringStruct("InternalName", "ZhiLing"),
            vi.StringStruct("OriginalFilename", "织灵.exe"),
            vi.StringStruct("ProductName", "织灵"),
            vi.StringStruct("ProductVersion", "0.1.0-dev"),
            vi.StringStruct("LegalCopyright", "组件许可见 THIRD_PARTY_NOTICES.md"),
        ])]), vi.VarFileInfo([vi.VarStruct("Translation", [0x0804, 1200])])])
    vi.write_version_info_to_executable(str(exe), info)


def package(stage: Path, dl: Path, out: Path) -> Path:
    seven = dl / "7zr.exe"
    boot = WORK / "boot"
    shutil.rmtree(boot, ignore_errors=True)
    for p in (WORK / "payload.7z", WORK / "boot.7z"):
        p.unlink(missing_ok=True)
    run([seven, "a", WORK / "payload.7z", f"{stage}\\*", "-mx=7"])
    shutil.copytree(stage / "runtime" / "python", boot / "runtime" / "python",
                    ignore=lambda d, names: ["site-packages"] if Path(d).name == "Lib" else [])
    shutil.copytree(stage / "app", boot / "app")
    # 向导第 1 页就要读配置包算默认人设，boot 阶段还没解 payload，所以 pack 得带一份（只有 1 MB）
    shutil.copytree(stage / "pack", boot / "pack")
    shutil.copy2(seven, boot / "7zr.exe")
    shutil.move(str(WORK / "payload.7z"), boot / "payload.7z")
    run([seven, "a", WORK / "boot.7z", f"{boot}\\*", "-mx=1"])
    run([seven, "e", dl / "lzma.7z", f"-o{WORK}", "-r", "7zSD.sfx", "-y"])
    out.mkdir(parents=True, exist_ok=True)
    stub = WORK / "zhiling.sfx"
    shutil.copy2(WORK / "7zSD.sfx", stub)
    stamp_executable(stub, stage / "app" / "web" / "img" / "icon.ico")
    exe = out / "织灵.exe"
    with open(exe, "wb") as f:
        f.write(stub.read_bytes())
        f.write(sfx_config_text().encode("utf-8"))
        with open(WORK / "boot.7z", "rb") as b:
            shutil.copyfileobj(b, f)
    (out / "SHA256SUMS.txt").write_text(hashlib.sha256(exe.read_bytes()).hexdigest() + "  " + exe.name + "\n", encoding="utf-8")
    return exe


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-download", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "dist"))
    args = ap.parse_args()
    dl, stage = WORK / "dl", WORK / "stage"
    download(dl, args.skip_download)
    shutil.rmtree(stage, ignore_errors=True)
    assemble(stage, dl)
    clean(stage, prewarm(stage))
    exe = package(stage, dl, Path(args.out))
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    print(f"{exe}  {exe.stat().st_size / 1024 / 1024:.1f} MB  sha256={digest}")


if __name__ == "__main__":
    main()
