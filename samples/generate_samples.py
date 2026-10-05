#!/usr/bin/env python3
"""
Builds the four guest sample backups used by "Continue as guest":

    samples/bottom-50.json   Bottom 50%   net worth up to  Rs 10 lakh
    samples/middle-40.json   Middle 40%   Rs 10 lakh  - Rs 1 crore
    samples/top-10.json      Top 10%      Rs 1 crore  - Rs 50 crore
    samples/top-1.json       Top 1%       Rs 50 crore - Rs 99 crore

Each file is a normal BlackRoad backup (same shape as /sample.json), so the
existing guest seeder can load it without any special handling.
The data is fictional and deterministic (fixed seeds).

Run:  python3 samples/generate_samples.py
"""
import json
import math
import os
import random
from datetime import date, timedelta

TODAY = date(2026, 10, 5)
LAST_DATA = date(2026, 10, 3)
OUT = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def iso(d):
    return d.isoformat()


def add_months(d, n):
    y = d.year + (d.month - 1 + n) // 12
    m = (d.month - 1 + n) % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def month_end(y, m):
    return add_months(date(y, m, 1), 1) - timedelta(days=1)


def months_between(a, b):
    return (b.year - a.year) * 12 + (b.month - a.month)


def years_between(a, b):
    return (b - a).days / 365.25


def grow(principal, rate, years, comp="quarterly"):
    n = {"monthly": 12, "quarterly": 4, "half-yearly": 2, "yearly": 1, "simple": 0}.get(comp, 4)
    if years <= 0:
        return principal
    if n == 0:
        return principal * (1 + rate * years / 100)
    return principal * (1 + rate / (100 * n)) ** (n * years)


def rnd(x, step=1):
    return int(round(x / step) * step)


# --------------------------------------------------------------------------
# stock universe (fictional "today" prices, rounded)
# --------------------------------------------------------------------------

STOCKS = {
    "RELIANCE": ("Reliance Industries", 1480, 13),
    "HDFCBANK": ("HDFC Bank", 1020, 12),
    "ICICIBANK": ("ICICI Bank", 1385, 15),
    "INFY": ("Infosys", 1650, 11),
    "TCS": ("Tata Consultancy Services", 3400, 10),
    "ITC": ("ITC", 430, 14),
    "LT": ("Larsen & Toubro", 3720, 16),
    "SBIN": ("State Bank of India", 905, 17),
    "BHARTIARTL": ("Bharti Airtel", 1960, 22),
    "ASIANPAINT": ("Asian Paints", 2450, 6),
    "HINDUNILVR": ("Hindustan Unilever", 2500, 6),
    "KOTAKBANK": ("Kotak Mahindra Bank", 2050, 9),
    "AXISBANK": ("Axis Bank", 1180, 13),
    "MARUTI": ("Maruti Suzuki", 12800, 14),
    "SUNPHARMA": ("Sun Pharmaceutical", 1780, 17),
    "TITAN": ("Titan Company", 3600, 20),
    "BAJFINANCE": ("Bajaj Finance", 1050, 15),
    "TATASTEEL": ("Tata Steel", 170, 14),
    "ZOMATO": ("Zomato", 260, 30),
    "DMART": ("Avenue Supermarts", 4300, 13),
    "NESTLEIND": ("Nestle India", 1250, 9),
    "ULTRACEMCO": ("UltraTech Cement", 12000, 15),
    "POWERGRID": ("Power Grid Corporation", 300, 14),
    "HAL": ("Hindustan Aeronautics", 4500, 38),
    "TRENT": ("Trent", 5400, 42),
    "PIDILITIND": ("Pidilite Industries", 3000, 14),
    "M&M": ("Mahindra & Mahindra", 3300, 28),
    "HCLTECH": ("HCL Technologies", 1600, 15),
    "POLYCAB": ("Polycab India", 7200, 33),
    "BEL": ("Bharat Electronics", 400, 36),
    "DIXON": ("Dixon Technologies", 15000, 45),
    "COALINDIA": ("Coal India", 400, 20),
    "IRCTC": ("IRCTC", 750, 18),
    "WIPRO": ("Wipro", 260, 8),
}


def price_at(sym, d, rng):
    _, cur, cagr = STOCKS[sym]
    yrs = max(0.0, years_between(d, TODAY))
    base = cur / (1 + cagr / 100) ** yrs
    return max(1, round(base * rng.uniform(0.93, 1.08), 1 if base < 1000 else 0))


# --------------------------------------------------------------------------
# tier definitions
# --------------------------------------------------------------------------

