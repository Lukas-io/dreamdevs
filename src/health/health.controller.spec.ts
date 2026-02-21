import { HealthController } from './health.controller';

describe('HealthController', () => {
  const makeController = (ingestion: Partial<any>, analytics: Partial<any>) =>
    new HealthController(ingestion as any, analytics as any);

  it('reflects import in-progress state', () => {
    const ctrl = makeController(
      { isComplete: false, totalImported: 0, totalSkipped: 0 },
      { isReady: false },
    );
    const result = ctrl.getHealth();
    expect(result.status).toBe('ok');
    expect(result.import.complete).toBe(false);
    expect(result.analytics.ready).toBe(false);
  });

  it('reflects fully ready state', () => {
    const ctrl = makeController(
      { isComplete: true, totalImported: 849573, totalSkipped: 102 },
      { isReady: true },
    );
    const result = ctrl.getHealth();
    expect(result.import.complete).toBe(true);
    expect(result.import.totalImported).toBe(849573);
    expect(result.import.totalSkipped).toBe(102);
    expect(result.analytics.ready).toBe(true);
  });

  it('always returns status ok regardless of readiness', () => {
    const ctrl = makeController(
      { isComplete: false, totalImported: 0, totalSkipped: 0 },
      { isReady: false },
    );
    expect(ctrl.getHealth().status).toBe('ok');
  });
});
