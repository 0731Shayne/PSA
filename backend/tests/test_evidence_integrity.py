import asyncio
import pytest
from sqlalchemy import func, select
from src.db.models import QuestionAttempt
from src.integrations.llm_client import LLMClient
from src.question_bank.analytics import build_learning_profile
from src.question_bank.grading import compare_answers
from src.question_bank.service import get_question, load_questions
from tests.test_classroom_loop import api

@pytest.mark.parametrize('answer,standard,expected', [
    (r'$\frac{1}{940}$', r'$\frac{19}{40}$', False),
    (r'\frac{2}{4}', '0.5', True), ('-1/2', '-0.5', True),
    (r'x^{12}', r'x^{1}2', None), ('A', 'a', None),
    ('{1,23}', '{12,3}', None), ('(1),(23)', '(12),(3)', None),
    (r'\frac{1}{0}', '0', None), ('', '', None),
])
def test_safe_comparison(answer, standard, expected):
    assert compare_answers(answer, standard) is expected


def test_pending_and_repeated_work_do_not_inflate_evidence():
    rows=load_questions()
    pending=[{'question_id':'P000001','verdict':'needs_review','error_type':'表达不完整'}]*4
    profile=build_learning_profile(rows,pending)
    assert profile['mastery']==[] and profile['alerts']==[]
    assert profile['evidence']['questions']==0
    assert profile['evidence']['pending_review']==4
    one={'question_id':'P000001','verdict':'correct','attempt_no':1}
    first=build_learning_profile(rows,[one])
    repeated=build_learning_profile(rows,[one]*30)
    assert [(m['score'],m['confidence']) for m in first['mastery']] == [(m['score'],m['confidence']) for m in repeated['mastery']]
    assert max(m['confidence'] for m in first['mastery']) < 100


async def offline(*args, **kwargs):
    raise RuntimeError('offline test')


async def make_task(client, teacher, student, qid='P000001'):
    th={'Authorization':f'Bearer {teacher}'};sh={'Authorization':f'Bearer {student}'}
    cr=(await client.post('/api/classrooms',json={'name':'证据验证班'},headers=th)).json()
    assert (await client.post('/api/classrooms/join',json={'join_code':cr['join_code']},headers=sh)).status_code==200
    response=await client.post(f"/api/classrooms/{cr['id']}/assignments",json={'question_ids':[qid],'count':1,'kind':'retest'},headers=th)
    assert response.status_code==200
    return cr,response.json(),th,sh


async def test_fraction_regression_and_summary(api,monkeypatch):
    client,_,student=api;sh={'Authorization':f'Bearer {student}'}
    monkeypatch.setattr(LLMClient,'chat_json',offline)
    r=await client.post('/api/question-bank/questions/P000020/attempts',json={'answer':r'$\frac{1}{940}$'},headers=sh)
    assert r.json()['verdict']=='incorrect'
    r=await client.post('/api/question-bank/questions/P000001/attempts',json={'answer':'无法判断的过程'},headers=sh)
    assert r.json()['verdict']=='needs_review' and not r.json()['error_type']
    summary=(await client.get('/api/question-bank/learning-summary',headers=sh)).json()
    assert summary['graded_questions']==1 and summary['pending_review']==1


async def test_reveal_and_correction_never_count_as_transfer(api,monkeypatch):
    client,teacher,student=api;monkeypatch.setattr(LLMClient,'chat_json',offline)
    cr,task,th,sh=await make_task(client,teacher,student)
    path='/api/question-bank/questions/P000001'
    await client.post(path+'/attempts',json={'answer':'不会做','assignment_id':task['id']},headers=sh)
    revealed=await client.get(path+'/answer',params={'assignment_id':task['id']},headers=sh)
    assert revealed.status_code==200
    corrected=await client.post(path+'/attempts',json={'answer':revealed.json()['answer'],'assignment_id':task['id']},headers=sh)
    assert corrected.json()['verdict']=='correct'
    assert corrected.json()['independent_eligible'] is False
    radar=(await client.get(f"/api/classrooms/{cr['id']}/radar",headers=th)).json()
    assert radar['summary']['independent_transfer']==0


async def test_fresh_correct_and_idempotent_retry(api,monkeypatch):
    client,teacher,student=api;monkeypatch.setattr(LLMClient,'chat_json',offline)
    cr,task,th,sh=await make_task(client,teacher,student)
    payload={'answer':get_question('P000001')['answer'],'assignment_id':task['id'],'request_key':'retry-key-001'}
    first=await client.post('/api/question-bank/questions/P000001/attempts',json=payload,headers=sh)
    again=await client.post('/api/question-bank/questions/P000001/attempts',json=payload,headers=sh)
    assert first.status_code==again.status_code==200
    assert first.json()['id']==again.json()['id']
    assert first.json()['independent_eligible'] is True
    mismatch=await client.post('/api/question-bank/questions/P000001/attempts',json={**payload,'answer':'另一份答案'},headers=sh)
    assert mismatch.status_code==409
    radar=(await client.get(f"/api/classrooms/{cr['id']}/radar",headers=th)).json()
    assert radar['summary']['independent_transfer']==1
    assert radar['summary']['attempts']==1
    history=(await client.get('/api/question-bank/attempts',params={'assignment_id':task['id'],'question_id':'P000001'},headers=sh)).json()
    assert len(history)==1 and history[0]['answer']==payload['answer'] and history[0]['feedback']