TIERS = {
    "bottom-50": dict(
        label="Bottom 50%",
        owner="Vignesh",
        email="vignesh.sample@blackroad.demo",
        seed=11,
        start=date(2021, 7, 1),
        salary=15500, growth=0.09, employer="Salary - Shreeji Retail Pvt Ltd",
        expense_ratio=0.80, bonus_months=[10], bonus_mult=0.6,
        extras=[("Freelance project - local shop billing", "Freelance", 0.35, 4)],
        interest_yearly=0.014,
        target_cash=62000,
        windfalls=[(date(2023, 1, 20), "Family land sale - share", "Profit", 120000)],
        mf=[
            ("UTI Nifty 50 Index Fund - Direct Plan - Growth", date(2021, 9, 5),
             [(date(2021, 9, 5), 1000), (date(2024, 1, 5), 1500), (date(2025, 6, 5), 2500)], 0.0095, 0.040),
            ("Parag Parikh Flexi Cap Fund - Direct Plan - Growth", date(2022, 4, 5),
             [(date(2022, 4, 5), 500), (date(2024, 4, 5), 1000), (date(2025, 6, 5), 2000)], 0.0105, 0.042),
        ],
        stocks=[("ITC", 160, [date(2022, 3, 10), date(2023, 8, 18)]),
                ("SBIN", 40, [date(2022, 11, 14), date(2024, 2, 6)]),
                ("TATASTEEL", 150, [date(2023, 5, 22)]),
                ("POWERGRID", 60, [date(2024, 7, 9)])],
        stock_sells=[("ITC", 0.0)],
        fds=[("SBI Fixed Deposit", 50000, 6.8, "quarterly", 12, date(2023, 4, 10), True),
             ("Post Office 5-Year TD", 100000, 7.5, "yearly", 60, date(2024, 2, 12), False)],
        parties=[("Vijay", "98110 22334", "Neighbour"), ("Charan", "98221 55667", "Cousin")],
        lend=[(1, "gave", 12000, date(2026, 6, 10), date(2026, 12, 10), "Medical help"),
              (2, "gave", 8000, date(2026, 8, 18), date(2026, 11, 18), "Short-term help"),
              (2, "got", 3000, date(2026, 9, 20), None, "Part repayment")],
        loans=[("Bajaj Finance - Two-wheeler loan", 3200, 30, 11.0, date(2024, 6, 5), "Used bike, 30 months")],
        manual=dict(banks=[38000, 14500], customs=[("EPF", 96000), ("Gold (jewellery)", 120000)],
                    cash=3500, pending=0, other=0, bankNames=["State Bank of India", "India Post Payments Bank"]),
        exp_extra=[("Room rent", "Housing", 0.20, 2, 1.0), ("Monthly groceries", "Bigbasket", 0.11, 6, 1.0),
                   ("Milk, bread & curd", "Milk / Bread / Curd", 0.04, 8, 1.0), ("Mobile recharge", "Recharges", 0.025, 9, 1.0),
                   ("Bus & metro pass", "Transportation", 0.06, 10, 1.0), ("Support to parents", "Mother / Dad", 0.09, 6, 1.0),
                   ("Street food", "Samosa / Outside Food", 0.03, 15, 0.9), ("Online food order", "Zomato", 0.03, 18, 0.6),
                   ("Doctor / pharmacy", "Health", 0.03, 21, 0.35), ("Clothes", "Apparel", 0.04, 22, 0.25),
                   ("Movies & OTT", "Entertainment", 0.02, 24, 0.7), ("Festival shopping", "Shopping", 0.05, 25, 0.2)],
    ),
    "middle-40": dict(
        label="Middle 40%",
        owner="Pranav",
        email="pranav.sample@blackroad.demo",
        seed=22,
        start=date(2016, 4, 1),
        salary=62000, growth=0.09, employer="Salary - Infoserve Technologies",
        expense_ratio=0.72, bonus_months=[3], bonus_mult=1.2, mf_scale=0.4, stock_scale=0.28,
        extras=[("Freelance project - Kaveri Foods", "Freelance", 0.5, 3)],
        interest_yearly=0.02,
        target_cash=380000,
        windfalls=[(date(2016, 4, 2), "Opening savings carried forward", "Interest", 300000),
                   (date(2018, 10, 10), "Joining & retention bonus", "Bonus", 500000),
                   (date(2021, 1, 10), "ESOP vest & sale - Infoserve", "Stock Return", 600000)],
        mf=[
            ("Parag Parikh Flexi Cap Fund - Direct Plan - Growth", date(2016, 8, 5),
             [(date(2016, 8, 5), 5000), (date(2019, 4, 5), 8000), (date(2022, 4, 5), 15000), (date(2025, 4, 5), 20000)], 0.0108, 0.040),
            ("UTI Nifty 50 Index Fund - Direct Plan - Growth", date(2017, 4, 5),
             [(date(2017, 4, 5), 4000), (date(2020, 4, 5), 8000), (date(2023, 4, 5), 12000)], 0.0095, 0.043),
            ("HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth", date(2018, 6, 5),
             [(date(2018, 6, 5), 3000), (date(2021, 6, 5), 6000), (date(2024, 6, 5), 10000)], 0.0115, 0.050),
            ("Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth", date(2016, 6, 5),
             [(date(2016, 6, 5), 3000), (date(2021, 4, 5), 4000)], 0.0105, 0.045),
        ],
        stocks=[("INFY", 380, [date(2018, 2, 12), date(2020, 11, 4), date(2023, 1, 16)]),
                ("HDFCBANK", 600, [date(2017, 9, 5), date(2021, 3, 9)]),
                ("ITC", 1400, [date(2018, 8, 20), date(2022, 6, 14)]),
                ("LT", 130, [date(2019, 7, 8), date(2023, 10, 3)]),
                ("BHARTIARTL", 260, [date(2021, 5, 17), date(2024, 1, 22)]),
                ("SBIN", 450, [date(2020, 9, 28)]),
                ("TITAN", 90, [date(2022, 2, 7), date(2024, 8, 12)]),
                ("SUNPHARMA", 210, [date(2023, 4, 10)])],
        stock_sells=[("INFY", 0.25), ("ITC", 0.2)],
        fds=[("HDFC Bank FD", 300000, 6.9, "quarterly", 36, date(2018, 11, 12), True),
             ("SBI Tax Saver FD", 150000, 6.5, "quarterly", 60, date(2019, 3, 20), True),
             ("ICICI Bank FD", 500000, 7.1, "quarterly", 24, date(2025, 5, 14), False),
             ("Bajaj Finance FD", 300000, 7.8, "quarterly", 36, date(2024, 9, 2), False)],
        parties=[("Dhanush", "98765 43210", "College friend"), ("Santhosh", "98450 11223", "Colleague"),
                 ("Charan", "99001 88776", "Brother-in-law")],
        lend=[(1, "gave", 150000, date(2023, 2, 14), date(2023, 8, 14), "Business deposit help"),
              (1, "got", 50000, date(2024, 1, 10), None, "Part repayment"),
              (2, "gave", 35000, date(2025, 11, 5), date(2026, 2, 5), "Medical emergency"),
              (3, "gave", 80000, date(2026, 3, 12), date(2026, 12, 12), "Shop renovation"),
              (3, "got", 20000, date(2026, 8, 2), None, "Instalment")],
        loans=[("SBI Education Loan", 11500, 60, 9.5, date(2016, 6, 5), "Education loan, settled"),
               ("HDFC Bank Car Loan", 14500, 60, 9.0, date(2023, 3, 5), "Hatchback, 5-year loan")],
        manual=dict(banks=[412000, 185000], customs=[("PPF", 1850000), ("EPF", 2450000), ("NPS", 620000), ("Gold (jewellery)", 480000)],
                    cash=22000, pending=60000, other=0, bankNames=["HDFC Bank", "State Bank of India"]),
        exp_extra=[("House rent", "Housing", 0.22, 2, 1.0), ("Monthly groceries", "Bigbasket", 0.08, 6, 1.0),
                   ("Milk, bread & curd", "Milk / Bread / Curd", 0.02, 8, 1.0), ("Mobile & broadband", "Recharges", 0.015, 9, 1.0),
                   ("Cabs & metro", "Transportation", 0.04, 10, 1.0), ("Support to parents", "Mother / Dad", 0.06, 6, 1.0),
                   ("Eating out", "Zomato", 0.03, 14, 0.9), ("Weekend brunch", "Swiggy", 0.025, 16, 0.8),
                   ("Doctor / pharmacy", "Health", 0.02, 21, 0.5), ("Clothes", "Apparel", 0.04, 22, 0.4),
                   ("Movies & OTT", "Entertainment", 0.02, 24, 0.9), ("Friends outing", "Friends", 0.03, 26, 0.6),
                   ("Online shopping", "Shopping", 0.05, 25, 0.5), ("Income tax (TDS)", "Tax", 0.07, 2, 1.0),
                   ("Personal care", "Personal Care", 0.015, 12, 0.8), ("Vacation", "Tour", 0.25, 18, 0.07)],
    ),
    "top-10": dict(
        label="Top 10%",
        owner="Mahadeva Swamy",
        email="mahadeva.sample@blackroad.demo",
        seed=33,
        start=date(2014, 4, 1),
        salary=320000, growth=0.10, employer="Salary - Meridian Capital (Director)",
        expense_ratio=0.62, bonus_months=[3, 9], bonus_mult=3.0, mf_scale=0.45, stock_scale=0.3,
        extras=[("Rent - Flat tenant", "Rent", 0.07, 1), ("Consulting - advisory board", "Freelance", 0.9, 4)],
        interest_yearly=0.03,
        target_cash=3500000,
        windfalls=[(date(2016, 9, 12), "ESOP sale - Meridian Capital", "Stock Return", 9000000),
                   (date(2020, 11, 18), "Sale of old flat", "Profit", 6000000)],
        mf=[
            ("Parag Parikh Flexi Cap Fund - Direct Plan - Growth", date(2014, 8, 5),
             [(date(2014, 8, 5), 25000), (date(2018, 4, 5), 60000), (date(2022, 4, 5), 100000)], 0.0108, 0.040),
            ("UTI Nifty 50 Index Fund - Direct Plan - Growth", date(2015, 4, 5),
             [(date(2015, 4, 5), 20000), (date(2019, 4, 5), 45000), (date(2023, 4, 5), 75000)], 0.0095, 0.043),
            ("HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth", date(2016, 6, 5),
             [(date(2016, 6, 5), 15000), (date(2020, 6, 5), 40000), (date(2024, 6, 5), 70000)], 0.0115, 0.050),
            ("Nippon India Small Cap Fund - Direct Plan - Growth", date(2017, 4, 5),
             [(date(2017, 4, 5), 10000), (date(2021, 4, 5), 30000), (date(2025, 4, 5), 50000)], 0.0125, 0.058),
            ("Axis Bluechip Fund - Direct Plan - Growth", date(2014, 6, 5),
             [(date(2014, 6, 5), 15000), (date(2019, 6, 5), 30000)], 0.0085, 0.040),
            ("SBI Contra Fund - Direct Plan - Growth", date(2018, 4, 5),
             [(date(2018, 4, 5), 15000), (date(2022, 4, 5), 40000), (date(2025, 4, 5), 60000)], 0.0120, 0.050),
        ],
        stocks=[("RELIANCE", 4500, [date(2016, 3, 9), date(2019, 11, 6), date(2022, 8, 18)]),
                ("HDFCBANK", 9000, [date(2015, 10, 12), date(2018, 6, 19), date(2021, 2, 3)]),
                ("ICICIBANK", 6500, [date(2017, 5, 24), date(2020, 4, 7), date(2023, 2, 9)]),
                ("INFY", 3500, [date(2016, 7, 14), date(2020, 12, 1)]),
                ("TCS", 1400, [date(2017, 1, 18), date(2021, 7, 22)]),
                ("LT", 1800, [date(2018, 9, 11), date(2022, 11, 29)]),
                ("BHARTIARTL", 3200, [date(2019, 8, 13), date(2023, 6, 28)]),
                ("ITC", 12000, [date(2016, 12, 5), date(2020, 10, 15), date(2024, 3, 11)]),
                ("TITAN", 1500, [date(2019, 2, 20), date(2022, 5, 10)]),
                ("BAJFINANCE", 4200, [date(2018, 12, 4), date(2023, 9, 14)]),
                ("SUNPHARMA", 2200, [date(2021, 1, 12)]),
                ("HAL", 900, [date(2022, 7, 6), date(2024, 5, 16)]),
                ("TRENT", 500, [date(2023, 3, 21)]),
                ("DMART", 700, [date(2020, 6, 25)])],
        stock_sells=[("RELIANCE", 0.15), ("TCS", 0.2), ("HDFCBANK", 0.1), ("BAJFINANCE", 0.15)],
        fds=[("HDFC Bank FD", 2000000, 7.0, "quarterly", 36, date(2019, 11, 12), True),
             ("SBI Tax Saver FD", 150000, 6.5, "quarterly", 60, date(2019, 3, 20), True),
             ("ICICI Bank FD", 4000000, 7.1, "quarterly", 24, date(2025, 5, 14), False),
             ("Bajaj Finance FD", 3000000, 7.9, "quarterly", 36, date(2024, 9, 2), False),
             ("Shriram Finance FD", 2500000, 8.2, "monthly", 36, date(2025, 11, 7), False)],
        parties=[("Vignesh", "98100 77889", "Business partner"), ("Vijay", "98730 44556", "Brother"),
                 ("Santhosh", "99203 66778", "Friend"), ("Charan", "", "Staff loan")],
        lend=[(1, "gave", 2500000, date(2022, 6, 14), date(2023, 6, 14), "Startup bridge loan"),
              (1, "got", 500000, date(2024, 2, 8), None, "Part repayment"),
              (2, "gave", 800000, date(2025, 1, 20), date(2026, 1, 20), "Home purchase help"),
              (3, "gave", 300000, date(2026, 4, 3), date(2026, 12, 3), "Short-term help"),
              (3, "got", 100000, date(2026, 9, 1), None, "Instalment")],
        loans=[("HDFC Home Loan", 78000, 180, 8.4, date(2019, 4, 5), "Apartment, 15-year home loan"),
               ("Kotak Car Loan", 45000, 48, 8.9, date(2022, 9, 5), "SUV, settled early")],
        manual=dict(banks=[2850000, 1240000, 610000], customs=[("PPF", 1500000), ("EPF", 6200000), ("NPS", 3400000),
                                                              ("Gold (jewellery)", 2800000), ("Residential flat (market value)", 32000000)],
                    cash=180000, pending=450000, other=1800000, bankNames=["HDFC Bank", "ICICI Bank", "Kotak Mahindra Bank"]),
        exp_extra=[("Society maintenance", "Housing", 0.045, 2, 1.0), ("Monthly groceries", "Blinkit", 0.03, 6, 1.0),
                   ("Domestic help & cook", "Home", 0.03, 5, 1.0), ("Mobile, broadband & OTT", "Recharges", 0.008, 9, 1.0),
                   ("Fuel & cabs", "Transportation", 0.02, 10, 1.0), ("Support to parents", "Mother / Dad", 0.05, 6, 1.0),
                   ("Dining out", "Zomato", 0.025, 14, 1.0), ("Weekend brunch", "Swiggy", 0.015, 16, 0.8),
                   ("Doctor / pharmacy", "Health", 0.02, 21, 0.6), ("Clothes & accessories", "Apparel", 0.03, 22, 0.6),
                   ("Movies & concerts", "Entertainment", 0.01, 24, 0.9), ("Friends & parties", "Party", 0.02, 26, 0.6),
                   ("Online shopping", "Shopping", 0.04, 25, 0.6), ("Advance tax", "Tax", 0.20, 15, 1.0),
                   ("Car service & insurance", "Car", 0.03, 12, 0.4), ("Donation", "Donate", 0.02, 28, 0.5),
                   ("Family holiday", "Tour", 0.45, 18, 0.12), ("Children school fees", "Education", 0.05, 4, 0.34)],
    ),
    "top-1": dict(
        label="Top 1%",
        owner="Dhanush",
        email="dhanush.sample@blackroad.demo",
        seed=44,
        start=date(2012, 4, 1),
        salary=1800000, growth=0.14, employer="Founder draw - Orbit Labs",
        expense_ratio=0.46, bonus_months=[3, 9], bonus_mult=6.0, mf_scale=0.55, stock_scale=0.18,
        extras=[("Profit distribution - Orbit Labs", "Profit", 5.0, 3), ("Rent - Commercial property", "Rent", 0.22, 1),
                ("Dividend - listed holdings", "Stock Return", 0.55, 4)],
        interest_yearly=0.04,
        target_cash=45000000,
        windfalls=[(date(2013, 9, 10), "Angel round - founder secondary", "Profit", 40000000),
                   (date(2015, 3, 10), "Seed round - founder secondary", "Profit", 60000000)],
        mf=[
            ("Parag Parikh Flexi Cap Fund - Direct Plan - Growth", date(2012, 8, 5),
             [(date(2012, 8, 5), 150000), (date(2016, 4, 5), 300000), (date(2021, 4, 5), 500000)], 0.0108, 0.040),
            ("UTI Nifty 50 Index Fund - Direct Plan - Growth", date(2013, 4, 5),
             [(date(2013, 4, 5), 100000), (date(2017, 4, 5), 250000), (date(2022, 4, 5), 400000)], 0.0095, 0.043),
            ("HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth", date(2014, 6, 5),
             [(date(2014, 6, 5), 100000), (date(2018, 6, 5), 250000), (date(2023, 6, 5), 400000)], 0.0115, 0.050),
            ("Nippon India Small Cap Fund - Direct Plan - Growth", date(2015, 4, 5),
             [(date(2015, 4, 5), 75000), (date(2019, 4, 5), 200000), (date(2024, 4, 5), 350000)], 0.0125, 0.058),
            ("Axis Bluechip Fund - Direct Plan - Growth", date(2012, 6, 5),
             [(date(2012, 6, 5), 75000), (date(2017, 6, 5), 150000)], 0.0085, 0.040),
            ("SBI Contra Fund - Direct Plan - Growth", date(2016, 4, 5),
             [(date(2016, 4, 5), 100000), (date(2020, 4, 5), 250000), (date(2025, 4, 5), 400000)], 0.0120, 0.050),
            ("Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth", date(2013, 6, 5),
             [(date(2013, 6, 5), 50000), (date(2018, 6, 5), 100000)], 0.0105, 0.045),
        ],
        stocks=[("RELIANCE", 130000, [date(2014, 3, 11), date(2017, 6, 8), date(2020, 4, 20), date(2023, 1, 12)]),
                ("HDFCBANK", 260000, [date(2013, 10, 7), date(2016, 8, 18), date(2019, 7, 9), date(2022, 3, 3)]),
                ("ICICIBANK", 180000, [date(2015, 5, 12), date(2018, 11, 6), date(2021, 6, 15)]),
                ("INFY", 110000, [date(2014, 9, 16), date(2019, 1, 22), date(2022, 10, 4)]),
                ("TCS", 42000, [date(2015, 2, 24), date(2020, 5, 13)]),
                ("LT", 52000, [date(2016, 11, 8), date(2021, 9, 21)]),
                ("BHARTIARTL", 95000, [date(2018, 3, 14), date(2022, 6, 7), date(2024, 11, 19)]),
                ("ITC", 380000, [date(2014, 12, 2), date(2018, 4, 17), date(2022, 1, 25)]),
                ("TITAN", 48000, [date(2017, 8, 29), date(2021, 11, 9)]),
                ("BAJFINANCE", 120000, [date(2016, 3, 22), date(2020, 3, 24), date(2023, 7, 11)]),
                ("SUNPHARMA", 70000, [date(2019, 9, 17), date(2023, 2, 28)]),
                ("HAL", 26000, [date(2022, 4, 12), date(2024, 2, 20)]),
                ("TRENT", 16000, [date(2021, 12, 14), date(2023, 12, 6)]),
                ("DMART", 20000, [date(2018, 2, 27), date(2021, 4, 13)]),
                ("KOTAKBANK", 38000, [date(2017, 3, 7), date(2022, 12, 15)]),
                ("MARUTI", 6500, [date(2016, 9, 20), date(2023, 4, 25)]),
                ("ULTRACEMCO", 6000, [date(2019, 12, 3)]),
                ("DIXON", 4500, [date(2022, 9, 13), date(2024, 8, 7)]),
                ("POLYCAB", 9000, [date(2021, 8, 24), date(2024, 1, 30)]),
                ("M&M", 22000, [date(2023, 5, 16), date(2025, 2, 11)])],
        stock_sells=[("RELIANCE", 0.15), ("TCS", 0.2), ("HDFCBANK", 0.1), ("BAJFINANCE", 0.2), ("INFY", 0.15), ("ITC", 0.1)],
        fds=[("HDFC Bank FD", 20000000, 7.0, "quarterly", 36, date(2019, 11, 12), True),
             ("ICICI Bank FD", 30000000, 7.1, "quarterly", 24, date(2025, 5, 14), False),
             ("Bajaj Finance FD", 25000000, 7.9, "quarterly", 36, date(2024, 9, 2), False),
             ("Shriram Finance FD", 20000000, 8.2, "monthly", 36, date(2025, 11, 7), False),
             ("SBI Bank FD", 25000000, 6.9, "quarterly", 12, date(2026, 2, 16), False)],
        parties=[("Orbit Labs Pvt Ltd", "", "Own company - director loan"), ("Pranav", "98480 11200", "Business associate"),
                 ("Vijay", "98860 33445", "Brother"), ("Santhosh", "99120 55671", "Friend")],
        lend=[(1, "gave", 40000000, date(2021, 4, 7), date(2024, 4, 7), "Director loan to company"),
              (1, "got", 12000000, date(2024, 6, 12), None, "Part repayment"),
              (2, "gave", 15000000, date(2023, 9, 15), date(2026, 3, 15), "Real-estate partnership advance"),
              (2, "got", 5000000, date(2025, 4, 10), None, "Part repayment"),
              (3, "gave", 3500000, date(2025, 2, 8), date(2026, 2, 8), "Education support"),
              (4, "gave", 2000000, date(2026, 5, 18), date(2026, 12, 18), "Short-term help")],
        loans=[("HDFC Business Loan", 180000, 144, 9.4, date(2018, 4, 5), "Working capital term loan"),
               ("ICICI Home Loan - Villa", 310000, 180, 8.5, date(2021, 7, 5), "Villa, 15-year loan")],
        manual=dict(banks=[28500000, 12400000, 6100000, 3800000],
                    customs=[("PPF", 1500000), ("EPF", 4800000), ("NPS", 9500000), ("Gold & jewellery", 45000000),
                             ("Residential property (market value)", 220000000), ("Commercial property (market value)", 150000000),
                             ("ESOPs / Orbit Labs equity (est.)", 600000000), ("Art & collectibles", 28000000)],
                    cash=900000, pending=8500000, other=12000000,
                    bankNames=["HDFC Bank", "ICICI Bank", "Kotak Mahindra Bank", "Axis Bank"]),
        exp_extra=[("Property maintenance", "Housing", 0.030, 2, 1.0), ("Household & groceries", "Blinkit", 0.012, 6, 1.0),
                   ("Domestic staff & drivers", "Home", 0.015, 5, 1.0), ("Phones, internet & OTT", "Recharges", 0.003, 9, 1.0),
                   ("Fuel & chauffeur", "Transportation", 0.008, 10, 1.0), ("Support to parents", "Mother / Dad", 0.02, 6, 1.0),
                   ("Fine dining", "Zomato", 0.012, 14, 1.0), ("Doctor / wellness", "Health", 0.012, 21, 0.7),
                   ("Clothes & accessories", "Apparel", 0.02, 22, 0.7), ("Concerts & events", "Entertainment", 0.008, 24, 0.9),
                   ("Parties & hosting", "Party", 0.02, 26, 0.6), ("Luxury shopping", "Shopping", 0.04, 25, 0.6),
                   ("Advance tax", "Tax", 0.30, 15, 1.0), ("Car service & insurance", "Car", 0.015, 12, 0.5),
                   ("Philanthropy", "Donate", 0.05, 28, 0.6), ("Family holiday abroad", "Tour", 0.6, 18, 0.15),
                   ("Children school fees", "Education", 0.025, 4, 0.34), ("Gifts", "Gift", 0.03, 20, 0.4)],
    ),
}

