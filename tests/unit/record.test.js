import { describe, it, expect } from 'vitest';
import { LearningRecord } from '../../src/learning/record.js';
import { AppState } from '../../src/systems/state.js';

const SLUG = 'glacier-time-machine';

describe('learning record (local-only, xAPI-shaped)', () => {
  it('logs statements under the slug key and reads them back', () => {
    localStorage.clear();
    const rec = new LearningRecord(SLUG);
    rec.log('completed', { id: 'm1-precheck', name: 'Pre-check' }, { response: { correct: 3, total: 5 } });
    rec.log('answered', { id: 'pre-1', name: 'Glacier flow' }, { response: 'b', success: true });
    expect(rec.events).toHaveLength(2);
    expect(rec.events[0].verb.display['en-US']).toBe('completed');
    expect(rec.events[1].object.id).toBe(`urn:${SLUG}:pre-1`);
    expect(JSON.parse(localStorage.getItem(`${SLUG}:progress`))).toHaveLength(2);
  });

  it('latestAnswers returns the last response per object', () => {
    localStorage.clear();
    const rec = new LearningRecord(SLUG);
    rec.log('answered', { id: 'q1' }, { response: 'a' });
    rec.log('answered', { id: 'q1' }, { response: 'c' });
    rec.log('answered', { id: 'q2' }, { response: 'b' });
    expect(rec.latestAnswers()).toEqual({ [`urn:${SLUG}:q1`]: 'c', [`urn:${SLUG}:q2`]: 'b' });
  });

  it('clearProjectData removes ONLY this project slug-prefixed keys', () => {
    localStorage.clear();
    localStorage.setItem('other-project:state', 'keep-me');
    const rec = new LearningRecord(SLUG);
    rec.log('completed', { id: 'x' });
    localStorage.setItem(`${SLUG}:settings`, '{}');
    const removed = rec.clearProjectData();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem('other-project:state')).toBe('keep-me');
    expect(rec.events).toHaveLength(0);
  });

  it('toJSON produces a valid export envelope', () => {
    localStorage.clear();
    const rec = new LearningRecord(SLUG);
    rec.log('experienced', { id: 'cinematic-flyover' });
    const parsed = JSON.parse(rec.toJSON());
    expect(parsed.slug).toBe(SLUG);
    expect(parsed.statements).toHaveLength(1);
  });
});

describe('app state (save/resume)', () => {
  it('completes steps, stores decisions and resumes', () => {
    localStorage.clear();
    const state = new AppState(SLUG, ['m1', 'm2']);
    expect(state.state.module).toBe('m1');
    state.goToModule('m2');
    state.completeStep('m2-tag', { tags: ['ice-loss'] });
    expect(state.isComplete('m2-tag')).toBe(true);
    const reloaded = new AppState(SLUG, ['m1', 'm2']);
    expect(reloaded.state.module).toBe('m2');
    expect(reloaded.state.decisions['m2-tag']).toEqual({ tags: ['ice-loss'] });
  });

  it('reset returns a fresh state', () => {
    localStorage.clear();
    const state = new AppState(SLUG, ['m1', 'm2']);
    state.completeStep('m1-flow');
    state.reset();
    expect(state.state.completed).toHaveLength(0);
    expect(new AppState(SLUG, ['m1', 'm2']).state.completed).toHaveLength(0);
  });
});
