"""Fixed-format signed messages between the Wanwu API and its bounded host controller."""
import datetime
import hashlib
import hmac
import json
import os
import pathlib
import re
import stat
import tempfile
import uuid


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def sign(payload, key):
    derived = hmac.new(key, b'wanwu-controller-key-v1', hashlib.sha256).digest()
    return {'payload': payload, 'mac': hmac.new(derived, canonical(payload), hashlib.sha256).hexdigest()}


def verify(value, key):
    if not isinstance(value, dict) or set(value) != {'payload', 'mac'} or not isinstance(value['payload'], dict):
        return None
    mac = value['mac']
    if not isinstance(mac, str) or not re.fullmatch('[a-f0-9]{64}', mac):
        return None
    return value['payload'] if hmac.compare_digest(mac, sign(value['payload'], key)['mac']) else None


def read_signed(path, key):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd) as file:
            info = os.fstat(file.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 32000 or info.st_mode & 0o007:
                return None
            return verify(json.load(file), key)
    except (OSError, ValueError, TypeError):
        return None


def write_signed(path, payload, key):
    fd, name = tempfile.mkstemp(prefix='.controller-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            os.fchown(file.fileno(), 0, 1000)
            os.fchmod(file.fileno(), 0o640)
            json.dump(sign(payload, key), file, ensure_ascii=False, allow_nan=False)
            file.write('\n')
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_key(root):
    path = root / '.env.api'
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise RuntimeError('Private Wanwu bootstrap configuration required')
    matches = re.findall(r'^WANWU_CONFIG_ENCRYPTION_KEY=([a-f0-9]{64})$', path.read_text(), re.M)
    if len(matches) != 1:
        raise RuntimeError('Wanwu configuration key is unavailable')
    return bytes.fromhex(matches[0])


def valid_request(value, now):
    if not isinstance(value, dict) or set(value) != {'format', 'id', 'revision', 'actor', 'createdAt'}:
        return False
    if value['format'] != 1 or type(value['revision']) is not int or not 0 <= value['revision'] <= 2**53-1:
        return False
    try:
        if any(str(uuid.UUID(value[k])) != value[k] for k in ['id', 'actor']):
            return False
        date = datetime.datetime.fromisoformat(value['createdAt'].replace('Z', '+00:00'))
        age = now - date.timestamp()
        return -5 <= age <= 300
    except (ValueError, TypeError, AttributeError):
        return False


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
