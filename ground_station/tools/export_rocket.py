"""OpenRocket 외형 치수를 추출한다. 원본과 시뮬레이션 코드는 수정하지 않는다."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'simulation/data/rocket.ork'
TARGET = ROOT / 'ground_station/static/models/rocket.json'


def export(source=SOURCE, target=TARGET):
    with zipfile.ZipFile(source) as archive:
        root = ET.fromstring(archive.read('rocket.ork'))
    parts = root.find('./rocket/subcomponents/stage/subcomponents')
    nose, body, tail = (parts.find(tag) for tag in ('nosecone', 'bodytube', 'transition'))
    fin = body.find('./subcomponents/trapezoidfinset')
    def num(node, key):
        return float(node.findtext(key).split()[-1])
    model = {
        'source': 'simulation/data/rocket.ork',
        'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'name': root.findtext('./rocket/name'), 'units': 'm',
        'nose': {'length': num(nose, 'length'), 'radius': num(nose, 'aftradius'), 'shape': nose.findtext('shape')},
        'body': {'length': num(body, 'length'), 'radius': num(body, 'radius')},
        'tail': {k:num(tail,k) for k in ('length','foreradius','aftradius')},
        'fins': {k:num(fin,k) for k in ('fincount','rootchord','tipchord','sweeplength','height','thickness','rotation')},
        'parachutes': [{'name':p.findtext('name'), **{k:num(p,k) for k in ('diameter','linecount','linelength')}} for p in root.findall('.//parachute')],
        'main_visualization': {'type': 'PHOTO_REFERENCE_PARAFOIL', 'span_m': None, 'chord_m': None, 'dimensions_verified': False, 'reference': 'https://images-na.ssl-images-amazon.com/images/I/61uHHe8CnZL.jpg'},
        'notes': ['ORK의 메인 parachute diameter는 날개형 캐노피의 실측 폭이 아님', '외부 표면만 재구성', '도색은 시각화용', '캐노피 곡면과 전개 애니메이션은 개념 표현; 공력/전개 시뮬레이션 아님'],
    }
    model['length'] = sum(model[p]['length'] for p in ('nose','body','tail'))
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
    return model


if __name__ == '__main__':
    m=export();print(f"Exported {m['length']:.6f} m, diameter {2*m['body']['radius']:.3f} m")
