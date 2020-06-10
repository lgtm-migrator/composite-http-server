import serializeJavascript from 'serialize-javascript'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { once } from 'events'
import mergeStream from 'merge-stream'
import splitStream from 'split'
import { CompositeServiceConfig, onceOutputLineIs } from '../../..'

const LOG_OUTPUT_LINES = false

export class CompositeProcess {
  readonly ready: Promise<void>
  readonly ended: Promise<void>
  private output: string[] = []
  private proc: ChildProcessWithoutNullStreams
  private didExit = false
  constructor(config: CompositeServiceConfig) {
    const configString = serializeJavascript(config, { unsafe: true })
    const script = `require('.').startCompositeService(${configString})`
    this.proc = spawn('node', ['-e', script])
    const outputStream = mergeStream([
      this.proc.stdout.setEncoding('utf8').pipe(splitStream()),
      this.proc.stderr.setEncoding('utf8').pipe(splitStream()),
    ])
    if (LOG_OUTPUT_LINES) {
      outputStream.on('data', line => console.log(line))
    }
    outputStream.on('data', line => this.output.push(line))
    this.ready = onceOutputLineIs(outputStream, 'Started all services')
    this.ended = once(outputStream, 'end').then(() => {
      this.didExit = true
    })
  }
  async start(): Promise<CompositeProcess> {
    await Promise.race([
      this.ready,
      this.ended.then(() => Promise.reject(new CompositeProcessCrashError())),
    ])
    return this
  }
  flushOutput(): string[] {
    return this.output.splice(0)
  }
  end(): Promise<void> {
    if (!this.didExit) {
      this.proc.kill('SIGINT')
    }
    return this.ended
  }
}

export class CompositeProcessCrashError extends Error {
  message = 'CompositeProcessCrashError'
}