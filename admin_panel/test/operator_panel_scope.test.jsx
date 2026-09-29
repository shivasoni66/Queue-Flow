/**
 * Live Operator Panel — facility isolation, counter selection and realtime
 * scoping.
 *
 * These are the failures the panel actually had, reproduced against the real
 * component:
 *
 *   • the panel showed one facility's name above another facility's counter,
 *     because the counter was fetched with no facility scope at all;
 *   • a duplicated token code appeared twice in "Next in Line";
 *   • the waiting count and the estimated wait were invented fallbacks rather
 *     than backend values;
 *   • CALL NEXT was offered on a counter that was closed or on a break;
 *   • a realtime event for one counter could overwrite another counter's screen.
 *
 * Nothing here talks to a network. `counterAPI` and the socket layer are mocked,
 * so the assertions are about the panel's scoping behaviour, which is what was
 * broken.
 *
 * Run:  npx vitest run --environment jsdom test/operator_panel_scope.test.jsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
expect.extend(matchers);

const COLLEGE = '6ab93df8da6b1eefeb19caa2';
const BANK = '6ab2de9aafc22e59af9d0caf';
const COLLEGE_SERVICE = '6ab93df8da6b1eefeb19caa6';

const COUNTER_ONE = '6ab93df9da6b1eefeb19caaa';
const COUNTER_TWO = '6ab93dfbda6b1eefeb19cae0';

// ── Mutable test state driven by the mocked API ──────────────────────────────
let operableByCenter = {};
let operatorStateByKey = {};
let activeCenterId = COLLEGE;
let setActiveCenterId = vi.fn();
let socketHandlers = {};
let currentUser = { _id: 'admin1', name: 'Admin User', role: 'ADMIN' };

function panelState({
  counterId,
  centerId = COLLEGE,
  centerName,
  serviceName,
  serviceId = COLLEGE_SERVICE,
  status = 'ACTIVE',
  token = null,
  waiting = [],
  waitingCount = 0,
  ewt = 4,
  canSelectAnyCounter = true,
}) {
  return {
    counter: {
      _id: counterId,
      name: counterId === COUNTER_ONE ? 'Counter 01' : counterId === COUNTER_TWO ? 'Counter 02' : counterId,
      number: counterId === COUNTER_ONE ? 1 : 2,
      status,
      centerId: { _id: centerId, name: centerName, code: 'CODE' },
      serviceId: { _id: serviceId, name: serviceName },
      currentTokenId: token,
      staffId: null,
    },
    center: { _id: centerId, name: centerName, code: 'CODE' },
    service: { _id: serviceId, name: serviceName },
    queue: { waitingCount, estimatedWaitMinutes: ewt },
    waitingTokens: waiting.map((t, i) => ({
      _id: `w${i}`,
      tokenCode: t,
      position: i + 1,
      waitEstimateMinutes: 3,
    })),
    waitingCount,
    estimatedWaitMinutes: ewt,
    workload: null,
    requiresCounterSelection: false,
    selectedCenterId: centerId,
    canSelectAnyCounter,
  };
}

vi.mock('../src/services/api', () => ({
  counterAPI: {
    getOperableCounters: vi.fn(async (centerId) => {
      const list = operableByCenter[centerId] || [];
      return { success: true, data: { counters: list, canSelectAnyCounter: true } };
    }),
    getOperatorCounter: vi.fn(async (centerId, counterId) => {
      const key = `${centerId || 'none'}:${counterId || 'assigned'}`;
      const state = operatorStateByKey[key];
      if (!state) {
        return {
          success: true,
          data: { counter: null, queue: null, waitingTokens: [], requiresCounterSelection: true, canSelectAnyCounter: true },
        };
      }
      return { success: true, data: state };
    }),
    callNext: vi.fn(async () => ({ success: true, data: { token: { tokenCode: 'C-010', status: 'CALLED' } } })),
    startServing: vi.fn(async () => ({ success: true, data: { token: { tokenCode: 'C-010', status: 'SERVING' } } })),
    complete: vi.fn(async () => ({ success: true, data: { token: { tokenCode: 'C-010', status: 'COMPLETED' } } })),
    skip: vi.fn(async () => ({ success: true, data: { token: { tokenCode: 'C-010', status: 'SKIPPED' } } })),
    recall: vi.fn(async () => ({ success: true, data: { token: { tokenCode: 'C-010' } } })),
    updateStatus: vi.fn(async () => ({ success: true, data: { counter: {} } })),
  },
}));

vi.mock('../src/services/socket', () => ({
  joinCounterRoom: vi.fn(),
  leaveCounterRoom: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

vi.mock('../src/context/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    on: (evt, handler) => {
      (socketHandlers[evt] = socketHandlers[evt] || []).push(handler);
      return () => {
        socketHandlers[evt] = (socketHandlers[evt] || []).filter((h) => h !== handler);
      };
    },
    activeCenterId,
    setActiveCenterId,
  }),
}));

import OperatorPortal from '../src/pages/OperatorPortal.jsx';
import { shouldApplyEvent } from '../src/hooks/useOperatorCounter.js';
import { counterAPI } from '../src/services/api';

function renderPanel() {
  return render(
    <MemoryRouter>
      <OperatorPortal />
    </MemoryRouter>
  );
}

/** Emit a socket event the way the transport would. */
async function emitSocket(evt, payload) {
  await act(async () => {
    for (const h of socketHandlers[evt] || []) h(payload);
  });
}

