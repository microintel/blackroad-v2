/* =========================================================
   EXAMPLE DATA
   A made-up household used to demonstrate every Financial
   Intelligence card. It is NOT read from your accounts,
   stores or services. To go live later, build an object
   with this same shape from real data and pass it to
   analyze() in engine.js.
   ========================================================= */

export const EXAMPLE_DATA = {
    profile: {
        monthlyIncome: 60000,   // salary credited on day 1
        openingBalance: 12000,  // spendable bank balance today
        savings: 155000         // savings + emergency money
    },

    // Fixed monthly payments, by day of the month they leave the account.
    fixed: [
        { key: "emi", label: "EMI", amount: 27000, day: 5 },
        { key: "sip", label: "SIP", amount: 5000, day: 10 },
        { key: "rent", label: "Rent", amount: 9000, day: 12 }
    ],

    // Everyday spending by category (rent and EMI are listed above).
    spending: {
        previous: { Food: 6000, Travel: 3000, Shopping: 3000, Utilities: 2000 },
        current: { Food: 7080, Travel: 3360, Shopping: 2850, Utilities: 2080 }
    },

    loan: { outstanding: 540000, annualRate: 10.5, emi: 27000 },
    debtExtraPayment: 2000,

    goals: [
        { name: "Laptop", target: 60000, saved: 39000, months: 6 },
        { name: "Bike down payment", target: 120000, saved: 20000, months: 12 }
    ],

    holdings: [
        { name: "Infosys", sector: "Technology", value: 120000 },
        { name: "TCS", sector: "Technology", value: 80000 },
        { name: "HDFC Bank", sector: "Finance", value: 90000 },
        { name: "ICICI Bank", sector: "Finance", value: 60000 },
        { name: "Sun Pharma", sector: "Healthcare", value: 80000 },
        { name: "ITC", sector: "Other", value: 40000 },
        { name: "Reliance", sector: "Other", value: 30000 }
    ],

    transactions: [
        ...["04-05", "05-05", "06-05", "07-05", "08-05", "09-05"].map((d) => ({
            merchant: "StreamPlus", date: `2026-${d}`, amount: 499
        })),
        ...["04-12", "05-12", "06-12", "07-12", "08-12", "09-12"].map((d) => ({
            merchant: "CloudDrive", date: `2026-${d}`, amount: 199
        })),
        ...["06-20", "07-20", "08-20", "09-20"].map((d) => ({
            merchant: "MusicPlus", date: `2026-${d}`, amount: 119
        })),
        { merchant: "FoodNow", date: "2026-04-08", amount: 320 },
        { merchant: "FoodNow", date: "2026-04-19", amount: 540 },
        { merchant: "FoodNow", date: "2026-05-03", amount: 280 },
        { merchant: "FoodNow", date: "2026-05-25", amount: 610 },
        { merchant: "FoodNow", date: "2026-06-14", amount: 450 },
        { merchant: "FoodNow", date: "2026-07-02", amount: 390 },
        { merchant: "FoodNow", date: "2026-08-09", amount: 520 },
        { merchant: "CityCab", date: "2026-05-11", amount: 240 },
        { merchant: "CityCab", date: "2026-06-30", amount: 380 },
        { merchant: "CityCab", date: "2026-08-21", amount: 190 }
    ]
};

// One-off shocks the What-If simulator can apply.
export const EMERGENCIES = {
    none: { label: "None", oneOff: 0, incomeLost: false },
    medical: { label: "Medical bill ₹40,000", oneOff: 40000, incomeLost: false },
    repair: { label: "Repair bill ₹15,000", oneOff: 15000, incomeLost: false },
    jobloss: { label: "No salary next month", oneOff: 0, incomeLost: true }
};
