// 결과 화면의 스타일. 확정 시안(sheet-wide-v4)과 3단계 시안 후보 가의 배치를 옮겼다. 두 언어를 함께 그리고 지금 언어가 아닌 쪽을 숨긴다(설계 13.1, 13.2, 13.4, 「3단계 계획 전 결정」의 1번)
export const REPORT_CSS = `
:root{--font:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace;--paper:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--mute:#898781;--hair:#e1e0d9;--wash:#f3f2ee;--track:#cde2fb;--fill:#2a78d6;--stamp:#2e3566;--up:#006300;--teal:#3ab4aa;--navy:#2e3566}
*{box-sizing:border-box}
html[data-ui="en"] [data-l="ko"],html[data-ui="ko"] [data-l="en"]{display:none!important}
[hidden]{display:none!important}
html{scroll-padding-top:12px}
body{margin:0;font-family:var(--font);font-size:16px;line-height:1.5;background:#dedcd5;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere}
button{font:inherit;cursor:pointer;color:inherit}
a{color:inherit}
button:focus-visible,summary:focus-visible,a:focus-visible,[tabindex]:focus-visible,textarea:focus-visible{outline:3px solid #2a78d6;outline-offset:2px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100% - 32px));padding:10px 16px;border-radius:8px;background:#0b0b0b;color:#fff;font-size:14px;display:none;z-index:40}
.sheet{max-width:1240px;margin:32px auto 80px;background:var(--paper);padding:40px 52px 30px;position:relative;box-shadow:0 1px 0 rgba(11,11,11,.05),0 18px 44px rgba(11,11,11,.12)}
.sheet::before{content:"";position:absolute;inset:0 0 auto 0;height:10px;background:var(--teal)}
.sheet::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;background:radial-gradient(circle at 12px -1px,var(--paper) 11px,transparent 12px) repeat-x;background-size:24px 12px}
.hd{display:grid;grid-template-columns:1fr auto;gap:16px 24px;align-items:end;padding-bottom:18px;border-bottom:2px solid var(--ink)}
.brandrow{display:flex;align-items:center;gap:10px}
.brandrow img,.brandrow .noart{width:32px;height:32px;border-radius:50%;display:block;flex:none}
.brandrow .noart{background:var(--wash);border:1px solid var(--hair)}
.brand{font-weight:800;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:var(--ink2)}
.title{font-size:32px;font-weight:800;letter-spacing:-.02em;margin:2px 0 0;line-height:1.15}
.hdr{display:grid;gap:10px;justify-items:end}
.langsw{display:inline-flex;border:1px solid var(--ink);border-radius:8px}
.langsw button{min-height:44px;min-width:44px;padding:0 14px;border:0;border-radius:0;background:var(--paper);font-size:14px;color:var(--ink2)}
.langsw button:first-child{border-radius:7px 0 0 7px}
.langsw button:last-child{border-radius:0 7px 7px 0}
.langsw button+button{border-left:1px solid var(--ink)}
.langsw button[aria-pressed="true"]{background:var(--ink);color:#fff;font-weight:700}
.langsw button:focus-visible{position:relative;z-index:1}
.info{display:grid;grid-auto-flow:column;gap:0;margin:0;border:1px solid var(--ink);border-radius:2px}
.info div{padding:7px 16px;border-left:1px solid var(--ink)}
.info div:first-child{border-left:0}
.info dt{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.info dd{margin:0;font-family:var(--mono);font-size:13px;font-weight:700;white-space:nowrap}
.hero{display:grid;grid-template-columns:264px 330px 1fr;gap:26px 40px;align-items:center;padding:28px 0 26px}
.scene{margin:0}
.scene .pic{width:264px;height:264px;border-radius:20px;overflow:hidden}
.scene img{width:100%;height:100%;object-fit:cover;display:block}
.scene .ph{width:100%;height:100%;display:grid;place-items:center;text-align:center;padding:20px;border:2px dashed var(--mute);border-radius:20px;background:repeating-linear-gradient(135deg,#f3f2ee 0 10px,#ecebe5 10px 20px);color:var(--ink2);font-size:14px;font-weight:700}
.scene figcaption{margin-top:8px;font-size:13px;font-weight:700;color:var(--ink2);text-align:center;line-height:1.4}
.score{position:relative;height:170px}
.score .n{font-size:176px;line-height:.86;font-weight:800;letter-spacing:-.06em}
.score .n.none{color:var(--ink2);font-size:52px;letter-spacing:-.02em;line-height:1.1;padding-top:44px}
.score .lb{position:absolute;left:4px;bottom:-6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:var(--ink2)}
.stamp{position:absolute;right:0;top:-2px;width:124px;height:124px;border-radius:50%;border:3px solid var(--stamp);color:var(--stamp);display:grid;place-items:center;text-align:center;transform:rotate(-13deg);font-weight:800;background:rgba(252,252,251,.72)}
.stamp::before{content:"";position:absolute;inset:6px;border:1px solid var(--stamp);border-radius:50%}
.stamp b{display:block;font-size:58px;line-height:1}
.stamp em{font-style:normal;font-size:10px;letter-spacing:.2em}
.axes{display:grid;gap:12px}
.ax{display:grid;grid-template-columns:112px 1fr 48px;gap:16px;align-items:center}
.ax .nm{font-size:15px;font-weight:700;line-height:1.25}
.ax .tr{height:12px;border-radius:6px;background:var(--track);position:relative;overflow:hidden}
.ax .tr.none{background:repeating-linear-gradient(135deg,#ecebe5 0 6px,#f6f5f1 6px 12px)}
.ax .tr i{position:absolute;inset:0 auto 0 0;border-radius:0 4px 4px 0;background:var(--fill)}
.ax .v{font-family:var(--mono);font-size:20px;font-weight:700;text-align:right}
.ax .v.none{font-size:12px;font-family:var(--font);color:var(--ink2);line-height:1.2}
.ax .ct{display:block;font-size:12px;font-weight:400;color:var(--ink2);white-space:nowrap}
.ax .ct b{color:var(--ink)}
.verdict{grid-column:1/-1;display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:32px;align-items:start;border-top:1px dashed var(--mute);padding-top:20px}
.verdict h2{margin:0 0 4px;font-size:12px;letter-spacing:.14em;color:var(--ink2);font-weight:700}
.verdict p{margin:0;font-size:17px;line-height:1.5;font-weight:700;letter-spacing:-.01em}
.verdict .pt{display:grid;grid-template-columns:20px 1fr;gap:8px;align-items:start;font-size:14px;line-height:1.45}
.verdict .pt b{display:block;font-size:12px;letter-spacing:.04em;color:var(--ink2);font-weight:700}
.verdict .pt svg{margin-top:2px}
.withheld{grid-column:2/-1;margin:0;font-size:14px;color:var(--ink2)}
h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;margin:0;color:var(--ink);font-weight:800}
h2 .no{font-family:var(--mono);color:var(--ink2);margin-right:10px;font-weight:700}
h2 .cnt{font-family:var(--mono);margin-left:10px;color:var(--ink2);font-weight:700}
.cols{display:grid;grid-template-columns:1fr 1fr;border-top:1px dashed var(--mute)}
.col{padding:22px 0 8px;min-width:0}
.col:first-child{padding-right:36px;border-right:1px dashed var(--mute)}
.col:last-child{padding-left:36px}
.col>h2{display:flex;align-items:center;padding-bottom:6px;min-height:62px}
.stk{width:56px;height:56px;border-radius:50%;flex:none;margin-left:auto;display:block;object-fit:cover}
.it{display:grid;grid-template-columns:108px minmax(0,1fr);gap:18px;padding:16px 0;border-top:1px solid var(--hair);scroll-margin-top:16px}
.col>.it:first-of-type,.lists .it:first-of-type{border-top:0}
.fig{font-family:var(--mono);font-weight:700;font-size:30px;line-height:1.1;letter-spacing:-.03em;overflow-wrap:normal}
.good .fig{color:var(--up)}
.fig small{display:block;font-family:var(--font);font-size:12px;font-weight:700;letter-spacing:.01em;color:var(--ink2);margin-top:3px;line-height:1.3}
.fig .u{display:block;font-family:var(--font);font-size:13px;font-weight:700;letter-spacing:0;color:var(--ink);margin-top:2px}
.fig.lg{font-size:26px}
.fig.nv{font-family:var(--font);font-size:16px;letter-spacing:0;line-height:1.3;color:var(--ink)}
.sev{display:inline-flex;align-items:flex-start;gap:6px;font-size:12px;font-weight:700;line-height:18px;margin-top:8px}
.sev svg{flex:none}
.it h3{margin:0;font-size:17px;line-height:1.35;letter-spacing:-.01em}
.it .top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;align-items:baseline}
.it .top h3{flex:1 1 12em;min-width:0}
.it .top .tags{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;justify-content:flex-end}
.it p{margin:4px 0 0;font-size:14px;color:var(--ink2)}
.it p.fix{color:var(--ink)}
.tag{font-size:12px;font-weight:700;white-space:nowrap;color:var(--ink2)}
.tag.up{font-family:var(--mono);color:var(--up)}
.chips{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;font-size:12px}
.chips li{font-family:var(--mono);padding:2px 8px;border:1px solid var(--hair);border-radius:12px;background:#fff}
.chips li.k{font-family:var(--font);font-weight:700;color:var(--ink2);border:0;background:none;padding:2px 0}
.chips li small{font-family:var(--font);color:var(--ink2);margin-left:4px}
details{margin-top:2px}
summary{font-size:13px;color:var(--ink2);cursor:pointer;width:max-content;max-width:100%;min-height:44px;padding:12px 0;line-height:20px}
.how p{font-size:13px;background:var(--wash);border-radius:4px;padding:8px 10px;margin-top:4px;color:var(--ink)}
.how p.ln{font-size:12.5px;font-variant-numeric:tabular-nums}
.act{margin-top:10px;min-height:44px;padding:0 14px;border-radius:6px;border:1px solid var(--ink);background:var(--paper);font-size:14px;font-weight:700}
.copybox{margin-top:8px;display:grid;gap:4px;font-size:13px;color:var(--ink)}
.copybox textarea{font-family:var(--mono);font-size:13px;padding:8px;border:1px solid var(--ink);border-radius:4px;resize:vertical;min-height:44px;width:100%}
.names{margin:4px 0 0;padding:0;list-style:none;display:grid;gap:6px}
.names li{font-size:12px;color:var(--ink)}
.names li>b{display:block;font-weight:700;color:var(--ink2);margin-bottom:2px}
.names code{font-family:var(--mono);font-size:12px;background:#fff;border:1px solid var(--hair);border-radius:10px;padding:1px 7px;margin:0 4px 2px 0;display:inline-block}
.names .when{display:block;margin:2px 0 4px;color:var(--ink2)}
.names pre{margin:4px 0;padding:6px 8px;background:#fff;border:1px solid var(--hair);border-radius:4px;font-family:var(--mono);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.lists{border-top:1px dashed var(--mute);padding:6px 0 10px;display:grid;grid-template-columns:1fr 1fr;gap:0 36px}
.lists>details{margin:0;padding:12px 0;min-width:0}
.lists>details>summary{font-size:14px;font-weight:800;color:var(--ink);letter-spacing:.04em}
.lists>details>summary .cnt{font-family:var(--mono);color:var(--ink2)}
.empty{font-size:14px;color:var(--ink2);margin:6px 0 0}
.use{border-top:1px dashed var(--mute);padding:22px 0 20px}
.usehd{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.use.as-table .chart,.use:not(.as-table) .table,.use.as-table .when-chart,.use:not(.as-table) .when-table{display:none}
.grid2{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:48px;margin-top:22px;align-items:start}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px;border:1px solid var(--hair);border-radius:4px}
.kpi{padding:14px 18px;border-left:1px solid var(--hair)}
.kpi:first-child{border-left:0}
.kpi b{display:block;font-size:30px;letter-spacing:-.03em;line-height:1.15;white-space:nowrap}
.kpi span{font-size:12px;color:var(--ink2)}
.sub{font-size:12px;font-weight:700;color:var(--ink2);margin:0 0 8px}
.mini-btn{min-height:44px;padding:0 10px;border:1px solid var(--hair);border-radius:6px;background:#fff;font-size:12px;font-weight:700;color:var(--ink)}
.heat{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.heat span{aspect-ratio:1;border-radius:3px}
.heat .wd{aspect-ratio:auto;font-size:11px;color:var(--ink2);text-align:center}
.heat .pad{visibility:hidden}
.heat .unused{background:#fff;box-shadow:inset 0 0 0 1px var(--hair)}
.heat .unseen{background:repeating-linear-gradient(135deg,#d9d7cf 0 2px,#fff 2px 5px)}
.heatwrap{position:relative}
.tip{position:absolute;z-index:5;pointer-events:none;padding:4px 8px;border-radius:6px;font-size:12px;white-space:nowrap;background:#0b0b0b;color:#fff;transform:translate(-50%,-130%);display:none}
.legend{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;margin-top:8px;color:var(--ink2)}
.legend .ramp{display:inline-flex;gap:3px;align-items:center}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.legend .k{display:inline-flex;gap:5px;align-items:center}
table.tv{border-collapse:collapse;font-size:12px;width:100%}
table.tv th,table.tv td{border-bottom:1px solid var(--hair);padding:4px 6px;text-align:left}
table.tv td.n{font-family:var(--mono);text-align:right}
.tvwrap{max-height:280px;overflow:auto;border:1px solid var(--hair);border-radius:4px}
.tools{display:grid;gap:14px}
.tools .t{display:grid;grid-template-columns:1fr auto;font-size:14px;gap:4px 12px}
.tools .t>b{font-family:var(--mono)}
.splitbar{grid-column:1/-1;display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--track)}
.splitbar i{display:block;height:100%}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.tools small{font-size:12px;color:var(--ink2)}
.shell{margin:16px 0 0;font-size:13px;color:var(--ink2)}
.notices{border-top:1px dashed var(--mute);padding:18px 0 16px}
.notices ul{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.notices li{display:grid;grid-template-columns:20px 1fr;gap:8px;font-size:14px;color:var(--ink)}
.ft{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px 24px;border-top:2px solid var(--ink);padding-top:16px;font-size:13px;color:var(--ink2)}
.ft .lock{display:grid;grid-template-columns:16px 1fr;gap:8px;align-items:start}
.ft .lock svg{margin-top:2px}
.ft .names-note{grid-column:1/-1;margin:0;font-size:13px;color:var(--ink)}
.share{min-height:44px;padding:0 20px;border-radius:6px;border:0;background:var(--ink);color:#fff;font-size:14px;font-weight:700}
dialog.card{width:min(1040px,calc(100% - 24px));max-height:calc(100% - 24px);border:0;border-radius:10px;padding:20px;background:var(--paper)}
dialog.card::backdrop{background:rgba(11,11,11,.55)}
dialog.card h2{font-size:16px;text-transform:none;letter-spacing:0;margin:0 0 12px}
.cardimg{display:block;width:100%;height:auto;border:1px solid var(--hair);border-radius:6px;background:#fff}
.cardft{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--ink2)}
.cardft .btns{display:flex;gap:8px}
.cardft a,.cardft button{min-height:44px;display:inline-flex;align-items:center;padding:0 16px;border-radius:6px;font-size:14px;font-weight:700;text-decoration:none}
.cardft a{background:var(--ink);color:#fff}
.cardft button{border:1px solid var(--ink);background:var(--paper)}
@media (max-width:1100px){
.sheet{padding:32px 28px 24px}
.hero{grid-template-columns:208px 300px 1fr;gap:22px 28px}
.scene .pic{width:208px;height:208px}
.score{height:146px}.score .n{font-size:150px}
.stamp{width:104px;height:104px}.stamp b{font-size:48px}
.verdict{gap:22px}
.grid2{gap:32px}
}
@media (max-width:920px){
.hero{grid-template-columns:208px 1fr}.axes{grid-column:1/-1}.score{max-width:300px}
.withheld{grid-column:1/-1}
.kpis{grid-template-columns:1fr 1fr}.kpi:nth-child(odd){border-left:0}.kpi:nth-child(n+3){border-top:1px solid var(--hair)}
.grid2{grid-template-columns:1fr}
}
@media (max-width:760px){
.scene{justify-self:center}.verdict{grid-template-columns:1fr;gap:14px}
.sheet{margin:0 0 40px;padding:28px 18px 22px}
.hd{grid-template-columns:1fr}.hdr{justify-items:start}
.info{grid-auto-flow:row;grid-template-columns:1fr 1fr}.info div:nth-child(odd){border-left:0}.info div:nth-child(n+3){border-top:1px solid var(--ink)}
.title{font-size:26px}
.hero{grid-template-columns:1fr}.score{height:150px;max-width:330px}.score .n{font-size:150px}
.ax{grid-template-columns:100px 1fr 44px;gap:12px}
.kpi b{font-size:24px}
.cols,.lists{grid-template-columns:1fr}.col:first-child{padding-right:0;border-right:0;border-bottom:1px dashed var(--mute)}.col:last-child{padding-left:0}
.it{grid-template-columns:84px minmax(0,1fr);gap:12px}.fig{font-size:24px}.fig.lg{font-size:21px}
.it .top{flex-direction:column;gap:2px}.it .top h3{flex:none}.it .top .tags{justify-content:flex-start}
.ft{grid-template-columns:1fr}.share{width:100%}
}
@media (prefers-reduced-motion:no-preference){.ax .tr i{transition:width .5s ease-out}}
`;
