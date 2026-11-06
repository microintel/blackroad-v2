/* =========================================================
   STOCK READER  (native RoadSync module, Stocks History > Angel One)
   Generated from the standalone Order Report Reader. Runs inside
   the RoadSync page (no iframe) in an isolated shadow root, so its
   styles never touch the rest of BlackRoad and vice versa.
   Screenshot reading, order parsing, checks and export are
   unchanged. Added: it follows BlackRoad's theme, and the session
   (orders read so far) is saved on this device like Statement Reader.
   ========================================================= */

const CSS = "\n/* Order Report Reader \u00b7 same flat design system and theme tokens as Statement Reader */\n.sk-root{--bg:var(--background);--s1:var(--surface);--s2:var(--br-surface-soft);--s3:var(--br-surface-hover);--bd:var(--border);--bd2:var(--br-border-strong);\n--ink:var(--text-primary);--tm:var(--text-secondary);--tmu:var(--text-muted);\n--gold:var(--br-gold);--gold-b:var(--br-gold-bright);--gold-t:var(--br-gold-text);--gold-s:var(--br-gold-surface);\n--ok:var(--success);--dg:var(--danger);--wn:var(--br-warning);--xf:var(--br-info);\n--hov:var(--hover-background);--act:var(--active-background);--ease:cubic-bezier(.2,.7,.2,1)}\n*{box-sizing:border-box}\nmain{max-width:1120px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 16px calc(72px + env(safe-area-inset-bottom))}\nbutton,input,select{font:inherit;color:inherit}button{cursor:pointer}\n:focus-visible{outline:2px solid var(--gold);outline-offset:2px}\n.hide{display:none!important}.sub{color:var(--tm);font-size:13px}svg{flex:none}\n.top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;margin-bottom:18px}\n.brand{display:flex;align-items:center;gap:10px;font-weight:650;font-size:16px}\n.brand .mark{width:10px;height:10px;border-radius:3px;background:var(--gold)}\n.top{flex-wrap:wrap}.top-r{display:flex;flex-wrap:wrap;align-items:center;gap:8px}\n.defd{display:flex;align-items:center;gap:8px;color:var(--tm);font-size:13px}.defd input{min-height:34px;padding:0 8px;font-size:13px;border-radius:8px}\n.ibtn{display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:10px;background:var(--s3);color:var(--tm)}\n.ibtn:hover{background:var(--act);color:var(--ink)}\n.sk-root[data-theme=\"light\"] .i-sun,.sk-root:not([data-theme=\"light\"]) .i-moon{display:none}\n.g-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border:0;border-radius:10px;background:var(--s3);color:var(--ink);font-weight:600;font-size:14px;white-space:nowrap;transition:background .15s,transform .1s,opacity .15s}\n.g-btn:hover{background:var(--act)}.g-btn:active{transform:scale(.98)}\n.g-btn.pri{background:var(--gold);color:var(--br-text-inverse)}.g-btn.pri:hover{background:var(--gold-b)}\n.g-btn.sm{min-height:34px;padding:0 12px;font-size:13px;border-radius:9px}\n.g-btn.on{background:var(--gold-s);color:var(--gold-t)}\n.g-btn.done,.g-btn.pri.done{background:var(--br-success-soft);color:var(--ok)}\n.g-btn[disabled]{opacity:.45;cursor:not-allowed}\ninput[type=text],input[type=search],input[type=number],input[type=date],input[type=time],select{min-height:42px;min-width:0;padding:0 12px;border:1px solid transparent;border-radius:10px;background:var(--s3);color:var(--ink)}\ninput::placeholder{color:var(--tmu)}input:hover,select:hover{background:var(--act)}input:focus,select:focus{border-color:var(--gold);outline:0}\n\n/* drop */\n.drop{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:720px;margin:8px auto 0;padding:52px 24px 28px;border:1.5px dashed var(--bd2);border-radius:20px;background:var(--s1);text-align:center;cursor:pointer;transition:border-color .2s,background .2s;animation:rise .4s var(--ease) both}\n.drop:hover,.drop.over{border-color:var(--gold);background:var(--hov)}\n.drop-ic{display:grid;place-items:center;width:56px;height:56px;margin-bottom:12px;border-radius:16px;background:var(--gold-s);color:var(--gold-t);transition:transform .25s var(--ease)}\n.drop:hover .drop-ic,.drop.over .drop-ic{transform:translateY(-3px)}\n.drop h1{margin:0;font-size:22px;font-weight:650;letter-spacing:-.015em}\n.drop p{margin:0 0 18px;color:var(--tm)}\n.drop-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;width:100%;margin:26px 0 0;padding:18px 0 0;border-top:1px solid var(--bd);list-style:none;color:var(--tmu);font-size:13px}\n.drop-meta li{display:inline-flex;align-items:center;gap:7px}\n.how{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:720px;margin:20px auto 0;padding:0;list-style:none}\n.how li{display:flex;align-items:center;gap:10px;color:var(--tm);font-size:13.5px}\n.how b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--s3);color:var(--ink);font-size:12px;flex:none}\n.status{max-width:720px;margin:14px auto 0;color:var(--tm);font-size:14px;text-align:center}.status:empty{display:none}\n\n/* processing + error */\n.state{max-width:560px;margin:20px auto 0;padding:28px;border-radius:20px;background:var(--s2);animation:rise .4s var(--ease) both}\n.state.err{text-align:center}\n.state-ic{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 14px;border-radius:16px;background:var(--br-danger-soft);color:var(--dg)}\n.state h2{margin:0 0 6px;font-size:19px;font-weight:650}.state h2:focus{outline:0}.state p{margin:0;color:var(--tm)}\n.hints{display:grid;gap:7px;margin:18px 0 0;padding:14px 16px;border-radius:12px;background:var(--s3);list-style:none;color:var(--tm);font-size:14px;text-align:left}\n.hints li{position:relative;padding-left:16px}.hints li::before{content:\"\";position:absolute;left:0;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--tmu)}\n.state details{margin-top:14px;text-align:left}.state summary{cursor:pointer;color:var(--tmu);font-size:13px;font-weight:600}\n.state pre{margin:8px 0 0;padding:10px 12px;max-height:160px;overflow:auto;border-radius:10px;background:var(--s3);color:var(--tm);font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}\n.state-act{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:22px}\n.proc-head{display:flex;align-items:center;gap:14px}.proc-head>div{min-width:0}\n.proc-head b{display:block;overflow:hidden;font-size:16px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}\n.proc-head small{display:block;color:var(--tm);font-size:13.5px}\n.spin{display:inline-block;width:22px;height:22px;flex:none;border:2.5px solid var(--bd2);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}\n.bar{height:6px;margin:20px 0 14px;overflow:hidden;border-radius:99px;background:var(--s3)}\n.bar i{display:block;width:0;height:100%;border-radius:inherit;background:var(--gold);transition:width .3s var(--ease)}\n.steps{display:grid;margin:0;padding:0;list-style:none}\n.steps li{display:flex;align-items:center;gap:12px;padding:8px 0;color:var(--tmu);font-size:14px;transition:color .25s}\n.steps li em{margin-left:auto;font-style:normal;font-size:13px}\n.steps .sd{display:grid;place-items:center;width:20px;height:20px;flex:none;border:1.5px solid var(--bd2);border-radius:50%}\n.steps li.on{color:var(--ink)}.steps li.on .sd{border-color:var(--gold);border-top-color:transparent;animation:spin .8s linear infinite}\n.steps li.done{color:var(--tm)}.steps li.done .sd{border-color:var(--ok);background:var(--ok)}\n.steps li.done .sd::after{content:\"\";width:4px;height:8px;margin-top:-2px;border:solid var(--br-text-inverse);border-width:0 2px 2px 0;transform:rotate(45deg)}\n.proc-note{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--bd);color:var(--tmu);font-size:13px}\n\n/* report */\n.okbar{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px 16px;border:1px solid var(--ok);border-radius:14px;background:var(--br-success-soft)}\n.okbar.warn{border-color:var(--wn);background:var(--br-warning-soft)}\n.okbar .oi{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;background:var(--ok);color:var(--br-text-inverse)}\n.okbar.warn .oi{background:var(--wn)}\n.okbar>div{flex:1;min-width:0}.okbar b{display:block;font-weight:600}.okbar small{display:block;color:var(--tm);font-size:13.5px}\n.seg{display:flex;width:fit-content;margin:0 0 16px;padding:3px;gap:2px;border-radius:999px;background:var(--s2)}\n.seg button{min-height:34px;padding:0 16px;border:0;border-radius:999px;background:none;color:var(--tm);font-size:14px;font-weight:600}\n.seg button:hover{color:var(--ink)}.seg button[aria-selected=true]{background:var(--act);color:var(--ink)}\n.pane-off{display:none!important}\n.hero,.card{border-radius:16px;background:var(--s2)}.hero{padding:26px 28px}.card{padding:22px}\n.hr{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}\n.hero small{display:block;color:var(--tm);font-size:13px}.hero h2{margin:2px 0;font-size:18px;font-weight:600}\n.hr-r{text-align:right}.bal{margin-top:2px;font-size:clamp(30px,6vw,40px);font-weight:700;letter-spacing:-.025em;line-height:1.1}\n.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:22px;border-top:1px solid var(--bd)}\n.chip{padding:14px 14px 0 0}.chip b{font-size:17px;font-weight:600}.chip b.cr{color:var(--ok)}.chip b.dr{color:var(--dg)}\n.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}\n.tile{padding:14px 16px;border-radius:14px;background:var(--s2)}.tile small{display:block;color:var(--tm);font-size:13px}.tile b{font-size:19px;font-weight:650}\n.masonry{column-count:2;column-gap:16px;margin:16px 0}\n.masonry>.card{display:block;width:100%;margin-bottom:16px;break-inside:avoid}\n.card h3{margin:0 0 14px;color:var(--tm);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}\n.donut{display:flex;flex-wrap:wrap;align-items:center;gap:18px}.donut svg{width:150px;height:150px}\n.donut svg text{font-family:inherit}.ring{stroke:var(--s3)}.dt-s{fill:var(--tm)}.dt-b{fill:var(--ink)}\n.leg{display:grid;flex:1;gap:2px;min-width:170px}\n.leg div{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}\n.leg i{width:8px;height:8px;flex:none;border-radius:50%}.leg span{flex:1}.leg em{font-style:normal;font-weight:600}\n.rep>div,.list>div{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd);font-size:14px}\n.rep>div:last-child,.list>div:last-child{border-bottom:0}\n.ok{color:var(--ok);font-weight:600}.bad{color:var(--wn);font-weight:600}\ndetails{margin-top:12px}summary{cursor:pointer;color:var(--wn);font-weight:600}\n.rv{max-height:220px;margin:8px 0 0;padding:10px 12px;overflow:auto;border-radius:10px;background:var(--s3);color:var(--tm);font-size:13px}\n.rv p{margin:0 0 6px;word-break:break-word}\n.br{display:grid;grid-template-columns:96px 1fr auto;align-items:center;gap:10px;padding:5px 0;font-size:13px}\n.br span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.br i{display:block;height:8px;overflow:hidden;border-radius:4px;background:var(--s3)}.br b{display:block;height:100%;border-radius:4px;background:var(--gold)}\n.br em{color:var(--tm);font-size:12px;font-style:normal;white-space:nowrap}\n.cr{color:var(--ok);font-weight:600}.dr{color:var(--dg);font-weight:600}\n.tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.tools input{flex:1;min-width:180px}\n.wrap{overflow-x:auto}\ntable{width:100%;min-width:760px;border-collapse:collapse}\nth,td{padding:12px 10px;border-bottom:1px solid var(--bd);text-align:left;vertical-align:middle;white-space:nowrap}\nth{color:var(--tm);font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;user-select:none}\nth:hover{color:var(--ink)}th[data-sorted]::after{content:\" \\2191\";color:var(--gold-t)}th[data-sorted=desc]::after{content:\" \\2193\"}\ntbody tr:hover{background:var(--hov)}tr:last-child td{border-bottom:0}\n.r{text-align:right}\n.tag{display:inline-block;padding:1px 8px;border-radius:6px;background:var(--s3);color:var(--tm);font-size:12.5px;font-weight:600}\n.tag.buy{background:var(--br-success-soft);color:var(--ok)}.tag.sell{background:var(--br-danger-soft);color:var(--dg)}\n.st{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:6px;font-size:12.5px;font-weight:600}\n.st.executed{background:var(--br-success-soft);color:var(--ok)}.st.cancelled{background:var(--s3);color:var(--tm)}\n.st.rejected{background:var(--br-danger-soft);color:var(--dg)}.st.pending{background:var(--br-warning-soft);color:var(--wn)}\n.flag{display:inline-block;margin-left:8px;padding:0 6px;border:1px solid var(--wn);border-radius:6px;color:var(--wn);font-size:11px;font-weight:600;cursor:help}\ntr.w td:first-child{box-shadow:inset 2px 0 var(--wn)}\ntr.none td{padding:36px 12px;color:var(--tmu);text-align:center}\n.ein{min-height:34px;padding:0 8px;font-size:13px;border-radius:8px;width:104px}.ein.n{width:82px;text-align:right}.ein.q{width:60px;text-align:right}.ein.t{width:100px}\n.iss-card{margin-bottom:16px}.iss-h{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.iss-h h3{margin:0}\n.iss-list{display:grid;gap:8px;max-height:380px;overflow:auto}\n.iss{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:12px;border-left:3px solid var(--wn);background:var(--s3);font-size:14px}\n.iss.dup{border-left-color:var(--xf)}.iss.info{border-left-color:var(--tmu)}\n.iss-t{flex:1;min-width:220px}.iss-t small{display:block;color:var(--tm);font-size:13px}.iss-a{display:flex;flex-wrap:wrap;gap:6px}\n.flag.act{background:none;line-height:1.5}.flag.act:hover{background:var(--hov)}.flag.dup{border-color:var(--xf);color:var(--xf)}\ntr.d td:first-child{box-shadow:inset 2px 0 var(--xf)}\n.export{display:flex;flex-wrap:wrap;gap:8px}\n.g-json{max-height:320px;margin:10px 0 0;padding:12px;overflow:auto;border-radius:10px;background:var(--s3);color:var(--tm);font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre}\n.g-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));z-index:60;max-width:90vw;padding:12px 18px;border-radius:12px;background:var(--act);font-size:14.5px;opacity:0;pointer-events:none;transform:translate(-50%,16px);transition:opacity .2s,transform .2s}\n.g-toast.on{opacity:1;transform:translate(-50%,0)}\n@keyframes spin{to{transform:rotate(360deg)}}@keyframes rise{from{opacity:0;transform:translateY(8px)}}\n@media(min-width:900px){main{max-width:1180px;padding-left:32px;padding-right:32px;padding-top:36px}.masonry{column-count:3;column-gap:18px}.hero{padding:30px 34px}}\n@media(min-width:900px) and (max-width:1100px){.masonry{column-count:2}}\n@media(max-width:760px){.masonry{column-count:1}}\n@media(max-width:560px){main{padding:max(16px,env(safe-area-inset-top)) 12px calc(64px + env(safe-area-inset-bottom))}\n.how{grid-template-columns:1fr;gap:8px}.hr-r{text-align:left}.drop{padding:40px 16px 22px}.state{padding:22px 18px}.card{padding:16px}.hero{padding:20px}\n.seg{width:100%}.seg button{flex:1;padding:0 8px}.okbar{flex-wrap:wrap}.okbar .g-btn{width:100%}.tools select,.tools .g-btn{flex:1 1 130px}}\n@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}\n\n/* ---- RoadSync embedding ---- */\n.sk-root{display:block;margin:0;background:transparent;color:var(--text-primary);font:15px/1.5 var(--br-font,Inter,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}\n.sk-root main{max-width:none;margin:0;padding:0 0 48px}\n.sk-root .brand,.sk-root #theme{display:none}\n.sk-root .top{min-height:0;margin-bottom:12px;justify-content:flex-end}\n.sk-root .g-toast{z-index:9002}\n@media(min-width:900px){.sk-root main{max-width:none;padding:0 0 48px}}\n@media(max-width:560px){.sk-root main{padding:0 0 48px}}\n";
const HTML = "<main>\n  <header class=\"top\">\n    <div class=\"brand\"><span class=\"mark\" aria-hidden=\"true\"></span>Order Report Reader</div>\n    <div class=\"top-r\">\n      <label class=\"defd\" title=\"Used for screenshots that do not show a date\">Date if missing <input type=\"date\" id=\"defDate\"></label>\n      <button class=\"g-btn sm hide\" id=\"reset\" type=\"button\">Start over</button>\n      <button class=\"ibtn\" id=\"theme\" type=\"button\" aria-label=\"Switch theme\"><svg class=\"i-sun\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\"/></svg><svg class=\"i-moon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\"/></svg></button>\n    </div>\n  </header>\n\n  <!-- 1. Empty -->\n  <div id=\"drop\" class=\"drop\" tabindex=\"0\" role=\"button\" aria-label=\"Choose order report screenshots\">\n    <span class=\"drop-ic\"><svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"17 8 12 3 7 8\"/><line x1=\"12\" x2=\"12\" y1=\"3\" y2=\"15\"/></svg></span>\n    <h1>Drop order report screenshots</h1>\n    <p>click to browse, or paste with Ctrl+V</p>\n    <span class=\"g-btn pri\">Choose screenshots</span>\n    <ul class=\"drop-meta\">\n      <li>Read on your device, never uploaded</li>\n      <li>Select several screenshots at once</li>\n      <li>Images only (PNG, JPG, WebP)</li>\n    </ul>\n    <input id=\"file\" type=\"file\" accept=\"image/*\" multiple hidden>\n  </div>\n  <div id=\"status\" class=\"status\" role=\"status\"></div>\n  <ol class=\"how\" id=\"how\"><li><b>1</b>Drop a screenshot</li><li><b>2</b>Check the report</li><li><b>3</b>Download JSON</li></ol>\n\n  <!-- 2. Processing -->\n  <section id=\"proc\" class=\"state hide\" aria-live=\"polite\" aria-busy=\"true\">\n    <div class=\"proc-head\"><span class=\"spin\" aria-hidden=\"true\"></span><div><b id=\"procName\">Screenshot</b><small id=\"procSub\">Preparing\u2026</small></div></div>\n    <div class=\"bar\" role=\"progressbar\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\" id=\"procBarWrap\"><i id=\"procBar\"></i></div>\n    <ol class=\"steps\" id=\"procSteps\">\n      <li data-s=\"prep\"><span class=\"sd\"></span>Preparing the image</li>\n      <li data-s=\"read\"><span class=\"sd\"></span>Reading text<em id=\"procPct\"></em></li>\n      <li data-s=\"parse\"><span class=\"sd\"></span>Finding orders<em id=\"procTx\"></em></li>\n      <li data-s=\"check\"><span class=\"sd\"></span>Checking details</li>\n    </ol>\n    <p class=\"proc-note\">This happens in your browser. Nothing leaves your device.</p>\n  </section>\n\n  <!-- 3. Error -->\n  <section id=\"fail\" class=\"state err hide\" role=\"alert\">\n    <div class=\"state-ic\"><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/></svg></div>\n    <h2 id=\"failT\" tabindex=\"-1\">Couldn't read this screenshot</h2>\n    <p id=\"failM\"></p>\n    <ul class=\"hints\" id=\"failH\"></ul>\n    <details id=\"failD\" class=\"hide\"><summary>Technical details</summary><pre id=\"failP\"></pre></details>\n    <div class=\"state-act\"><button class=\"g-btn pri\" id=\"failRetry\" type=\"button\">Choose another screenshot</button><button class=\"g-btn\" id=\"failManual\" type=\"button\">Enter orders manually</button><button class=\"g-btn\" id=\"failBack\" type=\"button\">Cancel</button></div>\n  </section>\n\n  <!-- 4. Report -->\n  <section id=\"result\" class=\"hide\">\n    <div class=\"okbar\" id=\"okBar\">\n      <span class=\"oi\" id=\"okIc\"></span>\n      <div><b id=\"okT\"></b><small id=\"okS\"></small></div>\n      <button class=\"g-btn sm hide\" id=\"fixB\" type=\"button\">Review issues</button>\n      <button class=\"g-btn sm\" id=\"addMore\" type=\"button\">Add screenshots</button>\n    </div>\n    <div class=\"seg\" id=\"rSeg\" role=\"tablist\">\n      <button type=\"button\" role=\"tab\" data-pane=\"o\" aria-selected=\"true\">Overview</button>\n      <button type=\"button\" role=\"tab\" data-pane=\"b\" aria-selected=\"false\">Breakdown</button>\n      <button type=\"button\" role=\"tab\" data-pane=\"t\" aria-selected=\"false\">Orders</button>\n    </div>\n    <div class=\"hero\" id=\"hero\" data-p=\"o\"></div>\n    <div id=\"tiles\" class=\"tiles\" data-p=\"o\"></div>\n    <div class=\"card\" data-p=\"o\"><h3>Export</h3>\n      <div class=\"export\">\n        <button class=\"g-btn pri\" id=\"dlJson\" type=\"button\">Download JSON</button>\n        <button class=\"g-btn\" id=\"cpJson\" type=\"button\">Copy JSON</button>\n        <button class=\"g-btn\" id=\"dlCsv\" type=\"button\">Download CSV</button>\n      </div>\n      <p class=\"sub\" style=\"margin:14px 0 8px\">This file is ready for BlackRoad: use Restore / Import there. It only adds new transactions. Nothing existing is changed, and orders already in Stocks are skipped. Merging below is optional.</p>\n      <div class=\"export\">\n        <button class=\"g-btn\" id=\"baseB\" type=\"button\">Merge with my Stocks export</button>\n        <button class=\"g-btn sm hide\" id=\"baseX\" type=\"button\">Remove</button>\n      </div>\n      <p class=\"sub\" id=\"baseS\" style=\"margin-top:8px\"></p>\n      <input id=\"baseFile\" type=\"file\" accept=\"application/json,.json\" hidden>\n      <details id=\"jsonDet\"><summary style=\"color:var(--tm)\">Preview JSON</summary><pre class=\"g-json\" id=\"jsonPre\"></pre></details>\n    </div>\n    <div class=\"masonry\" data-p=\"b\">\n      <div class=\"card\"><h3>Orders by status</h3><div class=\"donut\" id=\"dStatus\"></div></div>\n      <div class=\"card\"><h3>Executed value by symbol</h3><div class=\"donut\" id=\"dSym\"></div></div>\n      <div class=\"card\"><h3>Reading report</h3><div class=\"rep\" id=\"rep\"></div><div id=\"rv\"></div></div>\n      <div class=\"card\"><h3>Executed value by day</h3><div id=\"days\"></div></div>\n      <div class=\"card\"><h3>Matched buy / sell (before charges)</h3><div class=\"list\" id=\"pnl\"></div></div>\n      <div class=\"card\"><h3>Product and exchange</h3><div class=\"list\" id=\"prod\"></div></div>\n    </div>\n    <div class=\"card iss-card\" id=\"issues\" data-p=\"t\"></div>\n    <div class=\"card\" data-p=\"t\">\n      <h3>Orders</h3>\n      <div class=\"tools\">\n        <input id=\"q\" type=\"search\" placeholder=\"Search symbol, date or price\" aria-label=\"Search\">\n        <select id=\"fStatus\" aria-label=\"Status\"><option value=\"\">All statuses</option><option>EXECUTED</option><option>CANCELLED</option><option>REJECTED</option><option>PENDING</option></select>\n        <select id=\"fSide\" aria-label=\"Side\"><option value=\"\">Buy and sell</option><option>BUY</option><option>SELL</option></select>\n        <button class=\"g-btn\" id=\"editB\" type=\"button\" aria-pressed=\"false\">Edit rows</button>\n      </div>\n      <div class=\"wrap\"><table>\n        <thead><tr><th data-k=\"idx\">#</th><th data-k=\"ts\">Date</th><th data-k=\"symbol\">Symbol</th><th data-k=\"side\">Side</th><th>Type</th><th class=\"r\" data-k=\"qty\">Shares</th><th class=\"r\" data-k=\"price\">Price</th><th class=\"r\" data-k=\"value\">Value</th><th data-k=\"status\">Status</th><th class=\"del hide\"></th></tr></thead>\n        <tbody id=\"rows\"></tbody>\n      </table></div>\n      <p class=\"sub\" id=\"count\"></p>\n    </div>\n  </section>\n  <input id=\"fileMore\" type=\"file\" accept=\"image/*\" multiple hidden>\n  <div class=\"g-toast\" id=\"toast\" role=\"status\"></div>\n</main>";

