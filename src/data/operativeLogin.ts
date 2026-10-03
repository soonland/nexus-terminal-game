// The field terminal's boot credentials. The password is case-sensitive, and the briefing
// only calls it "the ticket number" (NX-2847) — which players cannot turn into the exact
// string `nX-2847` by guessing. Every place that mentions it states the casing explicitly.
export const OPERATIVE_USER = 'ghost';
export const OPERATIVE_PASS = 'nX-2847';

export const PASSWORD_CASE_NOTE = 'lowercase n, capital X';

export const LOGIN_FAILED_HINT = `Hint: the password is the ticket number from your briefing, case-sensitive (${PASSWORD_CASE_NOTE}).`;
