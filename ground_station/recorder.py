"""비행 데이터 SQLite 기록. 수신 작업과 디스크 쓰기를 큐로 분리한다."""
from contextlib import closing
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from queue import Queue, Empty, Full
import sqlite3
from threading import Event, Lock, Thread
from time import monotonic, time_ns


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def backup_database(source, destination):
    """WAL 파일을 단순 복사하지 않고 SQLite backup API로 일관된 사본을 만든다."""
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if source == destination or destination.exists():
        raise ValueError('백업 경로는 원본과 다르고 새 파일이어야 합니다.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(source.as_uri()+'?mode=ro', uri=True, timeout=5)
    dst = None
    try:
        dst = sqlite3.connect(destination)
        src.backup(dst, pages=128, sleep=.01)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('백업 무결성 검사 실패')
    finally:
        if dst is not None: dst.close()
        src.close()
    return str(destination)


class FlightRecorder(Thread):
    def __init__(self, directory, mode, session_id, queue_size=4096, backup_interval=60):
        super().__init__(name='flight-db-writer', daemon=True)
        self.directory = Path(directory).resolve()/mode.lower()
        self.path = self.directory/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'_'+session_id+'.sqlite3')
        self.mode, self.session_id = mode, session_id
        self.queue = Queue(maxsize=queue_size)
        self.stopping = Event()
        self.ready = Event()
        self.lock = Lock()
        self.backup_interval = backup_interval
        self.info = dict(status='STARTING', path=str(self.path), committed=0, dropped=0,
                         queued=0, error=None, backup_path=None, backup_utc=None, backup_error=None)

    def status(self):
        with self.lock: result = dict(self.info)
        result['queued'] = self.queue.qsize()
        return result

    def record(self, kind, payload):
        # JSON 직렬화로 호출자의 가변 객체와 분리한다. 키나 비밀값은 입력 계약에 없다.
        try:
            item = (utc_now(), monotonic(), kind, json.dumps(payload, ensure_ascii=False, allow_nan=False))
            with self.lock:
                if self.info['status'] in ('ERROR','CLOSED') or self.stopping.is_set():
                    self.info['dropped'] += 1
                    return
            self.queue.put_nowait(item)
        except (Full, ValueError, TypeError) as error:
            with self.lock:
                self.info['dropped'] += 1
                self.info['error'] = '기록 누락: '+str(error or 'queue full')

    def _backup(self, conn):
        target = self.directory/'backups'/(self.path.stem+'_'+str(time_ns())+'.sqlite3')
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(target)) as dst:
                conn.backup(dst, pages=128)
                if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise RuntimeError('백업 무결성 오류')
            for old in sorted(target.parent.glob(self.path.stem+'_*'+'.sqlite3'), key=lambda p:p.stat().st_mtime, reverse=True)[3:]:
                old.unlink()
            with self.lock:
                self.info.update(backup_path=str(target), backup_utc=utc_now(), backup_error=None)
        except (OSError, sqlite3.Error, RuntimeError) as error:
            with self.lock: self.info['backup_error'] = str(error)

    def run(self):
        conn = None
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=5)
            conn.execute('PRAGMA journal_mode=WAL')
            conn.execute('PRAGMA synchronous=FULL')
            conn.executescript('''
                CREATE TABLE session (session_id TEXT PRIMARY KEY, source_mode TEXT NOT NULL,
                    started_utc TEXT NOT NULL, closed_utc TEXT, clean_shutdown INTEGER NOT NULL DEFAULT 0,
                    dropped_records INTEGER NOT NULL DEFAULT 0, schema_version INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE records (id INTEGER PRIMARY KEY, received_utc TEXT NOT NULL,
                    pc_monotonic_s REAL NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL);
                CREATE INDEX records_kind ON records(kind,id);
            ''')
            conn.execute('INSERT INTO session(session_id,source_mode,started_utc) VALUES(?,?,?)',
                         (self.session_id,self.mode,utc_now()))
            conn.commit()
            with self.lock: self.info['status']='RECORDING'
            self.ready.set()
            last_backup = monotonic()
            while not self.stopping.is_set() or not self.queue.empty():
                batch=[]
                try: batch.append(self.queue.get(timeout=.2))
                except Empty: pass
                for _ in range(255):
                    try: batch.append(self.queue.get_nowait())
                    except Empty: break
                if batch:
                    conn.executemany('INSERT INTO records(received_utc,pc_monotonic_s,kind,payload_json) VALUES(?,?,?,?)',batch)
                    with self.lock: dropped = self.info["dropped"]
                    conn.execute("UPDATE session SET dropped_records=?", (dropped,))
                    conn.commit()
                    with self.lock: self.info['committed']+=len(batch)
                if monotonic()-last_backup >= self.backup_interval:
                    self._backup(conn)
                    last_backup=monotonic()
            with self.lock: dropped=self.info['dropped']
            conn.execute('UPDATE session SET closed_utc=?,clean_shutdown=1,dropped_records=?', (utc_now(),dropped))
            conn.commit()
            self._backup(conn)
            with self.lock: self.info['status']='CLOSED'
        except (OSError, sqlite3.Error, RuntimeError) as error:
            with self.lock: self.info.update(status='ERROR',error=str(error))
        finally:
            self.ready.set()
            if conn is not None: conn.close()

    def stop(self):
        self.stopping.set()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='SQLite 비행 DB 일관된 사본 생성')
    parser.add_argument('source');parser.add_argument('destination')
    args=parser.parse_args()
    print(backup_database(args.source,args.destination))