/* The reader's own code. `document` / `window` are the scoped stand-ins built in mountStockReader(). */
function run(document, window) {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const inr = n => "\u20B9" + Number(n || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad = n => String(n).padStart(2, "0");
const fDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${+m[3]} ${MON[+m[2]-1]} ${m[1]}` : (iso || "—"); };
const to12 = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "PM" : "AM"}`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ICO = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
};
const ico = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;

let toastT = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2400); }
function flash(btn, text) {
  if (!btn || btn._f) return;
  btn._f = btn.innerHTML; btn.classList.add("done"); btn.innerHTML = ico("check", 16) + " " + text;
  setTimeout(() => { btn.innerHTML = btn._f; btn._f = null; btn.classList.remove("done"); }, 1800);
}

/* ================= parser (screenshot text -> orders) ================= */
const NOT_SYMBOLS = new Set(["ALL","ORDER","REPORT","BUY","SELL","MARGIN","DEL","NSE","BSE","EXECUTED","CANCELLED","REJECTED","DELIVERY","INTRADAY"]);
const STATUS_MAP = {EXEC: "EXECUTED", CANCEL: "CANCELLED", REJEC: "REJECTED", PEND: "PENDING"};
function parsePrice(tok) { const d = String(tok).replace(/\//g, "7").replace(/[^\d]/g, ""); return d.length < 3 ? NaN : Number(d.slice(0, -2) + "." + d.slice(-2)); }
function to24(h, m, ap) { let hh = Number(h) % 12; if (/p/i.test(ap)) hh += 12; return `${pad(hh)}:${m}`; }
function incomplete(o) { return !o.symbol || !o.date || !o.side || !o.status || (!o.time && !o.noTime) || o.orderQty == null || !(o.price > 0); }
function orderId(o) {
  const key = [o.date, o.symbol, o.side, o.price, o.time, o.status, o.orderQty].join("|"); let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return "ord_" + h.toString(36);
}
function parseOrderText(text, defaultDate) {
  const out = []; let date = defaultDate || "", cur = null;
  const dateRe = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i;
  // Price may follow a misread rupee sign (%, 2, etc.) and OCR may read a 7 as "/".
  const symRe = /^([A-Z][A-Z0-9&\-]{2,})\s+[^\dA-Za-z\s]{0,2}\s*(\d[\d.,\/]*[.,]\d{2})\b/;
  const ltpRe = /LTP\s*[^\dA-Za-z\s]{0,2}\s*(\d[\d.,\/]*[.,]\d{2})\b/i;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/[|_~=\u00A9]/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const d = line.match(dateRe);
    if (d && !/share/i.test(line)) { date = `${d[3]}-${pad(MON.findIndex(m => m.toLowerCase() === d[2].toLowerCase()) + 1)}-${pad(d[1])}`; cur = null; continue; }
    const s = line.match(symRe);
    if (s && !NOT_SYMBOLS.has(s[1])) {
      cur = {date, symbol: s[1], side: "", product: "", exchange: "", price: parsePrice(s[2]), status: "", time: "", filledQty: null, orderQty: null};
      out.push(cur); continue;
    }
    if (!cur) continue;
    const side = line.match(/\b(BUY|SELL)\b/);
    if (side) {
      cur.side = side[1];
      cur.product = (line.match(/\b(MARGIN|DEL|MIS|CNC|NRML|INTRADAY|CARRYFORWARD|CF)\b/) || [])[1] || "";
      cur.exchange = (line.match(/\b(NSE|BSE|NFO|MCX)\b/) || [])[1] || "";
      const st = line.match(/EXEC|CANCEL|REJEC|PEND/i); if (st) cur.status = STATUS_MAP[st[0].toUpperCase()];
      const t = line.match(/(\d{1,2})[:.](\d{2})\s*([AP])\.?M/i); if (t) cur.time = to24(t[1], t[2], t[3]);
      continue;
    }
    const lt = line.match(ltpRe); if (lt) cur.ltp = parsePrice(lt[1]);
    const q = line.match(/(\d+)\s*[\/|]\s*(\d+)\s*Share/i) || line.match(/(\d+)\s+(\d+)\s*Shares?\b/i);
    if (q) { cur.filledQty = +q[1]; cur.orderQty = +q[2]; }
  }
  // Layout without times (e.g. the Executed list): do not ask for a time.
  const timed = out.some(o => o.time);
  // Fully filled and no status shown (the tab name is the status): treat as executed.
  out.forEach(o => { o.noTime = !timed; if (!o.status && o.orderQty > 0 && o.filledQty === o.orderQty) o.status = "EXECUTED"; });
  // A misread rupee sign can add a digit in front of a price (1,751.05 -> 21,751.05).
  // Prices of one symbol sit close together, so drop leading digits that make a price far too big.
  const lowest = {}; out.forEach(o => [o.price, o.ltp].forEach(v => { if (v > 0) lowest[o.symbol] = Math.min(lowest[o.symbol] ?? v, v); }));
  const fix = (v, ref) => { let t = String(Math.round(v * 100)); while (v > ref * 3 && t.length > 3) { t = t.slice(1); v = Number(t) / 100; } return v; };
  out.forEach(o => { if (o.price > 0) o.price = fix(o.price, lowest[o.symbol]); delete o.ltp; });
  // Identical rows in one screenshot are separate orders (_2, _3...). The same row seen again
  // in an overlapping screenshot gets the same id, so merging removes it.
  const seen = {};
  return out.map(o => { const k = orderId(o), n = seen[k] = (seen[k] || 0) + 1; return {...o, id: n > 1 ? `${k}_${n}` : k, incomplete: incomplete(o)}; });
}
function sortOrders(a) { return [...a].sort((x, y) => (y.date || "").localeCompare(x.date || "") || (y.time || "").localeCompare(x.time || "")); }
function mergeOrders(existing, incoming) {
  const m = new Map(existing.map(o => [o.id, o]));
  for (const o of incoming) { const p = m.get(o.id); if (!p || (p.incomplete && !o.incomplete)) m.set(o.id, o); }
  return sortOrders([...m.values()]);
}
function warningsFor(orders) {
  const w = [];
  orders.forEach((o, i) => {
    const tag = `${o.symbol || "Row " + (i + 1)} ${fDate(o.date)}`;
    if (o.incomplete) w.push(`${tag}: some details could not be read (cut off or unclear). Check this row.`);
    if (o.status === "EXECUTED" && o.orderQty != null && o.filledQty !== o.orderQty) w.push(`${tag}: executed, but filled ${o.filledQty} of ${o.orderQty} shares.`);
    if ((o.status === "CANCELLED" || o.status === "REJECTED") && o.filledQty > 0) w.push(`${tag}: ${o.status.toLowerCase()} but shows ${o.filledQty} shares filled.`);
  });
  return w;
}

/* ================= OCR (Tesseract.js, loaded on demand) ================= */
const TESS = "5.1.1";
const LOCAL = f => new URL("../../../assets/vendor/tesseract/" + f, import.meta.url).href;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = () => { s.remove(); rej(new Error("load " + src)); }; document.head.appendChild(s); }); }
async function loadTesseract() {
  if (globalThis.Tesseract) return globalThis.Tesseract;
  for (const src of [LOCAL("tesseract.min.js"), `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS}/dist/tesseract.min.js`, `https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/${TESS}/tesseract.min.js`]) {
    try { await loadScript(src); if (globalThis.Tesseract) return globalThis.Tesseract; } catch (e) { /* next */ }
  }
  throw new Error("OCR_LOAD");
}
async function localOpts() {
  if (location.protocol === "file:") return {};
  try { const r = await fetch(LOCAL("eng.traineddata.gz"), {method: "HEAD"}); if (!r.ok) return {}; return {workerPath: LOCAL("worker.min.js"), corePath: LOCAL(""), langPath: LOCAL("")}; } catch (e) { return {}; }
}
function loadImage(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("BAD_IMAGE")); }; i.src = u; });
}
function prepare(img) {
  const k = Math.min(img.width < 1200 ? 2 : 1, 7000 / img.height);
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext("2d", {willReadFrequently: true}); ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data; let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum += (p[i] + p[i+1] + p[i+2]) / 3;
  const dark = sum / (p.length / 4) < 128;
  for (let i = 0; i < p.length; i += 4) { let g = (p[i] + p[i+1] + p[i+2]) / 3; if (dark) g = 255 - g; g = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128)); p[i] = p[i+1] = p[i+2] = g; }
  ctx.putImageData(d, 0, 0); return c;
}

