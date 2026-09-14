import * as THREE from 'three';

// A single GPU particle batch for every chimney; shares the map's pause clock.
export function createChimneySmoke(origins) {
  const count = origins.length * 14,
    positions = new Float32Array(count * 3),
    phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set(origins[Math.floor(i / 14)], i * 3);
    phases[i] = (i % 14) / 14 + Math.floor(i / 14) * 0.071;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const uniforms = { smokeTime: { value: 0 }, pixelScale: { value: 100 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float phase; uniform float smokeTime; uniform float pixelScale; varying float age;
      void main(){age=fract(phase+smokeTime*.16); vec3 p=position;
        p.y+=age*.43; p.x+=age*age*.15+sin(age*8.0+phase*13.0)*age*.027;
        p.z+=age*age*.06+cos(age*10.0+phase*9.0)*age*.018;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
        gl_PointSize=clamp((.032+age*.105)*pixelScale,2.0,70.0);}`,
    fragmentShader: `varying float age;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p);
        float cloud=1.0-smoothstep(.10,.49,r+.03*sin(p.x*21.0+p.y*11.0));
        float fade=smoothstep(0.0,.12,age)*(1.0-smoothstep(.35,1.0,age));
        float alpha=cloud*fade*.26;if(alpha<.004)discard;
        gl_FragColor=vec4(mix(vec3(.57,.55,.51),vec3(.83,.83,.80),age),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Chimney_smoke';
  points.frustumCulled = false;
  const viewport = new THREE.Vector4();
  points.onBeforeRender = (renderer, scene, camera) => {
    uniforms.pixelScale.value =
      (renderer.getCurrentViewport(viewport).w * camera.zoom) /
      (camera.isOrthographicCamera
        ? camera.top - camera.bottom
        : 2 *
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
          Math.max(1, camera.position.length()));
  };
  return {
    points,
    count,
    setTime(t) {
      uniforms.smokeTime.value = t;
    },
  };
}
