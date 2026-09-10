import { useEffect, useRef, useState } from "react";
import type { ExperimentResult, Point } from "./model";

export function Chart({ result }: { result: ExperimentResult }) {
  const { points, bars, reference, comparison, marker } = result;
  const host=useRef<HTMLDivElement>(null);
  const [compact,setCompact]=useState(false);
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setCompact(entries[0].contentRect.width<480));
    if(host.current)observer.observe(host.current);
    return ()=>observer.disconnect();
  },[]);
  const width=compact?360:760, height=compact?300:330, pad=compact?48:55;
  const minX=result.domain?.[0] ?? Math.min(...points.map(p=>p.x));
  const maxX=result.domain?.[1] ?? Math.max(...points.map(p=>p.x));
  const maxY=result.domain?.[2] ?? (Math.max(...points.map(p=>p.y),...(comparison || []).map(p=>p.y),reference || 0)*1.08 || 1);
  const sx=(x:number)=>pad+(x-minX)/Math.max(maxX-minX,1e-9)*(width-pad*2);
  const sy=(y:number)=>height-pad-y/maxY*(height-pad*2);
  const line=(values:Point[])=>values.map((p,i)=>`${i?"L":"M"}${sx(p.x)},${sy(p.y)}`).join(" ");
  const barWidth=Math.max(2,(width-pad*2)/(points.length+1)*.7);
  return <div ref={host} className="experiment-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="实验结果图">
      <title>{result.summary}</title>
      {[0,.25,.5,.75,1].map(ratio=><g key={ratio}>
        <line x1={pad} y1={sy(maxY*ratio)} x2={width-pad} y2={sy(maxY*ratio)} stroke="#e3e6e0" />
        <text x={pad-9} y={sy(maxY*ratio)+4} textAnchor="end" fontSize="12" fill="#52605a">{(maxY*ratio).toFixed(2)}</text>
        <text x={sx(minX+(maxX-minX)*ratio)} y={height-pad+22} textAnchor="middle" fontSize="12" fill="#52605a">{(minX+(maxX-minX)*ratio).toFixed(1)}</text>
      </g>)}
      {reference !== undefined && <line x1={pad} y1={sy(reference)} x2={width-pad} y2={sy(reference)} stroke="#a66a32" strokeDasharray="6 4" />}
      {bars ? points.map((p,i)=><rect key={i} x={sx(p.x)-barWidth/2} y={sy(p.y)} width={barWidth} height={height-pad-sy(p.y)} fill="#275b4b" opacity=".75"><title>{`x=${p.x.toFixed(3)}，概率=${p.y.toFixed(4)}`}</title></rect>) : <path data-series="current" d={line(points)} fill="none" stroke="#275b4b" strokeWidth="2.5" />}
      {comparison && <path data-series="baseline" d={line(comparison)} fill="none" stroke="#ad533b" strokeWidth="2" strokeDasharray="5 3" />}
      {marker && <g><line x1={sx(marker.x)} y1={height-pad} x2={sx(marker.x)} y2={sy(marker.y)} stroke="#ad533b" strokeDasharray="4 3" /><circle cx={sx(marker.x)} cy={sy(marker.y)} r="6" fill="#ad533b" /><title>{`当前先验 ${marker.x}，后验 ${marker.y.toFixed(3)}`}</title></g>}
      <text x={width/2} y={height-8} textAnchor="middle" fill="#39443f" fontSize="13">{result.xLabel || (bars ? "取值" : "试验次数")}</text>
      <text x={pad} y="20" fill="#39443f" fontSize="13">{result.yLabel || (bars ? "频率 / 概率" : "频率")}</text>
    </svg>
    <p className="text-sm text-slate-600">实线 / 柱：当前结果{comparison ? ` · 虚线：${result.comparisonLabel}` : reference !== undefined ? ` · 虚线：理论值 ${(reference*100).toFixed(1)}%` : ""}</p>
  </div>;
}

export function Scatter({points}:{points:Point[]}) {
  return <svg viewBox="0 0 600 600" className="mx-auto w-full max-w-[440px]" role="img" aria-label="蒙特卡洛随机点">
    <rect x="20" y="20" width="560" height="560" fill="none" stroke="#c5cec6" />
    <path d="M20 20 A560 560 0 0 1 580 580" fill="none" stroke="#275b4b" strokeWidth="3" />
    {points.map((p,i)=><circle key={i} cx={20+p.x*560} cy={580-p.y*560} r={points.length>2000?1.1:1.8} fill={p.label==="圆内"?"#275b4b":"#a66a32"} opacity=".65" />)}
    <text x="22" y="596">0</text><text x="575" y="596">1</text><text x="4" y="27">1</text>
  </svg>;
}