/* ================= state + views ================= */
const S = {orders: [], files: [], raw: [], warnings: [], edit: false, q: "", fStatus: "", fSide: "", sort: {k: "ts", dir: "desc"}, pane: "o", busy: false, base: null, baseName: "", dupes: 0, dupIds: new Set(), dupWhy: new Map(), one: new Set()};
const VIEWS = ["drop", "status", "how", "proc", "fail", "result"];
function show(...on) { VIEWS.forEach(v => $(v).classList.toggle("hide", !on.includes(v))); $("reset").classList.toggle("hide", !(on.includes("result") || on.includes("fail"))); }
function setBar(p) { const v = Math.round(Math.max(0, Math.min(1, p)) * 100); $("procBar").style.width = v + "%"; $("procBarWrap").setAttribute("aria-valuenow", v); }
const STEPS = ["prep", "read", "parse", "check"];
function setStep(s) { const i = STEPS.indexOf(s); document.querySelectorAll("#procSteps li").forEach(li => { const j = STEPS.indexOf(li.dataset.s); li.classList.toggle("done", j < i); li.classList.toggle("on", j === i); }); }
function allDone() { document.querySelectorAll("#procSteps li").forEach(li => { li.classList.remove("on"); li.classList.add("done"); }); }

function fail(title, msg, hints, tech) {
  $("failT").textContent = title; $("failM").textContent = msg;
  $("failH").innerHTML = hints.map(h => `<li>${esc(h)}</li>`).join("");
  $("failD").classList.toggle("hide", !tech); $("failP").textContent = tech || "";
  show("fail"); $("failT").focus();
}

