import importlib.util
import tempfile
import sys
import shutil
import unittest
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "build_script", Path(__file__).resolve().parents[1] / "build" / "build.py")
build = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(build)


class BuildTest(unittest.TestCase):
    def test_sfx_config_text(self):
        text = build.sfx_config_text()
        self.assertTrue(text.startswith(";!@Install@!UTF-8!"))
        self.assertIn('Title="织灵"', text)
        self.assertIn(r'RunProgram="runtime\\python\\pythonw.exe app\\main.py"', text)
        self.assertTrue(text.rstrip().endswith(";!@InstallEnd@!"))

    def test_payload_has_no_bundled_fixed_character(self):
        source = Path(__file__).resolve().parents[1] / "vendor" / "dafeiyu-config-pack"
        with tempfile.TemporaryDirectory() as tmp:
            pack = Path(tmp) / "pack"
            build.stage_pack(source, pack)
            manifest = __import__("json").loads((pack / "settings/pack.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["persona"]["id"], "zhiling-character")
            self.assertEqual((pack / manifest["persona"]["file"]).read_text(), "")
            self.assertEqual(manifest["voice"]["doubao"]["persona"], "")
            self.assertEqual(manifest["voice"]["breeze"]["voice"], "")
            self.assertFalse(list(pack.glob("*.bat")))
            self.assertFalse(list((pack / "voice").glob("*.mp3")))
            self.assertFalse((pack / "persona/大肥鱼.md").exists())
            self.assertTrue((pack / "tools/import_character.py").is_file())
            self.assertTrue((pack / "LICENSE").is_file())
            self.assertTrue((pack / "plugins/astrbot_plugin_dafeiyu_sing/main.py").is_file())
        # Packaging does not erase or reattribute the original source records.
        self.assertTrue((source / "persona/大肥鱼.md").is_file())

    @unittest.skipUnless(sys.platform == "win32", "Windows PE resources")
    def test_executable_has_product_version_and_our_icon(self):
        import ctypes
        import struct
        import pefile
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "织灵.exe"
            shutil.copy2(sys.executable, exe)
            icon = Path(__file__).resolve().parents[1] / "app/web/img/icon.ico"
            build.stamp_executable(exe, icon)
            # Ask Windows itself for the product metadata of the saved PE.
            api = ctypes.WinDLL("version", use_last_error=True)
            api.GetFileVersionInfoSizeW.argtypes = [ctypes.c_wchar_p, ctypes.c_void_p]
            size = api.GetFileVersionInfoSizeW(str(exe), None)
            self.assertGreater(size, 0)
            buf = ctypes.create_string_buffer(size)
            api.GetFileVersionInfoW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
            self.assertTrue(api.GetFileVersionInfoW(str(exe), 0, size, buf))
            api.VerQueryValueW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p,
                                         ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_uint)]
            for key, expected in (("ProductName", "织灵"), ("OriginalFilename", "织灵.exe")):
                value, length = ctypes.c_void_p(), ctypes.c_uint()
                self.assertTrue(api.VerQueryValueW(buf, "\\StringFileInfo\\080404B0\\" + key,
                                                   ctypes.byref(value), ctypes.byref(length)))
                self.assertEqual(ctypes.wstring_at(value, length.value - 1), expected)
            # Compare actual embedded icon bytes with the approved source ICO.
            original = icon.read_bytes()
            with pefile.PE(str(exe)) as pe:
                icons = next(e for e in pe.DIRECTORY_ENTRY_RESOURCE.entries if e.id == 3)
                payloads = [pe.get_data(lang.data.struct.OffsetToData, lang.data.struct.Size)
                            for entry in icons.directory.entries for lang in entry.directory.entries]
                count = struct.unpack_from("<H", original, 4)[0]
                for i in range(count):
                    length, offset = struct.unpack_from("<II", original, 6 + i * 16 + 8)
                    self.assertIn(original[offset:offset + length], payloads)

    def test_clean_removes_db_sidecar_files(self):
        """*.db-wal / *.db-shm 留着预热期的数据，删主库不删它们等于没清。"""
        with tempfile.TemporaryDirectory() as d:
            stage = Path(d)
            data = stage / "astrbot" / "data"
            data.mkdir(parents=True)
            for name in ("data_v4.db", "data_v4.db-wal", "data_v4.db-shm", "cmd_config.json"):
                (data / name).write_text("{}", encoding="utf-8")
            build.clean(stage, [])
            self.assertEqual(list(data.iterdir()), [])

    def test_scan_for_secrets_flags_key(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "a").mkdir()
            (root / "a" / "conf.json").write_text('{"key": "sk-build"}', encoding="utf-8")
            (root / "clean.json").write_text('{"key": ""}', encoding="utf-8")
            (root / "note.txt").write_text("sk-build", encoding="utf-8")  # 只扫 json
            self.assertEqual(build.scan_for_secrets(root, ["sk-build"]), [root / "a" / "conf.json"])


if __name__ == "__main__":
    unittest.main()
