import mergeStream from 'merge-stream'
import serializeJavascript from 'serialize-javascript'
import {
  CompositeServiceConfig,
  normalizeCompositeServiceConfig,
  NormalizedCompositeServiceConfig,
} from './config'
import { assert, mapStream, rightPad } from './util'
import { ComposedService } from './ComposedService'

let started = false
export function startCompositeService(config: CompositeServiceConfig) {
  assert(!started, 'Already started a composite service in this process')
  started = true
  new CompositeService(config)
}

class CompositeService {
  private output = mergeStream()
  private config: NormalizedCompositeServiceConfig
  private services: ComposedService[]
  private serviceMap: Map<string, ComposedService>
  private maxLabelLength: number
  private stopping = false

  constructor(config: CompositeServiceConfig) {
    const printConfig = () =>
      console.log(
        'config =',
        serializeJavascript(config, { space: 2, unsafe: true })
      )
    // TODO: return any errorS (plural) from normalizeCompositeServiceConfig (as well as normalized config)
    try {
      this.config = normalizeCompositeServiceConfig(config)
    } catch (error) {
      printConfig()
      throw error
    }
    if (this.config.printConfig) {
      printConfig()
    }

    this.output.pipe(process.stdout)

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        this.die(`Received shutdown signal '${signal}'`)
      })
    }

    this.services = Object.entries(this.config.services).map(
      ([id, config]) => new ComposedService(id, config)
    )
    this.serviceMap = new Map(
      this.services.map(service => [service.id, service])
    )

    this.maxLabelLength = Math.max(
      ...Object.keys(this.config.services).map(({ length }) => length)
    )

    console.log('Starting all services...')
    Promise.all(this.services.map(service => this.startService(service)))
      .then(() => console.log('Started all services'))
      .catch(error => this.die(errorText(error)))
  }

  private async startService(service: ComposedService) {
    await Promise.all(
      service.config.dependencies.map(id =>
        this.startService(this.serviceMap.get(id) as ComposedService)
      )
    )
    if (this.stopping) return
    await service.start((startPromise, process) => {
      console.log(`Starting service '${service.id}'...`)
      startPromise.then(() => {
        console.log(`Started service '${service.id}'`)
      })
      this.output.add(
        process.output.pipe(
          mapStream(
            line => `${rightPad(service.id, this.maxLabelLength)} | ${line}`
          )
        )
      )
      process.ended.then(() => {
        this.die(`Error: Service '${service.id}' exited`)
      })
    })
  }

  private die(message: string) {
    if (this.stopping) {
      return
    }
    this.stopping = true
    console.log(message)
    console.log('Stopping all services...')
    // TODO: individually .catch(error => { console.log(`Error stopping service '${service.id}': ${errorText(error)}`) })
    Promise.all(this.services.map(service => this.stopService(service)))
      .then(() => console.log('Stopped all services'))
      // Wait one tick for output to flush
      .then(() => process.exit(1))
  }

  private async stopService(service: ComposedService) {
    await Promise.all(
      service.config.dependencies.map(id =>
        this.stopService(this.serviceMap.get(id)!)
      )
    )
    await service.stop(stopPromise => {
      console.log(`Stopping service '${service.id}'...`)
      stopPromise.then(() => {
        console.log(`Stopped service '${service.id}'`)
      })
    })
  }
}

function errorText(maybeError: any): string {
  return (maybeError instanceof Error && maybeError.stack) || `${maybeError}`
}