async function processFiles(list) {
  const images = [...list].filter(f => f.type.startsWith("image/"));
  if (!images.length) { $("status").textContent = "Choose image files (PNG, JPG or WebP)."; return; }
  if (S.busy) return;
  S.busy = true; $("status").textContent = "";
  show("proc"); setBar(0); setStep("prep"); $("procPct").textContent = ""; $("procTx").textContent = "";
  let workers = []; const errors = []; const results = [];
  try {
    $("procName").textContent = images[0].name || "Screenshot"; $("procSub").textContent = "Loading the text reader…";
    const T = await loadTesseract();
    const local = await localOpts();
    // Several screenshots are read side by side by a few workers (about half the CPU cores, at most 3).
    const n = images.length > 1 ? Math.min(3, images.length, Math.max(2, (navigator.hardwareConcurrency || 4) >> 1)) : 1;
    let done = 0;
    workers = await Promise.all(Array.from({length: n}, async () => {
      const w = await T.createWorker("eng", 1, {...local, logger: m => {
        if (n === 1 && m.status === "recognizing text") { setBar(m.progress); $("procPct").textContent = Math.round(m.progress * 100) + "%"; }
      }});
      await w.setParameters({tessedit_pageseg_mode: "6", preserve_interword_spaces: "1"});
      return w;
    }));
    const defDate = $("defDate").value;
    const better = (a, b) => b.filter(o => !o.incomplete).length * 2 + b.length > a.filter(o => !o.incomplete).length * 2 + a.length;
    const read = async (i, w) => {
      const f = images[i], name = f.name || "Pasted screenshot";
      try {
        if (n === 1) { $("procName").textContent = name; $("procSub").textContent = "Reading your screenshot…"; setStep("prep"); await sleep(30); }
        const canvas = prepare(await loadImage(f));
        if (n === 1) { setStep("read"); $("procPct").textContent = "0%"; }
        let {data} = await w.recognize(canvas), found = parseOrderText(data.text, defDate);
        // Nothing found, or rows with missing details: try once more as a single column of text and keep the better read.
        if (!found.length || found.some(o => o.incomplete)) {
          await w.setParameters({tessedit_pageseg_mode: "4"});
          const again = await w.recognize(canvas), f2 = parseOrderText(again.data.text, defDate);
          await w.setParameters({tessedit_pageseg_mode: "6"});
          if (better(found, f2)) { found = f2; data = again.data; }
        }
        results[i] = {name, found, text: data.text.trim()};
      } catch (e) { results[i] = {name, error: e.message === "BAD_IMAGE" ? "not a readable image" : e.message}; }
      done++; setBar(done / images.length);
      if (n > 1) { $("procName").textContent = `${images.length} screenshots`; $("procSub").textContent = `${done} of ${images.length} read`; }
    };
    let next = 0;
    await Promise.all(workers.map(async w => { for (let i; (i = next++) < images.length;) await read(i, w); }));
    setStep("parse");
    // Combine in the order the screenshots were chosen, so the result does not depend on which finished first.
    results.forEach(r => {
      if (r.error) { errors.push(`${r.name}: ${r.error}`); return; }
      S.raw.push(`— ${r.name} —\n${r.text}`); S.files.push(r.name);
      if (!r.found.length) { errors.push(`${r.name}: no orders found`); return; }
      const before = S.orders.length; S.orders = mergeOrders(S.orders, r.found); S.dupes += r.found.length - (S.orders.length - before);
    });
    $("procTx").textContent = `${S.orders.length} found`;
    setStep("check"); S.warnings = warningsFor(S.orders); await sleep(350); allDone(); await sleep(250);
  } catch (e) {
    S.busy = false; workers.forEach(w => w.terminate().catch(() => {}));
    if (e.message === "OCR_LOAD") return fail("Couldn't load the text reader", "The reader needs to download once, or be added to assets/vendor/tesseract.", ["Check your internet connection and try again.", "For offline use, copy the Tesseract files into assets/vendor/tesseract/."], String(e.message));
    return fail("Couldn't read this screenshot", "Something went wrong while reading the image.", ["Try a clearer, full-width screenshot.", "Try again."], e.stack || String(e));
  }
  workers.forEach(w => w.terminate().catch(() => {}));
  S.busy = false;
  if (!S.orders.length) return fail("No orders found", "The text was read, but no order rows were recognised.", ["Use a screenshot of the Order Report list (symbol, price, BUY/SELL, status).", "Make sure the screenshot is not blurry or cropped.", "Zoom so the text is large and try again."], S.raw.join("\n\n"));
  S.errors = errors; renderReport(); show("result");
  if (errors.length) toast(errors[0]);
}

