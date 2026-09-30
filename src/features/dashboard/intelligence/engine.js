/* =========================================================
   FINANCIAL INTELLIGENCE ENGINE
   Plain functions: data in, numbers and sentences out.
   No DOM, no storage, no network, no services. Every rule
   and threshold is written out here so it can be read,
   tested and changed in one place.
   ========================================================= */

import { EMERGENCIES } from "./example-data.js";

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

export const inr = (n) =>
    (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

export const signedInr = (n) => (n > 0 ? "+" : "") + inr(n);

export const signedPct = (n) =>
    (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)) + "%";

const fixedAmount = (data, key) =>
    (data.fixed.find((f) => f.key === key) || { amount: 0 }).amount;

/* ---------- 1. Core monthly picture (health, cash flow, risk, timeline) ---------- */

export function core(data, scenario = {}) {
    const { profile, fixed, spending } = data;

    const usePrevious = scenario.period === "previous";
    const baseSpending = usePrevious ? spending.previous : spending.current;

    const salaryPct = scenario.salaryPct || 0;
    const expensePct = scenario.expensePct || 0;
    const oneOff = scenario.oneOff || 0;

    const income = scenario.incomeLost
        ? 0
        : profile.monthlyIncome * (1 + salaryPct / 100);

    const emi = fixedAmount(data, "emi");
    const sip = fixedAmount(data, "sip");
    const rent = fixedAmount(data, "rent");

    const variable = sum(baseSpending) * (1 + expensePct / 100);
    const expenses = rent + variable;          // everyday costs, without EMI
    const obligations = expenses + emi;        // what must be paid every month
    const net = income - emi - sip - expenses; // left over after everything
    const endBalance = profile.openingBalance + net - oneOff;

    const previousExpenses = rent + sum(spending.previous);
    const trendPct = previousExpenses > 0 ? (expenses / previousExpenses - 1) * 100 : 0;

    const emiRatio = income > 0 ? emi / income : 1;
    const coverage = obligations > 0 ? profile.savings / obligations : 12;
    const savingsVsExpenses = expenses > 0 ? profile.savings / expenses : 12;
    const savingsRate = income > 0 ? (net + sip) / income : 0;

    /* ----- Health score: five parts, 100 points in total ----- */
    const parts = [
        {
            key: "cover", label: "Emergency cover", max: 30,
            points: clamp(coverage / 4, 0, 1) * 30,
            good: `savings cover ${round1(coverage)} months of bills`,
            weak: `savings cover only ${round1(coverage)} months of bills`
        },
        {
            key: "savExp", label: "Savings vs expenses", max: 20,
            points: clamp(savingsVsExpenses / 3, 0, 1) * 20,
            good: `savings are ${round1(savingsVsExpenses)}× monthly expenses`,
            weak: `savings are only ${round1(savingsVsExpenses)}× monthly expenses`
        },
        {
            key: "emi", label: "EMI burden", max: 20,
            points: (1 - clamp((emiRatio - 0.25) / 0.3, 0, 1)) * 20,
            good: `EMI is only ${Math.round(emiRatio * 100)}% of income`,
            weak: `EMI takes ${Math.round(emiRatio * 100)}% of income`
        },
        {
            key: "rate", label: "Amount kept", max: 15,
            points: clamp(savingsRate / 0.15, 0, 1) * 15,
            good: `you keep ${Math.round(savingsRate * 100)}% of income`,
            weak: `you keep only ${Math.round(savingsRate * 100)}% of income`
        },
        {
            key: "trend", label: "Spending trend", max: 10,
            points: trendPct <= 0 ? 10 : (1 - clamp(trendPct / 15, 0, 1)) * 10,
            good: "spending is stable",
            weak: `spending rose ${round1(trendPct)}% this month`
        }
    ];

    const score = Math.round(parts.reduce((a, p) => a + p.points, 0));
    const status = score >= 65 ? "Good" : score >= 40 ? "Fair" : "At risk";

    const ranked = [...parts].sort(
        (a, b) => b.points / b.max - a.points / a.max
    );

    const health = {
        score, status, parts,
        best: ranked[0],
        weakest: ranked[ranked.length - 1]
    };

    /* ----- Risk radar: four checks, each Low / Medium / High ----- */
    const level = (v, high, medium, lowerIsWorse = false) =>
        lowerIsWorse
            ? v < high ? "High" : v < medium ? "Medium" : "Low"
            : v >= high ? "High" : v >= medium ? "Medium" : "Low";

    const debtRatio = income > 0
        ? (data.loan.outstanding / (profile.monthlyIncome * 12)) * 100
        : 100;

    const surplusPct = income > 0 ? (net / income) * 100 : -100;

    const risks = [
        {
            key: "emi", label: "EMI", shown: `${Math.round(emiRatio * 100)}%`,
            level: level(emiRatio * 100, 40, 30),
            severity: clamp(((emiRatio * 100) / 50) * 100, 0, 100),
            msg: `EMI payments are ${Math.round(emiRatio * 100)}% of your monthly income.`
        },
        {
            key: "cover", label: "Savings", shown: `${round1(coverage)} mo`,
            level: level(coverage, 1, 3, true),
            severity: clamp(((6 - coverage) / 6) * 100, 0, 100),
            msg: `Savings cover ${round1(coverage)} months of bills.`
        },
        {
            key: "debt", label: "Debt", shown: `${Math.round(debtRatio)}%`,
            level: level(debtRatio, 100, 60),
            severity: clamp(debtRatio, 0, 100),
            msg: `Your loan balance is ${Math.round(debtRatio)}% of a year's income.`
        },
        {
            key: "surplus", label: "Monthly surplus", shown: signedInr(net),
            level: level(surplusPct, 0, 5, true),
            severity: clamp(100 - surplusPct * 5, 0, 100),
            msg: net < 0
                ? `You spend ${inr(-net)} more than you earn each month.`
                : `Only ${Math.round(surplusPct)}% of income is left after all payments.`
        }
    ];

    const order = { High: 2, Medium: 1, Low: 0 };
    const overall = risks.reduce(
        (worst, r) => (order[r.level] > order[worst] ? r.level : worst),
        "Low"
    );

    /* ----- Cash-flow events in the order they happen ----- */
    const events = [
        { label: "Salary", day: 1, amount: income },
        ...fixed.map((f) => ({ label: f.label, day: f.day, amount: -f.amount })),
        { label: "Everyday spending", day: 20, amount: -variable }
    ].sort((a, b) => a.day - b.day);

    let running = profile.openingBalance;
    let lowest = { balance: running, label: "Start of month" };

    events.forEach((e) => {
        running += e.amount;
        e.balance = running;
        if (running < lowest.balance) {
            lowest = { balance: running, label: `after ${e.label}` };
        }
    });

    const forecast = [1, 2, 3, 4, 5, 6].map(
        (i) => profile.openingBalance + net * i - oneOff
    );

    return {
        income, emi, sip, rent, variable, expenses, obligations, net,
        endBalance, trendPct, emiRatio, coverage, savingsVsExpenses,
        savingsRate, previousExpenses, health, risks, overall,
        events, lowest, forecast, opening: profile.openingBalance,
        savings: profile.savings, oneOff
    };
}

