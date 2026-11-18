// 외부 3D 엔진 없이 ENU 좌표를 회전·직교 투영하는 작은 시각화 모듈.
const CYAN = '#59e0cb', AMBER = '#f1be72';
export const finite = Number.isFinite;
export const gpsValid = g => !!g && g.valid === true && finite(g.lat) && finite(g.lon);
export function enu(g, origin) {
    const r = Math.PI / 180, earth = 6371000;
    const dlon = ((g.lon - origin.lon + 540) % 360) - 180;
    return [dlon*r*earth*Math.cos(origin.lat*r), (g.lat-origin.lat)*r*earth];
}
export function distance(a, b) {
    const r=Math.PI/180,dl=(a.lat-b.lat)*r,dn=(a.lon-b.lon)*r;
    const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;
    return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
const GAP_SECONDS=1; // 개발용 단절 기준. 실제 전송 주기 확정 후 조정.
function setup(canvas) {
    const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (canvas.width !== Math.round(w*ratio) || canvas.height !== Math.round(h*ratio)) {
        canvas.width = Math.round(w*ratio); canvas.height = Math.round(h*ratio);
    }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,w,h); ctx.font='10px monospace';
    return {ctx,w,h};
}
function line(ctx, points, color, width=1) {
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p)); ctx.stroke();
}
function dot(ctx,p,color,r=4){ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.fill();}
function empty(ctx,w,h,label){ctx.fillStyle='#91a4b9';ctx.textAlign='center';ctx.fillText(label,w/2,h/2);ctx.textAlign='left';}
function projector(w,h,az,el,scale,center=[0,0,0]) {
    return point => {
        const [x,y,z] = point.map((v,i)=>v-center[i]);
        const side=x*Math.cos(az)-y*Math.sin(az), depth=x*Math.sin(az)+y*Math.cos(az);
        return [w/2+side*scale,h/2+(depth*Math.sin(el)-z*Math.cos(el))*scale];
    };
}
export class FlightMap {
    constructor() {
        this.map=L.map('gps-map',{minZoom:2,maxZoom:19}).setView([0,0],2);
        this.grid=L.gridLayer({attribution:'좌표 지도 · 배경 없음'});
        this.grid.createTile=coords=>{
            const tile=document.createElement('canvas');tile.width=tile.height=256;
            const c=tile.getContext('2d');c.fillStyle='#101e29';c.fillRect(0,0,256,256);
            c.strokeStyle='#263a49';c.strokeRect(0,0,256,256);c.strokeStyle='#1b2d3b';
            for(let x=32;x<256;x+=32){c.beginPath();c.moveTo(x,0);c.lineTo(x,256);c.moveTo(0,x);c.lineTo(256,x);c.stroke();}
            c.fillStyle='#6e8798';c.font='10px monospace';
            const ll=this.map.unproject([coords.x*256,coords.y*256],coords.z);
            c.fillText(`${ll.lat.toFixed(4)} / ${ll.lng.toFixed(4)}`,10,20);
            return tile;
        };
        this.grid.addTo(this.map);L.control.scale({imperial:false}).addTo(this.map);
        this.track=L.polyline([],{color:CYAN,weight:2.5}).addTo(this.map);
        this.marker=L.circleMarker([0,0],{radius:6,color:'#e8fff9',fillColor:CYAN,fillOpacity:1});
        this.target=L.circleMarker([0,0],{radius:8,color:AMBER,fillOpacity:.1}).bindTooltip('보고된 목표');
        this.first=L.circleMarker([0,0],{radius:4,color:'#8da7bd'}).bindTooltip('첫 유효 GPS · 화면 원점');
        this.key=null;this.centered=false;
        this.tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
            maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        this.tiles.on('tileerror',()=>document.getElementById('map-status').textContent='배경 지도 로드 실패 · 좌표/궤적은 계속 표시');
        document.getElementById('map-online').addEventListener('change',e=>{
            if(e.target.checked)this.tiles.addTo(this.map);else this.map.removeLayer(this.tiles);
            document.getElementById('map-status').textContent=e.target.checked?'OpenStreetMap 배경 · 인터넷 필요':'오프라인 좌표 지도 · 배경 타일 없음';
        });
        document.getElementById('map-fit').addEventListener('click',()=>{
            const bounds=this.track.getBounds();if(this.map.hasLayer(this.target))bounds.extend(this.target.getLatLng());if(bounds.isValid())this.map.fitBounds(bounds.pad(.25),{maxZoom:17});
        });
    }
    update(s) {
        const key=s.session_id+':'+s.boot_id;
        if(this.key!==key){this.key=key;this.centered=false;this.map.removeLayer(this.first);}
        const segments=[];let segment=[],previous=null;
        for(const p of s.history||[]){
            if(!gpsValid(p.gps)){if(segment.length)segments.push(segment);segment=[];previous=null;continue;}
            if(previous!==null && (BigInt(p.seq)!==BigInt(previous.seq)+1n || p.t-previous.t>GAP_SECONDS)){if(segment.length)segments.push(segment);segment=[];}
            segment.push([p.gps.lat,p.gps.lon]);previous=p;
        }
        if(segment.length)segments.push(segment);this.track.setLatLngs(segments);
        if(gpsValid(s.gps)){
            const ll=[s.gps.lat,s.gps.lon];this.marker.setLatLng(ll).addTo(this.map);
            if(!this.centered){const first=(s.history||[]).find(p=>gpsValid(p.gps))?.gps||s.gps;const bounds=this.track.getBounds();if(s.target)bounds.extend([s.target.lat,s.target.lon]);if(bounds.isValid())this.map.fitBounds(bounds,{padding:[35,35],maxZoom:17});else this.map.setView(ll,17);this.first.setLatLng([first.lat,first.lon]).addTo(this.map);this.centered=true;}
        }else this.map.removeLayer(this.marker);
        if(s.target && finite(s.target.lat) && finite(s.target.lon))this.target.setLatLng([s.target.lat,s.target.lon]).addTo(this.map);
        else this.map.removeLayer(this.target);
    }
}
export class Trajectory {
    constructor(canvas) {
        this.canvas=canvas;this.az=.7;this.el=.5;this.zoom=1;this.s=null;this.origin=null;this.key=null;
        let drag=null;
        canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
        canvas.addEventListener('pointermove',e=>{if(!drag)return;this.az+=(e.clientX-drag[0])*.008;this.el=Math.max(.08,Math.min(1.4,this.el+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];this.draw();});
        for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
        canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.4,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));this.draw();},{passive:false});
        document.getElementById('orbit-reset').addEventListener('click',()=>{this.az=.7;this.el=.5;this.zoom=1;this.draw();});
        new ResizeObserver(()=>this.draw()).observe(canvas);
    }
    update(s){this.s=s;const key=s.session_id+':'+s.boot_id;if(this.key!==key){this.key=key;this.origin=null;}if(!this.origin){this.origin=(s.history||[]).find(p=>gpsValid(p.gps))?.gps||null;}this.draw();}
    draw(){
        const {ctx,w,h}=setup(this.canvas),s=this.s;if(!s||!this.origin){empty(ctx,w,h,'GPS + 고도 수신 대기');return;}
        const points=(s.history||[]).map(p=>gpsValid(p.gps)&&finite(p.altitude)?{point:[...enu(p.gps,this.origin),p.altitude],seq:p.seq,t:p.t}:null);
        const valid=points.filter(Boolean);if(!valid.length){empty(ctx,w,h,'유효 궤적 없음');return;}
        const span=Math.max(100,...valid.flatMap(p=>p.point.map(Math.abs)));
        const center=[span*.25,span*.25,span*.4];
        const project=projector(w,h,this.az,this.el,Math.min(w,h)/(span*1.7)*this.zoom,center);
        for(let v=-span;v<=span;v+=span/5){line(ctx,[project([-span,v,0]),project([span,v,0])],'#2a4145');line(ctx,[project([v,-span,0]),project([v,span,0])],'#2a4145');}
        for(const [end,color,label] of [[[span,0,0],CYAN,'E'],[[0,span,0],AMBER,'N'],[[0,0,span],'#8aa6ed','UP']]){
            line(ctx,[project([0,0,0]),project(end)],color);ctx.fillStyle=color;ctx.fillText(label,...project(end));
        }
        let prev=null;
        for(const p of points){if(p&&prev&&BigInt(p.seq)===BigInt(prev.seq)+1n&&p.t-prev.t<=GAP_SECONDS)line(ctx,[project(prev.point),project(p.point)],CYAN,2);prev=p;}
        // 현재 fix 무효일 때 과거 위치를 현재 위치로 표시하지 않는다.
        if(gpsValid(s.gps)&&finite(s.navigation?.relative_altitude?.value)){
            const last=[...enu(s.gps,this.origin),s.navigation.relative_altitude.value];
            line(ctx,[project(last),project([last[0],last[1],0])],'#f1be7277');dot(ctx,project(last),AMBER,5);
        }
        ctx.fillStyle='#91a4b9';ctx.fillText(`GRID ${(span/5).toFixed(0)} m`,16,22);
    }
}
// 기체 FRD → NED 회전 Rz(yaw) Ry(pitch) Rx(roll) → ENU 표시 좌표.
export function bodyToEnu(point, roll, pitch, yaw){
    const r=roll*Math.PI/180,p=pitch*Math.PI/180,y=yaw*Math.PI/180;
    let [x,a,b]=point;let yy=a*Math.cos(r)-b*Math.sin(r),z=a*Math.sin(r)+b*Math.cos(r);
    let xx=x*Math.cos(p)+z*Math.sin(p);z=-x*Math.sin(p)+z*Math.cos(p);
    const north=xx*Math.cos(y)-yy*Math.sin(y),east=xx*Math.sin(y)+yy*Math.cos(y);
    return [east,north,-z];
}
export class Attitude {
    constructor(canvas){this.canvas=canvas;this.imu=null;new ResizeObserver(()=>this.draw()).observe(canvas);}
    update(imu){this.imu=imu;this.draw();}
    draw(){
        const {ctx,w,h}=setup(this.canvas),imu=this.imu;
        if(!imu||!['roll_deg','pitch_deg','yaw_deg'].every(k=>finite(imu[k]))){empty(ctx,w,h,'자세 미수신 · 원시 IMU만으로 자세를 추정하지 않음');return;}
        const project=projector(w,h,.65,.55,Math.min(w,h)/220);
        const rotate=p=>project(bodyToEnu(p,imu.roll_deg,imu.pitch_deg,imu.yaw_deg));
        ctx.strokeStyle='#28424b';for(let r=30;r<=85;r+=25){ctx.beginPath();ctx.ellipse(w/2,h/2,r*1.3,r*.55,0,0,Math.PI*2);ctx.stroke();}
        const faces=[[[85,0,0],[-35,-16,-12],[-35,16,-12]],[[85,0,0],[-35,16,-12],[-35,16,12]],[[85,0,0],[-35,-16,12],[-35,-16,-12]],[[10,0,0],[-40,-65,0],[-28,0,0],[-40,65,0]]];
        for(const face of faces){const pts=face.map(rotate);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle='#59e0cb1a';ctx.fill();ctx.strokeStyle=CYAN;ctx.stroke();}
        dot(ctx,rotate([85,0,0]),AMBER,4);
        for(const [axis,color,label] of [[[100,0,0],AMBER,'X'],[[0,75,0],CYAN,'Y'],[[0,0,65],'#97a9ed','Z']]){line(ctx,[rotate([0,0,0]),rotate(axis)],color);ctx.fillStyle=color;ctx.fillText(label,...rotate(axis));}
    }
}
export function chart(canvas,history,key,color,label,events=[]){
    const {ctx,w,h}=setup(canvas),left=48,right=w-16,top=18,bottom=h-26;
    const valid=history.filter(p=>finite(p[key]));if(!valid.length){empty(ctx,w,h,label+' · 데이터 대기');return;}
    const min=Math.min(0,...valid.map(p=>p[key])),max=Math.max(1,...valid.map(p=>p[key]));
    const start=history[0].t,end=Math.max(start+1,history.at(-1).t);
    const pos=p=>[left+(p.t-start)/(end-start)*(right-left),bottom-(p[key]-min)/(max-min)*(bottom-top)];
    for(let i=0;i<=2;i++){const value=min+(max-min)*i/2,y=bottom-i/2*(bottom-top);line(ctx,[[left,y],[right,y]],'#263849');ctx.fillStyle='#91a4b9';ctx.fillText(value.toFixed(max-min<5?1:0),8,y+3);}
    ctx.setLineDash([3,4]);for(const e of events){const t=e.source_time_ms/1000;if(t>=start&&t<=end){const x=left+(t-start)/(end-start)*(right-left);line(ctx,[[x,top],[x,bottom]],'#70849366');}}ctx.setLineDash([]);
    let prev=null;for(const p of history){if(finite(p[key])&&prev&&BigInt(p.seq)===BigInt(prev.seq)+1n&&p.t-prev.t<=GAP_SECONDS)line(ctx,[pos(prev),pos(p)],color,1.8);prev=finite(p[key])?p:null;}
    ctx.fillStyle=color;ctx.fillText(label,left,12);ctx.fillStyle='#91a4b9';ctx.fillText(start.toFixed(1)+' s',left,h-6);ctx.fillText(end.toFixed(1)+' s',Math.max(left,right-55),h-6);
}

