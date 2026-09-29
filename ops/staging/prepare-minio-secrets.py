#!/usr/bin/env python3
"""Create private MinIO root and scoped application credentials on the host."""

import os
import secrets
import sys
import tempfile
from pathlib import Path


def write_secret(directory: Path, name: str, value: str) -> None:
    path = directory / name
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(value + "\n")
    path.chmod(0o644)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-minio-secrets.py HOST_CONFIG_DIRECTORY")
    parent = Path(sys.argv[1]).resolve()
    if not parent.is_dir() or parent.stat().st_mode & 0o077:
        raise SystemExit("The host configuration directory must exist and be owner-only.")
    destination = parent / "minio-secrets"
    if destination.exists():
        raise SystemExit("MinIO staging secrets already exist; refusing to rotate them implicitly.")
    temporary = Path(tempfile.mkdtemp(prefix=".minio-secrets-", dir=parent))
    try:
        temporary.chmod(0o700)
        write_secret(temporary, "root-user", f"junction-root-{secrets.token_hex(8)}")
        write_secret(temporary, "root-password", secrets.token_urlsafe(48))
        write_secret(temporary, "media-access-key-id", f"junction-media-{secrets.token_hex(8)}")
        write_secret(temporary, "media-secret-access-key", secrets.token_urlsafe(48))
        temporary.rename(destination)
    except BaseException:
        for path in temporary.iterdir():
            path.unlink()
        temporary.rmdir()
        raise
    print(f"Prepared MinIO staging secrets in {destination}; minio-init creates the bucket policy and application user.")


if __name__ == "__main__":
    main()
