import { LIVE_CONSTANTS, TMUX_FIELDS } from './live-constants.mjs';

const FIELD_LIMITS = Object.freeze([
  LIVE_CONSTANTS.MAX_SOCKET_BYTES,
  LIVE_CONSTANTS.MAX_ID_FIELD_BYTES,
  LIVE_CONSTANTS.MAX_ID_FIELD_BYTES,
  LIVE_CONSTANTS.MAX_ID_FIELD_BYTES,
  LIVE_CONSTANTS.MAX_ID_FIELD_BYTES,
  LIVE_CONSTANTS.MAX_ID_FIELD_BYTES,
  LIVE_CONSTANTS.MAX_NAME_OR_TITLE_BYTES,
  LIVE_CONSTANTS.MAX_NAME_OR_TITLE_BYTES,
  LIVE_CONSTANTS.MAX_COMMAND_BYTES,
]);

export class CollectorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CollectorError';
    this.code = code;
  }
}

function fail(code) {
  throw new CollectorError(code);
}

function decodeField(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('TMUX_UTF8_INVALID');
  }
}

function validateRecord(record, socketPath) {
  if (Object.values(record).some((value) => value.includes('\0'))) fail('TMUX_FIELD_INVALID');
  if (record.socket_path !== socketPath
    || !/^[0-9]{1,20}$/.test(record.start_time)
    || !Number.isSafeInteger(Number(record.start_time))
    || Number(record.start_time) <= 0
    || !/^\$[0-9]+$/.test(record.session_id)
    || !/^@[0-9]+$/.test(record.window_id)
    || !/^%[0-9]+$/.test(record.pane_id)
    || !/^[0-9]+$/.test(record.pane_index)) {
    fail('TMUX_FIELD_INVALID');
  }
}

export function parseTmuxBuffer(buffer, socketPath) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('TMUX_FRAME_INVALID');
  const records = [];
  const paneIds = new Set();
  let offset = 0;
  let expectedStartTime;

  while (offset < buffer.length) {
    if (records.length >= LIVE_CONSTANTS.MAX_RAW_RECORDS) fail('TMUX_FRAME_INVALID');
    if (buffer[offset] !== 0x54 || buffer[offset + 1] !== 0x31) fail('TMUX_FRAME_INVALID');
    offset += 2;
    const record = {};

    for (let fieldIndex = 0; fieldIndex < LIVE_CONSTANTS.TMUX_FIELD_COUNT; fieldIndex += 1) {
      const digitStart = offset;
      while (offset < buffer.length && buffer[offset] >= 0x30 && buffer[offset] <= 0x39) {
        offset += 1;
        if (offset - digitStart > LIVE_CONSTANTS.MAX_LENGTH_DIGITS) fail('TMUX_FRAME_INVALID');
      }
      const digitCount = offset - digitStart;
      if (digitCount === 0 || buffer[offset] !== 0x3a) fail('TMUX_FRAME_INVALID');
      if (digitCount > 1 && buffer[digitStart] === 0x30) fail('TMUX_FRAME_INVALID');
      const length = Number(buffer.toString('ascii', digitStart, offset));
      if (length > FIELD_LIMITS[fieldIndex]) fail('TMUX_FRAME_INVALID');
      offset += 1;
      if (offset + length > buffer.length) fail('TMUX_FRAME_INVALID');
      record[TMUX_FIELDS[fieldIndex]] = decodeField(buffer.subarray(offset, offset + length));
      offset += length;
    }
    if (buffer[offset] !== 0x0a) fail('TMUX_FRAME_INVALID');
    offset += 1;
    validateRecord(record, socketPath);
    if (expectedStartTime === undefined) expectedStartTime = record.start_time;
    if (record.start_time !== expectedStartTime) fail('TMUX_FIELD_INVALID');
    if (paneIds.has(record.pane_id)) fail('TMUX_IDENTITY_COLLISION');
    paneIds.add(record.pane_id);
    records.push(Object.freeze(record));
  }
  return Object.freeze(records);
}
