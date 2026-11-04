"""在桌面放「启动织灵」快捷方式。使用 Windows 原生 Unicode Shell Link 接口，不加依赖。"""

import os
import subprocess
import tempfile
from pathlib import Path

_PS_DESKTOP = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8;"
               "[Environment]::GetFolderPath('Desktop')")


def desktop_dir(desktop: Path | None = None) -> Path:
    """桌面目录。默认问系统要（会跟着 OneDrive 重定向）。"""
    if desktop:
        return Path(desktop)
    out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", _PS_DESKTOP],
                         capture_output=True, timeout=60,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if out.returncode != 0:
        raise OSError("找不到桌面目录")
    return Path(out.stdout.decode("utf-8", "replace").strip().splitlines()[-1])


def remove_shortcut(name: str, desktop: Path | None = None) -> None:
    """删掉桌面快捷方式。本来就没有也算成功。"""
    (desktop_dir(desktop) / f"{name}.lnk").unlink(missing_ok=True)


def _save_link(path: Path, target: Path, args: str, icon: Path) -> None:
    """IShellLinkW keeps Chinese paths and arguments intact on any system locale."""
    import ctypes as c
    from uuid import UUID

    class GUID(c.Structure):
        _fields_ = [("data1", c.c_uint32), ("data2", c.c_uint16),
                    ("data3", c.c_uint16), ("data4", c.c_ubyte * 8)]

    def guid(value):
        return GUID.from_buffer_copy(UUID(value).bytes_le)

    hresult = c.c_int32
    ole = c.WinDLL("ole32")
    ole.CoInitializeEx.argtypes = [c.c_void_p, c.c_uint32]
    ole.CoInitializeEx.restype = hresult
    ole.CoUninitialize.argtypes = []
    ole.CoUninitialize.restype = None
    ole.CoCreateInstance.argtypes = [c.POINTER(GUID), c.c_void_p, c.c_uint32,
                                    c.POINTER(GUID), c.POINTER(c.c_void_p)]
    ole.CoCreateInstance.restype = hresult

    def check(result):
        if result < 0:
            raise OSError(f"建桌面快捷方式失败：HRESULT 0x{result & 0xffffffff:08X}")

    def method(obj, index, *types):
        vtable = c.cast(obj, c.POINTER(c.POINTER(c.c_void_p))).contents
        return c.WINFUNCTYPE(hresult, c.c_void_p, *types)(vtable[index])

    initialized = ole.CoInitializeEx(None, 2)
    # RPC_E_CHANGED_MODE means the caller already owns a different apartment.
    if initialized != -2147417850:
        check(initialized)
    link, persist = c.c_void_p(), c.c_void_p()
    try:
        clsid = guid("00021401-0000-0000-c000-000000000046")
        iid = guid("000214f9-0000-0000-c000-000000000046")
        check(ole.CoCreateInstance(c.byref(clsid), None, 1, c.byref(iid), c.byref(link)))
        check(method(link, 20, c.c_wchar_p)(link, str(target)))
        check(method(link, 11, c.c_wchar_p)(link, args))
        check(method(link, 9, c.c_wchar_p)(link, str(target.parent)))
        check(method(link, 17, c.c_wchar_p, c.c_int)(link, str(icon), 0))
        iid_file = guid("0000010b-0000-0000-c000-000000000046")
        check(method(link, 0, c.POINTER(GUID), c.POINTER(c.c_void_p))(
            link, c.byref(iid_file), c.byref(persist)))
        check(method(persist, 6, c.c_wchar_p, c.c_int)(persist, str(path), 1))
    finally:
        if persist:
            method(persist, 2)(persist)
        if link:
            method(link, 2)(link)
        if initialized >= 0:
            ole.CoUninitialize()


def create_shortcut(target: Path, args: str, name: str, icon: Path, desktop: Path | None = None) -> Path:
    """建或原子替换桌面快捷方式；默认跟随系统桌面重定向。"""
    target, icon = Path(target).resolve(), Path(icon).resolve()
    destination = desktop_dir(desktop) / f"{name}.lnk"
    fd, staged_name = tempfile.mkstemp(prefix=".zhiling-", suffix=".lnk", dir=destination.parent)
    os.close(fd)
    staged = Path(staged_name)
    try:
        _save_link(staged, target, args, icon)
        if not staged.stat().st_size:
            raise OSError("建桌面快捷方式失败：文件为空")
        os.replace(staged, destination)
    finally:
        staged.unlink(missing_ok=True)
    return destination
