#!/usr/bin/env python3
"""Read one private staging provider credential from a terminal on the VPS."""

import getpass
import os
import sys
from pathlib import Path


ALLOWED_NAMES = {
    "resend-api-key",
    "sumsub-app-token",
    "sumsub-secret-key",
    "sumsub-webhook-secret",
    "media-s3-access-key-id",
    "media-s3-secret-access-key",
}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[2] not in ALLOWED_NAMES:
        raise SystemExit("Usage: install-provider-secret.py HOST_CONFIG_DIRECTORY SECRET_NAME")
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise SystemExit("Provider credentials must be entered from an interactive terminal.")

    parent = Path(sys.argv[1]).resolve()
    if not parent.is_dir() or parent.stat().st_mode & 0o077:
        raise SystemExit("The host configuration directory must exist and be owner-only.")
    destination = parent / "provider-secrets"
    if destination.is_symlink():
        raise SystemExit("Provider secret directory cannot be a symlink.")
    destination.mkdir(mode=0o700, exist_ok=True)
    if destination.stat().st_mode & 0o077:
        raise SystemExit("Provider secret directory must be owner-only.")
    path = destination / sys.argv[2]
    if path.exists() or path.is_symlink():
        raise SystemExit("Provider secret already exists; refusing implicit rotation.")

    value = getpass.getpass(f"Enter {sys.argv[2]}: ")
    if not value or value != value.strip() or not value.isprintable():
        raise SystemExit("Credential must be a nonempty, single-line printable value without surrounding whitespace.")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(value + "\n")
    path.chmod(0o644)
    print(f"Stored {sys.argv[2]} under the protected host directory.")


if __name__ == "__main__":
    main()