/* ================= report ================= */
const execQty = o => o.status === "EXECUTED" ? (o.filledQty ?? o.orderQty ?? 0) : 0;
const orderValue = o => execQty(o) * (o.price || 0);
function stats() {
  const O = S.orders, ex = O.filter(o => o.status === "EXECUTED");
  const buyV = ex.filter(o => o.side === "BUY").reduce((a, o) => a + orderValue(o), 0);
  const sellV = ex.filter(o => o.side === "SELL").reduce((a, o) => a + orderValue(o), 0);
  const dates = O.map(o => o.date).filter(Boolean).sort();
  return {O, ex, buyV, sellV, from: dates[0], to: dates[dates.length - 1], symbols: [...new Set(O.map(o => o.symbol))],
    cnt: s => O.filter(o => o.status === s).length, review: O.filter(o => o.incomplete).length};
}
function matched() {
  const g = {};
  S.orders.filter(o => o.status === "EXECUTED" && o.side && o.date).forEach(o => {
    const k = o.date + "|" + o.symbol, x = g[k] ||= {date: o.date, symbol: o.symbol, bq: 0, bv: 0, sq: 0, sv: 0};
    const q = execQty(o), v = orderValue(o); if (o.side === "BUY") { x.bq += q; x.bv += v; } else { x.sq += q; x.sv += v; }
  });
  return Object.values(g).filter(x => x.bq > 0 && x.sq > 0).map(x => { const m = Math.min(x.bq, x.sq); return {...x, qty: m, pnl: m * (x.sv / x.sq - x.bv / x.bq)}; })
    .sort((a, b) => b.date.localeCompare(a.date));
}
const COLORS = i => `hsl(${(i * 47 + 38) % 360} 62% 55%)`;
function donut(items, big, small) {
  const total = items.reduce((a, i) => a + i.value, 0); if (!total) return `<p class="sub">Nothing to show yet.</p>`;
  const r = 54, c = 2 * Math.PI * r; let off = 0;
  const segs = items.filter(i => i.value > 0).map(i => { const len = i.value / total * c; const s = `<circle r="${r}" cx="70" cy="70" fill="none" style="stroke:${i.color}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return s; }).join("");
  const leg = items.filter(i => i.value > 0).map(i => `<div><i style="background:${i.color}"></i><span>${esc(i.label)}</span><em>${esc(i.text)}</em></div>`).join("");
  return `<svg viewBox="0 0 140 140" role="img"><circle class="ring" r="${r}" cx="70" cy="70" fill="none" stroke-width="20"/>${segs}<text class="dt-s" x="70" y="66" text-anchor="middle" font-size="11">${esc(small)}</text><text class="dt-b" x="70" y="86" text-anchor="middle" font-size="18" font-weight="700">${esc(big)}</text></svg><div class="leg">${leg}</div>`;
}
function renderReport() {
  const s = stats(), warn = S.warnings.length > 0 || s.review > 0;
  $("okBar").classList.toggle("warn", warn); $("okIc").innerHTML = ico(warn ? "alert" : "check", 18);
  $("okT").textContent = warn ? `Read ${s.O.length} orders, a few need a check` : `Read ${s.O.length} orders`;
  const dupTxt = S.dupes ? ` ${S.dupes} duplicate${S.dupes === 1 ? "" : "s"} skipped.` : "";
  $("okS").textContent = (warn ? `${s.review} row${s.review === 1 ? "" : "s"} with missing details. Fix them in the Orders tab.` : "Everything was read. Review the report and download the JSON.") + dupTxt + " Saved on this device.";

  const range = s.from ? (s.from === s.to ? fDate(s.from) : `${fDate(s.from)} to ${fDate(s.to)}`) : "Unknown date";
  $("hero").innerHTML = `<div class="hr"><div><small>Order report</small><h2>${esc(range)}</h2><small>${s.symbols.length} symbol${s.symbols.length === 1 ? "" : "s"} · ${S.files.length} screenshot${S.files.length === 1 ? "" : "s"}</small></div>
    <div class="hr-r"><small>Executed value</small><div class="bal">${inr(s.buyV + s.sellV)}</div></div></div>
    <div class="chips"><div class="chip"><small>Orders</small><b>${s.O.length}</b></div><div class="chip"><small>Executed</small><b class="cr">${s.cnt("EXECUTED")}</b></div>
    <div class="chip"><small>Cancelled</small><b>${s.cnt("CANCELLED")}</b></div><div class="chip"><small>Rejected</small><b class="dr">${s.cnt("REJECTED")}</b></div>
    <div class="chip"><small>Bought</small><b>${inr(s.buyV)}</b></div><div class="chip"><small>Sold</small><b>${inr(s.sellV)}</b></div></div>`;
  const m = matched(), mp = m.reduce((a, x) => a + x.pnl, 0);
  $("tiles").innerHTML = [["Symbols", s.symbols.length], ["Buy orders", s.O.filter(o => o.side === "BUY").length], ["Sell orders", s.O.filter(o => o.side === "SELL").length],
    ["Matched P&L (gross)", m.length ? `<span class="${mp >= 0 ? "cr" : "dr"}">${(mp >= 0 ? "+" : "-") + inr(Math.abs(mp))}</span>` : "—"], ["Need a check", s.review]]
    .map(([a, b]) => `<div class="tile"><small>${a}</small><b>${b}</b></div>`).join("");

  const SC = {EXECUTED: "var(--ok)", CANCELLED: "var(--tmu)", REJECTED: "var(--dg)", PENDING: "var(--wn)"};
  $("dStatus").innerHTML = donut(["EXECUTED", "CANCELLED", "REJECTED", "PENDING"].map(k => ({label: k[0] + k.slice(1).toLowerCase(), value: s.cnt(k), color: SC[k], text: String(s.cnt(k))})), String(s.O.length), "orders");
  const bySym = s.symbols.map((sym, i) => { const v = s.ex.filter(o => o.symbol === sym).reduce((a, o) => a + orderValue(o), 0); return {label: sym, value: v, color: COLORS(i), text: inr(v)}; }).sort((a, b) => b.value - a.value);
  $("dSym").innerHTML = donut(bySym, String(s.symbols.length), "symbols");

  $("rep").innerHTML = [["Screenshots read", S.files.length], ["Orders found", s.O.length], ["Fully read", `<span class="ok">${s.O.length - s.review}</span>`],
    ["Need a check", `<span class="${s.review ? "bad" : "ok"}">${s.review}</span>`]].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join("");
  const rv = [...S.warnings, ...(S.errors || [])];
  $("rv").innerHTML = rv.length ? `<details><summary>${rv.length} thing${rv.length === 1 ? "" : "s"} to check</summary><div class="rv">${rv.map(w => `<p>${esc(w)}</p>`).join("")}</div></details>` : "";

  const days = {}; s.ex.forEach(o => { days[o.date] = (days[o.date] || 0) + orderValue(o); });
  const dk = Object.keys(days).sort().reverse(), mx = Math.max(1, ...Object.values(days));
  $("days").innerHTML = dk.length ? dk.map(d => `<div class="br"><span>${fDate(d)}</span><i><b style="width:${Math.max(3, days[d] / mx * 100)}%"></b></i><em>${inr(days[d])}</em></div>`).join("") : `<p class="sub">No executed orders.</p>`;
  $("pnl").innerHTML = m.length ? m.map(x => `<div><span>${esc(x.symbol)} <span class="sub">${fDate(x.date)} · ${x.qty} shares</span></span><span class="${x.pnl >= 0 ? "cr" : "dr"}">${(x.pnl >= 0 ? "+" : "-") + inr(Math.abs(x.pnl))}</span></div>`).join("") + `<p class="sub" style="margin-top:10px">Same-day buy and sell of the same symbol. Brokerage and taxes are not included.</p>` : `<p class="sub">No symbol has both a buy and a sell on the same day.</p>`;
  const pc = {}; s.O.forEach(o => { const k = `${o.product || "—"} · ${o.exchange || "—"}`; pc[k] = (pc[k] || 0) + 1; });
  $("prod").innerHTML = Object.entries(pc).map(([k, v]) => `<div><span>${esc(k)}</span><span>${v}</span></div>`).join("");
  renderJsonPreview(); renderRows(); renderIssues(); persistSession();
}
function renderRows() {
  const q = S.q.trim().toLowerCase();
  let rows = S.orders.map((o, i) => ({o, i})).filter(({o}) => (!S.fStatus || o.status === S.fStatus) && (!S.fSide || o.side === S.fSide) &&
    (!q || `${o.symbol} ${o.date} ${fDate(o.date)} ${o.price}`.toLowerCase().includes(q)));
  const {k, dir} = S.sort, f = dir === "asc" ? 1 : -1;
  const val = ({o, i}) => ({idx: i, ts: (o.date || "") + (o.time || ""), symbol: o.symbol, side: o.side, qty: execQty(o), price: o.price || 0, value: orderValue(o), status: o.status})[k];
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * f; });
  document.querySelectorAll("th[data-k]").forEach(th => { if (th.dataset.k === k) th.dataset.sorted = dir; else delete th.dataset.sorted; });
  const dupSet = new Set(dupGroups().flat()), showCol = S.edit || S.one.size > 0;
  document.querySelector("th.del").classList.toggle("hide", !showCol);
  $("rows").innerHTML = rows.length ? rows.map(({o, i}, n) => {
    const st = (o.status || "").toLowerCase();
    if (S.edit || S.one.has(i)) return `<tr class="${o.incomplete ? "w" : ""}${dupSet.has(i) ? " d" : ""}" data-i="${i}"><td>${n + 1}</td>
      <td><input class="ein" type="date" value="${esc(o.date)}" data-f="date" aria-label="Date"> <input class="ein t" type="time" value="${esc(o.time)}" data-f="time" aria-label="Time"></td>
      <td><input class="ein" type="text" value="${esc(o.symbol)}" data-f="symbol" aria-label="Symbol"></td>
      <td><select class="ein" data-f="side" aria-label="Side"><option value="">—</option><option ${o.side === "BUY" ? "selected" : ""}>BUY</option><option ${o.side === "SELL" ? "selected" : ""}>SELL</option></select></td>
      <td>${esc(o.product)} ${esc(o.exchange)}</td>
      <td class="r"><input class="ein q" type="number" min="0" value="${o.filledQty ?? ""}" data-f="filledQty" aria-label="Filled"> / <input class="ein q" type="number" min="0" value="${o.orderQty ?? ""}" data-f="orderQty" aria-label="Total"></td>
      <td class="r"><input class="ein n" type="text" inputmode="decimal" value="${o.price ?? ""}" data-f="price" aria-label="Price"></td>
      <td class="r">${inr(orderValue(o))}</td>
      <td><select class="ein" data-f="status" aria-label="Status"><option value="">—</option>${["EXECUTED", "CANCELLED", "REJECTED", "PENDING"].map(x => `<option ${o.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><button class="g-btn sm" data-del="${i}" type="button" aria-label="Remove row">Remove</button>${S.edit ? "" : ` <button class="g-btn sm" data-done="${i}" type="button">Done</button>`}</td></tr>`;
    return `<tr class="${o.incomplete ? "w" : ""}${dupSet.has(i) ? " d" : ""}"><td>${n + 1}</td>
      <td>${fDate(o.date)}<span class="sub"> ${to12(o.time)}</span>${o.incomplete ? `<button class="flag act" type="button" data-edit="${i}" title="Some details could not be read. Click to edit">check · edit</button>` : ""}${dupSet.has(i) ? `<button class="flag act dup" type="button" data-edit="${i}" title="Possible duplicate. Click to edit, or fix it under Needs attention">duplicate?</button>` : ""}${S.dupIds.has(o.id) ? '<span class="flag" title="Already in your Stocks export, so it is skipped">in Stocks</span>' : ""}</td>
      <td><b>${esc(o.symbol)}</b></td><td>${o.side ? `<span class="tag ${o.side.toLowerCase()}">${o.side}</span>` : "—"}</td>
      <td>${esc(o.product)} <span class="sub">${esc(o.exchange)}</span></td>
      <td class="r">${o.orderQty == null ? "—" : `${o.filledQty ?? 0}<span class="sub"> / ${o.orderQty}</span>`}</td>
      <td class="r">${o.price > 0 ? inr(o.price) : "—"}</td><td class="r">${o.status === "EXECUTED" ? inr(orderValue(o)) : "—"}</td>
      <td>${o.status ? `<span class="st ${st}">${o.status[0] + o.status.slice(1).toLowerCase()}</span>` : "—"}</td>${showCol ? "<td></td>" : ""}</tr>`;
  }).join("") : `<tr class="none"><td colspan="${showCol ? 10 : 9}">No orders match.</td></tr>`;
  $("count").textContent = `${rows.length} of ${S.orders.length} orders`;
}

/* ================= issues: check, duplicates, fixes ================= */
const need = o => [!o.symbol && "symbol", !o.date && "date", !o.side && "side", !o.status && "status", (!o.time && !o.noTime) && "time", o.orderQty == null && "shares", !(o.price > 0) && "price"].filter(Boolean);
function dupGroups() {
  const g = new Map();
  S.orders.forEach((o, i) => { if (!o.symbol || !o.date) return; const k = [o.date, o.symbol, o.side, o.price, o.status, o.filledQty, o.orderQty].join("|"); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
  return [...g.values()].filter(ix => ix.length > 1 && !ix.every(i => S.orders[i].dupOk));
}
const brief = o => `${esc(o.symbol || "No symbol")} · ${fDate(o.date)}${o.time ? " " + to12(o.time) : ""}`;
const abtn = (act, ix, label, cls = "") => `<button class="g-btn sm ${cls}" type="button" data-act="${act}" data-ix="${[].concat(ix).join(",")}">${label}</button>`;
function renderIssues() {
  const items = [];
  dupGroups().forEach(ix => {
    const o = S.orders[ix[0]], same = new Set(ix.map(i => S.orders[i].time || "")).size === 1;
    items.push({c: "dup", t: `<b>${esc(o.symbol)}</b> ${esc(o.side)} ${o.filledQty ?? "?"}/${o.orderQty ?? "?"} @ ${o.price > 0 ? inr(o.price) : "?"} on ${fDate(o.date)}<small>Found ${ix.length} times. ${same ? "Identical rows, probably read twice from overlapping screenshots." : "Same details at different times, so these may be real separate orders."}</small>`,
      a: abtn("rmdup", ix, "Remove extra", "pri") + abtn("keep", ix, "Keep all") + abtn("edit", ix, "Edit")});
  });
  S.orders.forEach((o, i) => {
    const m = need(o), p = []; let fix = "";
    if (m.length) p.push("Missing " + m.join(", "));
    if (o.status === "EXECUTED" && o.orderQty != null && o.filledQty !== o.orderQty) { p.push(`Executed but filled ${o.filledQty ?? 0} of ${o.orderQty}`); fix = abtn("fillfix", i, `Set filled to ${o.orderQty}`); }
    if ((o.status === "CANCELLED" || o.status === "REJECTED") && o.filledQty > 0) { p.push(`${o.status.toLowerCase()} but ${o.filledQty} filled`); fix = abtn("fillfix", i, "Set filled to 0"); }
    if (p.length) items.push({c: "", t: `<b>${brief(o)}</b> ${esc(o.side)}<small>${esc(p.join(". "))}.</small>`, a: fix + abtn("edit", i, "Edit", m.length ? "pri" : "")});
  });
  const n = items.length;
  (S.errors || []).forEach(e => items.push({c: "info", t: esc(e), a: abtn("addrow", [], "Add row manually")}));
  S.dupWhy.forEach((why, id) => {
    const i = S.orders.findIndex(o => o.id === id); if (i < 0) return; const o = S.orders[i];
    items.push({c: "info", t: `<b>${brief(o)}</b> ${esc(o.side)}<small>${why === "forced" ? "Matches a transaction in your Stocks export, but will be added anyway." : why === "sig" ? "Matches a transaction in your Stocks export, so it is skipped." : "Same id as a transaction in your Stocks export, so it is skipped."}</small>`,
      a: why === "forced" ? abtn("unforce", i, "Skip it") : why === "sig" ? abtn("force", i, "Add anyway") : ""});
  });
  // BlackRoad skips a sell when the shares are not held, so hint at sells with no earlier buy in this file.
  const run = {};
  S.orders.filter(o => o.status === "EXECUTED" && !o.incomplete && o.filledQty > 0 && o.side).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")).forEach(o => {
    const q = run[o.symbol] = (run[o.symbol] || 0) + (o.side === "BUY" ? o.filledQty : -o.filledQty);
    if (q < 0) { run[o.symbol] = 0; items.push({c: "info", t: `<b>${brief(o)}</b> SELL ${o.filledQty}<small>No earlier buy of this symbol in this file. BlackRoad skips a sell if you do not already hold those shares there.</small>`, a: abtn("edit", S.orders.indexOf(o), "Edit")}); }
  });
  $("fixB").classList.toggle("hide", !n); $("fixB").textContent = `Review ${n} issue${n === 1 ? "" : "s"}`;
  $("issues").innerHTML = `<div class="iss-h"><h3>${n ? "Needs attention · " + n : "Checks"}</h3><div class="export">${S.edit ? "" : abtn("editall", [], "Edit all rows")}${abtn("addrow", [], "Add row")}</div></div>` +
    (items.length ? `<div class="iss-list">${items.map(x => `<div class="iss ${x.c}"><div class="iss-t">${x.t}</div><div class="iss-a">${x.a}</div></div>`).join("")}</div>` : `<p class="sub" style="margin:0">All clear: no missing details or duplicates found.</p>`);
}
function openEdit(ix) {
  S.q = ""; S.fStatus = ""; S.fSide = ""; $("q").value = ""; $("fStatus").value = ""; $("fSide").value = "";
  ix.forEach(i => S.one.add(i)); renderRows();
  setTimeout(() => { const tr = document.querySelector(`tr[data-i="${ix[0]}"]`); if (!tr) return; tr.scrollIntoView({block: "center", behavior: "smooth"}); const f = [...tr.querySelectorAll(".ein")].find(x => !x.value) || tr.querySelector(".ein"); if (f) f.focus({preventScroll: true}); }, 0);
}
function addRow() {
  const o = {id: "man_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: $("defDate").value, symbol: "", side: "", product: "", exchange: "", price: null, status: "", time: "", filledQty: null, orderQty: null, noTime: true, manual: true};
  o.incomplete = incomplete(o); S.orders.push(o); S.warnings = warningsFor(S.orders);
  renderReport(); show("result"); document.querySelector('#rSeg [data-pane="t"]').click(); openEdit([S.orders.length - 1]);
}

/* ================= export ================= */
/* BlackRoad Stocks backup shape: { transactions, prices, seqCounter }.
   With a Stocks export loaded, new orders are merged into it (nothing existing is changed or dropped). */
const sig = t => [t.date, t.symbol, t.type, +t.quantity, +t.price].join("|");
function stocksPart(O) {
  const base = S.base, old = base ? base.transactions : [];
  // Existing transactions are never changed. A new one is skipped when its id exists, or when
  // an existing one has the same date/symbol/side/quantity/price (each existing one covers one new one).
  const ids = new Set(old.map(t => t.id)), left = {}, forced = new Set(O.filter(o => o.addAnyway).map(o => o.id));
  old.forEach(t => { const k = sig(t); left[k] = (left[k] || 0) + 1; });
  S.dupIds = new Set(); S.dupWhy = new Map();
  const fresh = O.filter(o => o.status === "EXECUTED" && !o.incomplete && o.filledQty > 0 && o.side)
    .map(o => ({id: o.id, date: o.date, type: o.side, symbol: o.symbol, name: o.symbol, quantity: o.filledQty, price: o.price,
      notes: "#orderreport", isMTF: false, time: o.time || undefined, exchange: o.exchange || undefined, source: "order-report"}))
    .filter(t => {
      const k = sig(t);
      if (!ids.has(t.id) && forced.has(t.id)) { if (left[k] > 0) S.dupWhy.set(t.id, "forced"); return true; }
      if (ids.has(t.id) || left[k] > 0) { if (!ids.has(t.id)) left[k]--; S.dupIds.add(t.id); S.dupWhy.set(t.id, ids.has(t.id) ? "id" : "sig"); return false; }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  let seq = Math.max(base ? base.seqCounter : 0, ...old.map(t => t.seq || 0), 0);
  fresh.forEach(t => { t.seq = ++seq; });
  const transactions = [...old, ...fresh].sort((a, b) => a.date.localeCompare(b.date) || (a.seq || 0) - (b.seq || 0));
  S.newTx = fresh.length;
  const out = {transactions};
  if (base) { out.prices = base.prices; out.seqCounter = seq; }
  return out;
}
function buildReport() {
  const O = sortOrders(S.orders), cnt = s => O.filter(o => o.status === s).length, dates = O.map(o => o.date).filter(Boolean).sort();
  return {
    schema: "blackroad.order-report", version: 1, exportedBy: {name: "Order Report Reader"}, exportedAt: new Date().toISOString(),
    source: {type: "screenshot", files: S.files, engine: "tesseract.js", extractedAt: new Date().toISOString()},
    summary: {orders: O.length, executed: cnt("EXECUTED"), cancelled: cnt("CANCELLED"), rejected: cnt("REJECTED"), pending: cnt("PENDING"),
      symbols: [...new Set(O.map(o => o.symbol))].sort(), from: dates[0] || null, to: dates[dates.length - 1] || null},
    orders: O.map(o => ({id: o.id, date: o.date, time: o.time || null, symbol: o.symbol, side: o.side, product: o.product, exchange: o.exchange,
      price: o.price, status: o.status, filledQty: o.filledQty, orderQty: o.orderQty, incomplete: !!o.incomplete})),
    ...stocksPart(O),
    warnings: warningsFor(O)
  };
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
function save(name, content, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function renderBase() {
  const b = S.base, n = S.newTx || 0;
  $("baseX").classList.toggle("hide", !b);
  $("baseS").textContent = b ? `Merged into ${S.baseName}: ${b.transactions.length} existing + ${n} new transactions.` + (S.dupIds.size ? ` ${S.dupIds.size} already in your Stocks, skipped.` : "") : `${n} transaction${n === 1 ? "" : "s"} in this file.`;
}
function renderJsonPreview() { $("jsonPre").textContent = JSON.stringify(buildReport(), null, 2); renderBase(); }
function csv() {
  const cols = ["date", "time", "symbol", "side", "product", "exchange", "price", "status", "filledQty", "orderQty"];
  return [cols.join(","), ...sortOrders(S.orders).map(o => cols.map(c => JSON.stringify(o[c] ?? "")).join(","))].join("\n");
}


/* ================= saved session (this device only) =================
   Same idea as Statement Reader: the orders you have read (and any Stocks export you merged
   with) are kept in localStorage, so leaving RoadSync or reloading does not lose them.
   "Start over" removes them. Nothing here touches BlackRoad's own data. */
const SESSION_KEY = "sk-session";
function persistSession() {
  try {
    if (!S.orders.length) { localStorage.removeItem(SESSION_KEY); return; }
    const snap = {v: 1, orders: S.orders, files: S.files, dupes: S.dupes, defDate: $("defDate").value};
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({...snap, base: S.base, baseName: S.baseName})); }
    catch (e) { localStorage.setItem(SESSION_KEY, JSON.stringify(snap)); } // merged export too big: keep the orders
  } catch (e) { /* storage blocked or full: the reader still works for this visit */ }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
function restoreSession() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) {}
  if (!s || s.v !== 1 || !Array.isArray(s.orders) || !s.orders.length) return;
  S.orders = sortOrders(s.orders); S.files = Array.isArray(s.files) ? s.files : []; S.dupes = +s.dupes || 0;
  if (s.base && Array.isArray(s.base.transactions)) { S.base = s.base; S.baseName = s.baseName || "your Stocks export"; }
  if (s.defDate) $("defDate").value = s.defDate;
  S.warnings = warningsFor(S.orders); S.errors = [];
  renderReport(); show("result");
}

/* ================= events ================= */
const pick = () => $("file").click();
$("drop").addEventListener("click", pick);
$("drop").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
$("file").addEventListener("change", e => { processFiles(e.target.files); e.target.value = ""; });
$("fileMore").addEventListener("change", e => { processFiles(e.target.files); e.target.value = ""; });
$("addMore").addEventListener("click", () => $("fileMore").click());
["dragenter", "dragover"].forEach(t => window.addEventListener(t, e => { e.preventDefault(); $("drop").classList.add("over"); }));
["dragleave", "drop"].forEach(t => window.addEventListener(t, e => { e.preventDefault(); if (t === "drop" || !e.relatedTarget) $("drop").classList.remove("over"); }));
window.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files); });
window.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith("image/")); if (f.length) processFiles(f); });

