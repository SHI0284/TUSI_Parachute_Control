import json
import os
import pty
import time
import unittest
from copy import deepcopy
from protocol import decode_frame, MAX_FRAME_BYTES
from simulator import make_packet
from state_store import StateStore
from transport import LineDecoder, SerialReceiver
from app import create_app


class GroundStationTests(unittest.TestCase):
    def packet(self, t=10, seq=1, boot='boot-a'):
        return decode_frame(json.dumps(make_packet(t, seq, boot)).encode())

    def test_atomic_snapshot_copy_and_duplicate(self):
        s=StateStore();p=self.packet();self.assertTrue(s.ingest(p))
        a=s.get_snapshot();a['gps']['lat']=0
        self.assertNotEqual(s.get_snapshot()['gps']['lat'],0)
        self.assertFalse(s.ingest(p));self.assertEqual(s.get_snapshot()['snapshot_revision'],'1')
        self.assertEqual(s.get_snapshot()['transport']['duplicates'],1)

    def test_missing_state_not_invented_and_revisits(self):
        s=StateStore()
        for seq,code in enumerate([1,2,1,2,4,99]):
            p=self.packet(10+seq,seq);p['state_code']=code;s.ingest(p)
        a=s.get_snapshot()
        self.assertEqual([e['state_code'] for e in a['events']],[1,2,1,2,4,99])
        self.assertEqual(a['flight']['state_name'],'UNKNOWN')

    def test_boot_reset_and_old_session_rejected(self):
        s=StateStore();s.ingest(self.packet());s.ingest(self.packet(0,0,'boot-b'))
        self.assertEqual(len(s.get_snapshot()['history']),1)
        self.assertFalse(s.ingest(self.packet(20,2)))
        self.assertEqual(s.get_snapshot()['boot_id'],'boot-b')

    def test_out_of_order_and_gap(self):
        s=StateStore();s.ingest(self.packet(10,2));s.ingest(self.packet(12,5))
        self.assertFalse(s.ingest(self.packet(11,6)))
        self.assertFalse(s.ingest(self.packet(13,4)))
        self.assertEqual(s.get_snapshot()['transport']['gaps'],2)

    def test_fragmented_invalid_oversize_and_recovery(self):
        s=StateStore();d=LineDecoder(s)
        raw=json.dumps(make_packet(10,1,'a')).encode()+b'\n'
        for b in raw:d.feed(bytes([b]))
        d.feed(b'{bad}\n'+b'x'*(MAX_FRAME_BYTES+5)+b'\n')
        d.feed(json.dumps(make_packet(11,2,'a')).encode()+b'\n')
        self.assertEqual(s.get_snapshot()['transport']['received'],2)
        self.assertEqual(s.get_snapshot()['transport']['rejected'],2)
        self.assertLessEqual(len(d.buffer),MAX_FRAME_BYTES)

    def test_invalid_data_rejected_and_no_fix_clears(self):
        for edit in [('gps',{'valid':True,'lat':100,'lon':0}),('altitude_m',float('nan')),('state_code',True)]:
            p=make_packet(10,1,'a');p[edit[0]]=edit[1]
            with self.assertRaises(ValueError):decode_frame(json.dumps(p).encode())
        s=StateStore();s.ingest(self.packet())
        p=make_packet(11,2,'boot-a');p['gps']={'valid':False};p['imu']=None
        s.ingest(decode_frame(json.dumps(p).encode()))
        self.assertIsNone(s.get_snapshot()['gps']);self.assertIsNone(s.get_snapshot()['imu'])

    def test_legacy_age_copy_and_navigation(self):
        s=StateStore();s.update_navigation(relative_altitude_m=0,vertical_speed_mps=-2,source_time_ms=1)
        a=s.get_snapshot();time.sleep(.02)
        b=s.get_snapshot();self.assertGreater(b['navigation']['relative_altitude']['age_ms'],a['navigation']['relative_altitude']['age_ms'])
        self.assertEqual(b['snapshot_revision'],'1')

    def test_api_and_assets(self):
        s=StateStore();s.ingest(self.packet());client=create_app(s).test_client()
        self.assertEqual(client.get('/').status_code,200)
        for path in ['js/app.js','js/visuals.js','css/style.css','vendor/leaflet.js','vendor/leaflet.css']:
            r=client.get('/static/'+path);self.assertEqual(r.status_code,200);r.close()
        a=client.get('/api/v1/snapshot');b=client.get('/api/v1/snapshot')
        self.assertEqual(a.json['snapshot_revision'],b.json['snapshot_revision'])
        self.assertEqual(a.headers['Cache-Control'],'no-store')
        self.assertEqual(client.post('/api/v1/commands').status_code,404)

    def test_real_serial_receiver_through_pty(self):
        master,slave=pty.openpty();s=StateStore('REAL')
        receiver=SerialReceiver(s,os.ttyname(slave),115200);receiver.start()
        try:
            deadline=time.monotonic()+3
            while s.get_snapshot()['transport']['status']!='OPEN' and time.monotonic()<deadline:time.sleep(.01)
            self.assertEqual(s.get_snapshot()['transport']['status'],'OPEN')
            raw=json.dumps(make_packet(15,1,'pty-boot')).encode()+b'\n'
            os.write(master,raw[:70]);os.write(master,raw[70:])
            while s.get_snapshot()['transport']['received']!=1 and time.monotonic()<deadline:time.sleep(.02)
            a=s.get_snapshot();self.assertEqual(a['source_mode'],'REAL');self.assertEqual(a['transport']['received'],1)
            self.assertEqual(a['flight']['state_name'],'COAST')
        finally:
            receiver.stop();receiver.join(2);os.close(master);os.close(slave)
        self.assertFalse(receiver.is_alive())


if __name__=='__main__':unittest.main()
