export class SharedTimer {
  constructor({url, key, instanceId, onState, onStatus}) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.instanceId = instanceId;
    this.onState = onState;
    this.onStatus = onStatus;
    this.topic = `realtime:pomo:${instanceId}`;
    this.ws = null;
    this.live = false;
    this.stopped = false;
    this.heartbeat = null;
    this.reconnect = null;
    this.retryMs = 1000;
    this.version = -1;
    this.refreshing = null;
    this.refreshRequested = 0;
    this.joinRef = null;
    this.requestNumber = 0;
  }

  async rpc(name, params) {
    const begunAt = Date.now();
    const response = await fetch(
      `${this.url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          'apikey': this.key,
          'Authorization': `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          p_instance_id: this.instanceId, ...params
        })
      }
    );

    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(
        problem.message || `Supabase error ${response.status}`
      );
    }

    return {
      payload: await response.json(),
      begunAt,
      arrivedAt: Date.now()
    };
  }

  apply(result) {
    const {payload, begunAt, arrivedAt} = result;

    if (!payload?.state || !Number.isFinite(payload.server_now)) {
      throw new Error('Unexpected Supabase response');
    }

    const row = payload.state;

    if (row.instance_id !== this.instanceId ||
        !Number.isSafeInteger(row.version)) {
      throw new Error('Unexpected room data');
    }

    if (row.version < this.version) return;
    this.version = row.version;

    const offset =
      payload.server_now - (begunAt + arrivedAt) / 2;

    this.onState({
      mode: row.mode,
      focus: row.focus,
      rest: row.rest,
      phase: row.phase,
      running: row.running,
      remaining: row.remaining_ms,
      endsAt: row.ends_at ? Date.parse(row.ends_at) : null,
      version: row.version
    }, offset);
  }

  async refresh() {
    ++this.refreshRequested;
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      let completed = 0;

      while (completed < this.refreshRequested) {
        completed = this.refreshRequested;
        this.apply(await this.rpc('pomo_read', {}));
      }
    })();

    try {
      await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  async command(type, extra = {}) {
    const params = {p_action: type};

    if (type === 'durations') {
      params.p_focus = extra.focus;
      params.p_rest = extra.rest;
    }

    this.apply(await this.rpc('pomo_command', params));
  }

  connect() {
    if (this.stopped) return;
    clearTimeout(this.reconnect);

    const wsUrl = new URL(
      this.url.replace(/^http/i, 'ws') +
      '/realtime/v1/websocket'
    );
    wsUrl.searchParams.set('apikey', this.key);
    wsUrl.searchParams.set('vsn', '1.0.0');

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.send('phx_join', this.topic, {
        config: {
          broadcast: {ack: false, self: false},
          presence: {enabled: false},
          private: false
        }
      });
    };

    ws.onmessage = event => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.topic === this.topic &&
          message.event === 'phx_reply' &&
          message.payload?.status === 'ok') {

        this.live = true;
        this.retryMs = 1000;
        this.onStatus('online');
        this.refresh().catch(e => this.onStatus('error', e));

        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(
          () => this.send('heartbeat', 'phoenix', {}),
          20000
        );

      } else if (
        message.topic === this.topic &&
        message.event === 'broadcast' &&
        message.payload?.event === 'changed'
      ) {
        this.refresh().catch(e => this.onStatus('error', e));

      } else if (
        message.topic === this.topic &&
        (message.event === 'phx_error' ||
         message.event === 'phx_close' ||
         (message.event === 'phx_reply' &&
          message.payload?.status === 'error'))
      ) {
        this.onStatus(
          'error',
          new Error(
            message.payload?.response?.reason ||
            'Realtime channel error'
          )
        );
        ws.close();
      }
    };

    ws.onerror = () => this.onStatus('reconnecting');

    ws.onclose = () => {
      this.live = false;
      clearInterval(this.heartbeat);
      if (this.stopped) return;

      this.onStatus('reconnecting');
      this.reconnect = setTimeout(
        () => this.connect(), this.retryMs
      );
      this.retryMs = Math.min(this.retryMs * 2, 15000);
    };
  }

  send(event, topic, payload) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const ref = String(++this.requestNumber);
    if (event === 'phx_join') this.joinRef = ref;

    this.ws.send(JSON.stringify({
      topic, event, payload, ref,
      join_ref: topic === 'phoenix' ? null : this.joinRef
    }));
  }

  resume() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  close() {
    this.stopped = true;
    clearTimeout(this.reconnect);
    clearInterval(this.heartbeat);
    this.ws?.close();
  }
}