export function scenarioFromControls(salaryPct, expensePct, emergencyKey) {
    const e = EMERGENCIES[emergencyKey] || EMERGENCIES.none;
    return {
        salaryPct, expensePct,
        oneOff: e.oneOff, incomeLost: e.incomeLost
    };
}

/* ---------- 2. Goals ---------- */

export function analyzeGoals(data, m) {
    let available = Math.max(m.net, 0);

    const goals = data.goals.map((g) => {
        const remaining = Math.max(g.target - g.saved, 0);
        const required = remaining / g.months;
        const fits = required <= available;
        const short = fits ? 0 : required - available;
        available = Math.max(available - required, 0);

        return {
            ...g, remaining, required, fits, short,
            progress: Math.round((g.saved / g.target) * 100)
        };
    });

    return { goals, surplus: Math.max(m.net, 0) };
}

/* ---------- 3. Debt payoff (month-by-month) ---------- */

function payoff({ outstanding, annualRate }, payment) {
    const r = annualRate / 12 / 100;
    let balance = outstanding, months = 0, interest = 0;

    while (balance > 0.5 && months < 600) {
        const monthInterest = balance * r;
        if (payment <= monthInterest) return { months: Infinity, interest: Infinity };
        interest += monthInterest;
        balance = balance + monthInterest - payment;
        months++;
    }

    return { months, interest: Math.round(interest) };
}

export function analyzeDebt(data) {
    const { loan, debtExtraPayment: extra } = data;
    const current = payoff(loan, loan.emi);
    const faster = payoff(loan, loan.emi + extra);

    const finite = Number.isFinite(current.months) && Number.isFinite(faster.months);

    return {
        loan, extra, current, faster,
        hasLoan: loan.outstanding > 0 && loan.emi > 0,
        stuck: !Number.isFinite(current.months),
        monthsSaved: finite ? current.months - faster.months : 0,
        interestSaved: finite ? current.interest - faster.interest : 0
    };
}

/* ---------- 4. Subscription detector ---------- */

const DAY = 86400000;

