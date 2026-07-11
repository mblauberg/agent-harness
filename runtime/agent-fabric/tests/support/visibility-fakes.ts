export type HerdrCall = {
  method: string;
  input: Record<string, unknown>;
};

export class FakeHerdrBoundary {
  readonly calls: HerdrCall[] = [];
  available = true;
  #pane = 0;

  async placeSideBySide(input: Record<string, unknown>): Promise<void> {
    this.#assertAvailable();
    this.calls.push({ method: "placeSideBySide", input });
  }

  async startObserver(input: Record<string, unknown>): Promise<{ paneId: string }> {
    this.#assertAvailable();
    this.#pane += 1;
    const paneId = `w-test:p${this.#pane}`;
    this.calls.push({ method: "startObserver", input: { ...input, paneId } });
    return { paneId };
  }

  async renderActivity(input: Record<string, unknown>): Promise<void> {
    this.#assertAvailable();
    this.calls.push({ method: "renderActivity", input });
  }

  async closePane(input: Record<string, unknown>): Promise<void> {
    this.#assertAvailable();
    this.calls.push({ method: "closePane", input });
  }

  async wakeup(input: Record<string, unknown>): Promise<{ status: "dispatched-unconfirmed" }> {
    this.#assertAvailable();
    this.calls.push({ method: "wakeup", input });
    return { status: "dispatched-unconfirmed" };
  }

  async reportMetadata(input: Record<string, unknown>): Promise<void> {
    this.#assertAvailable();
    this.calls.push({ method: "reportMetadata", input });
  }

  loseTelemetry(): void {
    this.available = false;
  }

  restoreTelemetry(): void {
    this.available = true;
  }

  callsFor(method: string): HerdrCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  #assertAvailable(): void {
    if (!this.available) {
      throw Object.assign(new Error("Herdr unavailable"), { code: "HERDR_UNAVAILABLE" });
    }
  }
}

export type ProviderSession = {
  agentId: string;
  sessionRef: string;
  mode: "managed" | "interactive";
  state: "idle" | "busy" | "lost";
  activeTools: number;
};

export class FakeProviderBoundary {
  readonly sessions = new Map<string, ProviderSession>();
  readonly calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  managedSpawnCount = 0;

  async spawnManaged(input: { agentId: string; sessionRef: string }): Promise<ProviderSession> {
    this.managedSpawnCount += 1;
    const session: ProviderSession = {
      ...input,
      mode: "managed",
      state: "idle",
      activeTools: 0,
    };
    this.sessions.set(input.agentId, session);
    this.calls.push({ method: "spawnManaged", input });
    return session;
  }

  async attachInteractive(input: { agentId: string; sessionRef: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      ...input,
      mode: "interactive",
      state: "idle",
      activeTools: 0,
    };
    this.sessions.set(input.agentId, session);
    this.calls.push({ method: "attachInteractive", input });
    return session;
  }

  setTurnState(agentId: string, state: "idle" | "busy", activeTools = 0): void {
    const session = this.require(agentId);
    session.state = state;
    session.activeTools = activeTools;
  }

  loseSession(agentId: string): void {
    this.require(agentId).state = "lost";
  }

  status(agentId: string): ProviderSession {
    return { ...this.require(agentId) };
  }

  require(agentId: string): ProviderSession {
    const session = this.sessions.get(agentId);
    if (session === undefined) {
      throw new Error(`provider session missing for ${agentId}`);
    }
    return session;
  }
}

export class VisibilityClock {
  #time = Date.parse("2026-07-10T00:00:00.000Z");

  now = (): number => this.#time;

  advance(milliseconds: number): void {
    this.#time += milliseconds;
  }
}
