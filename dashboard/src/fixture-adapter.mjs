function cloneSnapshot(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    sessions: snapshot.sessions.map((session) => ({ ...session })),
  };
}

export class FixtureSessionAdapter {
  #snapshot;

  constructor(snapshot) {
    this.#snapshot = cloneSnapshot(snapshot);
  }

  async readSnapshot() {
    return cloneSnapshot(this.#snapshot);
  }
}
