export const metadata = {
  title: "Psychiatry Lead Agent",
  description: "Sources, qualifies and drafts outreach to psychiatry practices.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
        <style>{`
:root{
  --slate:#50808E; --sage:#84B59F; --euc:#69A297;
  --ink:#1F2A28; --muted:#5B6B67; --line:#DCE6E2;
  --bg:#FBFCFC; --card:#FFFFFF; --soft:#F2F6F4; --soft2:#E7F0EC;
  --warn:#B85042; --amber:#B8893F;
}
@media (prefers-color-scheme: dark){
  :root{
    --ink:#E8EFEC; --muted:#9BACA7; --line:#2C3A37;
    --bg:#131A19; --card:#1A2321; --soft:#1E2927; --soft2:#243330;
    --slate:#7FA9B5; --sage:#8FC0AA; --euc:#7FB3A7;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
header{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:22px}
.eyebrow{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--euc);font-weight:600;margin:0 0 8px}
h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:clamp(25px,4vw,36px);margin:0 0 10px;letter-spacing:-.01em}
.sub{color:var(--muted);max-width:66ch;margin:0}
.controls{display:flex;flex-wrap:wrap;gap:9px;margin:20px 0 10px}
input{font-family:inherit;font-size:14px;padding:10px 13px;border-radius:8px;
  border:1px solid var(--line);background:var(--card);color:var(--ink);min-width:200px;flex:1}
input:focus{outline:none;border-color:var(--euc)}
button{font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;border-radius:8px;
  border:1px solid transparent;padding:10px 20px;transition:.15s}
.primary{background:var(--slate);color:#fff}
.primary:hover:not(:disabled){filter:brightness(1.08)}
.primary:disabled{opacity:.5;cursor:not-allowed}
.status{font-size:13px;color:var(--muted);font-family:"JetBrains Mono",monospace;margin:0 0 20px}
.err{background:#FBEAE8;color:#8C3529;border-radius:8px;padding:11px 14px;font-size:13.5px;margin-bottom:18px}
@media (prefers-color-scheme: dark){.err{background:#3A1F1C;color:#E8A79D}}
.stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:24px}
.stage{background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:12px 14px;opacity:.45;transition:.3s}
.stage.on{opacity:1;border-color:var(--euc);background:var(--soft2)}
.stage.done{opacity:1}
.stage .n{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--euc);font-weight:600}
.stage .t{font-weight:600;font-size:14px;margin-top:3px}
.stage .d{font-size:12px;color:var(--muted);margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:820px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:16px 18px}
.card.fit{border-left:3px solid var(--sage)}
.card.nofit{border-left:3px solid var(--warn)}
.card.pending{border-left:3px solid var(--amber)}
.pname{font-family:Fraunces,Georgia,serif;font-size:17px;font-weight:600;margin:0 0 3px}
.pmeta{font-size:12.5px;color:var(--muted);margin:0 0 10px;font-family:"JetBrains Mono",monospace;word-break:break-word}
.verdict{display:inline-block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  font-weight:600;padding:3px 9px;border-radius:999px;margin-bottom:10px}
.v-fit{background:var(--sage);color:#12211B}
.v-nofit{background:var(--warn);color:#fff}
.v-pending{background:var(--amber);color:#fff}
.reason{background:var(--soft);border-radius:7px;padding:11px 13px;font-size:13px;margin-bottom:10px}
.reason .rh{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--euc);font-weight:600;margin-bottom:5px}
.signals{list-style:none;padding:0;margin:0 0 10px;font-size:12.5px}
.signals li{padding:3px 0 3px 15px;position:relative;color:var(--muted)}
.signals li:before{content:"\\2022";position:absolute;left:2px;color:var(--euc)}
.draft{background:var(--soft2);border:1px solid var(--line);border-radius:7px;padding:13px 15px;
  font-size:13.5px;white-space:pre-wrap;line-height:1.6;margin-top:10px}
.draft .dh{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--euc);
  font-weight:600;margin-bottom:7px;white-space:normal}
.src{font-size:11.5px;color:var(--muted);margin-top:9px;font-style:italic}
.work{font-size:12px;color:var(--muted);font-family:"JetBrains Mono",monospace;margin:6px 0 0}
.note{background:var(--soft);border-left:3px solid var(--slate);border-radius:0 8px 8px 0;
  padding:14px 17px;margin:26px 0;font-size:13.5px;color:var(--muted)}
.note strong{color:var(--ink)}
footer{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.spin{display:inline-block;width:11px;height:11px;border:2px solid var(--line);
  border-top-color:var(--euc);border-radius:50%;animation:sp .7s linear infinite;
  vertical-align:-1px;margin-right:7px}
@keyframes sp{to{transform:rotate(360deg)}}
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