# --------------------------------------------------------------------------
# generators
# --------------------------------------------------------------------------


class Ids:
    def __init__(self):
        self.n = 0

    def next(self):
        self.n += 1
        return self.n


def build_mf(cfg, rng):
    """Mutual-fund profiles, SIP settings (with allocations) and monthly entries."""
    start = date(min(p[1].year for p in cfg["mf"]), min(p[1].month for p in cfg["mf"]), 1)
    months = months_between(start, date(TODAY.year, TODAY.month, 1)) + 1
    # one shared market path + per-fund noise
    market = []
    for i in range(months):
        d = add_months(start, i)
        r = rng.gauss(0.009, 0.035)
        if (d.year, d.month) == (2020, 3):
            r = -0.21
        if (d.year, d.month) == (2020, 4):
            r = 0.13
        if (d.year, d.month) in ((2022, 6), (2022, 9), (2025, 2)):
            r -= 0.04
        if (d.year, d.month) in ((2020, 11), (2021, 1), (2023, 12), (2024, 9)):
            r += 0.04
        market.append(r)

    profiles, settings, entries = [], [], []
    eid = 0
    mfs = cfg.get("mf_scale", 1.0)
    for pid, (name, first, schedule, mu, sd) in enumerate(cfg["mf"], start=1):
        schedule = [(d, max(500, rnd(a * mfs, 500))) for d, a in schedule]
        profiles.append({"id": pid, "name": name})
        nav = 10.0
        units = 0.0
        invested = 0.0
        allocs = {}
        skipped = []
        first_entry = True
        for i in range(months):
            md = add_months(start, i)
            ms = date(md.year, md.month, 1)
            me = month_end(ms.year, ms.month)
            if me < first.replace(day=1):
                continue
            r = market[i] * (0.8 + 0.4 * (sd / 0.045)) + (mu - 0.009) + rng.gauss(0, sd * 0.35)
            r = max(-0.3, r)
            sip_day = date(ms.year, ms.month, 5)
            is_last_partial = (ms.year, ms.month) == (TODAY.year, TODAY.month)
            if is_last_partial:
                r = rng.gauss(0.002, 0.006)
            if sip_day >= first and sip_day <= TODAY and not (is_last_partial and sip_day > LAST_DATA):
                amount = [a for (fd, a) in schedule if fd <= sip_day][-1]
                if sip_day.month == 5 and rng.random() < 0.015 and sip_day.year not in (2025, 2026):
                    skipped.append(iso(sip_day))
                else:
                    sip_nav = nav * (1 + r / 4)
                    u = round(amount / sip_nav, 4)
                    units += u
                    invested += amount
                    allocs[iso(sip_day)] = {
                        "status": "allocated", "paymentDate": iso(sip_day), "processingDate": None,
                        "allocationDate": iso(sip_day), "nav": round(sip_nav, 4), "units": u, "amount": amount, "legacy": True,
                    }
            nav = nav * (1 + r)
            if is_last_partial:
                edate = LAST_DATA
            else:
                edate = me
            eid += 1
            entries.append({
                "id": eid, "profileId": pid, "date": iso(edate),
                "percentChange": 0 if first_entry else round(r * 100, 2), "nav": None,
                "portfolioValue": round(units * nav, 4), "investedAmount": invested,
            })
            first_entry = False
        settings.append({
            "id": pid, "startDate": iso(first), "sipAmount": schedule[-1][1],
            "sipSchedule": [{"fromDate": iso(d), "amount": a} for d, a in schedule],
            "skippedSipDates": skipped, "sipAllocations": allocs, "sipAllocationsMigrated": True,
        })
    # goal on first fund
    last_val = [e for e in entries if e["profileId"] == 1][-1]["portfolioValue"]
    goal = max(1000000, int(math.ceil(last_val * 2.2 / 1000000.0) * 1000000))
    settings[0]["goalAmount"] = goal
    settings[0]["goalDate"] = iso(date(2034, 4, 5))
    entries.sort(key=lambda e: (e["date"], e["profileId"]))
    for i, e in enumerate(entries, 1):
        e["id"] = i
    return profiles, settings, entries