/**
 * Walk the flow an ADMIN actually performs: land on the "Choose a counter"
 * prompt, open the picker, and take a counter. The panel deliberately does not
 * pick a counter on the operator's behalf, so a test that wants the counter
 * screen has to go through here.
 */
async function chooseCounter(name) {
  const trigger = screen.queryAllByText('CHOOSE COUNTER')[0];
  expect(trigger, 'the panel should offer CHOOSE COUNTER').toBeTruthy();
  await act(async () => {
    trigger.click();
  });
  await screen.findByText('Choose counter');
  await act(async () => {
    screen.getByText(new RegExp(name)).click();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  socketHandlers = {};
  activeCenterId = COLLEGE;
  setActiveCenterId = vi.fn();
  currentUser = { _id: 'admin1', name: 'Admin User', role: 'ADMIN' };

  operableByCenter = {
    [COLLEGE]: [
      { _id: COUNTER_ONE, name: 'Counter 01', number: 1, displayLabel: 'COUNTER 01', status: 'ACTIVE', service: { _id: COLLEGE_SERVICE, name: 'College Queue' }, operator: null, currentToken: null, isAssignedToCaller: false, canOperate: true },
      { _id: COUNTER_TWO, name: 'Counter 02', number: 2, displayLabel: 'COUNTER 02', status: 'ACTIVE', service: { _id: COLLEGE_SERVICE, name: 'College Queue' }, operator: null, currentToken: null, isAssignedToCaller: false, canOperate: true },
    ],
    [BANK]: [
      { _id: 'bankc1', name: 'Teller A', number: 1, displayLabel: 'TELLER A', status: 'ACTIVE', service: { _id: 'banksvc', name: 'Account Opening' }, operator: null, currentToken: null, isAssignedToCaller: false, canOperate: true },
    ],
  };

  operatorStateByKey = {
    [`${COLLEGE}:${COUNTER_ONE}`]: panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      waiting: ['C-001', 'C-002', 'C-003'],
      waitingCount: 3,
      ewt: 7,
    }),
    [`${COLLEGE}:${COUNTER_TWO}`]: panelState({
      counterId: COUNTER_TWO,
      centerName: 'College Account',
      serviceName: 'College Queue',
      waiting: ['C-004'],
      waitingCount: 1,
      ewt: 2,
    }),
    [`${BANK}:bankc1`]: panelState({
      counterId: 'bankc1',
      centerId: BANK,
      centerName: 'State Bank — Main Branch',
      serviceName: 'Account Opening',
      serviceId: 'banksvc',
      waiting: ['A-001', 'A-002'],
      waitingCount: 2,
      ewt: 15,
    }),
  };
});

afterEach(() => cleanup());

