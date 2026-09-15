import { createFileRoute, Link } from "@tanstack/react-router";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  useDocumentTitle("隐私");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-muted">
          回选馆
        </Link>
        <p className="mt-6 text-sm tracking-[0.35em] text-muted">成语故事</p>
        <h1 className="mt-1 font-display text-4xl text-cinnabar">隐私说明</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-ink-soft">
          <p>
            本应用面向儿童与家长。浏览免费故事不强制注册。若要在换设备后继续阅读全年册，可选用邮箱注册；密码经加密保存在收款服务侧，邮箱仅作登录标识。
          </p>
          <p>
            本机仍会缓存开通状态，方便离线打开。服务端账号权益用于跨设备同步。卸载浏览器数据或退出登录后，本机缓存会失效，需重新登录领取。
          </p>
          <p>旁白音频只在点击播放后按页加载。应用不会自动把故事声音缓存到离线包里。</p>
          <p>我们不在应用内嵌入统计分析 SDK，也不把孩子的翻页轨迹上传到服务器。</p>
          <p>
            插图为 AI 生成。古风馆主图、前 24 本儿童线，以及 11 本儿童馆 Grok 重绘标注 Created with
            Grok；其余 65 本儿童馆重绘与工笔线不使用该标注。工笔线已有 Cursor
            生成记录，作为独立一类纳入发行权清单，不并入 Grok 主图。Grok 相关条款见 xAI
            的对外说明。生成方式本身不是发行许可。
          </p>
          <p>全年册付款通道尚未对公众开通。开通前，本页不会收集支付账号或身份证信息。</p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
