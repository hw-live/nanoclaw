/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
  model?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try {
      fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(
          `Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function processLines(buffer: string, onLine: (line: string) => void): string {
  const lines = buffer.split('\n');
  const remaining = lines.pop() || '';
  for (const line of lines) {
    if (line.trim()) {
      onLine(line);
    }
  }
  return remaining;
}

async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  containerInput: ContainerInput,
  env: Record<string, string>,
  resumeAt?: string,
): Promise<{
  newSessionId?: string;
  closedDuringQuery: boolean;
}> {
  const workDir = '/workspace/group';
  const tempDir = '/tmp';
  const promptPath = path.join(tempDir, `.nanoclaw_prompt_${Date.now()}.txt`);
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  const model =
    containerInput.model ||
    process.env.ANTHROPIC_MODEL ||
    'anthropic/claude-3-5-sonnet-latest';
  const args = [
    'run',
    '--format',
    'json',
    '--title',
    `NanoClaw-${containerInput.groupFolder}`,
  ];

  log(`sessionId value: ${sessionId} (type: ${typeof sessionId})`);

  if (sessionId) {
    args.push('--session', sessionId);
  }

  if (resumeAt) {
    args.push('--continue', '-c');
  }

  log(`Running opencode: opencode ${args.join(' ')}`);
  log(`Prompt: ${prompt.slice(0, 200)}...`);

  const child = spawn('opencode', args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Write prompt to stdin for opencode
  child.stdin.write(prompt);
  child.stdin.end();

  let bufferedOutput = '';
  const messageCount = 0;
  const resultCount = 0;
  let newSessionId: string | undefined;
  let ipcPolling = true;
  let closedDuringQuery = false;

  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected during query, ending stream');
      closedDuringQuery = true;
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput();
    if (messages.length > 0) {
      log(`Piping IPC message into active query (${messages[0].length} chars)`);
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  child.stdout.on('data', (data) => {
    bufferedOutput += data.toString();
    bufferedOutput = processLines(bufferedOutput, (line) => {
      log(`[opencode line] ${line.substring(0, 100)}`);

      try {
        const event: any = JSON.parse(line);
        log(`[opencode event type=${event.type}]`);

        if (event.type === 'error' && event.error) {
          log(`[opencode error] ${JSON.stringify(event.error)}`);
        }

        if (event.type === 'session' && event.session_id) {
          newSessionId = event.session_id;
          log(`Session initialized: ${newSessionId}`);
        }

        if (event.type === 'result' && event.result) {
          log(`Result: ${event.result.slice(0, 200)}`);
          writeOutput({
            status: 'success',
            result: event.result,
            newSessionId,
          });
        } else if (event.type === 'text') {
          // Opencode text events have content in event.text or event.part.text
          const text = event.text || (event.part && event.part.text);
          if (text) {
            log(`Text result: ${text.slice(0, 200)}`);
            writeOutput({
              status: 'success',
              result: text,
              newSessionId,
            });
          }
        }
      } catch (err) {
        if (line.trim()) {
          log(`Failed to parse opencode line: ${line.substring(0, 100)}`);
        }
      }
    });
  });

  child.stderr.on('data', (data) => {
    log(`opencode stderr: ${data.toString()}`);
  });

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      log(`opencode exited with code ${code}`);
      resolve();
    });
    child.on('error', reject);
  });

  try {
    fs.unlinkSync(promptPath);
  } catch {
    /* ignore */
  }

  ipcPolling = false;
  log(
    `Query done. newSessionId: ${newSessionId || 'none'}, closedDuringQuery: ${closedDuringQuery}`,
  );
  return { newSessionId, closedDuringQuery };
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try {
      fs.unlinkSync('/tmp/input.json');
    } catch {
      /* may not exist */
    }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${errorMessage}`,
    });
    process.exit(1);
  }

  const opencodeEnv: Record<string, string> = {
    ...process.env,
    ANTHROPIC_API_KEY: containerInput.secrets?.ANTHROPIC_API_KEY || '',
    ANTHROPIC_BASE_URL:
      containerInput.secrets?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  let sessionId = containerInput.sessionId;
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  try {
    fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
  } catch {
    /* ignore */
  }

  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  let resumeAt: string | undefined;
  try {
    while (true) {
      log(
        `Starting query (session: ${sessionId || 'new'}, resumeAt: ${resumeAt || 'latest'})...`,
      );

      const queryResult = await runQuery(
        prompt,
        sessionId,
        containerInput,
        opencodeEnv,
        resumeAt,
      );
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }

      if (queryResult.closedDuringQuery) {
        log('Close sentinel consumed during query, exiting');
        break;
      }

      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Query ended, waiting for next IPC message...');

      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();
