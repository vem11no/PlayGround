#!/usr/bin/env bash
set -euo pipefail

TIMEFORMAT='start.sh real %R user %U sys %S'
time {
  cd "$(dirname "$0")"
  PROJECT_DIR=$(pwd)
  PORT_VALUE="${PORT:-3000}"

  mkdir -p dist
  cp -f index.html dist/index.html

  mkdir -p "${OPENCODE_WEB_DIR:-/tmp/opencode}" "/home/runner/work/_temp/omgithub-web"
  cat > /home/runner/work/_temp/omgithub-web/deployment-output.json <<EOF
{"project":"${PROJECT_DIR}","directory":"${PROJECT_DIR}/dist"}
EOF

  if [[ -n "${OPENCODE_WEB_DIR:-}" ]]; then
    mkdir -p "$OPENCODE_WEB_DIR"
    if [[ "${OPENCODE_WEB_DIR}/deployment-output.json" != "/home/runner/work/_temp/omgithub-web/deployment-output.json" ]]; then
      cp /home/runner/work/_temp/omgithub-web/deployment-output.json "${OPENCODE_WEB_DIR}/deployment-output.json"
    fi
  fi

  exec node -e '''
  const http=require("http")
  const fs=require("fs")
  const path=require("path")
  const root=path.resolve(process.argv[1])
  const port=Number(process.argv[2] || 3000)
  const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon"}
  const server=http.createServer((req,res)=>{
    let pathname
    try { pathname=new URL(req.url,"http://localhost").pathname } catch (_) { res.writeHead(400); res.end("Bad request"); return }
    let file=path.join(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""))
    fs.stat(file,(err,st)=>{
      if(err || st.isDirectory()) file=path.join(root,"index.html")
      fs.readFile(file,(e,data)=>{
        if(e){res.writeHead(404);res.end("Not found");return}
        res.writeHead(200,{"Content-Type":mime[path.extname(file)] || "application/octet-stream","Cache-Control":"no-cache"})
        res.end(data)
      })
    })
  })
  server.listen(port,"0.0.0.0",()=>console.log("DUEL GRID listening on http://0.0.0.0:"+port))
  ''' "$PROJECT_DIR/dist" "$PORT_VALUE"
}