async def test_teacher_review_is_owned_and_updates_profile(api,monkeypatch):
    client,teacher,student=api;monkeypatch.setattr(LLMClient,'chat_json',offline)
    cr,task,th,sh=await make_task(client,teacher,student)
    response=await client.post('/api/question-bank/questions/P000001/attempts',json={'reasoning':'描述解题过程','assignment_id':task['id']},headers=sh)
    path=f"/api/classrooms/{cr['id']}/reviews"
    assert (await client.get(path,headers=sh)).status_code==403
    rows=(await client.get(path,headers=th)).json()
    assert len(rows)==1 and rows[0]['id']==response.json()['id']
    reviewed=await client.patch(path+f"/{rows[0]['id']}",json={'verdict':'partial','feedback':'已正确建立样本空间，请补充概率计算。'},headers=th)
    assert reviewed.status_code==200
    assert (await client.get(path,headers=th)).json()==[]
    assert (await client.get('/api/question-bank/learning-profile',headers=sh)).json()['evidence']['pending_review']==0
    assert (await client.patch(path+f"/{rows[0]['id']}",json={'verdict':'correct','feedback':'重复复核'},headers=th)).status_code==409


async def test_experiment_roundtrip_preserves_seed_and_version(api):
    client,_,student=api;sh={'Authorization':f'Bearer {student}'}
    await client.post('/api/question-bank/experiments/runs',json={'experiment_id':'coin','parameters':{'trials':200,'p':0.5},'result_summary':'观察记录','seed':12345,'algorithm_version':'probability-v2'},headers=sh)
    record=(await client.get('/api/question-bank/experiments/runs',headers=sh)).json()[0]
    assert record['seed']==12345 and record['algorithm_version']=='probability-v2'


def test_pending_hints_do_not_change_classroom_group():
    from src.classroom.analytics import build_classroom_radar
    students = [{'id': 1, 'name': '学生'}]
    evidence = [{'user_id': 1, 'question_id': qid, 'verdict': 'correct'} for qid in ['P000001', 'P000020']]
    baseline = build_classroom_radar(load_questions(), students, evidence)
    pending = {'user_id': 1, 'question_id': 'P000082', 'verdict': 'needs_review', 'hint_count': 10}
    updated = build_classroom_radar(load_questions(), students, [pending, *evidence])
    assert baseline['students'][0]['group_key'] == updated['students'][0]['group_key']
    assert updated['summary']['pending_review'] == 1


async def test_hints_from_practice_disqualify_later_transfer(api, monkeypatch):
    client, teacher, student = api
    monkeypatch.setattr(LLMClient, 'chat', offline)
    sh = {'Authorization': f'Bearer {student}'}
    assert (await client.post('/api/question-bank/questions/P000001/hint', json={}, headers=sh)).status_code == 200
    cr, task, th, sh = await make_task(client, teacher, student)
    result = await client.post('/api/question-bank/questions/P000001/attempts', json={
        'answer': get_question('P000001')['answer'], 'assignment_id': task['id']}, headers=sh)
    assert result.status_code == 200 and not result.json()['independent_eligible']
    radar = (await client.get(f"/api/classrooms/{cr['id']}/radar", headers=th)).json()
    assert radar['summary']['independent_transfer'] == 0


async def test_concurrent_retries_save_once_and_only_one_attempt_can_be_independent(api, monkeypatch):
    import asyncio
    client, _, student = api
    sh = {'Authorization': f'Bearer {student}'}
    async def diagnose(*args, **kwargs):
        await asyncio.sleep(0.02)
        return {'verdict': 'partial', 'feedback': '已建立事件关系，请继续计算。', 'error_type': '计算错误'}
    monkeypatch.setattr(LLMClient, 'chat_json', diagnose)
    path = '/api/question-bank/questions/P000001/attempts'
    payload = {'reasoning': '先分析样本空间', 'request_key': 'concurrent-retry-001'}
    first, retry = await asyncio.gather(*[client.post(path, json=payload, headers=sh) for _ in range(2)])
    assert first.status_code == retry.status_code == 200
    assert first.json()['id'] == retry.json()['id']
    # A second fresh question receives two distinct submissions at the same time.
    responses = await asyncio.gather(*[client.post('/api/question-bank/questions/P000020/attempts',
        json={'reasoning': '先分析条件关系', 'request_key': f'concurrent-fresh-{i}'}, headers=sh) for i in range(2)])
    assert all(r.status_code == 200 for r in responses)
    assert sum(r.json()['independent_eligible'] for r in responses) == 1
    history = (await client.get('/api/question-bank/attempts', headers=sh)).json()
    assert len(history) == 3


@pytest.mark.parametrize('endpoint', ['assistant', 'assistant/stream'])
async def test_tutor_help_is_tracked_across_assignments(api, monkeypatch, endpoint):
    client, teacher, student = api
    monkeypatch.setattr(LLMClient, 'chat', offline)
    async def interrupted(*args, **kwargs):
        raise RuntimeError('offline test')
        yield ''
    monkeypatch.setattr(LLMClient, 'stream_chat', interrupted)
    sh = {'Authorization': f'Bearer {student}'}
    helped = await client.post('/api/question-bank/' + endpoint, json={
        'message': '讲解 P000001', 'question_ids': ['P000001'], 'guidance_mode': 'full'}, headers=sh)
    assert helped.status_code == 200
    _, task, _, sh = await make_task(client, teacher, student)
    result = await client.post('/api/question-bank/questions/P000001/attempts', json={
        'answer': get_question('P000001')['answer'], 'assignment_id': task['id']}, headers=sh)
    assert result.status_code == 200 and result.json()['independent_eligible'] is False
