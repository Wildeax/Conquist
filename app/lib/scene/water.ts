import * as T from 'three';
export const OCEAN_HORIZON = '#102e39';
export function createWater(centers: T.Vector2[], lite: boolean) {
  const material = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDetail: { value: lite ? 0 : 1 },
      uHorizon: { value: new T.Color(OCEAN_HORIZON) },
      uTiles: { value: centers },
      uSun: { value: new T.Vector3(-0.5, 0.7, 0.4).normalize() },
    },
    vertexShader: `varying vec3 vWorld;
uniform float uTime;
void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `precision highp float;
varying vec3 vWorld;uniform float uTime;uniform vec2 uTiles[19];uniform vec3 uSun;
uniform float uDetail;uniform vec3 uHorizon;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 gradient(vec2 cell){float angle=hash(cell)*6.2831853;return vec2(cos(angle),sin(angle));}
// Gradient noise avoids the flat cell centers of value noise. Quintic blending
// keeps both slope and curvature continuous across cell boundaries.
float noise(vec2 p){
  vec2 c=floor(p),f=fract(p);
  vec2 s=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(gradient(c),f);
  float b=dot(gradient(c+vec2(1.,0.)),f-vec2(1.,0.));
  float d=dot(gradient(c+vec2(0.,1.)),f-vec2(0.,1.));
  float e=dot(gradient(c+vec2(1.,1.)),f-vec2(1.,1.));
  return .5+.65*mix(mix(a,b,s.x),mix(d,e,s.x),s.y);
}
float wave(vec2 p,float detail){vec2 drift=vec2(uTime*.055,-uTime*.038);mat2 turn=mat2(.8,-.6,.6,.8);return noise(p*.85+drift)*.65+noise(turn*p*2.3-drift*1.4)*.25*detail+noise(turn*p*5.7+drift*1.7)*.10*detail*uDetail;}
// Schlick water reflectance, as used by the Three.js Water example.
float reflectance(float cosine){return .02+.98*pow(1.-max(cosine,0.),5.);}
void main(){vec2 p=vWorld.xz;float footprint=max(length(dFdx(p)),length(dFdy(p)));float detail=1.-smoothstep(.06,.38,footprint);float e=max(.04,footprint*.6);float w=wave(p,detail);float dx=(wave(p+vec2(e,0.),detail)-wave(p-vec2(e,0.),detail))/(2.*e);float dz=(wave(p+vec2(0.,e),detail)-wave(p-vec2(0.,e),detail))/(2.*e);vec3 n=normalize(vec3(-dx*.10,1.,-dz*.10));vec3 v=normalize(cameraPosition-vWorld);
// Broaden glints when normal variation would be smaller than a screen pixel.
vec3 nx=dFdx(n),nz=dFdy(n);
float variance=dot(nx,nx)+dot(nz,nz);
float gloss=1./(1./48.+variance*2.);
float spec=pow(max(dot(n,normalize(uSun+v)),0.),gloss)*(gloss/48.);
float fres=reflectance(dot(n,v));
float shore=100.;for(int i=0;i<19;i++){vec2 q=abs(p-uTiles[i]);float d=max(q.x,q.x*.5+q.y*.866025)-.85;shore=min(shore,d);}
vec3 deep=vec3(.009,.06,.085),shallow=vec3(.025,.19,.20);vec3 col=mix(shallow,deep,smoothstep(0.,2.8,shore));col+=(w-.5)*.014;col=mix(col,vec3(.11,.20,.23),fres*.38);col+=vec3(.9,.78,.56)*spec*.085*detail;
float foam=(1.-smoothstep(.015,.17,shore))*smoothstep(-.035,.025,shore);foam*=smoothstep(.32,.72,noise(p*4.+vec2(uTime*.12,-uTime*.08)))*.4;col=mix(col,vec3(.38,.57,.52),foam);gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
// Match the background after exposure but before output color conversion.
gl_FragColor.rgb=mix(gl_FragColor.rgb,uHorizon,smoothstep(25.,95.,length(cameraPosition-vWorld)));
#include <colorspace_fragment>
}`,
  });
  const sea = new T.Mesh(
    // The boundary is beyond the camera far plane; distant water fades to sky.
    new T.PlaneGeometry(2000, 2000),
    material,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.13;
  sea.name = 'animated-ocean';
  return sea;
}
