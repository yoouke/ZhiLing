import os
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

import shortcut


class ShortcutTest(unittest.TestCase):
    def test_creates_lnk_with_target_args_and_icon(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d).resolve()  # 临时目录可能是 8.3 短路径，.lnk 里存的是长路径
            target = d / "pythonw.exe"
            target.write_bytes(b"")
            icon = d / "icon.ico"
            icon.write_bytes(b"")
            # 参数里带引号和空格，确认原样写进去
            args = f'"{d / "app" / "main.py"}" --status --root "{d / "大肥 鱼"}"'
            lnk = shortcut.create_shortcut(target, args, "启动织灵", icon, desktop=d)
            self.assertEqual(lnk, d / "启动织灵.lnk")
            self.assertTrue(lnk.exists(), f"Expected {lnk!s}; actual files: {[x.name for x in d.iterdir()]}")
            # WScript's legacy path handling also fails when reading a Unicode
            # filename. Inspect an exact byte-for-byte ASCII alias of the link;
            # keep all target/argument/icon checks against the real saved data.
            inspect_path = d / "inspect.lnk"
            shutil.copyfile(lnk, inspect_path)
            self.assertEqual(inspect_path.read_bytes(), lnk.read_bytes())
            env = dict(os.environ, LNK=str(inspect_path))
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
                 "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
                 "$s.TargetPath; $s.Arguments; $s.IconLocation; $s.WorkingDirectory"],
                capture_output=True, env=env, check=True).stdout.decode("utf-8").splitlines()
            self.assertEqual(Path(out[0]), target)
            # WScript also uses the system ANSI code page for arguments. Read
            # the saved MS-SHLLINK StringData independently to verify UTF-16.
            data = lnk.read_bytes()
            self.assertEqual(struct.unpack_from("<I", data)[0], 0x4c)
            flags = struct.unpack_from("<I", data, 20)[0]
            self.assertTrue(flags & 0x80, "Shell Link must contain Unicode StringData")
            offset = 76
            if flags & 1:  # LinkTargetIDList
                offset += 2 + struct.unpack_from("<H", data, offset)[0]
            if flags & 2:  # LinkInfo
                offset += struct.unpack_from("<I", data, offset)[0]
            strings = {}
            for bit, field in [(4, "name"), (8, "relative"), (16, "working"),
                               (32, "arguments"), (64, "icon")]:
                if flags & bit:
                    count = struct.unpack_from("<H", data, offset)[0]
                    offset += 2
                    strings[field] = data[offset:offset + count * 2].decode("utf-16-le")
                    offset += count * 2
            self.assertEqual(strings.get("arguments"), args)
            self.assertTrue(out[2].startswith(str(icon)))
            self.assertEqual(Path(out[3]), d)

    def test_remove_deletes_lnk(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            lnk = shortcut.create_shortcut(d / "a.exe", "", "启动织灵", d / "i.ico", desktop=d)
            shortcut.remove_shortcut("启动织灵", desktop=d)
            self.assertFalse(lnk.exists())

    def test_remove_missing_is_ok(self):
        with tempfile.TemporaryDirectory() as d:
            shortcut.remove_shortcut("不存在的", desktop=Path(d))

    def test_desktop_dir_from_system(self):
        self.assertTrue(shortcut.desktop_dir().is_dir())

    def test_overwrites_existing(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            shortcut.create_shortcut(d / "a.exe", "", "x", d / "i.ico", desktop=d)
            lnk = shortcut.create_shortcut(d / "b.exe", "", "x", d / "i.ico", desktop=d)
            self.assertTrue(lnk.exists())


if __name__ == "__main__":
    unittest.main()
