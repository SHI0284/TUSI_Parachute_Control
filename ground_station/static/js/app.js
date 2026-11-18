import {RocketScene} from './rocket_scene.js';
import {FlightMap,Trajectory,chart,vectorChart,finite,gpsValid,distance} from './visuals.js';

const $ = id => document.getElementById(id);
const STATES=['INIT','SAFE','ARMED','LAUNCH','COAST','APOGEE','DEPLOY','STABILIZATION','GUIDED_DESCENT','FINAL_DESCENT','GROUND','FAULT'];
const STALE_MS=1000; // 개발용 기준. 실제 무선 주기에 맞춰 별도 확정.
let latest=null,receivedAt=null,serverOK=false,revisionKey=null;
const map=new FlightMap(),trajectory=new Trajectory($('trajectory')),rocketScene=new RocketScene($('rocket-scene'));
const steps=STATES.map((name,i)=>{
    const el=document.createElement('div');el.className='state-step';
    const n=document.createElement('b');n.textContent=String(i).padStart(2,'0');el.append(n,document.createTextNode(name));
    $('state-bar').append(el);return el;
});
const text=(id,value)=>$(id).textContent=value;
const value=(m,unit)=>m?.valid===true&&m.unit===unit&&finite(m.value)?m.value:null;
const fmt=(v,d=1)=>finite(v)?v.toFixed(d):'—';

