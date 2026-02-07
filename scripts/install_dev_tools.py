#!/usr/bin/env python3
"""
Install a practical coding CLI toolkit into ~/.local/bin for macOS arm64.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


API_BASE = "https://api.github.com/repos"
UA = "codex-dev-tools-installer"


TOOLS = [
    {
        "name": "ripgrep",
        "bin": "rg",
        "repo": "BurntSushi/ripgrep",
        "asset_pattern": r"ripgrep-.*-aarch64-apple-darwin\.tar\.gz$",
        "kind": "tar.gz",
    },
    {
        "name": "fd",
        "bin": "fd",
        "repo": "sharkdp/fd",
        "asset_pattern": r"fd-v.*-aarch64-apple-darwin\.tar\.gz$",
        "kind": "tar.gz",
    },
    {
        "name": "fzf",
        "bin": "fzf",
        "repo": "junegunn/fzf",
        "asset_pattern": r"fzf-.*-darwin_arm64\.tar\.gz$",
        "kind": "tar.gz",
    },
    {
        "name": "jq",
        "bin": "jq",
        "repo": "jqlang/jq",
        "asset_pattern": r"jq-macos-arm64$",
        "kind": "binary",
    },
    {
        "name": "yq",
        "bin": "yq",
        "repo": "mikefarah/yq",
        "asset_pattern": r"yq_darwin_arm64$",
        "kind": "binary",
    },
    {
        "name": "bat",
        "bin": "bat",
        "repo": "sharkdp/bat",
        "asset_pattern": r"bat-v.*-aarch64-apple-darwin\.tar\.gz$",
        "kind": "tar.gz",
    },
]


def fetch_json(url: str) -> dict:
    out = subprocess.check_output(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--header",
            f"User-Agent: {UA}",
            "--header",
            "Accept: application/vnd.github+json",
            url,
        ],
        text=True,
        timeout=45,
    )
    return json.loads(out)


def download(url: str, target: Path) -> None:
    subprocess.check_call(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--header",
            f"User-Agent: {UA}",
            "--header",
            "Accept: application/octet-stream",
            "--output",
            str(target),
            url,
        ],
        timeout=300,
    )


def chmod_executable(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def install_tar_binary(archive_path: Path, binary_name: str, local_bin: Path) -> Path:
    with tempfile.TemporaryDirectory(prefix=f"extract_{binary_name}_") as extract_dir:
        extract_path = Path(extract_dir)
        with tarfile.open(archive_path) as tar:
            tar.extractall(extract_path)

        candidates = list(extract_path.rglob(binary_name))
        if not candidates:
            raise RuntimeError(f"Could not find '{binary_name}' in {archive_path.name}")

        src = candidates[0]
        dst = local_bin / binary_name
        shutil.copy2(src, dst)
        chmod_executable(dst)
        return dst


def install_binary_file(binary_path: Path, binary_name: str, local_bin: Path) -> Path:
    dst = local_bin / binary_name
    shutil.copy2(binary_path, dst)
    chmod_executable(dst)
    return dst


def select_asset(release: dict, pattern: str) -> dict:
    regex = re.compile(pattern)
    for asset in release.get("assets", []):
        if regex.search(asset.get("name", "")):
            return asset
    names = ", ".join(a.get("name", "?") for a in release.get("assets", []))
    raise RuntimeError(f"No asset matched /{pattern}/. Available: {names}")


def get_version(binary: Path) -> str:
    version_args = [["--version"], ["-V"], ["version"]]
    for args in version_args:
        try:
            out = subprocess.check_output([str(binary), *args], stderr=subprocess.STDOUT, text=True, timeout=10)
            first_line = out.strip().splitlines()[0]
            return first_line
        except Exception:
            continue
    return "installed"


def ensure_path_in_shell_rc(path_entry: str) -> None:
    rc_files = [Path.home() / ".zprofile", Path.home() / ".zshrc"]
    line = f'export PATH="{path_entry}:$PATH"'
    for rc in rc_files:
        if rc.exists():
            content = rc.read_text(encoding="utf-8")
            if path_entry in content:
                continue
        with rc.open("a", encoding="utf-8") as f:
            f.write("\n# Added by Codex dev tools installer\n")
            f.write(line + "\n")


def main() -> int:
    if sys.platform != "darwin":
        print("This installer targets macOS only.", file=sys.stderr)
        return 1

    local_bin = Path.home() / ".local" / "bin"
    local_bin.mkdir(parents=True, exist_ok=True)

    installed = []
    with tempfile.TemporaryDirectory(prefix="dev_tools_") as tmp_dir:
        tmp = Path(tmp_dir)
        for tool in TOOLS:
            print(f"Installing {tool['name']}...")
            release = fetch_json(f"{API_BASE}/{tool['repo']}/releases/latest")
            asset = select_asset(release, tool["asset_pattern"])
            asset_path = tmp / asset["name"]
            download(asset["browser_download_url"], asset_path)

            if tool["kind"] == "tar.gz":
                binary = install_tar_binary(asset_path, tool["bin"], local_bin)
            elif tool["kind"] == "binary":
                binary = install_binary_file(asset_path, tool["bin"], local_bin)
            else:
                raise RuntimeError(f"Unsupported installer kind: {tool['kind']}")

            installed.append((tool["name"], binary))

    ensure_path_in_shell_rc(str(local_bin))

    print("\nInstalled tools:")
    for name, binary in installed:
        print(f"- {name}: {get_version(binary)}")

    print(f"\nAdd to current shell now: export PATH=\"{local_bin}:$PATH\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