def build_stocks(cfg, rng):
    txns = []
    seq = 0
    held = {}
    cost = {}
    ledger_events = []  # (date, kind, desc, amount, costBasis)
    lots = []
    sts = cfg.get("stock_scale", 1.0)
    for sym, qty_total, dates in cfg["stocks"]:
        qty_total = max(len(dates), int(qty_total * sts))
        name = STOCKS[sym][0]
        per = max(1, qty_total // len(dates))
        for j, d in enumerate(dates):
            q = per if j < len(dates) - 1 else qty_total - per * (len(dates) - 1)
            p = price_at(sym, d, rng)
            lots.append((d, "BUY", sym, name, q, p))
    for sym, frac in cfg["stock_sells"]:
        if frac <= 0:
            continue
        buys = [l for l in lots if l[2] == sym]
        total = sum(l[4] for l in buys)
        last_buy = max(l[0] for l in buys)
        sd = max(add_months(last_buy, 8), date(2021, 10, 18))
        if sd > date(2026, 6, 1):
            continue
        q = max(1, int(total * frac))
        lots.append((sd, "SELL", sym, STOCKS[sym][0], q, price_at(sym, sd, rng)))
    lots.sort(key=lambda l: (l[0], l[1] == "SELL"))
    tags = {"BUY": ["#longterm", "#core", "#dividend", "#growth"], "SELL": ["#profit #booked"]}
    for d, typ, sym, name, q, p in lots:
        seq += 1
        txns.append({
            "id": f"txn_{seq:03d}", "seq": seq, "date": iso(d), "type": typ, "symbol": sym, "name": name,
            "quantity": q, "price": p, "notes": rng.choice(tags[typ]), "isMTF": False,
        })
        if typ == "BUY":
            held[sym] = held.get(sym, 0) + q
            cost[sym] = cost.get(sym, 0) + q * p
            ledger_events.append((d, "buy", f"Bought {sym}", q * p, None))
        else:
            avg = cost[sym] / held[sym]
            held[sym] -= q
            cost[sym] -= avg * q
            ledger_events.append((d, "sell", f"Sold {sym}", q * p, round(avg * q)))
    prices = {s: STOCKS[s][1] for s, q in held.items() if q > 0}
    value = sum(q * STOCKS[s][1] for s, q in held.items())
    return txns, prices, seq, ledger_events, value


def build_fds(cfg):
    out, events = [], []
    for i, (bank, principal, rate, comp, tenure, start, close) in enumerate(cfg["fds"], 1):
        row = {"id": i, "bankName": bank, "principal": principal, "interestRate": rate, "compounding": comp,
               "tenureMonths": tenure, "startDate": iso(start), "notes": ""}
        maturity = add_months(start, tenure)
        events.append((start, "buy", f"Opened {bank}", principal, None))
        if maturity <= TODAY and close:
            amt = rnd(grow(principal, rate, tenure / 12.0, comp))
            row.update({"status": "closed", "closedDate": iso(maturity), "closedAmount": amt})
            events.append((maturity, "sell", f"{bank} matured", amt, principal))
        elif maturity <= TODAY:
            row["notes"] = "Matured - not yet withdrawn"
        out.append(row)
    return out, events


def build_lending(cfg, gid):
    parties = [{"id": i, "name": n, "phone": p, "note": nt} for i, (n, p, nt) in enumerate(cfg["parties"], 1)]
    entries = []
    for i, (pid, typ, amt, d, due, note) in enumerate(cfg["lend"], 1):
        row = {"id": i, "partyId": pid, "type": typ, "amount": amt, "date": iso(d), "note": note}
        if due:
            row["dueDate"] = iso(due)
        entries.append(row)
    loans, emis = [], []
    for i, (lender, emi, n, rate, d, note) in enumerate(cfg["loans"], 1):
        payments = []
        for k in range(n):
            pd = add_months(d, k)
            if pd > TODAY:
                break
            payments.append({"id": gid.next(), "amount": emi, "date": iso(pd), "note": f"EMI {k + 1}/{n}"})
            emis.append((pd, f"EMI {k + 1}/{n} - {lender}", emi))
        loans.append({"id": i, "lender": lender, "principal": emi * n, "emiAmount": emi, "tenureMonths": n,
                      "interestRate": rate, "date": iso(d), "notes": note, "payments": payments})
    return parties, entries, loans, emis


def build_ledger(cfg, rng, stock_events, fd_events, emis, income_scale):
    """Month-by-month income & expense entries (dates up to LAST_DATA)."""
    entries_raw = []
    tid = [0]

    def txid():
        tid[0] += 1
        return "t" + format(tid[0], "x")

    # collect investment events by month
    ev_by_month = {}
    for e in stock_events + fd_events:
        ev_by_month.setdefault((e[0].year, e[0].month), []).append(e)
    # SIP schedule is rebuilt from MF settings below via cfg["_mf_settings"]
    sip_by_month = {}
    for s in cfg["_mf_settings"]:
        name = cfg["_profiles"][s["id"] - 1]["name"].split(" - ")[0]
        for dstr, a in s["sipAllocations"].items():
            d = date.fromisoformat(dstr)
            sip_by_month.setdefault((d.year, d.month), []).append((d, name, a["amount"]))
    emi_by_month = {}
    for d, desc, amt in emis:
        emi_by_month.setdefault((d.year, d.month), []).append((d, desc, amt))

    start = cfg["start"]
    months = months_between(start, date(TODAY.year, TODAY.month, 1)) + 1
    for i in range(months):
        ms = add_months(start, i)
        key = (ms.year, ms.month)
        if ms > LAST_DATA:
            break
        yrs = months_between(start, ms) // 12
        # salary steps up each April
        fy_steps = (ms.year - start.year) - (1 if ms.month < 4 else 0) + (1 if start.month < 4 else 0)
        base_salary = cfg["salary"] * (1 + cfg["growth"]) ** max(0, fy_steps)
        salary = base_salary * income_scale
        infl = 1.055 ** (months_between(start, ms) / 12.0)
        tmpl = sum(f * pr for (_, _, f, _, pr) in cfg["exp_extra"])
        life = base_salary * income_scale * cfg["expense_ratio"] / tmpl

        txs = []
        for desc, cat, frac, day, prob in cfg["exp_extra"]:
            if rng.random() > prob:
                continue
            amt = life * frac * rng.uniform(0.82, 1.22) * (infl ** 0.0)
            amt = rnd(amt, 1 if amt < 5000 else 10 if amt < 100000 else 100)
            if amt <= 0:
                continue
            d = min(date(ms.year, ms.month, min(day, 28)), LAST_DATA)
            txs.append({"id": txid(), "amount": amt, "date": iso(d), "description": desc, "category": cat, "type": "expense"})
        for d, desc, amt in emi_by_month.get(key, []):
            if d <= LAST_DATA:
                txs.append({"id": txid(), "amount": amt, "date": iso(d), "description": desc, "category": "Bank", "type": "expense"})
        for d, name, amt in sip_by_month.get(key, []):
            if d <= LAST_DATA:
                txs.append({"id": txid(), "amount": amt, "date": iso(d), "description": f"SIP - {name}",
                            "category": "SIP", "type": "investment"})
        for d, kind, desc, amt, cb in ev_by_month.get(key, []):
            if d > LAST_DATA:
                continue
            is_fd = "FD" in desc or "matured" in desc
            cat = "FD" if is_fd else "Stock"
            tx = {"id": txid(), "amount": rnd(amt), "date": iso(d), "description": desc, "category": cat,
                  "type": "investment" if kind == "buy" else "sell"}
            if kind == "sell":
                tx["costBasis"] = cb
            txs.append(tx)
        txs.sort(key=lambda t: t["date"])
        entries_raw.append((ms, cfg["employer"], "Salary" if "Salary" in cfg["employer"] else "Business", rnd(salary, 500), txs))

        # extras
        for desc, cat, mult, month_gap in cfg["extras"]:
            if cat == "Rent" or cat == "Stock Return":
                if cat == "Rent" and ms < add_months(start, 24):
                    continue
                if cat == "Stock Return" and (ms.month not in (6, 9, 12)):
                    continue
                if cat == "Rent":
                    amt = salary * mult * (1.05 ** (months_between(start, ms) / 12.0) / (1 + cfg["growth"]) ** 0)
                    entries_raw.append((date(ms.year, ms.month, 7), desc, cat, rnd(amt, 500), []))
                else:
                    amt = base_salary * mult * income_scale
                    entries_raw.append((date(ms.year, ms.month, 20), desc, cat, rnd(amt, 1000), []))
            elif cat in ("Freelance", "Profit"):
                if cat == "Profit":
                    if ms.month in (3, 9) and ms.year >= start.year + 1:
                        amt = base_salary * mult * income_scale * rng.uniform(0.8, 1.3)
                        entries_raw.append((date(ms.year, ms.month, 12), desc, cat, rnd(amt, 1000), []))
                elif rng.random() < 0.18 and ms.year >= start.year + 1:
                    amt = base_salary * mult * income_scale * rng.uniform(0.6, 1.5)
                    entries_raw.append((date(ms.year, ms.month, 14), desc, cat, rnd(amt, 100), []))
        if ms.month in cfg["bonus_months"] and ms.year > start.year:
            amt = base_salary * cfg["bonus_mult"] * income_scale * rng.uniform(0.7, 1.2) / max(1, len(cfg["bonus_months"]))
            entries_raw.append((date(ms.year, ms.month, 28 if ms.month != 10 else 1), "Annual bonus", "Bonus", rnd(amt, 500), []))
        if ms.month in (3, 6, 9, 12) and ms > add_months(start, 6):
            amt = base_salary * income_scale * cfg["interest_yearly"] * rng.uniform(0.7, 1.3)
            d = month_end(ms.year, ms.month)
            if d <= LAST_DATA:
                entries_raw.append((d, "Savings & FD interest", "Interest", rnd(amt, 10), []))

    for wd, wfrom, wcat, wamt in cfg.get("windfalls", []):
        entries_raw.append((wd, wfrom, wcat, rnd(wamt, 1000), []))
    entries_raw = [e for e in entries_raw if e[0] <= LAST_DATA]
    entries_raw.sort(key=lambda e: e[0])
    entries = []
    for i, (d, frm, cat, income, txs) in enumerate(entries_raw, 1):
        expense = sum(t["amount"] for t in txs if t["type"] == "expense")
        invest = sum(t["amount"] for t in txs if t["type"] == "investment")
        sale = sum(t["amount"] for t in txs if t["type"] == "sell")
        gain = sum(t["amount"] - t.get("costBasis", t["amount"]) for t in txs if t["type"] == "sell")
        entries.append({
            "id": i, "date": iso(d), "from": frm, "category": cat, "income": income, "transactions": txs,
            "expense": expense, "investment": invest, "investmentSale": sale, "realizedGainLoss": gain,
            "balance": income - expense - invest + sale,
        })
    return entries


def ledger_cash(entries):
    return sum(e["income"] - e["expense"] - e["investment"] + e["investmentSale"] for e in entries)


def deposits_value(fds):
    total = 0
    for r in fds:
        if r.get("status") == "closed":
            total += r["closedAmount"]
            continue
        start = date.fromisoformat(r["startDate"])
        mat = add_months(start, r["tenureMonths"])
        if TODAY >= mat:
            total += grow(r["principal"], r["interestRate"], r["tenureMonths"] / 12.0, r["compounding"])
        else:
            total += grow(r["principal"], r["interestRate"], years_between(start, TODAY), r["compounding"])
    return total


def lending_summary(entries, loans):
    by = {}
    for e in entries:
        b = by.setdefault(e["partyId"], [0, 0])
        b[0 if e["type"] == "gave" else 1] += e["amount"]
    recv = sum(g - t for g, t in by.values() if g - t > 0)
    pay = sum(t - g for g, t in by.values() if g - t < 0)
    outstanding = sum(max(0, l["principal"] - sum(p["amount"] for p in l["payments"])) for l in loans)
    return recv, pay + outstanding


def build_tier(key):
    cfg = TIERS[key]
    rng = random.Random(cfg["seed"])
    profiles, mf_settings, mf_entries = build_mf(cfg, rng)
    cfg["_profiles"], cfg["_mf_settings"] = profiles, mf_settings
    txns, prices, seq, stock_events, stock_value = build_stocks(cfg, rng)
    fds, fd_events = build_fds(cfg)
    gid = Ids()
    parties, lend_entries, loans, emis = build_lending(cfg, gid)

    # solve an income scale so the final ledger cash lands on target_cash
    def cash_for(scale):
        r = random.Random(cfg["seed"] + 1000)
        return ledger_cash(build_ledger(cfg, r, stock_events, fd_events, emis, scale))

    lo, hi = 0.02, 12.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if cash_for(mid) < cfg["target_cash"]:
            lo = mid
        else:
            hi = mid
    scale = (lo + hi) / 2
    ledger = build_ledger(cfg, random.Random(cfg["seed"] + 1000), stock_events, fd_events, emis, scale)

    cash = ledger_cash(ledger)
    mf_now = sum([e for e in mf_entries if e["profileId"] == p["id"]][-1]["portfolioValue"] for p in profiles)
    mf_inv = sum([e for e in mf_entries if e["profileId"] == p["id"]][-1]["investedAmount"] for p in profiles)
    fd_now = deposits_value(fds)
    recv, liab = lending_summary(lend_entries, loans)
    nw = cash + mf_now + stock_value + fd_now + recv - liab

    m = cfg["manual"]
    manual = {
        "banks": m["banks"], "customs": [{"name": n, "amt": a} for n, a in m["customs"]],
        "cash": m["cash"], "fd": rnd(fd_now, 1000), "stock": rnd(stock_value, 1000), "demat": rnd(stock_value * 0.0, 1),
        "pending": m["pending"], "other": m["other"], "updatedAt": "2026-10-03T09:00:00.000Z", "bankNames": m["bankNames"],
    }

    scope = f"guest-{key}@sample.blackroad.demo"
    payload = {
        "exportedAt": f"2026-10-05T09:00:00.000Z#{key}",
        "app": "BlackRoad",
        "exportedBy": {"name": cfg["owner"], "email": cfg["email"], "tier": cfg["label"], "sample": True},
        "databases": {
            f"BlackRoad2::{scope}": {"version": 3, "stores": {"entries": ledger, "meta": [{"key": "updateDate", "value": "2026-10-03"}]}},
            f"blackStocks::{scope}": {"version": 1, "stores": {"state": [
                {"key": "transactions", "value": txns}, {"key": "prices", "value": prices}, {"key": "seqCounter", "value": seq}]}},
            f"LendLedger::{scope}": {"version": 3, "stores": {"parties": parties, "entries": lend_entries, "loans": loans}},
            f"BlackRoadFD::{scope}": {"version": 1, "stores": {"deposits": fds}},
            f"sip-compounder::{scope}": {"version": 2, "stores": {"settings": mf_settings, "entries": mf_entries, "profiles": profiles}},
            f"BlackRoad Accounting::{scope}": {"version": 1, "stores": {"sst": [{"key": "manual", "value": manual}]}},
        },
    }
    summary = dict(cash=cash, mf=mf_now, mf_invested=mf_inv, stocks=stock_value, fd=fd_now, receivable=recv, liabilities=liab,
                   net_worth=nw, income_scale=scale, ledger_entries=len(ledger))
    return payload, summary


RANGES = {"bottom-50": (0, 1_000_000), "middle-40": (1_000_000, 10_000_000),
          "top-10": (10_000_000, 500_000_000), "top-1": (500_000_000, 990_000_000)}


def fmt(n):
    if abs(n) >= 1e7:
        return f"Rs {n / 1e7:,.2f} Cr"
    if abs(n) >= 1e5:
        return f"Rs {n / 1e5:,.2f} L"
    return f"Rs {n:,.0f}"


if __name__ == "__main__":
    for key in TIERS:
        payload, s = build_tier(key)
        lo, hi = RANGES[key]
        ok = lo <= s["net_worth"] <= hi
        path = os.path.join(OUT, f"{key}.json")
        with open(path, "w") as f:
            json.dump(payload, f, separators=(",", ":"))
        print(f"{key:10s} NW {fmt(s['net_worth']):>16s}  cash {fmt(s['cash']):>14s}  MF {fmt(s['mf']):>14s}  "
              f"stocks {fmt(s['stocks']):>14s}  FD {fmt(s['fd']):>14s}  recv {fmt(s['receivable']):>12s}  "
              f"liab {fmt(s['liabilities']):>12s}  incomeScale {s['income_scale']:.2f}  "
              f"{'OK' if ok else 'OUT OF RANGE'}  ({os.path.getsize(path) // 1024} KB)")