function renderEvents(events,flight){
    const visited=new Set(events.map(e=>e.state_code));
    steps.forEach((el,i)=>{
        el.className='state-step'+(visited.has(i)?' visited':'')+(flight.state_code===i?' active':'')+(i===11?' fault':'');
        if(flight.state_code===i)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
    });
    text('flight-label',flight.state_name==='UNKNOWN'?`UNKNOWN (${flight.state_code??'—'})`:flight.state_name);
    const fragment=document.createDocumentFragment();
    for(const event of [...events].reverse()){
        const row=document.createElement('div');row.className='event-row';
        const time=document.createElement('time');time.textContent=finite(event.source_time_ms)?(event.source_time_ms/1000).toFixed(1)+'s':'—';
        const before=document.createElement('span');before.textContent=event.previous+' →';
        const after=document.createElement('strong');after.textContent=event.state;
        row.append(time,before,after);fragment.append(row);
    }
    if(!events.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='상태 보고 대기';fragment.append(empty);}
    $('events').replaceChildren(fragment);text('event-count',events.length+' OBSERVED');
}
function render(s){
    text('source-mode',s.source_mode);text('session-id',s.session_id);text('vehicle-id',s.vehicle_id??'기체 보고 대기');
    text('source-note',s.source_mode==='SIM'?'합성 100초 미션 · 약 400m · 임의 GPS / IMU · 실제 비행 모델 아님':'USB 개발용 수신 모드 · RF 성능/인증 미검증 · 명령 송신 비활성');
    text('control-mode',s.flight.control_mode??'미확인');
    text('relative-altitude',fmt(value(s.navigation?.relative_altitude,'m')));
    text('vertical-speed',fmt(value(s.navigation?.vertical_speed,'m/s')));
    text('mission-time',finite(s.source_time_ms)?'T+ '+(s.source_time_ms/1000).toFixed(1).padStart(6,'0'):'T+ —');
    text('gps-coords',gpsValid(s.gps)?`${Math.abs(s.gps.lat).toFixed(6)}° ${s.gps.lat<0?'S':'N'} / ${Math.abs(s.gps.lon).toFixed(6)}° ${s.gps.lon<0?'W':'E'}`:'GNSS 유효 fix 없음');
    text('target-distance',gpsValid(s.gps)&&s.target?fmt(distance(s.gps,s.target)):'—');
    for(const key of ['roll','pitch','yaw'])text(key,fmt(s.imu?.[key+'_deg'])+'°');
    text('imu-status',s.imu?'탑재/모의 보고':'미수신');
    for(const [id,key] of [['accel','accel_mps2'],['gyro','gyro_dps']])text(id,s.imu?.[key]?.map(v=>fmt(v,2)).join(' / ')??'— / — / —');
    text('transport-status',s.transport.status);text('transport-detail',s.transport.detail);
    text('rx-count',s.transport.received);text('reject-count',s.transport.rejected);text('gap-count',s.transport.gaps);
    text('transport-error',s.transport.last_error??'');text('boot-id',s.boot_id??'미수신');text('duplicate-count',s.transport.duplicates);text('order-count',s.transport.out_of_order);
    const arm=s.arming;
    text('arming-state',arm?.armed===true?'ARMED':arm?.armed===false?'DISARMED':'미확인');
    text('arming-detail',(s.source_mode==='SIM'?'모의 동체 버튼':'동체 물리 버튼')+' · '+(arm?.button_pressed===true?'눌림':arm?.button_pressed===false?'놓임':'입력 미확인'));
    const recoveryLabel=r=>!r?'미확인':r.state+(finite(r.inflation)?' · '+Math.round(r.inflation*100)+'%':'');
    text('main-state',recoveryLabel(s.recovery?.main));text('drogue-state',recoveryLabel(s.recovery?.drogue));
    text('recovery-note',(s.source_mode==='SIM'?'SIM 합성 전개율':'탑재 전개 보고')+' · 물리적 확인: MAIN '+(s.recovery?.main?.physical_confirmed===true?'확인 보고':s.recovery?.main?.physical_confirmed===false?'미확인 보고':'정보 없음')+' / DROGUE '+(s.recovery?.drogue?.physical_confirmed===true?'확인 보고':s.recovery?.drogue?.physical_confirmed===false?'미확인 보고':'정보 없음'));
    renderController(s.controller);
    const log=s.logging||{};
    text('recording-state',log.status??'DISABLED');text('record-count',log.committed??0);text('record-queue',log.queued??0);text('record-dropped',log.dropped??0);
    text('record-path',log.path??'기록기 미연결');text('backup-path',log.backup_path??'첫 백업 대기');text('backup-time',log.backup_utc??'—');
    text('record-health',log.error||log.backup_error||(log.dropped?'기록 누락 발생 · 원본 완전성 확인 필요':log.status==='RECORDING'?'SQLite 기록 중 · 수신 처리와 별도 스레드':'기록 상태: '+(log.status??'DISABLED')));
    $('record-health').classList.toggle('record-error',!!(log.error||log.backup_error||log.dropped||log.status==='ERROR'));
    const key=s.session_id+':'+s.boot_id+':'+s.snapshot_revision;
    if(key!==revisionKey){
        revisionKey=key;map.update(s);trajectory.update(s);rocketScene.update(s);
        renderEvents(s.events||[],s.flight);
        renderCharts(s);

    }
}
function renderController(c){
    text('controller-status',c?.status??'미수신');text('controller-source',c?.input_source??'—');
    text('target-heading',fmt(c?.target_heading_deg)+'°');text('control-heading',fmt(c?.heading_deg)+'°');text('heading-error',fmt(c?.heading_error_deg)+'°');
    text('turn-command',fmt(c?.turn_command,2));
    $('steering-cursor').style.visibility=finite(c?.turn_command)?'visible':'hidden';
    $('steering-cursor').style.left=(finite(c?.turn_command)?(c.turn_command+1)*50:50)+'%';
    for(const side of ['left','right']){
        const servo=c?.[side],command=servo?.command_deg,actual=servo?.actual_deg;
        text(side+'-command',finite(command)?fmt(command)+'°':'—');text(side+'-pwm',finite(servo?.pwm_us)?fmt(servo.pwm_us,0)+' μs':'미제공');
        text(side+'-feedback',finite(actual)?fmt(actual)+'°':'미제공');
        $(side+'-command-bar').style.width=(finite(command)?command/180*100:0)+'%';
        $(side+'-feedback-marker').style.visibility=finite(actual)?'visible':'hidden';
        $(side+'-feedback-marker').style.left=(finite(actual)?actual/180*100:0)+'%';
    }
}
function freshness(){
    text('clock',new Date().toLocaleTimeString('ko-KR',{hour12:false}));
    const age=finite(latest?.telemetry_age_ms)&&receivedAt!==null?latest.telemetry_age_ms+performance.now()-receivedAt:null;
    text('data-age',age===null?'—':Math.round(age));
    const stale=age===null||age>=STALE_MS||!serverOK;
    document.body.classList.toggle('data-old',stale);
    const controlAge=finite(latest?.controller?.sample_time_ms)&&age!==null?age+latest.source_time_ms-latest.controller.sample_time_ms:null;
    const controlOld=!serverOK||controlAge===null||controlAge>=STALE_MS;
    document.querySelector('.controller-panel').classList.toggle('control-old',controlOld);
    text('controller-freshness',controlAge===null?'제어 샘플 미수신':!serverOK?'PC 연결 끊김 · 마지막 보고값':controlOld?'제어 갱신 지연 · '+(controlAge/1000).toFixed(1)+'초 전':'제어 샘플 '+Math.round(controlAge)+' ms 전');
    $('data-warning').className=stale?'warning':'warning fresh';
    text('data-warning',!serverOK?'PC 서버 조회 실패/대기 · 마지막 표시값의 최신 여부를 확인할 수 없습니다.':age===null?'입력 대기 · USB 연결과 유효 텔레메트리 수신은 별개입니다.':stale?`수신 갱신 지연 · ${(age/1000).toFixed(1)}초 전 데이터 / 상태·위치·자세는 마지막 보고값`:'텔레메트리 수신 중 · 상태 전이·위치·자세는 입력 장치 보고 기준');
}
function validate(s){
    if(!s||s.api_version!==1||!['SIM','REAL','REPLAY'].includes(s.source_mode)||!s.flight||!s.transport||typeof s.session_id!=='string'||!Array.isArray(s.history)||!Array.isArray(s.events))throw Error('지원하지 않는 API 형식 · 서버 재시작 필요');
}
async function poll(){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2000);
    try{
        const response=await fetch('/api/v1/snapshot',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        const s=await response.json();validate(s);
        // 화면 오류를 통신 오류로 오인하지 않도록 별도 표시한다.
        serverOK=true;latest=s;receivedAt=performance.now();text('server-status','● PC ONLINE');
        try{render(s);}catch(error){text('server-status','화면 처리 오류: '+error.message);console.error(error);}
    }catch(error){serverOK=false;text('server-status',error.name==='AbortError'?'PC TIMEOUT':'PC OFFLINE · '+error.message);}
    finally{clearTimeout(timeout);freshness();setTimeout(poll,250);}
}
function renderCharts(s){
    const h=s.history||[],events=s.events||[];
    chart($('altitude-chart'),h,'altitude','#afc7e5','ALT / m',events);
    chart($('speed-chart'),h,'speed','#e7a58a','V/S / m/s',events);
    vectorChart($('accel-chart'),h,'accel_mps2','ACCEL / m/s²');
    vectorChart($('gyro-chart'),h,'gyro_dps','GYRO / °/s');
}
window.addEventListener('resize',()=>{if(latest)renderCharts(latest);});
setInterval(freshness,200);poll();
