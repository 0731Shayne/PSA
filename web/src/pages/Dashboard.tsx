import { useEffect, useState } from "react";
import { Alert, Button, Empty, Progress, Select, Skeleton, Tag } from "antd";
import { ArrowRightOutlined, BookOutlined, ExperimentOutlined, ReadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

type Classroom={id:number;name:string;status:string};
type Task={id:number;title:string;classroom_name?:string;my_status?:string;status?:string;question_ids:string[];attempted_questions?:number;completed_count?:number;recipient_count?:number;due_at?:string};
type Radar={summary:{members:number;needs_intervention:number;independent_transfer:number;pending_review?:number};assignments:Task[]};
type Summary={attempted_questions:number;graded_questions?:number;correct_questions:number;pending_review?:number;recent_sessions:{id:number;title:string}[]};
type Profile={summary:{next_focus:string};evidence:{questions:number;pending_review?:number};path:{title:string;reason:string;question_ids:string[]}[]};

export default function Dashboard() {
  const {user}=useAuth();
  const teacher=user?.role==="teacher";
  const navigate=useNavigate();
  const [classrooms,setClassrooms]=useState<Classroom[]>([]);
  const [selected,setSelected]=useState<number>();
  const [radar,setRadar]=useState<Radar|null>(null);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError(false);
    const load=async()=>{
      if(teacher){
        const response=await apiClient.get<Classroom[]>("/api/classrooms");
        if(!active)return;
        setClassrooms(response.data);setSelected(current=>response.data.some(c=>c.id===current)?current:response.data.find(c=>c.status==="active")?.id ?? response.data[0]?.id);
      } else {
        const [t,s,p]=await Promise.all([apiClient.get<Task[]>("/api/assignments/mine"),apiClient.get<Summary>("/api/question-bank/learning-summary"),apiClient.get<Profile>("/api/question-bank/learning-profile")]);
        if(active){setTasks(t.data);setSummary(s.data);setProfile(p.data);}
      }
    };
    load().catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[teacher,revision]);
  useEffect(()=>{
    if(!teacher || !selected){setRadar(null);return;}
    let active=true;setRadar(null);
    apiClient.get<Radar>(`/api/classrooms/${selected}/radar`).then(r=>{if(active)setRadar(r.data);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[teacher,selected,revision]);
  const pending=tasks.filter(t=>t.my_status!=="completed").sort((a,b)=>(b.attempted_questions || 0)-(a.attempted_questions || 0) || (a.due_at?new Date(a.due_at).getTime():Infinity)-(b.due_at?new Date(b.due_at).getTime():Infinity));
  const next=pending[0];
  const classURL=`/classrooms${selected?`?classroom=${selected}`:""}`;
  const activeTasks=radar?.assignments.filter(t=>t.status==="published") || [];
  return <div className="dashboard-page action-dashboard">
    <header className="dashboard-heading"><div><p className="text-sm text-slate-600">你好，{user?.name} · {teacher?"教师工作台":"学习工作台"}</p><h1 className="mt-2 text-2xl font-bold">{teacher?"从今天的班级待办开始":"接着上一次，继续前进"}</h1></div>{teacher && classrooms.length>0 && <Select aria-label="当前班级" className="w-full sm:!w-64" value={selected} onChange={id=>{setError(false);setSelected(id);}} options={classrooms.map(c=>({value:c.id,label:c.name}))}/>}</header>
    {error && <Alert className="my-4" type="error" showIcon message="暂时无法载入工作台数据" description="已提交的记录仍保留，请重新加载。" action={<Button onClick={()=>setRevision(v=>v+1)}>重新加载</Button>}/>}
    {loading?<Skeleton active paragraph={{rows:8}}/>:teacher?<>
      {!classrooms.length?<section className="dashboard-next"><h2 className="text-xl font-bold">建立第一个课程班级</h2><p className="my-3">创建班级并邀请学生，发布一组短诊断后就能查看学习证据。</p><Button type="primary" onClick={()=>navigate("/classrooms")}>创建班级 <ArrowRightOutlined/></Button></section>:!radar?(!error && <Skeleton active/>):<>
        <section className="dashboard-next"><div><Tag>当前待办</Tag><h2 className="mt-3 text-xl font-bold">{radar.summary.pending_review?`${radar.summary.pending_review} 份作答等待复核`:radar.summary.needs_intervention?`${radar.summary.needs_intervention} 名学生需要后续练习`:activeTasks.length?"跟进进行中的班级任务":"为本班安排下一次诊断"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">先确认可用证据，再安排教学行动。待复核作答不计入学生的掌握度和风险。</p></div><Button type="primary" size="large" onClick={()=>navigate(`${classURL}&tab=${radar.summary.pending_review?"review":"overview"}`)}>{radar.summary.pending_review?"查看待复核作答":"查看班级证据"}<ArrowRightOutlined/></Button></section>
        <div className="dashboard-metrics"><Metric label="当前班级" value={radar.summary.members} note="学生"/><Metric label="进行中任务" value={activeTasks.length} note="最近任务中仍开放"/><Metric label="独立迁移" value={radar.summary.independent_transfer} note="首次、未受辅助的新题作答"/></div>
        <section className="editorial-panel"><div className="flex justify-between gap-3"><h2 className="text-lg font-bold">进行中的任务</h2><Button type="link" onClick={()=>navigate(`${classURL}&tab=tasks`)}>管理任务</Button></div>{!activeTasks.length?<Empty description="暂无进行中任务"/>:activeTasks.slice(0,4).map(t=><div className="dashboard-task" key={t.id}><div><h3 className="font-semibold">{t.title}</h3><p className="mt-1 text-sm text-slate-600">{t.question_ids.length} 道题 · {dueLabel(t.due_at)}</p></div><div className="min-w-36"><p className="text-sm">{t.completed_count}/{t.recipient_count} 人完成</p><Progress percent={t.recipient_count?Math.round((t.completed_count || 0)/t.recipient_count*100):0} showInfo={false}/></div></div>)}</section>
      </>}
    </>:<>
      <section className="dashboard-next"><div><Tag>{next?"待完成任务":"下一步练习"}</Tag><h2 className="mt-3 text-xl font-bold">{next?.title || `从${profile?.summary.next_focus || "样本空间"}开始`}</h2><p className="mt-2 text-sm text-slate-600">{next?`${next.classroom_name} · ${dueLabel(next.due_at)}`:profile?.evidence.questions?"根据已获得可靠判断的作答推荐，先完成一题，再看反馈。":"先完成基础题，建立你的第一份学习证据。"}</p>{next && <div className="mt-3 max-w-sm"><Progress percent={Math.round((next.attempted_questions || 0)/Math.max(next.question_ids.length,1)*100)} showInfo={false}/><p className="text-sm">已完成 {next.attempted_questions || 0}/{next.question_ids.length} 题</p></div>}</div><Button type="primary" size="large" onClick={()=>navigate(next?`/tasks/${next.id}`:"/learning-path")}>{next?"继续完成任务":"开始当前练习"}<ArrowRightOutlined/></Button></section>
      <div className="dashboard-metrics"><Metric label="待完成" value={pending.length} note="班级任务"/><Metric label="已正确完成" value={summary?.correct_questions ?? 0} note={`基于 ${summary?.graded_questions ?? 0} 道已判定题目`}/><Metric label="待复核" value={summary?.pending_review ?? 0} note="暂不影响掌握度"/></div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="editorial-panel"><h2 className="text-lg font-bold">接下来的学习重点</h2><p className="mt-3 text-xl font-semibold text-teal-900">{profile?.summary.next_focus || "样本空间"}</p><p className="my-3 text-sm leading-6 text-slate-600">已积累 {profile?.evidence.questions || 0} 道可评估题目的证据。查看推荐原因、相关题目与实验。</p><Button onClick={()=>navigate("/learning-path")}>查看学习路径</Button></section><section className="editorial-panel"><h2 className="text-lg font-bold">最近的答疑</h2>{summary?.recent_sessions.length?summary.recent_sessions.slice(0,3).map(s=><button className="quick-row" key={s.id} onClick={()=>navigate(`/tutor?session=${s.id}`)}><span className="flex-1 text-left">{s.title}</span><ArrowRightOutlined/></button>):<p className="my-3 text-sm text-slate-600">遇到问题时，可先描述自己的思路。</p>}<Button type="link" onClick={()=>navigate("/tutor")}>进入智能答疑</Button></section></div>
    </>}
    <section className="dashboard-tools" aria-label="课程工具"><Button icon={<BookOutlined/>} onClick={()=>navigate("/questions")}>课程题库</Button><Button icon={<ExperimentOutlined/>} onClick={()=>navigate("/experiments")}>概率实验室</Button>{teacher?<Button icon={<ReadOutlined/>} onClick={()=>navigate("/teaching")}>设计一节课</Button>:<Button onClick={()=>navigate("/tasks")}>全部任务 / 加入班级</Button>}</section>
  </div>;
}
function Metric({label,value,note}:{label:string;value:number;note:string}) {return <div><p className="text-sm text-slate-600">{label}</p><p className="my-2 text-3xl font-bold tabular-nums">{value}</p><p className="text-sm text-slate-600">{note}</p></div>;}
function dueLabel(value?:string) {return value?`截止 ${new Date(value).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}${new Date(value).getTime()<Date.now()?" · 可补交":""}`:"未设置截止时间";}
