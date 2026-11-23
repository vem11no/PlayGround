const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3002);
const rooms = new Map();
const clients = new Map();

const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};

function cleanRooms() {
  for (const [id, room] of rooms) {
    room.players = room.players.filter(p => p.connected);
    if (!room.players.length) rooms.delete(id);
  }
}

function publicRooms() {
  cleanRooms();
  return [...rooms.values()].map(r => ({
    id:r.id,name:r.name,host:r.host,format:r.format,players:r.players.length,
    status:r.status,maxPlayers:2,createdAt:r.createdAt
  }));
}

function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcastRooms() {
  for (const ws of clients.keys()) send(ws,{type:'rooms',rooms:publicRooms()});
}
function broadcastRoom(room) {
  for (const p of room.players) if (p.ws && p.ws.readyState === WebSocket.OPEN) send(p.ws,{type:'room-update',room:{id:room.id,name:room.name,host:room.host,format:room.format,status:room.status,players:room.players.map(x=>({id:x.id,name:x.name,ready:x.ready}))}});
}

const server = http.createServer((req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/rooms') {
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify(publicRooms()));
  }
  let file = path.join(__dirname, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({server});
wss.on('connection', ws => {
  const clientId = Math.random().toString(36).slice(2,10);
  clients.set(ws,{id:clientId,name:'Guest',roomId:null});
  send(ws,{type:'hello',id:clientId,rooms:publicRooms()});

  ws.on('message', raw => {
    let msg; try { msg=JSON.parse(raw.toString()); } catch { return; }
    const client = clients.get(ws);

    if (msg.type === 'name') {
      client.name = String(msg.name || 'Guest').slice(0,18);
    }

    if (msg.type === 'list') send(ws,{type:'rooms',rooms:publicRooms()});

    if (msg.type === 'create') {
      const id = Math.random().toString(36).slice(2,8).toUpperCase();
      const room={id,name:String(msg.name||'New Room').slice(0,22),host:client.name,format:Number(msg.format||8000),status:'waiting',createdAt:Date.now(),players:[{id:clientId,name:client.name,ready:false,connected:true,ws}],chat:[]};
      rooms.set(id,room); client.roomId=id;
      send(ws,{type:'joined',roomId:id,role:'host'}); broadcastRoom(room); broadcastRooms();
    }

    if (msg.type === 'join') {
      const room=rooms.get(String(msg.roomId||'').toUpperCase());
      if (!room) return send(ws,{type:'error',message:'Room no longer exists.'});
      if (room.players.length>=2) return send(ws,{type:'error',message:'This room is full.'});
      const duplicate=room.players.find(p=>p.id===clientId);
      if (!duplicate) room.players.push({id:clientId,name:client.name,ready:false,connected:true,ws});
      client.roomId=room.id;
      send(ws,{type:'joined',roomId:room.id,role:'guest'}); broadcastRoom(room); broadcastRooms();
    }

    if (msg.type === 'ready') {
      const room=rooms.get(client.roomId); if(!room)return;
      const player=room.players.find(p=>p.id===clientId); if(player)player.ready=!!msg.ready;
      if(room.players.length===2 && room.players.every(p=>p.ready)) room.status='ready';
      broadcastRoom(room); broadcastRooms();
    }

    if (msg.type === 'leave') {
      const room=rooms.get(client.roomId); if(room){
        room.players=room.players.filter(p=>p.id!==clientId);
        if(room.players.length){room.status='waiting';room.players.forEach(p=>p.ready=false);broadcastRoom(room)} else rooms.delete(room.id);
      }
      client.roomId=null; broadcastRooms();
    }

    if (msg.type === 'chat') {
      const room=rooms.get(client.roomId); if(!room)return;
      const text=String(msg.text||'').trim().slice(0,240); if(!text)return;
      room.chat.push({name:client.name,text,at:Date.now()}); room.chat=room.chat.slice(-50);
      for(const p of room.players) send(p.ws,{type:'chat',name:client.name,text});
    }

    if (msg.type === 'game') {
      const room=rooms.get(client.roomId); if(!room)return;
      for(const p of room.players) if(p.id!==clientId) send(p.ws,{type:'game',payload:msg.payload});
    }
  });

  ws.on('close', () => {
    const client=clients.get(ws); if(client?.roomId){
      const room=rooms.get(client.roomId); if(room){
        const player=room.players.find(p=>p.id===client.id); if(player)player.connected=false;
        room.players=room.players.filter(p=>p.id!==client.id);
        if(room.players.length){room.status='waiting';room.players.forEach(p=>p.ready=false);broadcastRoom(room)} else rooms.delete(room.id);
      }
    }
    clients.delete(ws); broadcastRooms();
  });
});

server.listen(PORT,'0.0.0.0',()=>console.log(`DUEL GRID online server listening on http://0.0.0.0:${PORT}`));
