// 사용자 사진의 날개형 캐노피를 표현한다. 실측 CAD/공력 모델이 아니다.
import * as THREE from 'three';
export function createParafoil(){
    const group=new THREE.Group(),span=2.05,chord=.67,cells=12;
    const material=color=>new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.58,metalness:.03});
    const red=material(0xd62436),ivory=material(0xe9e8df),black=material(0x151b21);
    const point=(u,v,upper)=>{
        const x=(u-.5)*span,arch=.36*(1-(2*u-1)**2);
        const rib=.009*Math.cos(u*cells*Math.PI*2);
        const thickness=(.065+.11*Math.sin(Math.PI*v))*Math.sqrt(1-v)*(upper?1:-.35);
        return [x,arch+thickness+rib*(upper?1:-.25),(.5-v)*chord];
    };
    function surface(from,to,upper,mat){
        const positions=[],indices=[],nx=96,nv=14;
        for(let i=0;i<=nx;i++)for(let j=0;j<=nv;j++)positions.push(...point(i/nx,from+(to-from)*j/nv,upper));
        for(let i=0;i<nx;i++)for(let j=0;j<nv;j++){
            const a=i*(nv+1)+j,b=a+nv+1;indices.push(a,b,a+1,b,b+1,a+1);
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();group.add(new THREE.Mesh(g,mat));
    }
    for(const upper of [true,false]){surface(0,.34,upper,red);surface(.34,.4,upper,black);surface(.4,1,upper,ivory);}
    // Cell ribs join upper/lower skins, leaving the leading edge open.
    for(let i=0;i<=cells;i++){
        const positions=[],indices=[];
        for(let j=0;j<=32;j++)positions.push(...point(i/cells,j/32,true),...point(i/cells,j/32,false));
        for(let j=0;j<32;j++){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
        group.add(new THREE.Mesh(g,red));
    }
    // Open leading-edge cells: dark recessed mouths and rib seams.
    for(let i=0;i<cells;i++){
        const u=(i+.5)/cells,center=point(u,.025,false),w=span/cells*.44;
        const opening=new THREE.Shape();opening.absellipse(0,0,w,.03,0,Math.PI*2,false,0);
        const mouth=new THREE.Mesh(new THREE.ShapeGeometry(opening,24),black);mouth.position.set(center[0],center[1]+.035,chord*.48);group.add(mouth);
    }
    for(let i=0;i<=cells;i++){
        const pts=[];for(let j=0;j<=32;j++)pts.push(new THREE.Vector3(...point(i/cells,j/32,true)));
        const seam=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x8a7774,transparent:true,opacity:.5}));group.add(seam);
    }
    // Bridle attachment points are visual references, not actual line lengths.
    const attachments=[];for(const u of [.08,.22,.36,.64,.78,.92])for(const v of [.14,.8])attachments.push(new THREE.Vector3(...point(u,v,false)));
    group.userData.shape='REFERENCE_PARAFOIL';group.userData.dimensionsVerified=false;
    return {group,attachments};
}
