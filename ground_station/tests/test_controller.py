import json
import sqlite3
import tempfile
import unittest
from protocol import decode_frame
from simulator import make_packet
from state_store import StateStore
from transport import LineDecoder
from recorder import FlightRecorder

class ControllerTests(unittest.TestCase):
    def packet(self): return make_packet(45,1,'control-test')

    def test_missing_controller_clears_without_inventing_feedback(self):
        p=self.packet();s=StateStore();s.ingest(decode_frame(json.dumps(p).encode()))
        self.assertEqual(s.get_snapshot()['controller']['status'],'ACTIVE')
        self.assertIsNone(s.get_snapshot()['controller']['left']['actual_deg'])
        p.pop('controller');p['seq']=2;s.ingest(decode_frame(json.dumps(p).encode()))
        self.assertIsNone(s.get_snapshot()['controller'])

    def test_invalid_controller_rejected(self):
        for field,value in [('sample_time_ms',46000),('sample_time_ms',True),('status','FIRE'),('input_source','GCS'),('turn_command',2),('heading_error_deg',float('nan'))]:
            with self.subTest(field=field):
                p=self.packet();p['controller'][field]=value
                with self.assertRaises(ValueError):decode_frame(json.dumps(p).encode())
        for field,value in [('command_deg',181),('actual_deg',True),('pwm_us',-1)]:
            p=self.packet();p['controller']['left'][field]=value
            with self.assertRaises(ValueError):decode_frame(json.dumps(p).encode())

    def test_serial_frame_to_snapshot_and_database(self):
        with tempfile.TemporaryDirectory() as directory:
            s=StateStore('REAL');r=FlightRecorder(directory,'REAL',s.get_snapshot()['session_id']);s.recorder=r;r.start();self.assertTrue(r.ready.wait(2))
            p=self.packet();p['controller']['left']['actual_deg']=82.25;p['controller']['sample_time_ms']=43000
            raw=json.dumps(p).encode()+b'\n';decoder=LineDecoder(s);decoder.feed(raw[:20]);decoder.feed(raw[20:])
            r.stop();r.join(5)
            self.assertEqual(s.get_snapshot()['controller']['left']['actual_deg'],82.25)
            self.assertEqual(s.get_snapshot()['controller']['sample_time_ms'],43000)
            with sqlite3.connect(r.path) as db:
                row=db.execute("SELECT payload_json FROM records WHERE kind='packet'").fetchone()
                self.assertEqual(json.loads(row[0])['packet']['controller'],p['controller'])
