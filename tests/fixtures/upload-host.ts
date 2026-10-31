// Disposable MCP Apps host. Simulates account/storage, never calls production.
import { uploadPanelResource } from '../../src/ui/panel.ts';
const SESSION = '00000000-0000-4000-8000-000000000001';
const session = {
  sessionId: SESSION,
  uploadUrl: `https://hiddenjobs.dev/mcp/upload#${SESSION}.${'a'.repeat(64)}`,
  expiresAt: '2030-01-01T00:00:00Z',
  name: 'QA panel — original PDF',
};
let state: Record<string, unknown> = { status: 'pending' };
const host = `<!doctype html><html><head><meta charset="utf-8"><title>CV upload panel — local test</title></head><body><h1>Hidden Jobs · local MCP Apps test</h1><p>Disposable account/storage simulation. No production calls.</p><iframe src="/panel" style="width:620px;height:620px" sandbox="allow-scripts allow-forms allow-same-origin"></iframe><p id="result" role="status">Waiting for the panel…</p><script>
const frame=document.querySelector('iframe');
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},location.origin);
if(m.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostInfo:{name:'Local QA host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},logging:{}},hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline'],locale:'en'}});
else if(m.method==='ui/notifications/initialized')frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:${JSON.stringify(session)}}},location.origin);
else if(m.method==='ui/message'||m.method==='ui/update-model-context'){document.querySelector('#result').textContent='Verified: '+JSON.stringify(m.params);reply({});}
else if(m.id!==undefined)reply({});});
</script></body></html>`;
Deno.serve({ hostname: '127.0.0.1', port: 4389 }, async (request) => {
  const path = new URL(request.url).pathname;
  if (path === '/state') return Response.json(state);
  if (path === `/api/cv-uploads/${SESSION}`) {
    const form = await request.formData(),
      file = form.get('file');
    if (!(file instanceof File)) return Response.json({}, { status: 400 });
    const bytes = await file.arrayBuffer();
    state = {
      status: 'saved',
      byteSize: bytes.byteLength,
      sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join(''),
      cv: {
        cvId: crypto.randomUUID(),
        versionId: crypto.randomUUID(),
        version: 1,
        name: typeof form.get('name') === 'string' ? form.get('name') : '',
      },
    };
    return Response.json({ data: state });
  }
  if (path === '/panel') {
    const html = uploadPanelResource([]).contents[0].text;
    const localOnly = `<script>const realFetch=window.fetch.bind(window);window.fetch=(u,i)=>typeof u==='string'&&u.startsWith('https://hiddenjobs.dev/api/')?realFetch(u.replace('https://hiddenjobs.dev',location.origin),i):realFetch(u,i);</script>`;
    return new Response(html.replace('</head>', localOnly + '</head>'), {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      },
    });
  }
  return new Response(host, { headers: { 'Content-Type': 'text/html' } });
});
