import * as T from 'three';
export function createWater(centers: T.Vector2[], lite: boolean) {
  const material = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTiles: { value: centers },
      uSun: { value: new T.Vector3(-0.5, 0.7, 0.4).normalize() },
    },
    vertexShader: `varying vec3 vWorld;
uniform float uTime;
void main(){vec3 p=position; p.z+=sin(p.x*1.8+uTime*.8)*.024+cos(p.y*2.1-uTime*.65)*.018;vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `precision highp float;
varying vec3 vWorld;uniform float uTime;uniform vec2 uTiles[19];uniform vec3 uSun;
float wave(vec2 p){return sin(p.x*3.+p.y*1.7+uTime*.8)*.32+sin(p.x*7.-p.y*4.-uTime*1.15)*.14+cos(p.x*13.+p.y*9.+uTime*.5)*.055;}
void main(){vec2 p=vWorld.xz;float w=wave(p);float dx=(wave(p+vec2(.015,0.))-w)/.015;float dz=(wave(p+vec2(0.,.015))-w)/.015;vec3 n=normalize(vec3(-dx*.22,1.,-dz*.22));vec3 v=normalize(cameraPosition-vWorld);float spec=pow(max(dot(reflect(-uSun,n),v),0.),80.);float fres=pow(1.-max(dot(n,v),0.),3.);
float shore=100.;for(int i=0;i<19;i++){vec2 q=abs(p-uTiles[i]);float d=max(q.x,q.x*.5+q.y*.866025)-.85;shore=min(shore,d);}
vec3 deep=vec3(.025,.17,.23),shallow=vec3(.06,.40,.43);vec3 col=mix(shallow,deep,smoothstep(.0,3.,shore));col+=w*.035;col=mix(col,vec3(.32,.55,.59),fres*.55);col+=vec3(1.,.83,.55)*spec*.7;
float foam=(1.-smoothstep(.02,.24,shore))*(.42+.32*sin(shore*46.-uTime*1.6+w*5.));foam*=smoothstep(-.05,.03,shore);col=mix(col,vec3(.63,.83,.75),foam*.72);float mist=smoothstep(15.,48.,length(p));col=mix(col,vec3(.035,.13,.17),mist);gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
  });
  const sea = new T.Mesh(
    new T.PlaneGeometry(100, 100, lite ? 32 : 128, lite ? 32 : 128),
    material,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.13;
  sea.name = 'animated-ocean';
  return sea;
}