describe('Operator Panel — facility isolation', () => {
  it('never shows another facility\'s counter, service or tokens under the selected facility', async () => {
    // The operator has chosen College Account, but the backend will happily
    // return a foreign counter if the panel asks without a facility scope. The
    // panel must always send the selected facility.
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    const operatorCall = counterAPI.getOperatorCounter.mock.calls.at(-1);
    expect(operatorCall[0]).toBe(COLLEGE);

    // Nothing from the other facility may be rendered anywhere on the screen.
    expect(screen.queryByText(/State Bank/)).not.toBeInTheDocument();
    expect(screen.queryByText('Account Opening')).not.toBeInTheDocument();
    expect(screen.queryByText('A-001')).not.toBeInTheDocument();
    expect(screen.queryByText('Teller A')).not.toBeInTheDocument();

    // And the correct facility, service and real tokens are shown.
    expect(screen.getAllByText('College Account').length).toBeGreaterThan(0);
    expect(screen.getAllByText('College Queue').length).toBeGreaterThan(0);
    expect(screen.getByText('C-001')).toBeInTheDocument();
    expect(screen.getByText('C-003')).toBeInTheDocument();
  });

  it('shows the backend waiting count and EWT instead of invented values', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    // 3 waiting customers, backend EWT of 7 minutes for this queue.
    expect(screen.getByTestId('people-waiting')).toHaveTextContent('3');
    expect(screen.getByTestId('est-wait')).toHaveTextContent('7m');
    // The placeholder figures from the broken screen must not appear.
    expect(screen.queryByText('15m')).not.toBeInTheDocument();
    expect(screen.queryByText('0 / 100')).not.toBeInTheDocument();
    expect(screen.queryByText(/Low Load/i)).not.toBeInTheDocument();
  });

  it('renders the waiting list exactly once per token, with no duplicates', async () => {
    // A backend that (incorrectly) returned a repeated record must not turn into
    // a repeated row.
    operatorStateByKey[`${COLLEGE}:${COUNTER_ONE}`] = panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      waiting: ['C-001', 'C-001', 'C-002'],
      waitingCount: 2,
    });

    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    expect(screen.getAllByText('C-001')).toHaveLength(1);
    expect(screen.getAllByText('C-002')).toHaveLength(1);
  });
});

describe('Operator Panel — CHOOSE COUNTER', () => {
  it('loads the real counter list for the selected facility from the backend', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');

    await act(async () => {
      screen.getAllByText('CHOOSE COUNTER')[0].click();
    });

    await screen.findByText('Choose counter');
    expect(counterAPI.getOperableCounters).toHaveBeenCalledWith(COLLEGE);

    // Real rows from the backend, for this facility only.
    expect(screen.getByText(/Counter 01/)).toBeInTheDocument();
    expect(screen.getByText(/Counter 02/)).toBeInTheDocument();
    expect(screen.queryByText(/Teller A/)).not.toBeInTheDocument();
    // College Queue, the real service of the real counters.
    expect(screen.getAllByText(/College Queue/).length).toBeGreaterThan(0);
  });

  it('switches the whole panel to the chosen counter and drops the previous data', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');
    expect(screen.getByText('C-001')).toBeInTheDocument();

    await act(async () => {
      screen.getAllByText('CHOOSE COUNTER')[0].click();
    });
    await screen.findByText('Choose counter');

    await act(async () => {
      screen.getByText(/Counter 02/).click();
    });

    // Header, waiting count and queue all follow the new counter.
    await waitFor(() => {
      expect(screen.getAllByText('Counter 02').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('people-waiting')).toHaveTextContent('1');
    expect(screen.getByTestId('est-wait')).toHaveTextContent('2m');
    expect(screen.getByText('C-004')).toBeInTheDocument();

    // Counter 01's customers are gone from the screen entirely.
    expect(screen.queryByText('C-001')).not.toBeInTheDocument();
    expect(screen.queryByText('C-002')).not.toBeInTheDocument();
    expect(screen.queryByText('C-003')).not.toBeInTheDocument();

    // And the new request was correctly scoped to facility + counter.
    const last = counterAPI.getOperatorCounter.mock.calls.at(-1);
    expect(last[0]).toBe(COLLEGE);
    expect(last[1]).toBe(COUNTER_TWO);
  });

  it('prompts an ADMIN to choose a counter instead of inventing one', async () => {
    // No counter selected: the backend says so explicitly.
    operatorStateByKey[`${COLLEGE}:assigned`] = null;
    operatorStateByKey[`${COLLEGE}:undefined`] = null;

    renderPanel();
    await screen.findByText('Choose a counter');
    expect(screen.getByText(/CHOOSE COUNTER/)).toBeInTheDocument();
  });
});

