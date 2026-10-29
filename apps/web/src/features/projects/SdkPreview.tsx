import { useMemo, useRef } from "react";

export default function SdkPreview({ uiStyle }: { uiStyle: string }) {
  const previewRef = useRef<HTMLElement>(null);
  const source = useMemo(() => {
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
    const options = JSON.stringify({
      serverUrl: location.origin,
      ak: "preview".padEnd(43, "0"),
      uiStyle,
      theme: "light",
      showTrigger: false,
      nonce,
    }).replaceAll("<", "\\u003c");
    // 独立沙箱只加载本地 SDK；不传项目 AK，并禁止所有网络提交。
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<style>body{margin:0;background:#f4ebdd;font:14px system-ui;color:#302b26}p{padding:16px}</style></head><body>
<p id="message">正在加载预览…</p>
<script nonce="${nonce}" src="${location.origin}/sdk/0.1.0/echo-feedback.iife.js"></script>
<script nonce="${nonce}">
const message=document.getElementById('message');
if(!window.EchoFeedback){message.textContent='预览加载失败，请重新打开接入弹窗。';}
else {
  const feedback=EchoFeedback.init(${options});
  const shadow=document.querySelector('echo-feedback').shadowRoot;
  shadow.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  message.hidden=true;
  feedback.open();
  window.addEventListener('pagehide',()=>feedback.destroy(),{once:true});
}
</script></body></html>`;
  }, [uiStyle]);
  return (
    <section ref={previewRef} className="sdk-preview" aria-label="表单风格预览">
      <h3>表单预览</h3>
      <p className="muted">明亮模式 · 仅展示外观，不可交互</p>
      <iframe
        key={uiStyle}
        inert
        sandbox="allow-scripts"
        srcDoc={source}
        tabIndex={-1}
        title="SDK 表单风格预览"
        aria-hidden="true"
        onLoad={() => {
          // 隔离 SDK 自动聚焦行为，键盘操作始终留在接入弹窗。
          previewRef.current
            ?.closest(".ant-modal")
            ?.querySelector<HTMLElement>('[aria-label="表单风格"]')
            ?.focus({ preventScroll: true });
        }}
      />
    </section>
  );
}
