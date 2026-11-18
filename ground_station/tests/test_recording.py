import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from recorder import FlightRecorder, backup_database
from state_store import StateStore
from transport import LineDecoder
from simulator import make_packet
from protocol import decode_frame


class RecordingTests(unittest.TestCase):
    def test_packets_raw_rejections_backup_and_shutdown(self):
        with tempfile.TemporaryDirectory() as directory:
            store=StateStore('REAL')
            recorder=FlightRecorder(directory,'REAL',store.get_snapshot()['session_id'])
            store.recorder=recorder;recorder.start();self.assertTrue(recorder.ready.wait(3))
            parser=LineDecoder(store);raw=json.dumps(make_packet(31,1,'boot')).encode()
            parser.feed(raw+b'\n'+raw+b'\ninvalid\n')
            recorder.stop();recorder.join(5);self.assertFalse(recorder.is_alive())
            self.assertEqual(recorder.status()['status'],'CLOSED')
            with sqlite3.connect(recorder.path) as db:
                rows=db.execute("SELECT payload_json FROM records WHERE kind='packet' ORDER BY id").fetchall()
                self.assertEqual([json.loads(r[0])['accepted'] for r in rows],[True,False])
                self.assertEqual(db.execute("SELECT count(*) FROM records WHERE kind='raw_frame'").fetchone()[0],3)
                self.assertEqual(db.execute("SELECT count(*) FROM records WHERE kind='rejection'").fetchone()[0],1)
                self.assertEqual(db.execute('SELECT source_mode,clean_shutdown FROM session').fetchone(),('REAL',1))
                count=db.execute('SELECT count(*) FROM records').fetchone()[0]
            backup=backup_database(recorder.path,Path(directory)/'copy.sqlite3')
            for path in (backup,recorder.status()['backup_path']):
                with sqlite3.connect(path) as db:
                    self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                    self.assertEqual(db.execute('SELECT count(*) FROM records').fetchone()[0],count)

    def test_disk_failure_and_queue_overflow_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'not_directory';file.write_text('x')
            r=FlightRecorder(file,'REAL','test');r.start();r.join(3)
            self.assertEqual(r.status()['status'],'ERROR');self.assertTrue(r.status()['error'])
            r.record('packet',{});self.assertEqual(r.status()['dropped'],1)
            q=FlightRecorder(directory,'SIM','queue',queue_size=1)
            q.record('packet',{});q.record('packet',{})
            self.assertEqual(q.status()['dropped'],1)

    def test_optional_arming_recovery_and_validation(self):
        p=make_packet(31,1,'boot');decoded=decode_frame(json.dumps(p).encode())
        self.assertEqual(decoded['recovery']['main']['inflation'],.5)
        self.assertTrue(decoded['arming']['armed'])
        p['recovery']['main']['inflation']=2
        with self.assertRaises(ValueError):decode_frame(json.dumps(p).encode())
        p=make_packet(31,1,'boot');del p['recovery'];del p['arming']
        s=StateStore('REAL');s.ingest(decode_frame(json.dumps(p).encode()))
        self.assertIsNone(s.get_snapshot()['recovery']);self.assertIsNone(s.get_snapshot()['arming'])

if __name__=='__main__':unittest.main()
