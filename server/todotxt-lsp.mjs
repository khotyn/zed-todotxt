#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const documents = new Map();
let nextId = 1;
const pending = new Map();
let input = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  readMessages();
});

function readMessages() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const header = input.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      throw new Error("Missing Content-Length header.");
    }

    const length = Number(match[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + length;
    if (input.length < messageEnd) {
      return;
    }

    const body = input.subarray(messageStart, messageEnd).toString("utf8");
    input = input.subarray(messageEnd);
    handleMessage(JSON.parse(body));
  }
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function request(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function handleMessage(message) {
  if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(message.error.message));
      } else {
        waiter.resolve(message.result);
      }
    }
    return;
  }

  if (message.method) {
    handleRequestOrNotification(message).catch((error) => {
      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        respondError(message.id, -32603, error instanceof Error ? error.message : String(error));
      }
    });
  }
}

async function handleRequestOrNotification(message) {
  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      respond(id, {
        capabilities: {
          textDocumentSync: 1,
          semanticTokensProvider: {
            legend: {
              tokenTypes: ["completedTask", "overdueDue", "activeDue"],
              tokenModifiers: [],
            },
            full: true,
          },
          codeActionProvider: {
            codeActionKinds: ["quickfix", "source"],
            resolveProvider: true,
          },
        },
      });
      return;

    case "initialized":
      return;

    case "shutdown":
      respond(id, null);
      return;

    case "exit":
      process.exit(0);
      return;

    case "textDocument/didOpen":
      documents.set(params.textDocument.uri, params.textDocument.text);
      publishDiagnostics(params.textDocument.uri);
      return;

    case "textDocument/didChange":
      documents.set(params.textDocument.uri, params.contentChanges.at(-1)?.text ?? "");
      publishDiagnostics(params.textDocument.uri);
      return;

    case "textDocument/didClose":
      documents.delete(params.textDocument.uri);
      send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: params.textDocument.uri, diagnostics: [] },
      });
      return;

    case "textDocument/codeAction":
      respond(id, codeActions(params));
      return;

    case "textDocument/semanticTokens/full":
      respond(id, semanticTokens(params.textDocument.uri));
      return;

    case "codeAction/resolve":
      respond(id, resolveCodeAction(params));
      return;

    default:
      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        respond(id, null);
      }
  }
}

function codeActions(params) {
  const uri = params.textDocument.uri;
  const archive = collectArchive(uri);
  if (!archive || archive.completed.length === 0) {
    return [];
  }

  return [
    {
      title: `Archive ${archive.completed.length} completed todo.txt task${archive.completed.length === 1 ? "" : "s"}`,
      kind: "quickfix",
      diagnostics: params.context?.diagnostics ?? [],
      data: { uri },
    },
  ];
}

function resolveCodeAction(action) {
  const uri = action.data?.uri;
  const archive = collectArchive(uri);
  if (!archive || archive.completed.length === 0) {
    return action;
  }

  appendCompletedTasks(uri, archive);
  action.edit = buildCurrentDocumentEdit(uri, archive);
  delete action.data;
  return action;
}

function publishDiagnostics(uri) {
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics: [] },
  });
}

function buildArchiveEdit(uri) {
  const archive = collectArchive(uri);
  if (!archive || archive.completed.length === 0) {
    return null;
  }

  return buildCurrentDocumentEdit(uri, archive);
}

function buildCurrentDocumentEdit(uri, archive) {
  return {
    documentChanges: [
      {
        textDocument: { uri, version: null },
        edits: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: archive.documentEnd,
            },
            newText: archive.nextText,
          },
        ],
      },
    ],
  };
}

function appendCompletedTasks(sourceUri, archive) {
  const sourcePath = fileURLToPath(sourceUri);
  const donePath = path.join(path.dirname(sourcePath), "done.txt");
  const existing = readFileIfExists(donePath);
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? archive.newline : "";

  fs.mkdirSync(path.dirname(donePath), { recursive: true });
  fs.appendFileSync(
    donePath,
    `${prefix}${archive.completed.join(archive.newline)}${archive.newline}`,
    "utf8",
  );
}

function collectArchive(uri) {
  const text = documents.get(uri);
  if (text === undefined) {
    return null;
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const hasFinalNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  if (hasFinalNewline) {
    lines.pop();
  }

  const active = [];
  const completed = [];
  for (const line of lines) {
    if (/^x\s/.test(line)) {
      completed.push(line);
    } else {
      active.push(line);
    }
  }

  const nextText = active.join(newline) + (hasFinalNewline && active.length > 0 ? newline : "");

  return {
    completed,
    lines,
    newline,
    nextText,
    documentEnd: positionAt(text, text.length),
  };
}

function semanticTokens(uri) {
  const archive = collectArchive(uri);
  if (!archive) {
    return { data: [] };
  }

  const data = [];
  let previousLine = 0;
  let previousStart = 0;
  const today = localTodayIso();

  for (const [line, lineText] of archive.lines.entries()) {
    if (/^x\s/.test(lineText)) {
      const start = 0;
      appendSemanticToken(data, {
        line,
        start,
        length: utf16Length(lineText),
        tokenType: 0,
        previousLine,
        previousStart,
      });
      previousLine = line;
      previousStart = start;
      continue;
    }

    for (const due of dueTokens(lineText, today)) {
      appendSemanticToken(data, {
        line,
        start: due.start,
        length: due.length,
        tokenType: due.overdue ? 1 : 2,
        previousLine,
        previousStart,
      });
      previousLine = line;
      previousStart = due.start;
    }
  }

  return { data };
}

function appendSemanticToken(data, token) {
  data.push(
    token.line - token.previousLine,
    token.line === token.previousLine ? token.start - token.previousStart : token.start,
    token.length,
    token.tokenType,
    0,
  );
}

function dueTokens(lineText, today) {
  const tokens = [];
  const duePattern = /(?:^|\s)(due:(\d{4}-\d{2}-\d{2}))(?:\s|$)/g;
  let match;

  while ((match = duePattern.exec(lineText)) !== null) {
    const field = match[1];
    const date = match[2];
    if (!isValidDateIso(date)) {
      continue;
    }

    tokens.push({
      start: utf16Length(lineText.slice(0, match.index + match[0].indexOf(field))),
      length: utf16Length(field),
      overdue: date < today,
    });
  }

  return tokens;
}

function localTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateIso(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function utf16Length(text) {
  return [...text].reduce((length, character) => length + (character.codePointAt(0) > 0xffff ? 2 : 1), 0);
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function positionAt(text, offset) {
  let line = 0;
  let character = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      character = 0;
    } else if (text[index] !== "\r") {
      character += 1;
    }
  }
  return { line, character };
}
