declare module 'changes-stream' {
  import { EventEmitter } from 'events'
  
  class ChangesStream extends EventEmitter {
    constructor(options: any)
    read(): any
    destroy(): void
  }
  
  export = ChangesStream
}