describe('Operator Panel — counter status gates the actions', () => {
  it.each([
    ['CLOSED', 'Counter is CLOSED'],
    ['BREAK', 'Counter is on BREAK'],
  ])('disables CALL NEXT while the counter is %s', async (status, tooltip) => {
    operatorStateByKey[`${COLLEGE}:${COUNTER_ONE}`] = panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      status,
      waiting: ['C-001', 'C-002'],
      waitingCount: 2,
    });

    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    const callNext = screen.getByText('CALL NEXT').closest('button');
    expect(callNext).toBeDisabled();
    expect(callNext).toHaveAttribute('title', tooltip);
  });

  it('enables CALL NEXT only when the counter is ACTIVE and customers are waiting', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    const callNext = screen.getByText('CALL NEXT').closest('button');
    expect(callNext).toBeEnabled();
    expect(callNext).toHaveAttribute('title', 'Call the next waiting customer to this counter');
  });

  it('disables CALL NEXT when the queue is empty', async () => {
    operatorStateByKey[`${COLLEGE}:${COUNTER_ONE}`] = panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      waiting: [],
      waitingCount: 0,
    });

    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    const callNext = screen.getByText('CALL NEXT').closest('button');
    expect(callNext).toBeDisabled();
    expect(callNext).toHaveAttribute('title', 'No customers waiting in this queue');
  });

  it('shows IDLE and disables token actions when no token is called', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    expect(screen.getByText('IDLE')).toBeInTheDocument();
    for (const label of ['START SERVING', 'COMPLETE', 'SKIP', 'RE-CALL']) {
      expect(screen.getByText(label).closest('button')).toBeDisabled();
    }
  });

  it('shows the real called token and enables START SERVING', async () => {
    operatorStateByKey[`${COLLEGE}:${COUNTER_ONE}`] = panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      token: { _id: 'tok1', tokenCode: 'C-023', status: 'CALLED', calledAt: new Date().toISOString() },
      waiting: ['C-024'],
      waitingCount: 1,
    });

    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    // The real token, never a hardcoded sample code.
    expect(screen.getByText('C-023')).toBeInTheDocument();
    expect(screen.queryByText('A-001')).not.toBeInTheDocument();
    expect(screen.queryByText('IDLE')).not.toBeInTheDocument();
    expect(screen.getByText('START SERVING').closest('button')).toBeEnabled();
  });
});

describe('Operator Panel — a normal operator is locked to its own counter', () => {
  it('hides CHOOSE COUNTER and shows the assigned-counter lock for a STAFF user', async () => {
    currentUser = { _id: 'staff1', name: 'College Operator 01', role: 'STAFF' };
    // The backend resolves a STAFF operator's own counter with no counterId, and
    // reports that this user may not choose a counter.
    operatorStateByKey[`${COLLEGE}:assigned`] = panelState({
      counterId: COUNTER_ONE,
      centerName: 'College Account',
      serviceName: 'College Queue',
      waiting: ['C-001'],
      waitingCount: 1,
      canSelectAnyCounter: false,
    });

    renderPanel();

    // The panel goes straight to the assigned counter: no "choose" prompt.
    await screen.findByText(/Counter 01/);
    expect(screen.queryByText('Choose a counter')).not.toBeInTheDocument();
    expect(screen.queryByText('CHOOSE COUNTER')).not.toBeInTheDocument();
    expect(screen.getByText(/Assigned counter/)).toBeInTheDocument();
  });
});

