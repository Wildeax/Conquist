import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createReviewServer() {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const allowed=[resolve(root,'art/blender')+sep,resolve(root,'app/node_modules/three')+sep];
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.wasm':'application/wasm'};
  return createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      const path=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/art/blender/browser-review.html':pathname));
      if(!allowed.some(prefix=>path.startsWith(prefix))){res.writeHead(403).end();return;}
      const data=await readFile(path);
      res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':data.length});res.end(data);
    }catch{res.writeHead(404).end();}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.argv[2]||4315);
  createReviewServer().listen(port,'127.0.0.1',()=>console.log('Browser board preview: http://127.0.0.1:'+port));
}
