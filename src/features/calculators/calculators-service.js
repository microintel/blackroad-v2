/* =========================================================
   CALCULATORS: maths only (no DOM), so it can be tested alone.

   SIP        fixed amount every month, paid at the start of the
              month, return compounded monthly.
   Step-up    same, but the monthly amount rises by a fixed % at the
              start of every year.
   Lumpsum    one amount, compounded once a year.

   Each calculator returns
     { invested, value, returns, multiple, realValue, finalSip,
       yearly: [{ year, sip, invested, value, returns }] }
   ========================================================= */

const num = (n) => (Number.isFinite(n) ? n : 0);

function finish(years, inflation, invested, value, yearly, finalSip = 0) {
    const real = value / Math.pow(1 + inflation / 100, years);

    return {
        years,
        invested,
        value,
        returns: value - invested,
        multiple: invested > 0 ? value / invested : 0,
        realValue: num(real),
        finalSip,
        yearly
    };
}

/* Monthly investing. stepUp is the yearly increase in the SIP, in % (0 = plain SIP). */
export function sipPlan({ amount, rate, years, stepUp = 0, inflation = 0 }) {
    const i = rate / 12 / 100;
    const yearly = [];

    let balance = 0;
    let invested = 0;
    let sip = amount;

    for (let y = 1; y <= years; y++) {
        for (let m = 0; m < 12; m++) {
            balance = (balance + sip) * (1 + i);
            invested += sip;
        }

        yearly.push({ year: y, sip, invested, value: balance, returns: balance - invested });

        sip = sip * (1 + stepUp / 100);
    }

    const finalSip = yearly.length ? yearly[yearly.length - 1].sip : amount;

    return finish(years, inflation, invested, balance, yearly, finalSip);
}

export function lumpsumPlan({ amount, rate, years, inflation = 0 }) {
    const yearly = [];

    for (let y = 1; y <= years; y++) {
        const value = amount * Math.pow(1 + rate / 100, y);

        yearly.push({ year: y, sip: 0, invested: amount, value, returns: value - amount });
    }

    const value = yearly.length ? yearly[yearly.length - 1].value : amount;

    return finish(years, inflation, amount, value, yearly);
}

/* ---------------- formatting ---------------- */

export function inr(n) {
    const v = Math.round(num(n));

    return (v < 0 ? "-" : "") + "₹" + Math.abs(v).toLocaleString("en-IN");
}

/* ₹1.25 L, ₹3.4 Cr: short labels for chart axes. */
export function inrShort(n) {
    const v = Math.abs(num(n));
    const sign = n < 0 ? "-" : "";
    const trim = (x) => String(+x.toFixed(2));

    if (v >= 1e7) return sign + "₹" + trim(v / 1e7) + " Cr";
    if (v >= 1e5) return sign + "₹" + trim(v / 1e5) + " L";
    if (v >= 1e3) return sign + "₹" + trim(v / 1e3) + " K";

    return sign + "₹" + Math.round(v);
}
