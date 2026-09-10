import { Slider } from "antd";
import type { Params } from "./model";
function Range({ label, value, min, max, step = 1, onChange, suffix = "" }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    onChange: (value: number) => void;
}) { return <div><div className="flex justify-between text-sm font-bold text-slate-600"><span>{label}</span><span className="text-teal-800">{value}{suffix}</span></div><Slider ariaLabelForHandle={label} min={min} max={max} step={step} value={value} onChange={onChange}/></div>; }
export function Controls({ id, params, update }: {
    id: string;
    params: Params;
    update: (name: string, value: number) => void;
}) { const controls: React.ReactNode[] = []; if (id === "coin")
    controls.push(<Range key="trials" label="试验次数" value={params.trials} min={20} max={2000} step={20} onChange={v => update("trials", v)}/>, <Range key="p" label="正面概率 p" value={params.p} min={0.1} max={0.9} step={0.05} onChange={v => update("p", v)}/>); if (id === "binomial" || id === "poisson")
    controls.push(<Range key="n" label="试验次数 n" value={params.n} min={5} max={100} onChange={v => update("n", v)}/>, <Range key="p" label="成功概率 p" value={params.p} min={0.01} max={0.95} step={0.01} onChange={v => update("p", v)}/>); if (id === "normal")
    controls.push(<Range key="mu" label="均值 μ" value={params.mu} min={-3} max={3} step={0.1} onChange={v => update("mu", v)}/>, <Range key="sigma" label="标准差 σ" value={params.sigma} min={0.3} max={3} step={0.1} onChange={v => update("sigma", v)}/>); if (id === "clt")
    controls.push(<Range key="sample" label="样本容量" value={params.sampleSize} min={1} max={50} onChange={v => update("sampleSize", v)}/>, <Range key="repeats" label="重复次数" value={params.repeats} min={200} max={2000} step={100} onChange={v => update("repeats", v)}/>); if (id === "bayes")
    controls.push(<Range key="prior" label="先验概率" value={params.prior} min={0.01} max={0.8} step={0.01} onChange={v => update("prior", v)}/>, <Range key="sen" label="灵敏度" value={params.sensitivity} min={0.5} max={0.99} step={0.01} onChange={v => update("sensitivity", v)}/>, <Range key="spe" label="特异度" value={params.specificity} min={0.5} max={0.99} step={0.01} onChange={v => update("specificity", v)}/>); if (id === "confidence")
    controls.push(<Range key="n" label="样本量" value={params.n} min={5} max={200} onChange={v => update("n", v)}/>, <Range key="confidence" label="置信水平" value={params.confidence} min={80} max={99} suffix="%" onChange={v => update("confidence", v)}/>, <Range key="repeats" label="重复次数" value={params.repeats} min={50} max={500} step={10} onChange={v => update("repeats", v)}/>); if (id === "montecarlo")
    controls.push(<Range key="points" label="随机点数" value={params.points} min={100} max={5000} step={100} onChange={v => update("points", v)}/>); return <div className="mt-6 grid gap-x-8 gap-y-2 md:grid-cols-2">{controls}</div>; }