export function vectorChart(canvas,history,key,label){
    const {ctx,w,h}=setup(canvas),colors=[CYAN,AMBER,'#b6a1f2'];
    const values=history.flatMap(p=>p.imu?.[key]||[]).filter(finite);
    if(!values.length){empty(ctx,w,h,label+' · 데이터 대기');return;}
    const low=Math.min(-1,...values),high=Math.max(1,...values);
    const left=48,right=w-16,top=18,bottom=h-26,start=history[0].t,end=Math.max(start+1,history.at(-1).t);
    const pos=(p,v)=>[left+(p.t-start)/(end-start)*(right-left),bottom-(v-low)/(high-low)*(bottom-top)];
    for(let i=0;i<=2;i++){const v=low+(high-low)*i/2,y=bottom-i/2*(bottom-top);line(ctx,[[left,y],[right,y]],'#263849');ctx.fillStyle='#91a4b9';ctx.fillText(v.toFixed(1),4,y+3);}
    colors.forEach((color,axis)=>{
        let prev=null;
        for(const p of history){const v=p.imu?.[key]?.[axis];if(finite(v)&&prev&&BigInt(p.seq)===BigInt(prev.seq)+1n&&p.t-prev.t<=GAP_SECONDS)line(ctx,[pos(prev,prev.imu[key][axis]),pos(p,v)],color,1.5);prev=finite(v)?p:null;}
    });
    ctx.fillStyle='#91a4b9';ctx.fillText(label,left,12);ctx.fillText(start.toFixed(1)+' s',left,h-6);ctx.fillText(end.toFixed(1)+' s',Math.max(left,right-55),h-6);
}
