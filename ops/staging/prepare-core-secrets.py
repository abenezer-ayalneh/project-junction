#!/usr/bin/env python3
"""Create private staging database, Redis, and Better Auth secrets on the host."""

import os
import secrets
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote


def write_secret(directory: Path, name: str, value: str) -> None:
    path = directory / name
    # Local Compose file secrets retain source permissions inside containers.
    # The parent directory blocks host traversal; mounted files must be
    # readable by each service's unprivileged container user.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(value + "\n")
    path.chmod(0o644)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-core-secrets.py HOST_CONFIG_DIRECTORY")
    parent = Path(sys.argv[1]).resolve()
    if not parent.is_dir() or parent.stat().st_mode & 0o077:
        raise SystemExit("The host configuration directory must exist and be owner-only.")
    destination = parent / "core-secrets"
    if destination.exists():
        raise SystemExit("Core staging secrets already exist; refusing to rotate them implicitly.")

    postgres_password = secrets.token_urlsafe(36)
    redis_password = secrets.token_urlsafe(36)
    better_auth_secret = secrets.token_urlsafe(48)
    temporary = Path(tempfile.mkdtemp(prefix=".core-secrets-", dir=parent))
    try:
        temporary.chmod(0o700)
        write_secret(temporary, "postgres-password", postgres_password)
        write_secret(
            temporary,
            "database-url",
            f"postgresql://junction_app:{quote(postgres_password, safe='')}@postgres:5432/junction_staging",
        )
        write_secret(temporary, "redis-acl", f"user default off\nuser junction on >{redis_password} ~* &* +@all -@admin -@dangerous")
        write_secret(temporary, "redis-url", f"redis://junction:{quote(redis_password, safe='')}@redis:6379/0")
        write_secret(temporary, "better-auth-secret", better_auth_secret)
        temporary.rename(destination)
    except BaseException:
        for path in temporary.iterdir():
            path.unlink()
        temporary.rmdir()
        raise
    print(f"Prepared core staging secrets in {destination}; provider secrets remain required.")


if __name__ == "__main__":
    main()
