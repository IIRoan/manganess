import { scheduleIdle } from '../scheduleIdle';

describe('scheduleIdle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the task after the current turn', () => {
    const task = jest.fn();

    scheduleIdle(task);

    expect(task).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not run the task after cancel', () => {
    const task = jest.fn();
    const cancel = scheduleIdle(task);

    cancel();
    jest.runAllTimers();

    expect(task).not.toHaveBeenCalled();
  });
});
