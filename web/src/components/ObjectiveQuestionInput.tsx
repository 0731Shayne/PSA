import { Checkbox, Radio } from "antd";
import { MathMarkdown } from "@/components/MathMarkdown";

interface ObjectiveQuestion {
  ID: string;
  qtype: string;
  choices: string[] | null;
}

// These bank entries ask for separate judgments on two statements.
const multipartJudgmentIds = new Set(["P000851", "P001822"]);

export function isObjectiveQuestion(question: ObjectiveQuestion) {
  return (question.qtype === "判断题" && !multipartJudgmentIds.has(question.ID)) ||
    (Boolean(question.choices?.length) && ["单选题", "多选题"].includes(question.qtype));
}

export function ObjectiveQuestionInput({ question, answer, onChange }: {
  question: ObjectiveQuestion;
  answer: string;
  onChange: (value: string) => void;
}) {
  const options = question.qtype === "判断题"
    ? [{ label: "正确", value: "正确" }, { label: "错误", value: "错误" }]
    : (question.choices || []).map(choice => {
        const label = choice.trim();
        const number = label.match(/^\(\d+\)/)?.[0];
        const letter = label.match(/^([A-Z])(?:[.．、)]|\s|$)/i)?.[1].toUpperCase();
        return { label: <MathMarkdown>{choice}</MathMarkdown>, value: number ?? letter ?? choice };
      });

  if (question.qtype === "多选题") {
    return <Checkbox.Group
      aria-label="选择所有符合的选项"
      className="!grid !gap-3"
      options={options}
      value={answer ? answer.split("，") : []}
      onChange={values => onChange(options.map(option => option.value).filter(value => values.includes(value)).join("，"))}
    />;
  }

  return <Radio.Group
    aria-label={question.qtype === "判断题" ? "判断正误" : "选择一个选项"}
    className="!grid !gap-3"
    options={options}
    value={answer}
    onChange={event => onChange(event.target.value)}
  />;
}
