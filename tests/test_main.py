import argparse
import json
import tempfile
import unittest
from pathlib import Path

import main as entry
import installer
import services
from store import remember_install


def args(status=False, root=None):
    return argparse.Namespace(status=status, root=root, no_window=True)


class ResolveModeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / "home"
        self.root = Path(self.tmp.name) / "ZhiLing"
        self.root.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def install(self, root=None, complete=True):
        root = root or self.root
        layout = services.Layout(root)
        for path in (layout.python, layout.astrbot / "main.py", layout.napcat / "node.exe",
                     layout.pack / "settings/pack.json", layout.pack / "persona/character.md"):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture", encoding="utf-8")
        saved = {"done": sorted(installer.SETUP_STEPS) if complete else ["extract", "ports"],
                 "keys_ok": complete, "profile": {"name": "fixture"} if complete else None}
        (root / "state.json").write_text(json.dumps(saved), encoding="utf-8")
        remember_install(root, self.home)

    def test_fresh_machine_gets_the_wizard(self):
        self.assertEqual(entry.resolve_mode(args(), self.home), ("install", None))

    def test_completed_installation_gets_workspace(self):
        self.install()
        self.assertEqual(entry.resolve_mode(args(), self.home), ("status", self.root))

    def test_partial_install_resumes_setup_even_from_shortcut(self):
        self.install(complete=False)
        self.assertEqual(entry.resolve_mode(args(status=True, root=str(self.root)), self.home), ("install", self.root))

    def test_state_file_alone_cannot_open_workspace(self):
        (self.root / "state.json").write_text("{}", encoding="utf-8")
        remember_install(self.root, self.home)
        self.assertEqual(entry.resolve_mode(args(), self.home), ("install", self.root))

    def test_completed_flags_with_missing_runtime_require_repair(self):
        self.install()
        services.Layout(self.root).python.unlink()
        self.assertEqual(entry.resolve_mode(args(), self.home), ("install", self.root))

    def test_missing_keys_do_not_count_as_completed(self):
        self.install()
        saved = json.loads((self.root / "state.json").read_text())
        saved["keys_ok"] = False
        (self.root / "state.json").write_text(json.dumps(saved))
        self.assertFalse(installer.installation_ready(self.root))

    def test_install_dir_deleted_falls_back_to_the_wizard(self):
        remember_install(self.root, self.home)
        self.assertEqual(entry.resolve_mode(args(), self.home), ("install", None))

    def test_explicit_root_wins(self):
        self.install()
        other = Path(self.tmp.name) / "Other"
        other.mkdir()
        self.install(other, complete=False)
        remember_install(self.root, self.home)
        self.assertEqual(entry.resolve_mode(args(status=True, root=str(other)), self.home), ("install", other))


class LockTest(unittest.TestCase):
    def test_setup_and_workspace_share_a_single_desktop_host(self):
        home = Path("home")
        self.assertEqual(entry.window_files("install", home), entry.window_files("status", home))
        self.assertEqual(entry.window_files("status", home), (home / "desktop.lock", home / "edge-desktop"))


if __name__ == "__main__":
    unittest.main()
