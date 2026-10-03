import { describe, it, expect } from 'vitest';
import {
  LOGIN_FAILED_HINT,
  OPERATIVE_PASS,
  OPERATIVE_USER,
  PASSWORD_CASE_NOTE,
} from './operativeLogin';

describe('operative login text', () => {
  it('keeps the exact credentials in one place', () => {
    expect(OPERATIVE_USER).toBe('ghost');
    expect(OPERATIVE_PASS).toBe('nX-2847');
  });

  it('explains the casing of the password explicitly', () => {
    expect(PASSWORD_CASE_NOTE).toBe('lowercase n, capital X');
  });

  it('the failure hint says the password is case-sensitive and where to look, without printing it', () => {
    expect(LOGIN_FAILED_HINT).toMatch(/case-sensitive/i);
    expect(LOGIN_FAILED_HINT).toContain(PASSWORD_CASE_NOTE);
    expect(LOGIN_FAILED_HINT).toMatch(/ticket number/i);
    expect(LOGIN_FAILED_HINT).not.toContain(OPERATIVE_PASS);
  });
});
