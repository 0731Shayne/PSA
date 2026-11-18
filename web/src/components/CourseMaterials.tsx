import { useEffect, useState } from "react";
import { Alert, Button, Modal, Spin } from "antd";
import { MathMarkdown } from "./MathMarkdown";
import catalog from "../../../backend/data/course_materials/catalog.json";

const files = import.meta.glob<string>("../../../backend/data/course_materials/files/*", {
  eager: true, import: "default", query: "?url&no-inline",
});
const materials = catalog.map(item => ({
  ...item, url: files[`../../../backend/data/course_materials/files/${item.file}`],
}));
export type CourseMaterial = typeof materials[number];

interface Props {
  spaceName?: string;
  imported?: string[];
  busy?: boolean;
  onImport?: (material: CourseMaterial) => void;
}

export function CourseMaterials({ spaceName, imported, busy, onImport }: Props) {
  const [preview, setPreview] = useState<CourseMaterial | null>(null);
  const [content, setContent] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!preview) return;
    const controller = new AbortController();
    fetch(preview.url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.text();
      })
      .then(text => { if (!controller.signal.aborted) setContent(text); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [preview]);

  return <section className="mt-6 border border-slate-200 bg-white p-5" aria-label="随项目附送的资料">
    <h2 className="text-lg font-bold">随项目附送的资料</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">{onImport && spaceName
      ? `可加入当前资料库「${spaceName}」。解析完成后，已绑定的班级可在答疑中引用。`
      : "可直接阅读或下载。教师可在部署的平台中将资料加入自己的课程资料库。"}</p>
    <ul className="mt-3 divide-y divide-slate-100">{materials.map(item => <li key={item.file} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div><strong>{item.title}</strong><p className="mt-1 text-sm text-slate-600">{item.summary}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {/\.(md|txt)$/i.test(item.file) && <Button onClick={() => { setContent(""); setFailed(false); setPreview(item); }} aria-label={`阅读${item.title}`}>阅读</Button>}
        <a href={item.url} download={item.file} aria-label={`下载${item.title}`} className="px-2 text-indigo-700">下载</a>
        {onImport && <Button disabled={busy || imported?.includes(item.file)} onClick={() => onImport(item)} aria-label={`将${item.title}加入当前库`}>{imported?.includes(item.file) ? "已在库中" : "加入当前库"}</Button>}
      </div>
    </li>)}</ul>
    <Modal title={preview?.title} open={!!preview} onCancel={() => setPreview(null)} closable={{ "aria-label": "关闭资料预览" }} footer={null} width={720}>
      {failed ? <Alert type="error" message="资料加载失败，请重新打开或下载文件。" /> : content ? <article className="tutor-markdown"><MathMarkdown>{content.replace(/^# [^\n]+\n+/, "")}</MathMarkdown></article> : <Spin aria-label="正在加载资料" />}
    </Modal>
  </section>;
}
