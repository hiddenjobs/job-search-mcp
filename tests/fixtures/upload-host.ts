import { createMcpHandler } from '../../src/server.ts';
import { uploadPanelResource } from '../../src/ui/panel.ts';
const DOC = '00000000-0000-4000-8000-000000000001',
  CV = '00000000-0000-4000-8000-000000000002',
  VER = '00000000-0000-4000-8000-000000000003';
let bytes = new Uint8Array(),
  expected: Record<string, unknown> = {},
  name = '';
const events: string[] = [];
const hash = async (b: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
const handler = createMcpHandler({
  uploadOrigins: ['https://uploads.example.test'],
  execute: async (_token, operation, args) => {
    events.push(operation);
    if (operation === 'create_document_upload') {
      expected = args;
      return {
        id: DOC,
        state: 'pending',
        uploadUrl: 'https://uploads.example.test/test',
        method: 'PUT',
      };
    }
    if (operation === 'finalize_document_upload') {
      if (bytes.length !== expected.byteSize || (await hash(bytes)) !== expected.sha256)
        throw Error('Bytes differ');
      return { id: DOC, state: 'ready', byte_size: bytes.length, sha256: await hash(bytes) };
    }
    if (operation === 'save_cv') {
      name = String(args.name);
      return { id: VER, cv_id: CV, document_id: DOC, version: 1 };
    }
    return {
      id: CV,
      name,
      versions: { items: [{ id: VER, cv_id: CV, document_id: DOC, version: 1 }] },
    };
  },
});
const host = `<!doctype html><html><head><meta charset="utf-8"><title>CV upload panel — local test</title><style>body{margin:0;background:#edf7f3;color:#102238;font:15px system-ui;padding:24px}main{max-width:620px;margin:auto}h1{font-size:20px}iframe{width:100%;height:590px;background:white;border:1px solid #d5e8e2;border-radius:14px}p{line-height:1.5}#result{overflow-wrap:anywhere;color:#007f78}</style></head><body><main><h1>Hidden Jobs · CV upload</h1><p>Local MCP Apps test host. Uses a simulated account and storage; no production services are called.</p><iframe id="app" src="/panel" sandbox="allow-scripts allow-forms allow-same-origin"></iframe><p id="result" role="status">Waiting for the panel…</p></main><script>
const frame=document.querySelector('iframe');
window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},location.origin);
if(m.method==='ui/initialize'){reply({protocolVersion:'2026-01-26',hostInfo:{name:'Local QA host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{},logging:{}},hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline'],locale:'en'}});}
else if(m.method==='ui/notifications/initialized')frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:{name:'QA panel — original PDF'}}},location.origin);
else if(m.method==='tools/call'){const r=await fetch('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer a.b.c'},body:JSON.stringify({jsonrpc:'2.0',id:m.id,method:'tools/call',params:m.params})});const result=await r.json();frame.contentWindow.postMessage(result,location.origin);}
else if(m.method==='ui/message'||m.method==='ui/update-model-context'){document.querySelector('#result').textContent='Verified: '+JSON.stringify(m.params);reply({});}
else if(m.id!==undefined)reply({});});
</script></body></html>`;
Deno.serve({ hostname: '127.0.0.1', port: 4389 }, async (request) => {
  const path = new URL(request.url).pathname;
  if (path === '/mcp') return handler(request);
  if (path === '/upload') {
    bytes = new Uint8Array(await request.arrayBuffer());
    events.push('browser PUT original bytes');
    return Response.json({ ok: true });
  }
  if (path === '/state')
    return Response.json({
      events,
      bytes: bytes.length,
      hash: await hash(bytes),
      expectedHash: expected.sha256,
      name,
    });
  if (path === '/panel') {
    const html = uploadPanelResource(['https://uploads.example.test']).contents[0].text;
    const stub = `<script>const realFetch=window.fetch.bind(window);window.fetch=(u,i)=>String(u).startsWith('https://uploads.example.test/')?realFetch('/upload',i):realFetch(u,i);</script>`;
    return new Response(html.replace('</head>', stub + '</head>'), {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      },
    });
  }
  return new Response(host, { headers: { 'Content-Type': 'text/html' } });
});
