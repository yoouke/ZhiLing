"""Publish a verified development installer without replacing existing releases."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", type=int, required=True)
    ap.add_argument("--smoke", type=int, required=True)
    args = ap.parse_args()
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GH_TOKEN"]

    def api(path):
        req = urllib.request.Request("https://api.github.com/repos/" + repo + path,
                                     headers={"Authorization": "Bearer " + token,
                                              "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    build, smoke = api(f"/actions/runs/{args.build}"), api(f"/actions/runs/{args.smoke}")
    for run, name in ((build, "织灵 Windows 安装包"), (smoke, "织灵成品启动检查")):
        assert run["name"] == name and run["conclusion"] == "success", "Required verification did not pass"
        assert run["head_repository"]["full_name"] == repo, "Unexpected source repository"
    info = json.loads(Path("candidate/BUILD_INFO.json").read_text(encoding="utf-8"))
    report = json.loads(Path("proof/SMOKE_REPORT.json").read_text(encoding="utf-8"))
    installer = Path("candidate/织灵.exe")
    digest = hashlib.sha256(installer.read_bytes()).hexdigest()
    assert digest == Path("candidate/SHA256SUMS.txt").read_text(encoding="utf-8").split()[0]
    assert digest == report["installer_sha256"] == info["installer_sha256"], "Verification refers to a different installer"
    assert info["source_commit"] == build["head_sha"], "Build source does not match the recorded commit"
    checks = api("/commits/" + build["head_sha"] + "/check-runs")["check_runs"]
    assert any(x["name"] == "tests" and x["conclusion"] == "success" for x in checks), "Windows regression is missing"
    for name in ("embedded_runtime_boot", "blank_character", "unauthenticated_api_rejected"):
        assert report.get(name) is True, "Packaged host verification is incomplete"
    notes = Path("release-notes.md")
    notes.write_text(f'''织灵 Windows 开发预览

此安装包提供当前基础安装、角色提示词导入、QQ 连接配置、插件配置与 DSH 受管部署入口。安装包使用空白角色，由用户填写自己的角色资料。

已执行：Windows 回归、真实引擎部署、成品压缩包校验、包内运行时首次启动、空白角色及本机接口认证检查。welcome.png 为该安装包在 Windows runner 的实际首次启动截图。

尚未完成：多人格运行隔离、AI 讨论与联网创作、SnowLuma 分支、多平台统一管理、完整监控及 DIY。QQ 扫码、真实模型与语音授权、Win10/11 桌面完整流程仍待验收。此版本不是 PRD 完整版。

下载「织灵.exe」并在 Windows 运行；SHA256SUMS.txt 用于校验。BUILD_INFO.json 与 SMOKE_REPORT.json 记录对应成品检查范围。组件许可见随附 THIRD_PARTY_NOTICES.md。

构建提交：{build['head_sha']}
构建记录：{build['html_url']}
成品启动检查：{smoke['html_url']}
''', encoding="utf-8")
    tag = "v0.1.0-dev"
    # Deliberately do not use --clobber or edit an existing release.
    subprocess.run(["gh", "release", "create", tag, "--repo", repo, "--target", build["head_sha"],
                    "--prerelease", "--title", "织灵 0.1.0 开发预览", "--notes-file", str(notes),
                    str(installer), "candidate/SHA256SUMS.txt", "candidate/BUILD_INFO.json",
                    "proof/SMOKE_REPORT.json", "proof/welcome.png"], check=True)


if __name__ == "__main__":
    main()
