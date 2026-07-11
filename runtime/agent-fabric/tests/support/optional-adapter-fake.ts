export type OptionalDispatchResult =
  | { state: "unavailable"; acknowledged: false; reason: string }
  | { state: "accepted"; acknowledged: false; providerActionRef: string }
  | { state: "terminal"; acknowledged: true; providerActionRef: string };

export type OptionalLookupResult =
  | { state: "unknown"; acknowledged: false }
  | { state: "accepted"; acknowledged: false; providerActionRef: string }
  | { state: "terminal"; acknowledged: true; providerActionRef: string };

export class FakeOptionalAdapter {
  readonly dispatches: Array<{ actionId: string; payload: Record<string, unknown> }> = [];
  readonly lookups: string[] = [];
  #responses: OptionalDispatchResult[];
  #lookupResult: OptionalLookupResult;

  constructor(options: {
    dispatchResponses: OptionalDispatchResult[];
    lookupResult?: OptionalLookupResult;
  }) {
    this.#responses = [...options.dispatchResponses];
    this.#lookupResult = options.lookupResult ?? { state: "unknown", acknowledged: false };
  }

  async dispatch(input: {
    actionId: string;
    payload: Record<string, unknown>;
  }): Promise<OptionalDispatchResult> {
    this.dispatches.push(input);
    return this.#responses.shift() ?? {
      state: "unavailable",
      acknowledged: false,
      reason: "provider-unavailable",
    };
  }

  async lookupAction(actionId: string): Promise<OptionalLookupResult> {
    this.lookups.push(actionId);
    return this.#lookupResult;
  }
}