function reset() { clearSession(); S.one.clear(); Object.assign(S, {dupes: 0, base: null, baseName: "", orders: [], files: [], raw: [], warnings: [], errors: [], edit: false, q: "", fStatus: "", fSide: ""}); $("q").value = ""; $("fStatus").value = ""; $("fSide").value = ""; $("editB").classList.remove("on"); show("drop", "status", "how"); }
$("reset").addEventListener("click", () => { if (S.orders.length && !globalThis.confirm("Remove the orders saved on this device and start over?")) return; reset(); });
$("failRetry").addEventListener("click", () => { if (S.orders.length) { show("result"); $("fileMore").click(); } else { reset(); pick(); } });
$("failBack").addEventListener("click", () => { S.orders.length ? show("result") : reset(); });

$("rSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-pane]"); if (!b) return; S.pane = b.dataset.pane;
  document.querySelectorAll("#rSeg button").forEach(x => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll("[data-p]").forEach(el => el.classList.toggle("pane-off", el.dataset.p !== S.pane));
});
document.querySelectorAll("[data-p]").forEach(el => el.classList.toggle("pane-off", el.dataset.p !== "o"));

$("q").addEventListener("input", e => { S.q = e.target.value; renderRows(); });
$("fStatus").addEventListener("change", e => { S.fStatus = e.target.value; renderRows(); });
$("fSide").addEventListener("change", e => { S.fSide = e.target.value; renderRows(); });
$("editB").addEventListener("click", e => { S.edit = !S.edit; e.currentTarget.classList.toggle("on", S.edit); e.currentTarget.setAttribute("aria-pressed", S.edit); renderRows(); });
document.querySelector("thead").addEventListener("click", e => {
  const th = e.target.closest("th[data-k]"); if (!th) return;
  S.sort = S.sort.k === th.dataset.k ? {k: th.dataset.k, dir: S.sort.dir === "asc" ? "desc" : "asc"} : {k: th.dataset.k, dir: th.dataset.k === "ts" ? "desc" : "asc"}; renderRows();
});
$("rows").addEventListener("change", e => {
  const f = e.target.dataset.f, tr = e.target.closest("tr[data-i]"); if (!f || !tr) return;
  const o = S.orders[+tr.dataset.i], v = e.target.value;
  if (f === "price") o.price = Number(v.replace(/,/g, "")) || null;
  else if (f === "filledQty" || f === "orderQty") o[f] = v === "" ? null : Math.max(0, parseInt(v, 10) || 0);
  else if (f === "symbol") o.symbol = v.toUpperCase().trim(); else o[f] = v;
  o.incomplete = incomplete(o); S.warnings = warningsFor(S.orders); renderReport();
});
$("rows").addEventListener("click", e => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  S.orders.splice(+b.dataset.del, 1); S.one.clear(); S.warnings = warningsFor(S.orders);
  if (!S.orders.length) return reset(); renderReport();
});
$("baseB").addEventListener("click", () => $("baseFile").click());
$("baseX").addEventListener("click", () => { S.base = null; S.baseName = ""; renderJsonPreview(); });
$("baseFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || !Array.isArray(j.transactions)) throw 0;
    S.base = {transactions: j.transactions, prices: (j.prices && typeof j.prices === "object") ? j.prices : {},
      seqCounter: typeof j.seqCounter === "number" ? j.seqCounter : 0};
    S.baseName = f.name; renderJsonPreview(); toast("Merged with " + f.name);
  } catch (x) { toast("That is not a BlackRoad Stocks export."); }
});
$("dlJson").addEventListener("click", e => { save(`blackroad-order-report-${stamp()}.json`, JSON.stringify(buildReport(), null, 2), "application/json"); flash(e.currentTarget, "Downloaded"); });
$("dlCsv").addEventListener("click", e => { save(`order-report-${stamp()}.csv`, csv(), "text/csv"); flash(e.currentTarget, "Downloaded"); });
$("cpJson").addEventListener("click", async e => { const b = e.currentTarget; try { await navigator.clipboard.writeText(JSON.stringify(buildReport(), null, 2)); flash(b, "Copied"); } catch (x) { toast("Copy is blocked here. Use Download JSON."); } });

