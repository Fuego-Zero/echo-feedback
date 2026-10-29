import { useEffect, useMemo, useRef, useState } from "react";

import previewCss from "./sdkPreview.css?inline";

export default function SdkPreview({ uiStyle }: { uiStyle: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const resize = (event: MessageEvent<unknown>) => {
      // 沙箱来源为 opaque origin，只接受当前预览窗口的尺寸消息。
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }

      const { data } = event;
      if (
        !data ||
        typeof data !== "object" ||
        !("type" in data) ||
        data.type !== "echo-preview-size" ||
        !("height" in data) ||
        typeof data.height !== "number" ||
        !Number.isFinite(data.height) ||
        data.height < 100 ||
        data.height > 1200
      ) {
        return;
      }

      setHeight(Math.ceil(data.height));
      setReady(true);
    };

    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, []);
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
    const css = JSON.stringify(previewCss).replaceAll("<", "\\u003c");
    // 真实 SDK 渲染原生文字与控件；占位 AK 和 CSP 阻断业务提交。
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<style>html,body{margin:0;background:transparent;overflow:hidden}#message{padding:20px;font:14px system-ui;color:#766552}</style></head><body>
<p id="message">正在加载预览…</p>
<script nonce="${nonce}" src="${location.origin}/sdk/0.1.0/echo-feedback.iife.js"></script>
<script nonce="${nonce}">
const message=document.getElementById('message');
if(!window.EchoFeedback){message.textContent='预览加载失败，请重新打开接入弹窗。';}
else {
  const feedback=EchoFeedback.init(${options});
  const shadow=document.querySelector('echo-feedback').shadowRoot;
  const style=document.createElement('style');
  style.textContent=${css};
  shadow.append(style);
  const dialog=shadow.querySelector('dialog');
  shadow.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  message.hidden=true;
  // 只展示内容，不调用 open()：避免顶层遮罩、自动焦点和手机全屏留白。
  dialog.setAttribute('open','');
  const reportSize=()=>parent.postMessage({type:'echo-preview-size',height:dialog.getBoundingClientRect().height},'*');
  const observer=new ResizeObserver(reportSize);
  observer.observe(dialog);
  document.fonts.ready.then(reportSize);
  window.addEventListener('pagehide',()=>{observer.disconnect();feedback.destroy();},{once:true});
}
</script></body></html>`;
  }, [uiStyle]);
  return (
    <section className="sdk-preview" aria-label="表单风格预览" data-ready={ready}>
      <div className="sdk-preview-heading">
        <h3>表单预览</h3>
        <span className="muted">明亮模式 · 仅展示外观</span>
      </div>
      <iframe
        key={uiStyle}
        ref={frameRef}
        inert
        sandbox="allow-scripts"
        srcDoc={source}
        style={{ height }}
        tabIndex={-1}
        title="SDK 表单风格预览"
        aria-hidden="true"
      />
    </section>
  );
}
