// The "plan-on" level: the share of the 24 h forecast a buyer can count on 9 hours in 10.
// Learned from December 2025 only (10th percentile of actual ÷ forecast = 0.729), then tested on
// January 2026, where output reached it in 89% of hours.
// Source: analysis/wind_forecast_analysis.ipynb, section 5 ("What a buyer can rely on").
export const PLAN_ON_SHARE = 0.73;
export const PLAN_ON_MET_IN_JANUARY = "89%";