$("issues").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const ix = b.dataset.ix ? b.dataset.ix.split(",").map(Number) : [], act = b.dataset.act, O = S.orders;
  if (act === "edit") return openEdit(ix);
  if (act === "addrow") return addRow();
  if (act === "editall") { S.edit = true; $("editB").classList.add("on"); $("editB").setAttribute("aria-pressed", true); renderRows(); return renderIssues(); }
  if (act === "keep") ix.forEach(i => O[i].dupOk = true);
  if (act === "rmdup") { const keep = ix.find(i => !O[i].incomplete) ?? ix[0]; ix.filter(i => i !== keep).sort((a, c) => c - a).forEach(i => O.splice(i, 1)); S.one.clear(); toast("Duplicate removed"); }
  if (act === "fillfix") { const o = O[ix[0]]; o.filledQty = o.status === "EXECUTED" ? o.orderQty : 0; o.incomplete = incomplete(o); }
  if (act === "force" || act === "unforce") O[ix[0]].addAnyway = act === "force";
  S.warnings = warningsFor(O); renderReport();
});
$("rows").addEventListener("click", e => {
  const ed = e.target.closest("[data-edit]"), dn = e.target.closest("[data-done]");
  if (ed) openEdit([+ed.dataset.edit]); else if (dn) { S.one.delete(+dn.dataset.done); renderRows(); renderIssues(); }
});
$("fixB").addEventListener("click", () => { document.querySelector('#rSeg [data-pane="t"]').click(); $("issues").scrollIntoView({behavior: "smooth"}); });
$("failManual").addEventListener("click", addRow);

