import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Empty, Input, Popconfirm, Select, Tag, message } from "antd";
import { DeleteOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { ALGORITHM_VERSION, calculate, describeParams, experiments, type CatalogItem, type ExperimentRun, type Params } from "@/experiments/model";
import { Chart, Scatter } from "@/experiments/Chart";
import { Controls } from "@/experiments/Controls";

export default function ExperimentLab() {
  const navigate=useNavigate();
  const [search,setSearch]=useSearchParams();
  const active=experiments.find(item=>item.id===search.get("id")) || experiments[0];
  const [params,setParams]=useState<Params>(active.defaults);
  const [seed,setSeed]=useState(1);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const [catalog,setCatalog]=useState<CatalogItem[]>([]);
  const [runs,setRuns]=useState<ExperimentRun[]>([]);
  const [compareIds,setCompareIds]=useState<number[]>([]);
  const [loadError,setLoadError]=useState(false);
  const [historyRun,setHistoryRun]=useState<ExperimentRun|null>(null);
  const [runRevision,setRunRevision]=useState(0);
  const result=useMemo(()=>calculate(active.id,params,seed),[active.id,params,seed]);
  const related=catalog.find(item=>item.experiment_id===active.id);
  useEffect(()=>{ if(!historyRun || historyRun.experiment_id!==active.id) {setParams(active.defaults);setHistoryRun(null);} },[active.id]);
  async function load() {
    try {
      const [c,r]=await Promise.all([apiClient.get<CatalogItem[]>("/api/question-bank/experiments/catalog"),apiClient.get<ExperimentRun[]>("/api/question-bank/experiments/runs")]);
      setCatalog(c.data);setRuns(r.data);setLoadError(false);
    } catch {setLoadError(true);}
  }
  useEffect(()=>{void load();},[]);
  function change(name:string,value:number) {setHistoryRun(null);setParams(current=>({...current,[name]:value}));}
  async function saveRun() {
    setSaving(true);
    try {
      await apiClient.post("/api/question-bank/experiments/runs",{experiment_id:active.id,parameters:params,seed,algorithm_version:ALGORITHM_VERSION,result_summary:result.summary,observation:notes[active.id] || ""});
      await load();message.success("实验结果与观察已保存，可以准确重现");
    } catch {message.error("保存失败，当前参数和观察仍保留");} finally {setSaving(false);}
  }
  function reopenRun(run:ExperimentRun) {
    setHistoryRun(run);setSearch({id:run.experiment_id});setParams(run.parameters);
    setSeed(run.seed || 1);setNotes(current=>({...current,[run.experiment_id]:run.observation || ""}));
    window.scrollTo({top:0,behavior:"auto"});
  }
  async function deleteRun(id:number) {
    try {await apiClient.delete(`/api/question-bank/experiments/runs/${id}`);setRuns(rows=>rows.filter(r=>r.id!==id));setCompareIds(ids=>ids.filter(v=>v!==id));}
    catch {message.error("删除失败，记录仍然保留");}
  }
  const legacy=historyRun && (!historyRun.seed || historyRun.algorithm_version!==ALGORITHM_VERSION);
  const compared=compareIds.map(id=>runs.find(run=>run.id===id)).filter((run):run is ExperimentRun=>Boolean(run));
  return <div className="course-page experiment-page">
    <div className="page-heading mb-5"><h1 className="text-2xl font-bold">参数化概率实验室</h1><p className="mt-1 text-sm text-slate-600">先观察变化，再解释原因，最后用一道题验证。</p></div>
    <div className="experiment-picker"><Select aria-label="选择实验" value={active.id} className="w-full sm:!w-80" options={experiments.map(e=>({label:e.title,value:e.id}))} onChange={id=>{setHistoryRun(null);setSearch({id});}} /><Tag>{active.chapter}</Tag></div>
    {loadError && <Alert className="my-4" type="error" showIcon message="实验历史或关联题目加载失败" action={<Button onClick={load}>重新加载</Button>} />}
    <section className="experiment-workbench">
      <div className="experiment-visual"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{active.title}</h2><p className="mt-2 text-sm text-slate-600">{active.description}</p></div>{historyRun && <Tag>历史记录</Tag>}</div>
        {legacy ? <Alert className="my-5" showIcon type="info" message="这条历史记录没有可复现的随机状态" description={<><p>当时结果：{historyRun.result_summary}</p><p>保留原始观察。点击“以这些参数重新运行”生成新结果。</p></>} /> : <div key={runRevision} className="mt-5">{active.id==="montecarlo"?<Scatter points={result.points}/>:<Chart result={result}/>}<p className="experiment-result" aria-live="polite">{result.summary}</p></div>}
        {active.id==="normal" && <p className="mt-3 text-sm text-slate-600">坐标固定为 x∈[−15,15]，与标准正态基准线对比，观察位置、高度与宽度。</p>}
        {active.id==="confidence" && <p className="mt-3 text-sm text-slate-600">从 N(0,1) 独立抽样，假设总体标准差已知为 1，以正态分位数构造均值区间；虚线表示所选置信水平。</p>}
      </div>
      <aside className="experiment-controls"><h3 className="font-bold">调整参数</h3><Controls id={active.id} params={params} update={change}/><div className="mt-5 flex flex-wrap gap-2"><Button type="primary" onClick={()=>{setHistoryRun(null);setSeed(value=>value+1);setRunRevision(v=>v+1);}}>{historyRun?"以这些参数重新运行":"重新运行模拟"}</Button><Button icon={<ReloadOutlined/>} onClick={()=>{setHistoryRun(null);setParams(active.defaults);setSeed(1);}}>重置</Button></div>
        <label htmlFor="experiment-observation" className="mt-6 block font-bold">探究问题</label><p className="my-3 text-sm leading-6">{active.question}</p><Input.TextArea id="experiment-observation" rows={4} maxLength={3000} value={notes[active.id] || ""} placeholder="记录变化，并解释你的判断依据" onChange={e=>setNotes(current=>({...current,[active.id]:e.target.value}))}/><Button className="mt-4" block icon={<SaveOutlined/>} loading={saving} disabled={Boolean(legacy)} onClick={saveRun}>保存本次实验记录</Button>
        <div className="mt-5 border-t pt-4"><p className="mb-2 text-sm font-bold">把结论带回题库验证</p>{related?.question_ids.map(id=><Button key={id} className="mr-2 mb-2" size="small" onClick={()=>navigate(`/questions?query=${id}&task=1`)}>{id}</Button>)}</div>
      </aside>
    </section>
    <section className="mt-6 editorial-panel" aria-labelledby="experiment-history-heading"><h2 id="experiment-history-heading" className="text-lg font-bold">实验记录</h2><p className="mt-2 text-sm text-slate-600">重新打开保留当次结果；选择同一种实验的两条记录并排比较。</p>
      {!runs.length?<Empty description="保存第一次实验，留下你的发现"/>:<div className="mt-4 divide-y">{runs.map(run=><article key={run.id} className="py-4"><div className="flex flex-wrap items-center gap-3"><Checkbox checked={compareIds.includes(run.id)} onChange={e=>{if(e.target.checked && compared.length && compared[0].experiment_id!==run.experiment_id){message.info("请选择同一种实验进行比较");return;}setCompareIds(ids=>e.target.checked?[...ids,run.id].slice(-2):ids.filter(id=>id!==run.id));}}>比较</Checkbox><strong>{experiments.find(e=>e.id===run.experiment_id)?.title}</strong><span className="text-sm text-slate-500">{run.created_at?new Date(run.created_at).toLocaleString("zh-CN"):""}</span><Button className="sm:ml-auto" onClick={()=>reopenRun(run)}>重新打开</Button><Popconfirm title="删除实验记录？" onConfirm={()=>deleteRun(run.id)}><Button danger type="text" aria-label="删除实验记录" icon={<DeleteOutlined/>}/></Popconfirm></div><p className="mt-2 text-sm text-slate-600">{describeParams(run.parameters)}</p><p className="mt-2">{run.result_summary}</p>{run.observation && <p className="mt-2 text-sm">观察：{run.observation}</p>}</article>)}</div>}
      {compared.length===2 && <div className="mt-5"><h3 className="mb-3 font-bold">并排比较</h3><div className="grid gap-4 md:grid-cols-2">{compared.map(run=><div key={run.id} className="border p-4"><p className="font-bold">{run.result_summary}</p><p className="my-2 text-sm">{describeParams(run.parameters)}</p>{run.seed && run.algorithm_version===ALGORITHM_VERSION && run.experiment_id!=="montecarlo" && <Chart result={calculate(run.experiment_id,run.parameters,run.seed)}/>}<p className="text-sm">观察：{run.observation || "未填写"}</p></div>)}</div></div>}
    </section>
  </div>;
}
