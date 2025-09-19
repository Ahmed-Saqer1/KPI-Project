import logging
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime
from threading import RLock
from typing import Deque, Dict, List, Optional


@dataclass
class LogRecordItem:
    timestamp: str
    level: str
    logger: str
    module: str
    funcName: str
    lineNo: int
    process: int
    thread: str
    message: str


_buffer: Deque[LogRecordItem] = deque(maxlen=1000)
_lock = RLock()
_handler_attached = False


class RingBufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - basic container logic
        try:
            item = LogRecordItem(
                timestamp=datetime.utcfromtimestamp(record.created).isoformat() + "Z",
                level=record.levelname,
                logger=record.name,
                module=record.module,
                funcName=record.funcName,
                lineNo=record.lineno,
                process=record.process,
                thread=record.threadName,
                message=record.getMessage(),
            )
            with _lock:
                _buffer.append(item)
        except Exception:
            # Never raise from logging
            pass


def init_logging_buffer(capacity: int = 1000) -> None:
    """Attach a global ring buffer logging handler to the root logger.

    Safe to call multiple times; subsequent calls will just adjust capacity.
    """
    global _buffer, _handler_attached
    with _lock:
        # Adjust capacity by creating a new deque and copying content
        new_buf: Deque[LogRecordItem] = deque(_buffer, maxlen=capacity)
        _buffer = new_buf
        if not _handler_attached:
            logging.getLogger().addHandler(RingBufferHandler())
            _handler_attached = True


def _parse_since(since: Optional[str]) -> Optional[datetime]:
    if not since:
        return None
    s = since.strip()
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except Exception as e:
        raise ValueError("Invalid 'since' timestamp. Use ISO8601, e.g. 2025-08-29T12:00:00Z") from e


def get_recent_logs(limit: int = 100, level: Optional[str] = None, since: Optional[str] = None) -> List[Dict[str, str]]:
    if limit <= 0:
        return []
    level_norm = level.upper() if level else None
    ts_since = _parse_since(since)

    with _lock:
        items = list(_buffer)

    # Filter with newest last; we'll slice from end
    def _match(item: LogRecordItem) -> bool:
        if level_norm and item.level.upper() != level_norm:
            return False
        if ts_since:
            try:
                t = datetime.fromisoformat(item.timestamp.replace("Z", ""))
                if t < ts_since:
                    return False
            except Exception:
                return False
        return True

    filtered = [it for it in items if _match(it)]
    result = [asdict(it) for it in filtered[-limit:]]
    # Return newest first for convenience
    result.reverse()
    return result