$("defDate").addEventListener("change", () => { if (S.orders.length) persistSession(); });
{ const d = new Date(); $("defDate").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
show("drop", "status", "how");
restoreSession();
/* Load the text reader in the background so the first screenshot starts quickly. */
(window.requestIdleCallback || setTimeout)(() => { loadTesseract().catch(() => {}); });

}

export async function mountStockReader(container) {
    const shadow = container.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style><div class="sk-root">${HTML}</div>`;
    const wrap = shadow.querySelector(".sk-root");

    // Follow BlackRoad's theme.
    const syncTheme = () => wrap.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    syncTheme();
    const themeObs = new MutationObserver(syncTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // `document` limited to the reader's own DOM.
    const doc = {
        getElementById: (id) => shadow.getElementById(id),
        querySelector: (q) => shadow.querySelector(q),
        querySelectorAll: (q) => shadow.querySelectorAll(q),
        createElement: (t) => document.createElement(t),
        get activeElement() { return shadow.activeElement; },
        head: document.head,
        body: wrap,
        documentElement: wrap
    };

    // Page-level drag/drop and paste only count while the reader is on screen,
    // and are removed when the page is replaced.
    const page = [];
    const win = {
        addEventListener: (type, fn, opts) => {
            const guarded = (e) => { if (container.isConnected && container.offsetParent !== null) fn(e); };
            window.addEventListener(type, guarded, opts);
            page.push([type, guarded, opts]);
        },
        removeEventListener: () => {}
    };

    run(doc, win);

    const gone = new MutationObserver(() => {
        if (!container.isConnected) {
            themeObs.disconnect();
            gone.disconnect();
            page.forEach(([type, fn, opts]) => window.removeEventListener(type, fn, opts));
        }
    });
    gone.observe(document.body, { childList: true, subtree: true });

    return {};
}