export function detectSubscriptions(data) {
    const byMerchant = {};

    data.transactions.forEach((t) => {
        (byMerchant[t.merchant] = byMerchant[t.merchant] || []).push(t);
    });

    const found = [];

    Object.entries(byMerchant).forEach(([name, list]) => {
        if (list.length < 3) return;

        list.sort((a, b) => a.date.localeCompare(b.date));

        const amounts = list.map((t) => t.amount);
        const sameAmount = Math.max(...amounts) - Math.min(...amounts) <= amounts[0] * 0.05;

        const gaps = list.slice(1).map(
            (t, i) => (new Date(t.date) - new Date(list[i].date)) / DAY
        );
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const steady = gaps.every((g) => Math.abs(g - avgGap) <= 4);

        if (sameAmount && steady && avgGap >= 26 && avgGap <= 35) {
            found.push({
                name, amount: amounts[0], count: list.length,
                last: list[list.length - 1].date
            });
        }
    });

    const monthly = found.reduce((a, s) => a + s.amount, 0);

    return {
        found: found.sort((a, b) => b.amount - a.amount),
        monthly, yearly: monthly * 12,
        checked: Object.keys(byMerchant).length
    };
}

/* ---------- 5. Portfolio concentration ---------- */

export function analyzePortfolio(data) {
    const total = data.holdings.reduce((a, h) => a + h.value, 0) || 0;
    const bySector = {};

    data.holdings.forEach((h) => {
        bySector[h.sector] = (bySector[h.sector] || 0) + h.value;
    });

    const sectors = Object.entries(bySector)
        .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.pct - a.pct);

    return {
        total, sectors,
        empty: sectors.length === 0,
        top: sectors[0] || { name: "None", value: 0, pct: 0 },
        concentrated: sectors.length > 0 && sectors[0].pct >= 35
    };
}

/* ---------- 6. What changed ---------- */

export function analyzeChanges(data) {
    const { previous, current } = data.spending;

    const rows = Object.keys(current).map((name) => ({
        name,
        before: previous[name],
        after: current[name],
        delta: current[name] - previous[name],
        pct: previous[name] > 0
            ? (current[name] / previous[name] - 1) * 100
            : current[name] > 0 ? 100 : 0
    })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const before = sum(previous), after = sum(current);
    const drivers = rows.filter((r) => r.delta > 0).slice(0, 2);

    return {
        rows, before, after,
        delta: after - before,
        pct: before > 0 ? (after / before - 1) * 100 : 0,
        drivers
    };
}

/* ---------- 7. Explainable insights (built from the results above) ---------- */

export function buildInsights(data, m, changes, subs, portfolio) {
    const before = core(data, { period: "previous" });
    const insights = [];

    const moved = m.health.score - before.health.score;
    const rose = changes.delta >= 0;

    insights.push({
        title: "Why did your financial health change?",
        body:
            moved === 0
                ? `Your health score is unchanged at ${m.health.score}.`
                : `Your health score ${moved < 0 ? "fell" : "rose"} from ${before.health.score} to ${m.health.score} because everyday spending ${rose ? "rose" : "fell"} by ${inr(Math.abs(changes.delta))} this month.`,
        factors: changes.rows
            .filter((r) => r.delta !== 0)
            .slice(0, 3)
            .map((r) => `${r.name} ${signedInr(r.delta)} (${signedPct(r.pct)})`)
    });

    const worst = m.risks.filter((r) => r.level !== "Low");

    insights.push({
        title: `Why is your overall risk ${m.overall.toLowerCase()}?`,
        body: worst.length
            ? worst.map((r) => r.msg).join(" ")
            : "None of the four risk checks is above its warning level.",
        factors: worst.map((r) => `${r.label}: ${r.shown}, ${r.level.toLowerCase()}`)
    });

    if (subs.found.length) {
        const top = subs.found[0];
        insights.push({
            title: "What are you paying for every month?",
            body: `You paid ${inr(top.amount)} to ${top.name} ${top.count} months in a row. All ${subs.found.length} subscriptions together cost ${inr(subs.monthly)} a month, ${inr(subs.yearly)} a year.`,
            factors: subs.found.map((s) => `${s.name} ${inr(s.amount)} × ${s.count}`)
        });
    }

    if (portfolio.concentrated) {
        insights.push({
            title: "Why is your portfolio flagged?",
            body: `${Math.round(portfolio.top.pct)}% of your investments sit in one sector (${portfolio.top.name}).`,
            factors: portfolio.sectors.map((s) => `${s.name} ${Math.round(s.pct)}%`)
        });
    }

    return insights;
}

/* ---------- Everything at once, for the baseline dashboard ---------- */

export function analyze(data) {
    const m = core(data);
    const changes = analyzeChanges(data);
    const subs = detectSubscriptions(data);
    const portfolio = analyzePortfolio(data);

    return {
        data, m,
        goals: analyzeGoals(data, m),
        debt: analyzeDebt(data),
        subs, portfolio, changes,
        insights: buildInsights(data, m, changes, subs, portfolio)
    };
}