describe('Operator Panel — actions are backend calls, not local state', () => {
  it('sends the selected facility with CALL NEXT and refreshes from the backend', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    await act(async () => {
      screen.getByText('CALL NEXT').closest('button').click();
    });

    expect(counterAPI.callNext).toHaveBeenCalledWith(COUNTER_ONE, COLLEGE);
    // The panel refetches the authoritative state instead of patching locally.
    expect(counterAPI.getOperatorCounter).toHaveBeenCalledWith(COLLEGE, COUNTER_ONE);
  });

  it('reports the backend\'s own CALL NEXT outcome', async () => {
    counterAPI.callNext.mockResolvedValueOnce({
      success: true,
      message: 'No waiting tokens in the queue',
      data: { token: null, skipped: [], blocked: [] },
    });

    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');

    await act(async () => {
      screen.getByText('CALL NEXT').closest('button').click();
    });

    await waitFor(() => {
      expect(screen.getByText('No waiting tokens in the queue')).toBeInTheDocument();
    });
  });
});

describe('realtime event scoping', () => {
  const scope = { centerId: COLLEGE, counterId: COUNTER_ONE, serviceId: COLLEGE_SERVICE };

  it('applies an event for the selected counter in the selected facility', () => {
    expect(
      shouldApplyEvent('token.called', { token: { centerId: COLLEGE }, counter: { _id: COUNTER_ONE } }, scope)
    ).toBe(true);
  });

  it('ignores an event belonging to a different facility', () => {
    expect(
      shouldApplyEvent('token.called', { token: { centerId: BANK }, counter: { _id: 'bankc1' } }, scope)
    ).toBe(false);
  });

  it('ignores an event belonging to a different counter in the same facility', () => {
    expect(
      shouldApplyEvent('token.called', { token: { centerId: COLLEGE }, counter: { _id: COUNTER_TWO } }, scope)
    ).toBe(false);
  });

  it('ignores a queue update for a different service', () => {
    expect(shouldApplyEvent('queue.updated', { centerId: COLLEGE, serviceId: 'someOtherService' }, scope)).toBe(false);
  });

  it('applies a queue update for the counter\'s own service', () => {
    expect(shouldApplyEvent('queue.updated', { centerId: COLLEGE, serviceId: COLLEGE_SERVICE }, scope)).toBe(true);
  });

  it('ignores a counter update that names no counter', () => {
    expect(shouldApplyEvent('counter.updated', { centerId: COLLEGE }, scope)).toBe(false);
  });

  it('applies nothing while no counter is selected', () => {
    expect(shouldApplyEvent('token.called', { token: { centerId: COLLEGE } }, { centerId: COLLEGE, counterId: null })).toBe(false);
  });

  it('does not let another counter\'s event repaint the current counter', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');
    expect(screen.getByText('C-001')).toBeInTheDocument();

    const before = counterAPI.getOperatorCounter.mock.calls.length;

    // Counter 02 calls somebody. Counter 01 is on screen, so nothing happens.
    await emitSocket('token.called', {
      token: { centerId: COLLEGE, tokenCode: 'C-099' },
      counter: { _id: COUNTER_TWO, centerId: COLLEGE },
    });

    expect(counterAPI.getOperatorCounter.mock.calls.length).toBe(before);
    expect(screen.queryByText('C-099')).not.toBeInTheDocument();

    // Counter 01's own event does refresh it.
    await emitSocket('token.called', {
      token: { centerId: COLLEGE, tokenCode: 'C-098' },
      counter: { _id: COUNTER_ONE, centerId: COLLEGE },
    });
    expect(counterAPI.getOperatorCounter.mock.calls.length).toBeGreaterThan(before);
  });

  it('ignores events from an entirely different facility', async () => {
    renderPanel();
    await screen.findByText('Choose a counter');
    await chooseCounter('Counter 01');
    const before = counterAPI.getOperatorCounter.mock.calls.length;

    await emitSocket('token.called', {
      token: { centerId: BANK, tokenCode: 'A-050' },
      counter: { _id: 'bankc1', centerId: BANK },
    });

    expect(counterAPI.getOperatorCounter.mock.calls.length).toBe(before);
    expect(screen.queryByText('A-050')).not.toBeInTheDocument();
  });
});
