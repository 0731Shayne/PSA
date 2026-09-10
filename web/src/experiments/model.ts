export type Params = Record<string, number>;
export type Point = {
    x: number;
    y: number;
    label?: string;
};
export type Experiment = {
    id: string;
    title: string;
    chapter: string;
    description: string;
    question: string;
    defaults: Params;
};
export type CatalogItem = {
    experiment_id: string;
    keypoints: string[];
    question_ids: string[];
};
export type ExperimentRun = {
    id: number;
    experiment_id: string;
    parameters: Params;
    result_summary: string;
    observation?: string;
    created_at?: string;
    seed?: number;
    algorithm_version?: string;
};
export const experiments: Experiment[] = [
    { id: "coin", title: "大数定律：抛硬币", chapter: "概率基础", description: "观察试验次数增加时，正面频率如何靠近理论概率。", question: "试验次数扩大10倍后，频率波动有什么变化？", defaults: { trials: 200, p: 0.5 } },
    { id: "binomial", title: "二项分布形态", chapter: "常见分布", description: "调整试验次数与成功概率，观察概率质量函数的形状。", question: "当 p 偏离 0.5 时，分布的偏斜方向如何变化？", defaults: { n: 20, p: 0.5 } },
    { id: "normal", title: "正态分布参数", chapter: "常见分布", description: "探索均值与标准差对钟形曲线位置和离散程度的影响。", question: "标准差增大时，曲线高度和宽度如何变化？", defaults: { mu: 0, sigma: 1 } },
    { id: "clt", title: "中心极限定理", chapter: "极限定理", description: "从均匀分布反复抽样，观察样本均值分布逐渐接近正态。", question: "样本容量从2增加到30时，均值分布发生了什么变化？", defaults: { sampleSize: 5, repeats: 800 } },
    { id: "bayes", title: "贝叶斯先验敏感性", chapter: "条件概率", description: "改变先验率、灵敏度和特异度，观察阳性后的后验概率。", question: "低患病率为什么会显著降低阳性结果的可信度？", defaults: { prior: 0.1, sensitivity: 0.9, specificity: 0.9 } },
    { id: "confidence", title: "置信区间覆盖率", chapter: "统计推断", description: "重复抽样构造均值置信区间，观察长期覆盖比例。", question: "样本量变化主要影响区间宽度还是置信水平？", defaults: { n: 30, confidence: 95, repeats: 200 } },
    { id: "montecarlo", title: "蒙特卡洛估计 π", chapter: "随机模拟", description: "在正方形中生成随机点，用落入四分之一圆的比例估计圆周率。", question: "点数增加时，估计误差是否单调减小？", defaults: { points: 800 } },
    { id: "poisson", title: "二项分布的泊松近似", chapter: "分布近似", description: "在 n 较大、p 较小时，对比二项概率与泊松近似。", question: "保持 λ=np 不变时，怎样调整 n、p 会提高近似效果？", defaults: { n: 50, p: 0.08 } },
];
export const ALGORITHM_VERSION = "probability-v2";
export type ExperimentResult = {
    points: Point[];
    bars?: boolean;
    reference?: number;
    summary: string;
    domain?: [
        number,
        number,
        number
    ];
    comparison?: Point[];
    comparisonLabel?: string;
    marker?: Point;
    xLabel?: string;
    yLabel?: string;
};
export const parameterLabels: Record<string, string> = { trials: "试验次数", p: "成功概率", n: "样本/试验数", mu: "均值", sigma: "标准差", sampleSize: "样本容量", repeats: "重复次数", prior: "先验概率", sensitivity: "灵敏度", specificity: "特异度", confidence: "置信水平", points: "随机点数" };
export const describeParams = (params: Params) => Object.entries(params).map(([name, value]) => `${parameterLabels[name] || name}=${value}`).join(" · ");
function rng(seed: number) { let value = (Math.trunc(seed) % 2147483646) + 1; return () => { value = (value * 48271) % 2147483647; return value / 2147483647; }; }
function choose(n: number, k: number) { let value = 1; for (let i = 1; i <= Math.min(k, n - k); i++)
    value = value * (n - i + 1) / i; return value; }
