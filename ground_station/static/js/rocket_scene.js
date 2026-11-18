import {createParafoil} from './parafoil.js';
// ORK 외부 치수 기반 모델. 캐노피 변형은 보고값의 시각화이며 공력 모델이 아니다.
import * as THREE from 'three';
import {OrbitControls} from '../vendor/three/OrbitControls.js';
export class RocketScene {
    constructor(host) {
        this.host=host;this.snapshot=null;this.ready=false;this.canopies=[];
        this.init().catch(error=>{document.getElementById('model-status').textContent='3D 표시 불가 · '+error.message;console.warn(error);});
    }
    async init(){
        const response=await fetch('/static/models/rocket.json');if(!response.ok)throw Error('모델 치수 로딩 실패');
        this.model=await response.json();const m=this.model;
        this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
        this.host.append(this.renderer.domElement);
        this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(36,1,.01,100);
        this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.minDistance=1.5;this.controls.maxDistance=12;
        this.reset();document.getElementById('model-reset').onclick=()=>this.reset();
        this.scene.add(new THREE.HemisphereLight(0xe9edf7,0x1b2233,2.3));
        const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(3,5,3);this.scene.add(key);
        const rim=new THREE.DirectionalLight(0x91b7ff,2);rim.position.set(-3,2,-3);this.scene.add(rim);
        this.rocket=new THREE.Group();this.scene.add(this.rocket);
        const white=new THREE.MeshStandardMaterial({color:0xd9dedc,metalness:.45,roughness:.31});
        const dark=new THREE.MeshStandardMaterial({color:0x253335,metalness:.7,roughness:.32});
        const orange=new THREE.MeshStandardMaterial({color:0x9ca4b2,metalness:.25,roughness:.4});
        const mesh=(g,mat,y)=>{const o=new THREE.Mesh(g,mat);o.position.y=y;this.rocket.add(o);return o;};
        const base=-m.length/2,bodyBottom=base+m.tail.length,bodyTop=bodyBottom+m.body.length;
        mesh(new THREE.CylinderGeometry(m.body.radius,m.body.radius,m.body.length,48),white,bodyBottom+m.body.length/2);
        mesh(new THREE.CylinderGeometry(m.tail.foreradius,m.tail.aftradius,m.tail.length,48),dark,base+m.tail.length/2);
        const profile=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI/2;profile.push(new THREE.Vector2(m.nose.radius*Math.cos(a),m.nose.length*Math.sin(a)));}
        mesh(new THREE.LatheGeometry(profile,48),orange,bodyTop);
        for(const y of [bodyBottom+.43,bodyTop-.09])mesh(new THREE.CylinderGeometry(m.body.radius+.0005,m.body.radius+.0005,.025,48),dark,y);
        const f=m.fins,shape=new THREE.Shape(),r=m.body.radius;
        shape.moveTo(r,f.rootchord);shape.lineTo(r+f.height,f.rootchord-f.sweeplength);shape.lineTo(r+f.height,f.rootchord-f.sweeplength-f.tipchord);shape.lineTo(r,0);shape.closePath();
        const finGeo=new THREE.ExtrudeGeometry(shape,{depth:f.thickness,bevelEnabled:false});finGeo.translate(0,0,-f.thickness/2);
        for(let i=0;i<f.fincount;i++){const fin=mesh(finGeo,dark,bodyBottom);fin.rotation.y=f.rotation+i*Math.PI*2/f.fincount;}
        const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3,.004,8,128),new THREE.MeshBasicMaterial({color:0x6a7d91}));ring.rotation.x=Math.PI/2;ring.position.y=-1.01;this.scene.add(ring);
        const grid=new THREE.GridHelper(3.4,20,0x3c4a60,0x1d2939);grid.position.y=-1.02;this.scene.add(grid);
        const pad=new THREE.Mesh(new THREE.CircleGeometry(1.5,96),new THREE.MeshStandardMaterial({color:0x152031,roughness:.8,transparent:true,opacity:.5}));pad.rotation.x=-Math.PI/2;pad.position.y=-1.025;this.scene.add(pad);
        m.parachutes.filter((_,i)=>i===0).forEach(p=>this.createCanopy(p,'drogue',-.8));
        this.createWing();
        document.getElementById('model-dimensions').textContent=`ORK · ${(m.length*1000).toFixed(0)} mm / Ø ${(m.body.radius*2000).toFixed(0)} mm / ${f.fincount} FINS`;
        this.ready=true;this.update(this.snapshot);
        const resize=()=>{const {width,height}=this.host.getBoundingClientRect();this.renderer.setSize(width,height);this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();};
        new ResizeObserver(resize).observe(this.host);resize();
        this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
    }
    reset(){this.camera.position.set(3.4,1.8,4.4);this.controls.target.set(0,.55,0);this.controls.update();}
    createCanopy(p,key,offset){
        const group=new THREE.Group(),radius=p.diameter/2;
        const mat1=new THREE.MeshStandardMaterial({color:0xf58149,side:THREE.DoubleSide,roughness:.85});
        const mat2=new THREE.MeshStandardMaterial({color:0xe2e4d2,side:THREE.DoubleSide,roughness:.85});
        const n=p.linecount;
        for(let i=0;i<n;i++){
            const g=new THREE.SphereGeometry(radius,12,14,i/n*Math.PI*2,Math.PI*2/n,0,Math.PI/2);
            g.scale(1,.55,1);group.add(new THREE.Mesh(g,i%2?mat2:mat1));
        }
        this.scene.add(group);
        const positions=new Float32Array(n*6),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc6d0b9,transparent:true,opacity:.75}));this.scene.add(lines);
        this.canopies.push({key,p,group,lines,positions,offset});
    }
    createWing(){
        const {group,attachments}=createParafoil();this.scene.add(group);
        const geometry=new THREE.BufferGeometry(),positions=new Float32Array(attachments.length*6);
        geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc8cedb,transparent:true,opacity:.6}));this.scene.add(lines);
        this.canopies.push({key:'main',p:{linelength:1.05},group,lines,positions,offset:0,attachments});
    }
    update(s){
        this.snapshot=s;if(!this.ready)return;
        const imu=s?.imu,valid=['roll_deg','pitch_deg','yaw_deg'].every(k=>Number.isFinite(imu?.[k]));
        if(valid){
            // FRD -> NED (Rz yaw Ry pitch Rx roll), then ENU and Three Y-up.
            const rad=Math.PI/180,q=new THREE.Quaternion().setFromEuler(new THREE.Euler(imu.roll_deg*rad,imu.pitch_deg*rad,imu.yaw_deg*rad,'ZYX'));
            const transform=v=>{v.applyQuaternion(q);return new THREE.Vector3(v.y,-v.z,-v.x);};
            const matrix=new THREE.Matrix4().makeBasis(transform(new THREE.Vector3(0,1,0)),transform(new THREE.Vector3(1,0,0)),transform(new THREE.Vector3(0,0,-1)));
            this.rocket.quaternion.setFromRotationMatrix(matrix);
        }else this.rocket.quaternion.identity();
        document.getElementById('model-status').textContent=valid?'탑재 자세 보고 · 드래그 회전 / 휠 확대':'자세 미수신 · 기본 형상 표시';
        const anchor=new THREE.Vector3(0,this.model.length/2,0).applyQuaternion(this.rocket.quaternion);
        for(const c of this.canopies){
            const report=s?.recovery?.[c.key];
            // 전개 상태가 없으면 FSM DEPLOY라도 임의로 캐노피를 열지 않는다.
            const known=report&&['DEPLOYING','DEPLOYED'].includes(report.state);
            const amount=known?(Number.isFinite(report.inflation)?report.inflation:report.state==='DEPLOYED'?1:0):0;
            c.group.visible=c.lines.visible=amount>0;
            c.group.scale.set(Math.max(.015,amount),Math.max(.04,amount),Math.max(.015,amount));
            const radius=(c.p.diameter||0)/2*amount;
            c.group.position.set(anchor.x+c.offset*amount,anchor.y+c.p.linelength,anchor.z);
            if(c.attachments){
                // 캐노피 자세 센서가 없으므로 기체 자세를 캐노피 자세로 간주하지 않는다.
                c.group.updateMatrixWorld(true);
                c.attachments.forEach((a,i)=>{
                    const end=c.group.localToWorld(a.clone());
                    const spread=a.x<0?-.035:.035;
                    c.positions.set([anchor.x+spread,anchor.y,anchor.z,end.x,end.y,end.z],i*6);
                });
            }
            for(let i=0;i<(c.p.linecount||0);i++){
                const a=i/c.p.linecount*Math.PI*2,j=i*6;
                c.positions.set([anchor.x,anchor.y,anchor.z,c.group.position.x+radius*Math.cos(a),c.group.position.y,c.group.position.z+radius*Math.sin(a)],j);
            }
            c.lines.geometry.attributes.position.needsUpdate=true;c.lines.geometry.computeBoundingSphere();
        }
    }
}