function normalPdf(x: number, mu: number, sigma: number) { return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)); }
// Invert the normal CDF with a bounded binary search (absolute CDF error < 1e-7).
function cdf(x: number) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - tail : tail;
}
export function zFor(confidence: number) {
    let low = 0, high = 8;
    const target = (1 + confidence / 100) / 2;
    for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        if (cdf(mid) < target)
            low = mid;
        else
            high = mid;
    }
    return (low + high) / 2;
}
export function calculate(id: string, p: Params, seed: number): ExperimentResult { const random = rng(seed); if (id === "coin") {
    let heads = 0;
    const points: Point[] = [];
    for (let i = 1; i <= p.trials; i++) {
        if (random() < p.p)
            heads++;
        if (i === 1 || i % Math.max(1, Math.floor(p.trials / 100)) === 0)
            points.push({ x: i, y: heads / i });
    }
    return { points, reference: p.p, summary: `正面频率 ${(heads / p.trials).toFixed(3)}，理论概率 ${p.p.toFixed(2)}` };
} if (id === "binomial" || id === "poisson") {
    const lambda = p.n * p.p;
    const points: Point[] = [];
    const comparison: Point[] = [];
    const maxK = Math.min(p.n, Math.ceil(lambda + 4 * Math.sqrt(lambda + 1)));
    for (let k = 0; k <= maxK; k++) {
        const binomial = choose(p.n, k) * p.p ** k * (1 - p.p) ** (p.n - k);
        const poisson = Math.exp(-lambda) * lambda ** k / Array.from({ length: k }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
        comparison.push({ x: k, y: binomial });
        points.push({ x: k, y: id === "poisson" ? poisson : binomial, label: id === "poisson" ? `二项=${binomial.toFixed(3)}` : undefined });
    }
    return { points, bars: true, xLabel: "成功次数 k", yLabel: "概率", comparison: id === "poisson" ? comparison : undefined, comparisonLabel: "精确二项分布", summary: id === "poisson" ? `λ=np=${lambda.toFixed(2)}，绿色柱为泊松近似，橙色线为精确二项概率` : `均值 np=${lambda.toFixed(2)}，方差 np(1-p)=${(lambda * (1 - p.p)).toFixed(2)}` };
} if (id === "normal") {
    const points = Array.from({ length: 601 }, (_, i) => { const x = -15 + i * 30 / 600; return { x, y: normalPdf(x, p.mu, p.sigma) }; });
    return { points, domain: [-15, 15, 1.4], comparison: points.map(point => ({ x: point.x, y: normalPdf(point.x, 0, 1) })), comparisonLabel: "基准 μ=0，σ=1", xLabel: "随机变量 x", yLabel: "概率密度", summary: `曲线中心 ${p.mu.toFixed(1)}，约 95% 数据位于 [${(p.mu - 1.96 * p.sigma).toFixed(2)}, ${(p.mu + 1.96 * p.sigma).toFixed(2)}]` };
} if (id === "clt") {
    const bins = Array(24).fill(0);
    for (let r = 0; r < p.repeats; r++) {
        let sum = 0;
        for (let j = 0; j < p.sampleSize; j++)
            sum += random();
        const mean = sum / p.sampleSize;
        bins[Math.min(23, Math.floor(mean * 24))]++;
    }
    return { points: bins.map((count, i) => ({ x: (i + .5) / 24, y: count / p.repeats })), bars: true, summary: `样本均值理论均值 0.5，理论标准差 ${(1 / Math.sqrt(12 * p.sampleSize)).toFixed(3)}` };
} if (id === "bayes") {
    const posterior = (prior: number) => prior * p.sensitivity / (prior * p.sensitivity + (1 - prior) * (1 - p.specificity));
    const points = Array.from({ length: 99 }, (_, i) => ({ x: (i + 1) / 100, y: posterior((i + 1) / 100) }));
    return { points, domain: [0, 1, 1], marker: { x: p.prior, y: posterior(p.prior) }, xLabel: "先验概率", yLabel: "后验概率", summary: `当前阳性后的后验概率 ${(posterior(p.prior) * 100).toFixed(1)}%` };
} if (id === "confidence") {
    const z = zFor(p.confidence);
    let covered = 0;
    const points: Point[] = [];
    for (let i = 1; i <= p.repeats; i++) {
        let sum = 0;
        for (let j = 0; j < p.n; j++) {
            const u1 = Math.max(random(), 1e-8), u2 = random();
            sum += Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }
        const mean = sum / p.n;
        if (Math.abs(mean) <= z / Math.sqrt(p.n))
            covered++;
        points.push({ x: i, y: covered / i });
    }
    return { points, reference: p.confidence / 100, domain: [1, p.repeats, 1], xLabel: "重复抽样次数", yLabel: "累计覆盖率", summary: `实际覆盖率 ${(covered / p.repeats * 100).toFixed(1)}%，单个区间半宽 ${(z / Math.sqrt(p.n)).toFixed(3)}` };
} const points = Array.from({ length: p.points }, () => { const x = random(), y = random(); return { x, y, label: x * x + y * y <= 1 ? "圆内" : "圆外" }; }); const inside = points.filter(item => item.label === "圆内").length; return { points, summary: `π ≈ ${(4 * inside / p.points).toFixed(5)}，绝对误差 ${Math.abs(Math.PI - 4 * inside / p.points).toFixed(5)}` }; }
